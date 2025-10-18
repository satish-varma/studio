
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  query,
  orderBy,
  writeBatch,
  where,
  QueryConstraint
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from "firebase/auth";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, UserRole, Site, Stall, UserStatus, StaffDetails, SalaryHistory } from "@/types";
import { logStaffActivity } from "@/lib/staffLogger";
import { parseISO, isWithinInterval, startOfMonth } from 'date-fns';

const LOG_PREFIX = "[useUserManagement]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();
const auth = getAuth(getApp());

export function useUserManagement() {
  const { user: currentUser, loading: authLoading, activeSiteId } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [staffDetails, setStaffDetails] = useState<Map<string, StaffDetails>>(new Map());
  const [sites, setSites] = useState<Site[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [salaryHistories, setSalaryHistories] = useState<Map<string, SalaryHistory[]>>(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setError("Please log in to manage users.");
      setLoading(false);
      return;
    }
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
      setError("You do not have permission to view this data.");
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Admins see all users. Managers see only users in their managed sites.
    const usersQuery = currentUser.role === 'admin'
      ? query(collection(db, "users"), orderBy("displayName", "asc"))
      : query(collection(db, "users"), where("defaultSiteId", "in", currentUser.managedSiteIds && currentUser.managedSiteIds.length > 0 ? currentUser.managedSiteIds : ['placeholder-for-empty-array']));

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setUsers(fetchedUsers);
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching users:`, err);
      setError("Failed to load users list.");
    });
    
    const unsubSites = onSnapshot(query(collection(db, "sites"), orderBy("name", "asc")), (snapshot) => {
      setSites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site)));
    });

    const unsubStalls = onSnapshot(query(collection(db, "stalls"), orderBy("name", "asc")), (snapshot) => {
      setStalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall)));
    });

    const unsubStaffDetails = onSnapshot(query(collection(db, "staffDetails")), (snapshot) => {
      const newDetailsMap = new Map<string, StaffDetails>();
      snapshot.forEach(doc => newDetailsMap.set(doc.id, doc.data() as StaffDetails));
      setStaffDetails(newDetailsMap);
    });

    const unsubSalaryHistory = onSnapshot(query(collection(db, "salaryHistory"), orderBy("effectiveDate", "desc")), (snapshot) => {
        const histories = new Map<string, SalaryHistory[]>();
        snapshot.forEach(doc => {
            const historyItem = { id: doc.id, ...doc.data() } as SalaryHistory;
            const userHistory = histories.get(historyItem.staffUid) || [];
            userHistory.push(historyItem);
            histories.set(historyItem.staffUid, userHistory);
        });
        setSalaryHistories(histories);
    });

    Promise.all([
        getDocs(usersQuery),
        getDocs(query(collection(db, "sites"))),
        getDocs(query(collection(db, "stalls"))),
        getDocs(query(collection(db, "staffDetails"))),
        getDocs(query(collection(db, "salaryHistory"))),
    ]).then(() => {
        setLoading(false);
    }).catch(err => {
        console.error(`${LOG_PREFIX} Error loading initial data:`, err);
        setError("Error loading initial data.");
        setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubSites();
      unsubStalls();
      unsubStaffDetails();
      unsubSalaryHistory();
    };
  }, [currentUser, authLoading]);

  const getHistoricalSalary = useCallback((staffUid: string, forDate: Date): number | null => {
    const history = salaryHistories.get(staffUid);
    const details = staffDetailsMap.get(staffUid);

    // Find the most recent salary change that is on or before the given date
    const applicableSalaryRecord = history?.find(record => 
        !isAfter(parseISO(record.effectiveDate), forDate)
    );

    if (applicableSalaryRecord) {
        return applicableSalaryRecord.newSalary;
    }
    
    // If no historical salary is applicable, check if the joining date is after the given date.
    // If so, they weren't employed, so salary is 0.
    if (details?.joiningDate && isAfter(parseISO(details.joiningDate), forDate)) {
        return 0;
    }
    
    // Otherwise, return their current base salary.
    return details?.salary || null;

  }, [salaryHistories, staffDetailsMap]);
  
  const handleCreateUserFirestoreDoc = useCallback(async (uid: string, newUserData: Omit<AppUser, 'createdAt' | 'uid'>): Promise<boolean> => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can create users.", variant: "destructive" });
      return false;
    }
    const userDocRef = doc(db, "users", uid);
    try {
      await setDoc(userDocRef, { ...newUserData, createdAt: new Date().toISOString(), status: 'active' });
      return true;
    } catch (error: any) {
      toast({ title: "Firestore Error", description: `Could not create user document: ${error.message}`, variant: "destructive" });
      return false;
    }
  }, [currentUser, toast]);

  const handleRoleChange = useCallback(async (userId: string, newRole: UserRole) => {
    if (!currentUser || currentUser.role !== 'admin' || userId === currentUser.uid) {
      toast({ title: "Permission Denied", description: "You cannot change this user's role.", variant: "destructive" });
      return;
    }
    const userDocRef = doc(db, "users", userId);
    try {
      const updates: Record<string, any> = { role: newRole };
      if (newRole === 'staff') updates.managedSiteIds = null;
      if (newRole === 'manager') {
        updates.defaultSiteId = null;
        updates.defaultStallId = null;
      }
      if (newRole === 'admin') {
        updates.defaultSiteId = null;
        updates.defaultStallId = null;
        updates.managedSiteIds = null;
      }
      await updateDoc(userDocRef, updates);
      toast({ title: "Role Updated", description: "User role has been successfully changed." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  }, [currentUser, toast]);

  const handleDeleteUser = useCallback(async (userId: string, userName: string) => {
    if (!currentUser || currentUser.role !== 'admin' || !auth.currentUser || userId === currentUser.uid) {
      toast({ title: "Permission Denied", description: "You cannot delete this user.", variant: "destructive" });
      return;
    }
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch(`/api/admin/delete-user/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      
      await deleteDoc(doc(db, "users", userId));
      toast({ title: "User Deleted", description: `${userName} has been successfully deleted.` });
    } catch (error: any) {
      toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
    }
  }, [currentUser, toast]);

  const handleDefaultSiteChange = useCallback(async (userId: string, newSiteId: string | null) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { defaultSiteId: newSiteId, defaultStallId: null });
      toast({ title: "Default Site Updated", description: "Stall selection was cleared." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  }, [currentUser, toast]);

  const handleDefaultStallChange = useCallback(async (userId: string, newStallId: string | null) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { defaultStallId: newStallId });
      toast({ title: "Default Stall Updated" });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  }, [currentUser, toast]);

  const handleUpdateManagedSites = useCallback(async (userId: string, newManagedSiteIds: string[]) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { managedSiteIds: newManagedSiteIds, defaultSiteId: null, defaultStallId: null });
      toast({ title: "Managed Sites Updated" });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  }, [currentUser, toast]);

  const handleStatusChange = useCallback(async (userId: string, newStatus: UserStatus, exitDate?: Date | null) => {
    if (!currentUser || currentUser.role !== 'admin' || userId === currentUser.uid) {
      toast({ title: "Permission Denied", description: "You cannot change this user's status.", variant: "destructive" });
      return;
    }
    const userDocRef = doc(db, "users", userId);
    try {
      const updates: Record<string, any> = { status: newStatus };
      await updateDoc(userDocRef, updates);

      const detailsDocRef = doc(db, "staffDetails", userId);
      const detailsUpdate: Record<string, any> = {};
      if (newStatus === 'inactive' && exitDate) {
        detailsUpdate.exitDate = exitDate.toISOString();
      } else if (newStatus === 'active') {
        detailsUpdate.exitDate = null;
      }
      if (Object.keys(detailsUpdate).length > 0) {
        await setDoc(detailsDocRef, detailsUpdate, { merge: true });
      }

      await logStaffActivity(currentUser, {
        type: 'USER_STATUS_CHANGED',
        relatedStaffUid: userId,
        siteId: users.find(u => u.uid === userId)?.defaultSiteId || null,
        details: {
            status: newStatus,
            notes: `User status changed to ${newStatus}. ${exitDate ? `Exit date set to ${exitDate.toLocaleDateString()}` : ''}`
        }
      });
      
      toast({ title: "Status Updated", description: `User has been set to ${newStatus}.` });
    } catch (error: any) {
      toast({ title: "Update Failed", description: `Could not update status: ${error.message}`, variant: "destructive" });
    }
  }, [currentUser, toast, users]);

  const handleBatchUpdateStaffDetails = useCallback(async (userIds: string[], updates: { salary?: number; joiningDate?: Date | null; }) => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can perform batch updates.", variant: "destructive" });
      return;
    }
    if (userIds.length === 0) {
      toast({ title: "No Users Selected", description: "Please select users to update.", variant: "default" });
      return;
    }
    
    const batch = writeBatch(db);
    let updateCount = 0;
    
    for (const userId of userIds) {
      const detailsDocRef = doc(db, "staffDetails", userId);
      const updateData: Record<string, any> = {};

      if (updates.salary !== undefined) {
        updateData.salary = updates.salary;
      }
      if (updates.joiningDate) {
        updateData.joiningDate = updates.joiningDate.toISOString();
      }
      
      if (Object.keys(updateData).length > 0) {
        batch.set(detailsDocRef, updateData, { merge: true });
        
        const logNotesParts: string[] = [];
        if (updates.salary !== undefined) logNotesParts.push(`Salary to ₹${updates.salary.toFixed(2)}`);
        if (updates.joiningDate) logNotesParts.push(`Joining date to ${updates.joiningDate.toLocaleDateString()}`);
        
        logStaffActivity(currentUser, {
            type: 'STAFF_DETAILS_UPDATED',
            relatedStaffUid: userId,
            siteId: users.find(u => u.uid === userId)?.defaultSiteId || null,
            details: {
                notes: `Batch Update: ${logNotesParts.join(', ')}.`,
            }
        });

        updateCount++;
      }
    }

    if (updateCount === 0) {
        toast({ title: "No Updates Applied", description: "No changes were specified to apply.", variant: "default" });
        return;
    }

    try {
        await batch.commit();
        toast({ title: "Batch Update Successful", description: `Successfully updated details for ${updateCount} staff member(s).` });
    } catch (error: any) {
        toast({ title: "Batch Update Failed", description: `An error occurred: ${error.message}`, variant: "destructive"});
    }
  }, [currentUser, toast, users]);


  return {
    users,
    sites,
    stalls,
    staffDetails,
    salaryHistories,
    loading: authLoading || loading,
    error,
    getHistoricalSalary,
    handleCreateUserFirestoreDoc,
    handleRoleChange,
    handleDeleteUser,
    handleDefaultSiteChange,
    handleDefaultStallChange,
    handleUpdateManagedSites,
    handleStatusChange,
    handleBatchUpdateStaffDetails,
  };
}

    

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
  orderBy
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from "firebase/auth";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { AppUser, UserRole, Site, Stall, UserStatus } from "@/types";

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
  const { user: currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
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

    const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
    const sitesQuery = query(collection(db, "sites"), orderBy("name", "asc"));
    const stallsQuery = query(collection(db, "stalls"), orderBy("name", "asc"));

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser)));
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching users:`, err);
      setError("Failed to load users list.");
    });

    const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
      setSites(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site)));
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching sites:`, err);
      setError("Failed to load sites list.");
    });

    const unsubStalls = onSnapshot(stallsQuery, (snapshot) => {
      setStalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall)));
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching stalls:`, err);
      setError("Failed to load stalls list.");
    });

    // Combine loading states
    Promise.all([
      new Promise(resolve => onSnapshot(usersQuery, () => resolve(true))),
      new Promise(resolve => onSnapshot(sitesQuery, () => resolve(true))),
      new Promise(resolve => onSnapshot(stallsQuery, () => resolve(true))),
    ]).then(() => {
        setLoading(false);
    }).catch(err => {
        setError("Error loading initial data.");
        setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubSites();
      unsubStalls();
    };
  }, [currentUser, authLoading]);

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

  const handleStatusChange = useCallback(async (userId: string, newStatus: UserStatus) => {
    if (!currentUser || currentUser.role !== 'admin' || userId === currentUser.uid) {
      toast({ title: "Permission Denied", description: "You cannot change this user's status.", variant: "destructive" });
      return;
    }
    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { status: newStatus });
      toast({ title: "Status Updated", description: `User has been set to ${newStatus}.` });
    } catch (error: any) {
      toast({ title: "Update Failed", description: `Could not update status: ${error.message}`, variant: "destructive" });
    }
  }, [currentUser, toast]);


  return {
    users,
    sites,
    stalls,
    loading: authLoading || loading,
    error,
    handleCreateUserFirestoreDoc,
    handleRoleChange,
    handleDeleteUser,
    handleDefaultSiteChange,
    handleDefaultStallChange,
    handleUpdateManagedSites,
    handleStatusChange,
  };
}

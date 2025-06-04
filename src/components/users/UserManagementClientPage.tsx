
"use client";

import { useState, useEffect } from "react";
import { UserTable } from "@/components/users/UserTable";
import type { AppUser, UserRole, Site, Stall } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc, // Added setDoc for creating user
  QuerySnapshot,
  DocumentData,
  getDocs, 
  query,
  orderBy,
  getDoc 
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert, PlusCircle } from "lucide-react"; // Added PlusCircle
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader"; // Ensure PageHeader is imported
import { Button } from "@/components/ui/button"; // Ensure Button is imported
import CreateUserDialog from "@/components/users/CreateUserDialog"; // Import the new dialog

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in UserManagementClientPage:", error);
  }
}
const db = getFirestore();

export default function UserManagementClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<AppUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [loadingData, setLoadingData] = useState(true); 
  const [errorData, setErrorData] = useState<string | null>(null);
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);

  useEffect(() => {
    if (authLoading) {
      setLoadingData(true);
      return;
    }

    if (!currentUser) {
      setLoadingData(false);
      setErrorData("Please log in to manage users.");
      setUsers([]);
      setSites([]);
      setStalls([]);
      return;
    }

    if (currentUser.role !== 'admin') {
      setLoadingData(false);
      setErrorData("Access Denied: You do not have permission to view this page.");
      setUsers([]);
      setSites([]);
      setStalls([]);
      return;
    }
    
    setLoadingData(true);
    setErrorData(null);
    let unsubscribeUsers: (() => void) | null = null;

    const fetchInitialData = async () => {
      try {
        const usersCollectionRef = collection(db, "users");
        unsubscribeUsers = onSnapshot(usersCollectionRef, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedUsers: AppUser[] = snapshot.docs
              .map(docSnapshot => ({
                uid: docSnapshot.id,
                ...docSnapshot.data()
              } as AppUser))
              .filter(u => u.uid && typeof u.uid === 'string' && u.uid.trim() !== ""); 
            setUsers(fetchedUsers.sort((a,b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")));
          },
          (error) => {
            console.error("Error fetching users:", error);
            setErrorData(prev => prev ? `${prev}\nFailed to load users.` : "Failed to load users.");
          }
        );

        const sitesCollectionRef = collection(db, "sites");
        const sitesSnapshot = await getDocs(query(sitesCollectionRef, orderBy("name")));
        const fetchedSites: Site[] = sitesSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as Site));
        setSites(fetchedSites);

        const stallsCollectionRef = collection(db, "stalls");
        const stallsSnapshot = await getDocs(query(stallsCollectionRef, orderBy("name")));
        const fetchedStalls: Stall[] = stallsSnapshot.docs.map(docSnapshot => ({ id: docSnapshot.id, ...docSnapshot.data() } as Stall));
        setStalls(fetchedStalls);
        
      } catch (error: any) {
        console.error("Error fetching initial data for User Management:", error);
        setErrorData("Failed to load page data. Please try again. Error: " + error.message);
      } finally {
        setLoadingData(false);
      }
    };
    
    fetchInitialData();

    return () => {
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, [currentUser, authLoading]);

  const handleCreateUser = async (newUserData: Omit<AppUser, 'createdAt'>) => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can create users.", variant: "destructive"});
      return false;
    }
    if (!db) {
      toast({ title: "Database Error", description: "Firestore not initialized.", variant: "destructive"});
      return false;
    }
    if (!newUserData.uid || !newUserData.email || !newUserData.role) {
        toast({ title: "Missing Required Fields", description: "UID, Email, and Role are required to create a user document.", variant: "destructive"});
        return false;
    }

    const userDocRef = doc(db, "users", newUserData.uid);
    try {
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        toast({ title: "User Exists", description: `A user document with UID ${newUserData.uid} already exists.`, variant: "destructive" });
        return false;
      }

      const fullUserData: AppUser = {
        ...newUserData,
        displayName: newUserData.displayName || newUserData.email?.split('@')[0] || "New User",
        createdAt: new Date().toISOString(),
        defaultSiteId: newUserData.defaultSiteId || null,
        defaultStallId: newUserData.defaultStallId || null,
        managedSiteIds: newUserData.managedSiteIds || null,
        // Initialize preference fields to null
        defaultItemSearchTerm: null,
        defaultItemCategoryFilter: null,
        defaultItemStockStatusFilter: null,
        defaultItemStallFilterOption: null,
        defaultSalesDateRangeFrom: null,
        defaultSalesDateRangeTo: null,
        defaultSalesStaffFilter: null,
      };

      await setDoc(userDocRef, fullUserData);
      toast({ title: "User Document Created", description: `Firestore document for ${newUserData.email} created successfully.` });
      setShowCreateUserDialog(false); // Close dialog on success
      return true;
    } catch (error: any) {
      console.error("Error creating user document:", error);
      toast({ title: "Creation Failed", description: error.message || "Could not create user document.", variant: "destructive" });
      return false;
    }
  };


  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "You cannot change user roles.", variant: "destructive"});
      return;
    }
    if (userId === currentUser.uid) {
      toast({ title: "Action Not Allowed", description: "Admins cannot change their own role via this interface.", variant: "destructive"});
      return;
    }
     if (!db) {
      toast({ title: "Database Error", description: "Firestore not initialized. Cannot update role.", variant: "destructive"});
      return;
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === "") {
      console.error("handleRoleChange called with invalid userId:", userId);
      toast({ title: "Internal Error", description: "User ID is invalid for role change. Please refresh and try again.", variant: "destructive"});
      return;
    }

    const userDocRef = doc(db, "users", userId);
    try {
      const updates: Record<string, any> = { role: newRole };
      if (newRole === 'staff') {
        updates.managedSiteIds = null; 
      } else if (newRole === 'manager') {
        updates.defaultSiteId = null; 
        updates.defaultStallId = null;
      } else if (newRole === 'admin') {
        updates.defaultSiteId = null;
        updates.defaultStallId = null;
        updates.managedSiteIds = null;
      }
      await updateDoc(userDocRef, updates);
      toast({ title: "Role Updated", description: `User role successfully changed to ${newRole}. Associated site/stall assignments may have been reset.` });
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast({ title: "Update Failed", description: error.message || "Could not update user role.", variant: "destructive" });
    }
  };

  const handleDefaultSiteChange = async (userId: string, newSiteId: string | null) => {
    if (!currentUser || currentUser.role !== 'admin') {
        toast({ title: "Permission Denied", description: "Only admins can change default sites.", variant: "destructive"});
        return;
    }
    if (!db || !userId) return;
    const userDocRef = doc(db, "users", userId);
    try {
        await updateDoc(userDocRef, { 
            defaultSiteId: newSiteId,
            ...(newSiteId === null && { defaultStallId: null }) 
        });
        toast({ title: "Default Site Updated", description: `User's default site has been ${newSiteId ? 'set' : 'cleared'}.` });
    } catch (error: any) {
        console.error("Error updating default site:", error);
        toast({ title: "Update Failed", description: error.message || "Could not update default site.", variant: "destructive" });
    }
  };

  const handleDefaultStallChange = async (userId: string, newStallId: string | null) => {
    if (!currentUser || currentUser.role !== 'admin') {
        toast({ title: "Permission Denied", description: "Only admins can change default stalls.", variant: "destructive"});
        return;
    }
    if (!db || !userId) return;
    const userDocRef = doc(db, "users", userId);
    const userSnap = await getDoc(userDocRef);
    try {
        if (newStallId && (!userSnap.exists() || !userSnap.data()?.defaultSiteId)) {
            toast({ title: "Site Required", description: "A default site must be selected before assigning a default stall.", variant: "default"});
            return;
        }
        await updateDoc(userDocRef, { defaultStallId: newStallId });
        toast({ title: "Default Stall Updated", description: `User's default stall has been ${newStallId ? 'set' : 'cleared'}.` });
    } catch (error: any) {
        console.error("Error updating default stall:", error);
        toast({ title: "Update Failed", description: error.message || "Could not update default stall.", variant: "destructive" });
    }
  };

  const handleUpdateManagedSites = async (userId: string, newManagedSiteIds: string[]) => {
    if (!currentUser || currentUser.role !== 'admin') {
        toast({ title: "Permission Denied", description: "Only admins can change managed sites.", variant: "destructive"});
        return;
    }
    if (!db || !userId) return;
    const userDocRef = doc(db, "users", userId);
    try {
        await updateDoc(userDocRef, { 
            managedSiteIds: newManagedSiteIds,
            defaultSiteId: null, 
            defaultStallId: null
        });
        toast({ title: "Managed Sites Updated", description: `Manager's site assignments have been updated.` });
    } catch (error: any) {
        console.error("Error updating managed sites:", error);
        toast({ title: "Update Failed", description: error.message || "Could not update managed sites.", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
     if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "You cannot delete users.", variant: "destructive"});
      return;
    }
    if (userId === currentUser.uid) {
      toast({ title: "Action Not Allowed", description: "Admins cannot delete their own account via this interface.", variant: "destructive"});
      return;
    }
     if (!db) {
      toast({ title: "Database Error", description: "Firestore not initialized. Cannot delete user.", variant: "destructive"});
      return;
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === "") {
      console.error("handleDeleteUser called with invalid userId:", userId);
      toast({ title: "Internal Error", description: "User ID is invalid for deletion. Please refresh and try again.", variant: "destructive"});
      return;
    }
    
    const userDocRef = doc(db, "users", userId);
    try {
      await deleteDoc(userDocRef);
      toast({ title: "User Document Deleted", description: `Firestore document for ${userName} has been deleted.` });
      // Note: This does NOT delete the Firebase Authentication user. That must be done from Firebase Console.
    } catch (error: any) {
      console.error("Error deleting user document:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete user document.", variant: "destructive" });
    }
  };
  
  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user data and context...</p>
      </div>
    );
  }

  if (errorData) {
    return (
       <div className="space-y-6">
        <PageHeader
          title="User Management"
          description="View, edit roles, and manage user accounts. (Admins Only)"
          actions={
            <Button onClick={() => setShowCreateUserDialog(true)} disabled={loadingData}>
              <PlusCircle className="mr-2 h-5 w-5" /> Create New User Document
            </Button>
          }
        />
        <Card className="shadow-lg border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive">
              <ShieldAlert className="mr-2 h-5 w-5" />
              Access Restricted or Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center py-10 text-destructive">{errorData}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!currentUser || currentUser.role !== 'admin') {
     return (
      <div className="space-y-6">
        <PageHeader
          title="User Management"
          description="View, edit roles, and manage user accounts. (Admins Only)"
        />
        <Card className="shadow-lg border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive">
              <ShieldAlert className="mr-2 h-5 w-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center py-10 text-destructive">You do not have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <PageHeader
        title="User Management"
        description="Create and manage user documents, roles, and assignments. (Admins Only)"
        actions={
          <Button onClick={() => setShowCreateUserDialog(true)} disabled={loadingData}>
            <PlusCircle className="mr-2 h-5 w-5" /> Create New User Document
          </Button>
        }
      />
      <UserTable 
          users={users} 
          sites={sites}
          stalls={stalls}
          onRoleChange={handleRoleChange} 
          onDeleteUser={handleDeleteUser}
          onDefaultSiteChange={handleDefaultSiteChange}
          onDefaultStallChange={handleDefaultStallChange}
          onManagedSitesChange={handleUpdateManagedSites}
          currentUserId={currentUser?.uid}
      />
      <CreateUserDialog
        isOpen={showCreateUserDialog}
        onClose={() => setShowCreateUserDialog(false)}
        onCreateUser={handleCreateUser}
        sites={sites} // Pass sites for selection
        stalls={stalls} // Pass stalls for selection
      />
    </div>
  );
}

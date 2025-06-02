
"use client";

import { useState, useEffect } from "react";
import { UserTable } from "@/components/users/UserTable";
import type { AppUser, UserRole } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


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
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return; // Wait for auth state to resolve

    if (!currentUser || currentUser.role !== 'admin') {
      setLoadingUsers(false);
      setErrorUsers("Access Denied: You do not have permission to view this page.");
      return;
    }

    const usersCollectionRef = collection(db, "users");
    const unsubscribe = onSnapshot(usersCollectionRef, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedUsers: AppUser[] = snapshot.docs.map(docSnapshot => ({
          uid: docSnapshot.id,
          ...docSnapshot.data()
        } as AppUser));
        setUsers(fetchedUsers);
        setLoadingUsers(false);
        setErrorUsers(null);
      },
      (error) => {
        console.error("Error fetching users:", error);
        setErrorUsers("Failed to load users. Please try again later.");
        setLoadingUsers(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, authLoading]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast({ title: "Permission Denied", description: "You cannot change user roles.", variant: "destructive"});
      return;
    }
    if (userId === currentUser.uid) {
      toast({ title: "Action Not Allowed", description: "Admins cannot change their own role via this interface.", variant: "destructive"});
      return;
    }
    if (!userId || typeof userId !== 'string' || userId.trim() === "") {
      console.error("handleRoleChange called with invalid userId:", userId);
      toast({ title: "Internal Error", description: "User ID is invalid for role change. Please refresh and try again.", variant: "destructive"});
      return;
    }
    if (!db) {
      toast({ title: "Database Error", description: "Firestore not initialized. Cannot update role.", variant: "destructive"});
      return;
    }

    const userDocRef = doc(db, "users", userId);
    try {
      await updateDoc(userDocRef, { role: newRole });
      toast({ title: "Role Updated", description: `User role successfully changed to ${newRole}.` });
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast({ title: "Update Failed", description: error.message || "Could not update user role.", variant: "destructive" });
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
    if (!userId || typeof userId !== 'string' || userId.trim() === "") {
      console.error("handleDeleteUser called with invalid userId:", userId);
      toast({ title: "Internal Error", description: "User ID is invalid for deletion. Please refresh and try again.", variant: "destructive"});
      return;
    }
    if (!db) {
      toast({ title: "Database Error", description: "Firestore not initialized. Cannot delete user.", variant: "destructive"});
      return;
    }
    
    const userDocRef = doc(db, "users", userId);
    try {
      await deleteDoc(userDocRef);
      toast({ title: "User Deleted", description: `User ${userName} has been deleted from Firestore.` });
      // TODO: Implement Firebase Function to delete user from Firebase Authentication
      // Deleting from Auth is a privileged operation and should be handled securely.
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete user.", variant: "destructive" });
    }
  };
  
  if (authLoading || loadingUsers) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user data...</p>
      </div>
    );
  }

  if (errorUsers) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive">
            <ShieldAlert className="mr-2 h-5 w-5" />
            Access Restricted or Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-10 text-destructive">{errorUsers}</p>
        </CardContent>
      </Card>
    );
  }
  
  if (!currentUser || currentUser.role !== 'admin') {
     return (
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
    );
  }


  return (
    <UserTable 
        users={users} 
        onRoleChange={handleRoleChange} 
        onDeleteUser={handleDeleteUser}
        currentUserId={currentUser?.uid}
    />
  );
}


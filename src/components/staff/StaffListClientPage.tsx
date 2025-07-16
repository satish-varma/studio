
"use client";

import { useState, useEffect } from "react";
import type { AppUser, Site, Stall } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query,
  orderBy
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert, PlusCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StaffListTable } from "@/components/staff/StaffListTable";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import { useUserManagement } from "@/hooks/use-user-management";


const LOG_PREFIX = "[StaffListClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function StaffListClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const {
    users,
    sites,
    stalls,
    loading: loadingData,
    error: errorData,
    handleCreateUserFirestoreDoc,
  } = useUserManagement();

  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);

  const staffUsers = users.filter(u => u.role === 'staff' || u.role === 'manager');
  const sitesMap: Record<string, string> = sites.reduce((acc, site) => {
    acc[site.id] = site.name;
    return acc;
  }, {});
  

  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading staff data...</p>
      </div>
    );
  }
  
  if (errorData) {
    return (
        <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorData}</AlertDescription>
        </Alert>
    );
  }

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
    return (
        <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to view this page.</AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="space-y-6">
       <PageHeader
        title="Staff Members"
        description="View all staff and managers. Add new team members or view their profiles."
        actions={
          <Button onClick={() => setShowCreateUserDialog(true)} disabled={loadingData}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Member
          </Button>
        }
      />
      <StaffListTable users={staffUsers} sitesMap={sitesMap} />
      <CreateUserDialog
        isOpen={showCreateUserDialog}
        onClose={() => setShowCreateUserDialog(false)}
        onCreateUserFirestoreDoc={handleCreateUserFirestoreDoc}
        sites={sites} 
        stalls={stalls}
      />
    </div>
  );
}

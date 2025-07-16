
"use client";

import { useState } from "react";
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
import { Loader2, ShieldAlert, PlusCircle, MoreHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StaffListTable } from "@/components/staff/StaffListTable";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import { useUserManagement } from "@/hooks/use-user-management";
import BatchUpdateStaffDialog from "./BatchUpdateStaffDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


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
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const {
    users,
    sites,
    stalls,
    loading,
    error,
    handleCreateUserFirestoreDoc,
    handleBatchUpdateStaffDetails,
  } = useUserManagement();
  
  const staffUsers = users.filter(u => u.role === 'staff' || u.role === 'manager');
  const sitesMap: Record<string, string> = sites.reduce((acc, site) => {
    acc[site.id] = site.name;
    return acc;
  }, {});

  const handleBatchUpdateConfirm = async (updates: { salary?: number; joiningDate?: Date | null; }) => {
    await handleBatchUpdateStaffDetails(selectedUserIds, updates);
    setSelectedUserIds([]); // Clear selection after update
  };
  

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading staff data...</p>
      </div>
    );
  }
  
  if (error) {
    return (
        <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
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
          <Button onClick={() => setShowCreateUserDialog(true)} disabled={loading}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Member
          </Button>
        }
      />
      {selectedUserIds.length > 0 && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-accent-foreground">
                {selectedUserIds.length} member(s) selected.
            </p>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground w-full sm:w-auto">
                        Batch Actions <MoreHorizontal className="ml-2 h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setShowBatchUpdateDialog(true)}>
                        Update Details (Salary/Joining Date)
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
      )}
      <StaffListTable 
        users={staffUsers} 
        sitesMap={sitesMap} 
        selectedUserIds={selectedUserIds}
        onSelectionChange={setSelectedUserIds}
      />
      <CreateUserDialog
        isOpen={showCreateUserDialog}
        onClose={() => setShowCreateUserDialog(false)}
        onCreateUserFirestoreDoc={handleCreateUserFirestoreDoc}
        sites={sites} 
        stalls={stalls}
      />
      <BatchUpdateStaffDialog
        isOpen={showBatchUpdateDialog}
        onClose={() => setShowBatchUpdateDialog(false)}
        onConfirm={handleBatchUpdateConfirm}
        selectedUserCount={selectedUserIds.length}
      />
    </div>
  );
}

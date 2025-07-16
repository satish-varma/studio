
"use client";

import { useState } from "react";
import { UserTable } from "@/components/users/UserTable";
import { Loader2, ShieldAlert, PlusCircle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useUserManagement } from "@/hooks/use-user-management";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LOG_PREFIX = "[UserManagementClientPage]";

export default function UserManagementClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);

  const {
    users,
    sites,
    stalls,
    loading,
    error,
    handleCreateUserFirestoreDoc,
    handleRoleChange,
    handleDeleteUser,
    handleDefaultSiteChange,
    handleDefaultStallChange,
    handleUpdateManagedSites,
    handleStatusChange,
  } = useUserManagement();
  
  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user data and context...</p>
      </div>
    );
  }

  if (error) {
    return (
       <div className="space-y-6">
        <PageHeader
          title="User Management"
          description="Create users, manage their documents, roles, and assignments. (Admins Only)"
          actions={
            <Button onClick={() => setShowCreateUserDialog(true)} disabled={loading}>
              <PlusCircle className="mr-2 h-5 w-5" /> Create New User
            </Button>
          }
        />
        <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
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
         <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>You do not have permission to view this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <PageHeader
        title="User Management"
        description="Create users, manage their documents, roles, and assignments. (Admins Only)"
        actions={
          <Button onClick={() => setShowCreateUserDialog(true)} disabled={loading}>
            <PlusCircle className="mr-2 h-5 w-5" /> Create New User
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
          onStatusChange={handleStatusChange}
          currentUserId={currentUser?.uid}
      />
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

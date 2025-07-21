
"use client";

import { useState, useMemo, useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";
import StaffListClientPage from "@/components/staff/StaffListClientPage";
import { Button } from "@/components/ui/button";
import { Loader2, PlusCircle, Filter } from "lucide-react";
import CreateUserDialog from "@/components/users/CreateUserDialog";
import BatchUpdateStaffDialog from "@/components/staff/BatchUpdateStaffDialog";
import { useUserManagement } from "@/hooks/use-user-management";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserStatus } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert, MoreHorizontal } from "lucide-react";

export default function StaffListPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false);
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('active');

  const {
    users,
    sites,
    stalls,
    staffDetails,
    loading,
    error,
    handleCreateUserFirestoreDoc,
    handleBatchUpdateStaffDetails,
  } = useUserManagement();
  
  const staffUsers = useMemo(() => {
    const baseList = users.filter(u => u.role === 'staff' || u.role === 'manager');
    if (statusFilter === 'all') {
      return baseList;
    }
    return baseList.filter(u => (u.status || 'active') === statusFilter);
  }, [users, statusFilter]);

  const sitesMap: Record<string, string> = sites.reduce((acc, site) => {
    acc[site.id] = site.name;
    return acc;
  }, {} as Record<string, string>);

  const handleBatchUpdateConfirm = async (updates: { salary?: number; joiningDate?: Date | null; }) => {
    await handleBatchUpdateStaffDetails(selectedUserIds, updates);
    setSelectedUserIds([]); // Clear selection after update
  };
  
  // When filter changes, clear selection
  useEffect(() => {
    setSelectedUserIds([]);
  }, [statusFilter]);
  
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
          currentUser?.role === 'admin' && (
            <Button onClick={() => setShowCreateUserDialog(true)} disabled={loading}>
              <PlusCircle className="mr-2 h-5 w-5" /> Add New Member
            </Button>
          )
        }
      />
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
            <SelectTrigger className="w-full sm:w-[200px] bg-input">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Staff</SelectItem>
              <SelectItem value="inactive">Inactive Staff</SelectItem>
              <SelectItem value="all">All Staff</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {selectedUserIds.length > 0 && currentUser.role === 'admin' && (
          <div className="w-full sm:w-auto p-3 bg-accent/10 border border-accent/30 rounded-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
      </div>

      <StaffListClientPage
        staffUsers={staffUsers}
        sitesMap={sitesMap}
        staffDetails={staffDetails}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
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

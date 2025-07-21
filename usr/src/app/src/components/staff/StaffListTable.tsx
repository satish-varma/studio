
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { AppUser, Site, StaffDetails } from "@/types";
import { Users as UsersIcon, Edit, IndianRupee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useMemo } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { format } from 'date-fns';
import UpdateStatusDialog from "@/components/users/UpdateStatusDialog";

interface StaffListTableProps {
  users: AppUser[];
  sitesMap: Record<string, string>;
  staffDetailsMap: Map<string, StaffDetails>;
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function StaffListTable({ users, sitesMap, staffDetailsMap, selectedUserIds, onSelectionChange }: StaffListTableProps) {
  const router = useRouter();

  const isAllSelected = useMemo(() => users.length > 0 && selectedUserIds.length === users.length, [users, selectedUserIds]);
  const isIndeterminate = useMemo(() => selectedUserIds.length > 0 && selectedUserIds.length < users.length, [users, selectedUserIds]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectionChange(checked === true ? users.map(u => u.uid) : []);
  };
  
  const handleSelectOne = (userId: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      onSelectionChange([...selectedUserIds, userId]);
    } else {
      onSelectionChange(selectedUserIds.filter(id => id !== userId));
    }
  };


  if (users.length === 0) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Staff Members Found</p>
        <p className="text-muted-foreground">
          There are no staff or managers in the system yet.
        </p>
      </div>
    );
  }

  const getSiteAssignments = (user: AppUser): string => {
    if (user.role === 'manager') {
        const managedCount = user.managedSiteIds?.length || 0;
        if (managedCount === 0) return "No sites assigned";
        const firstSiteName = user.managedSiteIds?.[0] ? sitesMap[user.managedSiteIds[0]] || user.managedSiteIds[0].substring(0,6) : '';
        return `${firstSiteName}${managedCount > 1 ? ` & ${managedCount - 1} more` : ''}`;
    }
    if (user.role === 'staff') {
        return user.defaultSiteId ? sitesMap[user.defaultSiteId] || "Assigned" : "Not assigned";
    }
    return "N/A";
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (e) {
      return "Invalid Date";
    }
  };


  return (
    <div className="rounded-lg border shadow-sm bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all staff"
                  data-state={isIndeterminate ? 'indeterminate' : isAllSelected ? 'checked' : 'unchecked'}
                />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Site Assignment</TableHead>
            <TableHead className="hidden md:table-cell text-right">Salary</TableHead>
            <TableHead className="hidden lg:table-cell">Joining Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const details = staffDetailsMap.get(user.uid);
            return (
              <TableRow key={user.uid} data-state={selectedUserIds.includes(user.uid) ? "selected" : ""}>
                <TableCell>
                    <Checkbox
                      checked={selectedUserIds.includes(user.uid)}
                      onCheckedChange={(checked) => handleSelectOne(user.uid, checked)}
                      aria-label={`Select user ${user.displayName}`}
                    />
                </TableCell>
                <TableCell className="font-medium">
                  <div>{user.displayName || "N/A"}</div>
                  <div className="text-xs text-muted-foreground capitalize">{user.status || 'active'}</div>
                </TableCell>
                <TableCell>
                    <Badge variant={user.role === 'manager' ? 'default' : (user.role === 'admin' ? 'destructive' : 'secondary')}>{user.role}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{getSiteAssignments(user)}</TableCell>
                <TableCell className="hidden md:table-cell text-right text-muted-foreground">
                  <div className="flex items-center justify-end">
                    <IndianRupee className="h-3.5 w-3.5 mr-1 text-gray-400" />
                    {details?.salary ? details.salary.toLocaleString('en-IN') : 'N/A'}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">{formatDate(details?.joiningDate)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/staff/${user.uid}/edit`)}>
                      <Edit className="mr-2 h-4 w-4" /> Edit Profile
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}


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
import type { AppUser, Site } from "@/types";
import { Users as UsersIcon, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { useMemo } from 'react';
import { Checkbox } from "@/components/ui/checkbox";

interface StaffListTableProps {
  users: AppUser[];
  sitesMap: Record<string, string>;
  selectedUserIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function StaffListTable({ users, sitesMap, selectedUserIds, onSelectionChange }: StaffListTableProps) {
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
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Site Assignment</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.uid} data-state={selectedUserIds.includes(user.uid) ? "selected" : ""}>
              <TableCell>
                  <Checkbox
                    checked={selectedUserIds.includes(user.uid)}
                    onCheckedChange={(checked) => handleSelectOne(user.uid, checked)}
                    aria-label={`Select user ${user.displayName}`}
                  />
              </TableCell>
              <TableCell className="font-medium text-foreground">{user.displayName || "N/A"}</TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell">{user.email}</TableCell>
              <TableCell>
                  <Badge variant={user.role === 'manager' ? 'default' : 'secondary'}>{user.role}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{getSiteAssignments(user)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => router.push(`/staff/${user.uid}/edit`)}>
                    <Edit className="mr-2 h-4 w-4" /> Edit Profile
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

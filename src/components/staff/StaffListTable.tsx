
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

interface StaffListTableProps {
  users: AppUser[];
  sitesMap: Record<string, string>;
}

export function StaffListTable({ users, sitesMap }: StaffListTableProps) {
  
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
            <TableHead>Name</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Site Assignment</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.uid}>
              <TableCell className="font-medium text-foreground">{user.displayName || "N/A"}</TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell">{user.email}</TableCell>
              <TableCell>
                  <Badge variant={user.role === 'manager' ? 'default' : 'secondary'}>{user.role}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{getSiteAssignments(user)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" disabled>
                    <Edit className="mr-2 h-4 w-4" /> Edit Profile (Soon)
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

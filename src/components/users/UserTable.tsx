
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AppUser, UserRole, Site, Stall } from "@/types";
import { Trash2, MoreHorizontal, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";

interface UserTableProps {
  users: AppUser[];
  sites: Site[];
  stalls: Stall[];
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>;
  onDeleteUser: (userId: string, userName: string) => Promise<void>;
  onDefaultSiteChange: (userId: string, newSiteId: string | null) => Promise<void>;
  onDefaultStallChange: (userId: string, newStallId: string | null) => Promise<void>;
  currentUserId?: string;
}

export function UserTable({
  users,
  sites,
  stalls,
  onRoleChange,
  onDeleteUser,
  onDefaultSiteChange,
  onDefaultStallChange,
  currentUserId,
}: UserTableProps) {
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null);
  const [isUpdatingSiteStall, setIsUpdatingSiteStall] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const handleRoleChangeInternal = async (userId: string, newRole: UserRole) => {
    setIsUpdatingRole(userId);
    await onRoleChange(userId, newRole);
    setIsUpdatingRole(null);
  };

  const handleDefaultSiteChangeInternal = async (userId: string, newSiteId: string) => {
    setIsUpdatingSiteStall(userId);
    await onDefaultSiteChange(userId, newSiteId === "none" ? null : newSiteId);
    // If site is set to none, stall should also be none
    if (newSiteId === "none") {
      await onDefaultStallChange(userId, null);
    }
    setIsUpdatingSiteStall(null);
  };

  const handleDefaultStallChangeInternal = async (userId: string, newStallId: string) => {
    setIsUpdatingSiteStall(userId);
    await onDefaultStallChange(userId, newStallId === "none" ? null : newStallId);
    setIsUpdatingSiteStall(null);
  };
  
  const handleDeleteInternal = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    await onDeleteUser(userToDelete.uid, userToDelete.displayName || userToDelete.email || "Unknown User");
    setIsDeleting(false);
    setUserToDelete(null);
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (e) {
      return "Invalid Date";
    }
  };

  if (users.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No users found.</p>;
  }

  return (
    <>
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Default Site</TableHead>
              <TableHead>Default Stall</TableHead>
              <TableHead>Joined On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isCurrentUserBeingManaged = user.uid === currentUserId;
              const stallsForSelectedSite = user.defaultSiteId
                ? stalls.filter(s => s.siteId === user.defaultSiteId)
                : [];

              return (
                <TableRow key={user.uid}>
                  <TableCell className="font-medium text-foreground">{user.displayName || "N/A"}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {isUpdatingRole === user.uid ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => handleRoleChangeInternal(user.uid, newRole as UserRole)}
                        disabled={isCurrentUserBeingManaged || isUpdatingRole === user.uid}
                      >
                        <SelectTrigger className="w-[120px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged}>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {isCurrentUserBeingManaged && <Badge variant="outline" className="mt-1 text-xs border-primary text-primary">Current Admin</Badge>}
                  </TableCell>
                  <TableCell>
                    {isUpdatingSiteStall === user.uid ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                        <Select
                        value={user.defaultSiteId || "none"}
                        onValueChange={(newSiteId) => handleDefaultSiteChangeInternal(user.uid, newSiteId)}
                        disabled={isCurrentUserBeingManaged || isUpdatingSiteStall === user.uid || sites.length === 0}
                        >
                        <SelectTrigger className="w-[160px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged}>
                            <SelectValue placeholder={sites.length === 0 ? "No sites" : "Select site"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">(None)</SelectItem>
                            {sites.map(site => (
                            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {isUpdatingSiteStall === user.uid && user.defaultSiteId ? ( // Show loader only if a site is selected and being processed
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                        <Select
                        value={user.defaultStallId || "none"}
                        onValueChange={(newStallId) => handleDefaultStallChangeInternal(user.uid, newStallId)}
                        disabled={isCurrentUserBeingManaged || isUpdatingSiteStall === user.uid || !user.defaultSiteId || stallsForSelectedSite.length === 0}
                        >
                        <SelectTrigger className="w-[170px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged || !user.defaultSiteId}>
                            <SelectValue placeholder={!user.defaultSiteId ? "Select site first" : (stallsForSelectedSite.length === 0 ? "No stalls in site" : "Select stall")} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">(None)</SelectItem>
                            {stallsForSelectedSite.map(stall => (
                            <SelectItem key={stall.id} value={stall.id}>{stall.name} ({stall.stallType})</SelectItem>
                            ))}
                        </SelectContent>
                        </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(user.createdAt as string | undefined)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isCurrentUserBeingManaged}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">User Actions</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                        onSelect={(e) => e.preventDefault()} 
                        className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                        disabled={isCurrentUserBeingManaged || isDeleting}
                        onClick={() => setUserToDelete(user)}
                        >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete User
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {userToDelete && (
        <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the user "{userToDelete.displayName || userToDelete.email}" 
                from Firestore. Deleting their Authentication account requires a separate process.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setUserToDelete(null)} disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                onClick={handleDeleteInternal} 
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90"
                >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete User from Firestore
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

    
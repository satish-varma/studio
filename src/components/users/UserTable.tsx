
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
import { Trash2, MoreHorizontal, Loader2, Info, Edit3, Users as UsersIcon, Building, Store } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface UserTableProps {
  users: AppUser[];
  sites: Site[];
  stalls: Stall[];
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>;
  onDeleteUser: (userId: string, userName: string) => Promise<void>;
  onDefaultSiteChange: (userId: string, newSiteId: string | null) => Promise<void>;
  onDefaultStallChange: (userId: string, newStallId: string | null) => Promise<void>;
  onManagedSitesChange: (userId: string, managedSiteIds: string[]) => Promise<void>;
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
  onManagedSitesChange,
  currentUserId,
}: UserTableProps) {
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null);
  const [isUpdatingAssignment, setIsUpdatingAssignment] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const [showManageSitesDialog, setShowManageSitesDialog] = useState(false);
  const [currentUserForSiteManagement, setCurrentUserForSiteManagement] = useState<AppUser | null>(null);
  const [selectedManagedSites, setSelectedManagedSites] = useState<string[]>([]);
  const [isSavingManagedSites, setIsSavingManagedSites] = useState(false);


  const handleRoleChangeInternal = async (userId: string, newRole: UserRole) => {
    setIsUpdatingRole(userId);
    await onRoleChange(userId, newRole);
    setIsUpdatingRole(null);
  };

  const handleDefaultSiteChangeInternal = async (userId: string, newSiteId: string) => {
    setIsUpdatingAssignment(userId);
    await onDefaultSiteChange(userId, newSiteId === "none" ? null : newSiteId);
    if (newSiteId === "none") {
      await onDefaultStallChange(userId, null); // If site is cleared, stall must be cleared
    }
    setIsUpdatingAssignment(null);
  };

  const handleDefaultStallChangeInternal = async (userId: string, newStallId: string) => {
    setIsUpdatingAssignment(userId);
    await onDefaultStallChange(userId, newStallId === "none" ? null : newStallId);
    setIsUpdatingAssignment(null);
  };

  const handleDeleteInternal = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    await onDeleteUser(userToDelete.uid, userToDelete.displayName || userToDelete.email || "Unknown User");
    setIsDeleting(false);
    setUserToDelete(null);
  };

  const openManageSitesDialog = (user: AppUser) => {
    setCurrentUserForSiteManagement(user);
    setSelectedManagedSites(user.managedSiteIds || []);
    setShowManageSitesDialog(true);
  };

  const handleSaveManagedSites = async () => {
    if (!currentUserForSiteManagement) return;
    setIsSavingManagedSites(true);
    await onManagedSitesChange(currentUserForSiteManagement.uid, selectedManagedSites);
    setIsSavingManagedSites(false);
    setShowManageSitesDialog(false);
    setCurrentUserForSiteManagement(null);
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
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Users Found</p>
        <p className="text-muted-foreground">
          There are no users in the system yet. Try creating one!
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display Name</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Site Assignment(s)</TableHead>
              <TableHead>Default Stall (Staff)</TableHead>
              <TableHead className="hidden lg:table-cell">Joined On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const isCurrentUserBeingManaged = user.uid === currentUserId;
              const isManager = user.role === 'manager';
              const isStaff = user.role === 'staff';
              const isAdmin = user.role === 'admin';

              const stallsForSelectedSite = (isStaff && user.defaultSiteId)
                ? stalls.filter(s => s.siteId === user.defaultSiteId)
                : [];
              
              let siteAssignmentDisplay: React.ReactNode;
              if (isManager) {
                const managedSiteNames = (user.managedSiteIds || [])
                  .map(id => sites.find(s => s.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");
                siteAssignmentDisplay = (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs whitespace-nowrap">
                       Manages: {managedSiteNames || (user.managedSiteIds?.length ? `${user.managedSiteIds.length} site(s)` : "None")}
                    </Badge>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openManageSitesDialog(user)}
                      disabled={isCurrentUserBeingManaged || isUpdatingAssignment === user.uid}
                    >
                      <Edit3 size={14}/>
                      <span className="sr-only">Edit Managed Sites</span>
                    </Button>
                  </div>
                );
              } else if (isStaff) {
                siteAssignmentDisplay = (
                  <Select
                    value={user.defaultSiteId || "none"}
                    onValueChange={(newSiteId) => handleDefaultSiteChangeInternal(user.uid, newSiteId)}
                    disabled={isCurrentUserBeingManaged || isUpdatingAssignment === user.uid || sites.length === 0}
                  >
                    <SelectTrigger className="w-full sm:w-[160px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged}>
                       <Building size={12} className="mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder={sites.length === 0 ? "No sites" : "Default Site"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">(None)</SelectItem>
                      {sites.map(site => (
                        <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              } else { // Admin
                siteAssignmentDisplay = <Badge variant="outline" className="text-xs border-primary/70 text-primary/90">All Access</Badge>;
              }


              return (
                <TableRow key={user.uid}>
                  <TableCell className="font-medium text-foreground">{user.displayName || "N/A"}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{user.email}</TableCell>
                  <TableCell>
                    {isUpdatingRole === user.uid ? (
                       <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Select
                        value={user.role}
                        onValueChange={(newRole) => handleRoleChangeInternal(user.uid, newRole as UserRole)}
                        disabled={isCurrentUserBeingManaged || isUpdatingRole === user.uid}
                      >
                        <SelectTrigger className="w-full sm:w-[120px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged}>
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
                    {isUpdatingAssignment === user.uid && (isStaff || isManager) ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : siteAssignmentDisplay }
                  </TableCell>
                  <TableCell>
                    {isUpdatingAssignment === user.uid && isStaff && user.defaultSiteId ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : isStaff ? (
                      <Select
                        value={user.defaultStallId || "none"}
                        onValueChange={(newStallId) => handleDefaultStallChangeInternal(user.uid, newStallId)}
                        disabled={isCurrentUserBeingManaged || isUpdatingAssignment === user.uid || !user.defaultSiteId || stallsForSelectedSite.length === 0}
                      >
                        <SelectTrigger className="w-full sm:w-[170px] bg-input text-xs h-8" disabled={isCurrentUserBeingManaged || !user.defaultSiteId}>
                           <Store size={12} className="mr-1.5 text-muted-foreground" />
                          <SelectValue placeholder={!user.defaultSiteId ? "Select site first" : (stallsForSelectedSite.length === 0 ? "No stalls" : "Default Stall")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">(None)</SelectItem>
                          {stallsForSelectedSite.map(stall => (
                            <SelectItem key={stall.id} value={stall.id}>{stall.name} ({stall.stallType})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-xs">N/A</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">{formatDate(user.createdAt as string | undefined)}</TableCell>
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
                        <Trash2 className="mr-2 h-4 w-4" /> Delete User Account
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
                This action cannot be undone. This will permanently delete the user account for "{userToDelete.displayName || userToDelete.email}" 
                (allowing their email to be reused) and their associated data document from Firestore.
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
                Delete User Account
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

      {currentUserForSiteManagement && (
        <Dialog open={showManageSitesDialog} onOpenChange={(open) => {
            if (!open) {
                setCurrentUserForSiteManagement(null);
                setSelectedManagedSites([]);
            }
            setShowManageSitesDialog(open);
        }}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Manage Sites for {currentUserForSiteManagement.displayName || currentUserForSiteManagement.email}</DialogTitle>
                    <DialogDescription>
                        Select the sites this manager is responsible for. Default site/stall preferences for this manager will be cleared if assignments change.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[300px] my-4 pr-3 border rounded-md">
                    <div className="p-4 space-y-2">
                        {sites.length > 0 ? sites.map(site => (
                            <div key={site.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`site-${site.id}`}
                                    checked={selectedManagedSites.includes(site.id)}
                                    onCheckedChange={(checked) => {
                                        setSelectedManagedSites(prev =>
                                            checked === true
                                            ? [...prev, site.id]
                                            : prev.filter(id => id !== site.id)
                                        );
                                    }}
                                    disabled={isSavingManagedSites}
                                />
                                <Label htmlFor={`site-${site.id}`} className="font-normal text-sm">
                                    {site.name}
                                </Label>
                            </div>
                        )) : (
                            <p className="text-sm text-muted-foreground text-center py-4">No sites available to assign.</p>
                        )}
                    </div>
                </ScrollArea>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowManageSitesDialog(false)} disabled={isSavingManagedSites}>Cancel</Button>
                    <Button type="button" onClick={handleSaveManagedSites} disabled={isSavingManagedSites}>
                        {isSavingManagedSites && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </>
  );
}

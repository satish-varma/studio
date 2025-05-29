
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
import type { AppUser, UserRole } from "@/types";
import { Trash2, MoreHorizontal, Loader2, ShieldQuestion } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  onRoleChange: (userId: string, newRole: UserRole) => Promise<void>;
  onDeleteUser: (userId: string, userName: string) => Promise<void>;
  currentUserId?: string; // UID of the currently logged-in admin
}

export function UserTable({ users, onRoleChange, onDeleteUser, currentUserId }: UserTableProps) {
  const [isUpdatingRole, setIsUpdatingRole] = useState<string | null>(null); // userId of user being updated
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRoleChangeInternal = async (userId: string, newRole: UserRole) => {
    setIsUpdatingRole(userId);
    await onRoleChange(userId, newRole);
    setIsUpdatingRole(null);
  };
  
  const handleDeleteInternal = async (userId: string, userName: string) => {
    setIsDeleting(true);
    await onDeleteUser(userId, userName);
    setIsDeleting(false);
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
    <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Display Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined On</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isCurrentUserAdmin = user.uid === currentUserId;
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
                      disabled={isCurrentUserAdmin || isUpdatingRole === user.uid}
                    >
                      <SelectTrigger className="w-[120px] bg-input text-xs h-8" disabled={isCurrentUserAdmin}>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {isCurrentUserAdmin && <Badge variant="outline" className="mt-1 text-xs border-primary text-primary">Current Admin</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt as string | undefined)}</TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                     <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isCurrentUserAdmin}>
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">User Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <AlertDialogTrigger asChild>
                           <DropdownMenuItem 
                            onSelect={(e) => e.preventDefault()} 
                            className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                            disabled={isCurrentUserAdmin || isDeleting}
                           >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete User
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        {/* Add other actions like "View Profile" or "Reset Password" here if needed */}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the user "{user.displayName || user.email}" 
                          from Firestore. Deleting their Authentication account requires a separate process.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDeleteInternal(user.uid, user.displayName || user.email || "Unknown User")} 
                          disabled={isDeleting}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Delete User from Firestore
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

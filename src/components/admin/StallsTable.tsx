
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
import type { Stall } from "@/types/stall";
import { MoreHorizontal, Edit, Trash2, Loader2, Store } from "lucide-react"; // Added Store icon
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in StallsTable:", error);
  }
}
const db = getFirestore();

interface StallsTableProps {
  stalls: Stall[];
}

export function StallsTable({ stalls }: StallsTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const siteId = params.siteId as string;

  const [isDeleting, setIsDeleting] = useState(false);
  const [stallToDelete, setStallToDelete] = useState<Stall | null>(null);

  const handleEdit = (stallId: string) => {
    router.push(`/admin/sites/${siteId}/stalls/${stallId}/edit`);
  };

  const openDeleteDialog = (stall: Stall) => {
    setStallToDelete(stall);
  };

  const closeDeleteDialog = () => {
    setStallToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!stallToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "stalls", stallToDelete.id));
      toast({
        title: "Stall Deleted",
        description: `Stall "${stallToDelete.name}" has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting stall:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not delete the stall. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      closeDeleteDialog();
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch (e) { return "Invalid Date"; }
  };

  if (stalls.length === 0) {
     return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <Store className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Stalls Found for this Site</p>
        <p className="text-muted-foreground">
          You haven't added any stalls to this site yet.
        </p>
        <Button className="mt-4" onClick={() => router.push(`/admin/sites/${siteId}/stalls/new`)}>
          Add Your First Stall
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Created At</TableHead>
              <TableHead className="hidden lg:table-cell">Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stalls.map((stall) => (
              <TableRow key={stall.id}>
                <TableCell className="font-medium text-foreground">{stall.name}</TableCell>
                <TableCell className="text-muted-foreground">{stall.stallType}</TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{formatDate(stall.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">{formatDate(stall.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Stall Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(stall.id)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit Stall
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(stall)}
                        className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Stall
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {stallToDelete && (
        <AlertDialog open={!!stallToDelete} onOpenChange={(open) => !open && closeDeleteDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the stall "{stallToDelete.name}".
                Any items or data associated with this stall will need to be manually re-assigned or handled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeDeleteDialog} disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Stall
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

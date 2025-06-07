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
import type { Site } from "@/types/site";
import { MoreHorizontal, Edit, Trash2, Store, Loader2, Building } from "lucide-react"; // Added Building icon
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SitesTable:", error);
  }
}
const db = getFirestore();

interface SitesTableProps {
  sites: Site[];
}

export function SitesTable({ sites }: SitesTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);

  const handleEdit = (siteId: string) => {
    router.push(`/admin/sites/${siteId}/edit`);
  };

  const handleManageStalls = (siteId: string) => {
    router.push(`/admin/sites/${siteId}/stalls`);
  };

  const openDeleteDialog = (site: Site) => {
    setSiteToDelete(site);
  };

  const closeDeleteDialog = () => {
    setSiteToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!siteToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "sites", siteToDelete.id));
      toast({
        title: "Site Deleted",
        description: `Site "${siteToDelete.name}" has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting site:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not delete the site. Please try again.",
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

  if (sites.length === 0) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <Building className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Sites Found</p>
        <p className="text-muted-foreground">
          You haven't added any sites yet.
        </p>
        <Button className="mt-4" onClick={() => router.push('/admin/sites/new')}>
          Add Your First Site
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.map((site) => (
              <TableRow key={site.id}>
                <TableCell className="font-medium text-foreground">{site.name}</TableCell>
                <TableCell className="text-muted-foreground">{site.location || "N/A"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(site.createdAt)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(site.updatedAt)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Site Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleManageStalls(site.id)}>
                        <Store className="mr-2 h-4 w-4" /> Manage Stalls
                      </DropdownMenuItem>
                       <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleEdit(site.id)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit Site
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => openDeleteDialog(site)}
                        className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Site
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {siteToDelete && (
        <AlertDialog open={!!siteToDelete} onOpenChange={(open) => !open && closeDeleteDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the site "{siteToDelete.name}".
                Stalls associated with this site will NOT be automatically deleted and may need manual cleanup or re-association.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeDeleteDialog} disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete Site
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
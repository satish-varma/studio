
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query, deleteDoc, doc, getDocs, where } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { FoodVendor } from '@/types/food';
import { ScrollArea } from '../ui/scroll-area';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("ManageVendorsDialog: Firebase initialization error:", error);
  }
} else {
  db = getFirestore(getApp());
}

interface ManageVendorsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageVendorsDialog({ isOpen, onClose }: ManageVendorsDialogProps) {
  const [vendors, setVendors] = useState<FoodVendor[]>([]);
  const [newVendorName, setNewVendorName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!db || !isOpen) return;

    setIsLoading(true);
    const vendorsCollectionRef = collection(db, "foodVendors");
    const q = query(vendorsCollectionRef, orderBy("name", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedVendors = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FoodVendor));
      setVendors(fetchedVendors);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching vendors:", error);
      toast({ title: "Error", description: "Could not fetch vendors.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, toast]);

  const handleAddVendor = async () => {
    if (!db) return;
    const trimmedName = newVendorName.trim();
    if (!trimmedName) {
      toast({ title: "Validation Error", description: "Vendor name cannot be empty.", variant: "destructive" });
      return;
    }
    // Check for duplicates (case-insensitive)
    if (vendors.some(vendor => vendor.name.toLowerCase() === trimmedName.toLowerCase())) {
        toast({ title: "Duplicate Vendor", description: "This vendor name already exists.", variant: "destructive"});
        return;
    }

    setIsAdding(true);
    try {
      await addDoc(collection(db, "foodVendors"), {
        name: trimmedName,
        createdAt: new Date().toISOString(),
      });
      toast({ title: "Vendor Added", description: `"${trimmedName}" has been added to your vendors list.` });
      setNewVendorName("");
    } catch (error: any) {
      console.error("Error adding vendor:", error);
      toast({ title: "Error", description: "Could not add vendor. " + error.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteVendor = async (vendorId: string, vendorName: string) => {
    if (!db) return;
    setIsDeleting(vendorId);
    try {
      await deleteDoc(doc(db, "foodVendors", vendorId));
      toast({ title: "Vendor Deleted", description: `"${vendorName}" has been removed.` });
    } catch (error: any) {
      console.error("Error deleting vendor:", error);
      toast({ title: "Error", description: "Could not delete vendor. " + error.message, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Food Stall Vendors</DialogTitle>
          <DialogDescription>Add or remove vendors from the list used in expense tracking.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="flex gap-2">
            <Input
              value={newVendorName}
              onChange={(e) => setNewVendorName(e.target.value)}
              placeholder="Enter new vendor name"
              disabled={isAdding}
              onKeyDown={(e) => e.key === 'Enter' && handleAddVendor()}
            />
            <Button onClick={handleAddVendor} disabled={isAdding || !newVendorName.trim()}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              <span className="ml-2">Add</span>
            </Button>
          </div>
          <ScrollArea className="h-64 border rounded-md p-2">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : vendors.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">No vendors added yet.</p>
            ) : (
              <div className="space-y-2">
                {vendors.map(vendor => (
                  <div key={vendor.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <span className="text-sm">{vendor.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteVendor(vendor.id, vendor.name)}
                      disabled={isDeleting === vendor.id}
                      aria-label={`Delete vendor ${vendor.name}`}
                    >
                      {isDeleting === vendor.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

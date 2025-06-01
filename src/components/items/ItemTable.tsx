
"use client";

import Image from "next/image";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StockItem, Stall, Site } from "@/types";
import { MoreHorizontal, Edit, Trash2, PackageOpen, Loader2, Building, Store } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { getFirestore, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemTable:", error);
  }
}
const db = getFirestore();

interface ItemTableProps {
  items: StockItem[];
  sitesMap: Record<string, string>; // siteId -> siteName
  stallsMap: Record<string, string>; // stallId -> stallName
}

export function ItemTable({ items, sitesMap, stallsMap }: ItemTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockUpdateItemId, setStockUpdateItemId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState<number | string>("");

  const handleEdit = (itemId: string) => {
    router.push(`/items/${itemId}/edit`);
  };

  const handleDelete = async (itemId: string, itemName: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "stockItems", itemId));
      toast({
        title: "Item Deleted",
        description: `${itemName} has been successfully deleted.`,
      });
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not delete the item. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  const handleOpenUpdateStockDialog = (item: StockItem) => {
    setStockUpdateItemId(item.id);
    setNewQuantity(item.quantity); 
  };

  const handleStockQuantityChange = async () => {
    if (stockUpdateItemId === null || newQuantity === "" || isNaN(Number(newQuantity)) || Number(newQuantity) < 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid non-negative number for the quantity.", variant: "destructive" });
      return;
    }
    setIsUpdatingStock(true);
    try {
      const itemRef = doc(db, "stockItems", stockUpdateItemId);
      await updateDoc(itemRef, {
        quantity: Number(newQuantity),
        lastUpdated: new Date().toISOString(),
      });
      toast({
        title: "Stock Updated",
        description: `Stock quantity updated to ${newQuantity}.`,
      });
      setStockUpdateItemId(null); 
      setNewQuantity("");
    } catch (error: any) {
      console.error("Error updating stock:", error);
      toast({
        title: "Stock Update Failed",
        description: error.message || "Could not update stock. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStock(false);
    }
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

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No items found for the current filter.</p>;
  }

  return (
    <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[64px]">Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isLowStock = item.quantity <= item.lowStockThreshold;
            const isOutOfStock = item.quantity === 0;
            const siteName = item.siteId ? sitesMap[item.siteId] || item.siteId.substring(0,6)+"..." : "N/A";
            const stallName = item.stallId ? stallsMap[item.stallId] || item.stallId.substring(0,6)+"..." : "Master Stock";
            
            return (
              <TableRow key={item.id} className={cn(
                isLowStock && !isOutOfStock && "bg-orange-500/10 hover:bg-orange-500/20",
                isOutOfStock && "bg-destructive/10 hover:bg-destructive/20",
              )}>
                <TableCell>
                  <Image
                    src={item.imageUrl || `https://placehold.co/64x64.png?text=${item.name.substring(0,2)}`}
                    alt={item.name}
                    width={40}
                    height={40}
                    className="rounded-md object-cover"
                    data-ai-hint={`${item.category} item`}
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center text-muted-foreground">
                    <Building size={14} className="mr-1 text-primary/70" /> {siteName}
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground/80">
                    <Store size={12} className="mr-1 text-accent/70" /> {stallName}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-right text-foreground">{item.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                <TableCell className="text-right text-foreground">₹{item.price.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      isOutOfStock ? "destructive" : isLowStock ? "outline" : "secondary"
                    }
                    className={cn(
                       isLowStock && !isOutOfStock && "border-orange-500 text-orange-600 dark:text-orange-400",
                       isOutOfStock && "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{formatDate(item.lastUpdated)}</TableCell>
                <TableCell className="text-right">
                  <Dialog open={stockUpdateItemId === item.id} onOpenChange={(open) => !open && setStockUpdateItemId(null)}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DialogTrigger asChild>
                          <DropdownMenuItem onClick={() => handleOpenUpdateStockDialog(item)}>
                            <PackageOpen className="mr-2 h-4 w-4" /> Update Stock
                          </DropdownMenuItem>
                        </DialogTrigger>
                        <DropdownMenuItem onClick={() => handleEdit(item.id)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit Item
                        </DropdownMenuItem>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive-foreground focus:bg-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Item
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the item "{item.name}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(item.id, item.name)} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Update Stock for {item.name}</DialogTitle>
                        <DialogDescription>
                          Current quantity: {item.quantity} {item.unit} ({item.stallId ? stallsMap[item.stallId] || 'Stall '+item.stallId.substring(0,4) : 'Master Stock'} at {item.siteId ? sitesMap[item.siteId] || 'Site '+item.siteId.substring(0,4) : 'N/A Site'}).
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="quantity" className="text-right">
                            New Quantity
                          </Label>
                          <Input
                            id="quantity"
                            type="number"
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(e.target.value)}
                            className="col-span-3 bg-input"
                            min="0"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                           <Button type="button" variant="outline" disabled={isUpdatingStock}>Cancel</Button>
                        </DialogClose>
                        <Button type="button" onClick={handleStockQuantityChange} disabled={isUpdatingStock}>
                          {isUpdatingStock && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save changes
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

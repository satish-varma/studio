
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
import type { StockItem, Stall } from "@/types";
import { MoreHorizontal, Edit, Trash2, PackageOpen, Loader2, Building, Store, MoveRight, Undo2 } from "lucide-react";
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
  AlertDialogTrigger,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getFirestore,
  doc,
  deleteDoc,
  updateDoc,
  runTransaction,
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
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
  sitesMap: Record<string, string>;
  stallsMap: Record<string, string>;
  availableStallsForAllocation: Stall[];
  onDataNeedsRefresh: () => void; // Callback to refresh data
}

export function ItemTable({ items, sitesMap, stallsMap, availableStallsForAllocation, onDataNeedsRefresh }: ItemTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockUpdateItemId, setStockUpdateItemId] = useState<string | null>(null);
  const [newQuantity, setNewQuantity] = useState<number | string>("");

  const [itemToAllocate, setItemToAllocate] = useState<StockItem | null>(null);
  const [showAllocateDialog, setShowAllocateDialog] = useState(false);
  const [targetStallIdForAllocation, setTargetStallIdForAllocation] = useState("");
  const [quantityToAllocate, setQuantityToAllocate] = useState<number | string>("");
  const [isAllocating, setIsAllocating] = useState(false);

  const [itemToReturn, setItemToReturn] = useState<StockItem | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [quantityToReturn, setQuantityToReturn] = useState<number | string>("");
  const [isReturning, setIsReturning] = useState(false);


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
      onDataNeedsRefresh(); 
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
      onDataNeedsRefresh(); 
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

  const handleOpenAllocateDialog = (item: StockItem) => {
    setItemToAllocate(item);
    setQuantityToAllocate(1);
    setTargetStallIdForAllocation("");
    setShowAllocateDialog(true);
  };

  const handleConfirmAllocation = async () => {
    if (!itemToAllocate || !targetStallIdForAllocation || quantityToAllocate === "" || Number(quantityToAllocate) <= 0) {
      toast({ title: "Invalid Input", description: "Please select a target stall and enter a valid quantity greater than 0.", variant: "destructive" });
      return;
    }

    const numQuantityToAllocate = Number(quantityToAllocate);
    if (numQuantityToAllocate > itemToAllocate.quantity) {
      toast({ title: "Insufficient Stock", description: `Cannot allocate ${numQuantityToAllocate}. Only ${itemToAllocate.quantity} available in master stock.`, variant: "destructive" });
      return;
    }

    setIsAllocating(true);
    try {
      await runTransaction(db, async (transaction) => {
        const masterStockRef = doc(db, "stockItems", itemToAllocate.id);
        const masterStockSnap = await transaction.get(masterStockRef);

        if (!masterStockSnap.exists()) {
          throw new Error("Master stock item not found.");
        }
        const currentMasterStock = masterStockSnap.data() as StockItem;
        if (currentMasterStock.quantity < numQuantityToAllocate) {
          throw new Error(`Concurrent update: Not enough master stock. Available: ${currentMasterStock.quantity}`);
        }

        const stallItemsRef = collection(db, "stockItems");
        const q = query(stallItemsRef,
                        where("originalMasterItemId", "==", itemToAllocate.id),
                        where("stallId", "==", targetStallIdForAllocation));
        const existingStallItemQuerySnap = await getDocs(q); // Use getDocs, not transaction.get for queries

        let targetStallItemRef;
        let newStallItemQuantity = numQuantityToAllocate;

        if (!existingStallItemQuerySnap.empty) {
          const existingStallItemDoc = existingStallItemQuerySnap.docs[0];
          targetStallItemRef = existingStallItemDoc.ref;
          const existingStallItemData = existingStallItemDoc.data() as StockItem;
          newStallItemQuantity = existingStallItemData.quantity + numQuantityToAllocate;

          transaction.update(targetStallItemRef, {
            quantity: newStallItemQuantity,
            lastUpdated: new Date().toISOString(),
          });

        } else {
          targetStallItemRef = doc(collection(db, "stockItems"));
          const newStallItemData: Omit<StockItem, 'id'> = {
            name: currentMasterStock.name,
            category: currentMasterStock.category,
            quantity: newStallItemQuantity,
            unit: currentMasterStock.unit,
            price: currentMasterStock.price,
            lowStockThreshold: currentMasterStock.lowStockThreshold,
            imageUrl: currentMasterStock.imageUrl,
            siteId: currentMasterStock.siteId,
            stallId: targetStallIdForAllocation,
            originalMasterItemId: itemToAllocate.id,
            lastUpdated: new Date().toISOString(),
          };
          transaction.set(targetStallItemRef, newStallItemData);
        }

        transaction.update(masterStockRef, {
          quantity: currentMasterStock.quantity - numQuantityToAllocate,
          lastUpdated: new Date().toISOString(),
        });
      });

      toast({
        title: "Stock Allocated",
        description: `${numQuantityToAllocate} unit(s) of ${itemToAllocate.name} allocated successfully.`,
      });
      setShowAllocateDialog(false);
      setItemToAllocate(null);
      onDataNeedsRefresh(); 
    } catch (error: any) {
      console.error("Error allocating stock:", error);
      toast({
        title: "Allocation Failed",
        description: error.message || "Could not allocate stock. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAllocating(false);
    }
  };

  const handleOpenReturnDialog = (item: StockItem) => {
    setItemToReturn(item);
    setQuantityToReturn(1); 
    setShowReturnDialog(true);
  };

  const handleConfirmReturnToMaster = async () => {
    if (!itemToReturn || !itemToReturn.originalMasterItemId || quantityToReturn === "" || Number(quantityToReturn) <= 0) {
      toast({ title: "Invalid Input", description: "Please enter a valid quantity greater than 0 to return.", variant: "destructive" });
      return;
    }
    const numQuantityToReturn = Number(quantityToReturn);
    if (numQuantityToReturn > itemToReturn.quantity) {
      toast({ title: "Insufficient Stall Stock", description: `Cannot return ${numQuantityToReturn}. Only ${itemToReturn.quantity} available in this stall.`, variant: "destructive" });
      return;
    }

    setIsReturning(true);
    try {
      await runTransaction(db, async (transaction) => {
        const stallItemRef = doc(db, "stockItems", itemToReturn.id);
        const masterItemRef = doc(db, "stockItems", itemToReturn.originalMasterItemId!);

        const stallItemSnap = await transaction.get(stallItemRef);
        const masterItemSnap = await transaction.get(masterItemRef);

        if (!stallItemSnap.exists()) {
          throw new Error("Stall item not found. Cannot proceed with return.");
        }
        if (!masterItemSnap.exists()) {
          throw new Error("Original master stock item not found. Cannot return to a non-existent master item.");
        }

        const currentStallStock = stallItemSnap.data() as StockItem;
        const currentMasterStock = masterItemSnap.data() as StockItem;

        if (currentStallStock.quantity < numQuantityToReturn) {
          throw new Error(`Concurrent update: Not enough stall stock to return. Available: ${currentStallStock.quantity}`);
        }
        
        transaction.update(masterItemRef, {
          quantity: currentMasterStock.quantity + numQuantityToReturn,
          lastUpdated: new Date().toISOString(),
        });

        transaction.update(stallItemRef, {
          quantity: currentStallStock.quantity - numQuantityToReturn,
          lastUpdated: new Date().toISOString(),
        });
      });

      toast({
        title: "Stock Returned to Master",
        description: `${numQuantityToReturn} unit(s) of ${itemToReturn.name} returned to master stock.`,
      });
      setShowReturnDialog(false);
      setItemToReturn(null);
      onDataNeedsRefresh();
    } catch (error: any)
    {
      console.error("Error returning stock to master:", error);
      toast({
        title: "Return Failed",
        description: error.message || "Could not return stock to master. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsReturning(false);
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
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Stock Items Found</p>
        <p className="text-muted-foreground">
          No items match your current filters for this site/stall.
        </p>
        <p className="text-muted-foreground mt-1">
          Try adjusting the search or filters above. You can also use the "Add New Item" button
          (if enabled) to add stock to the currently selected site context.
        </p>
      </div>
    );
  }

  const stallsForCurrentSite = itemToAllocate?.siteId
    ? availableStallsForAllocation.filter(s => s.siteId === itemToAllocate.siteId)
    : [];

  return (
    <>
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

              const siteNameDisplay = item.siteId ? (sitesMap[item.siteId] || `Site ID: ${item.siteId.substring(0,6)}...`) : "N/A";
              let stallDisplay;
              if (item.stallId) {
                  stallDisplay = stallsMap[item.stallId] || `Stall ID: ${item.stallId.substring(0,6)}...`;
              } else if (item.siteId) {
                  stallDisplay = `Master Stock`;
              } else {
                  stallDisplay = "Unknown Location";
              }

              return (
                <TableRow key={item.id} className={cn(
                  isLowStock && !isOutOfStock && "bg-orange-500/10 hover:bg-orange-500/20",
                  isOutOfStock && "bg-destructive/10 hover:bg-destructive/20",
                )}>
                  <TableCell>
                    <Image
                      src={item.imageUrl || `https://placehold.co/64x64.png?text=${item.name.substring(0,2)}`}
                      alt={item.name}
                      data-ai-hint={`${item.category} item`}
                      width={40}
                      height={40}
                      className="rounded-md object-cover"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center text-muted-foreground">
                      <Building size={14} className="mr-1 text-primary/70" /> {siteNameDisplay}
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground/80">
                      <Store size={12} className="mr-1 text-accent/70" /> {stallDisplay}
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
                           {item.stallId === null && ( 
                            <DropdownMenuItem onClick={() => handleOpenAllocateDialog(item)}>
                              <MoveRight className="mr-2 h-4 w-4" /> Allocate to Stall
                            </DropdownMenuItem>
                          )}
                          {item.stallId !== null && item.originalMasterItemId && (
                             <DropdownMenuItem onClick={() => handleOpenReturnDialog(item)}>
                              <Undo2 className="mr-2 h-4 w-4" /> Return to Master
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
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
                                  If this is master stock, any allocated stall stock derived from it will NOT be automatically deleted.
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
                            Current quantity: {item.quantity} {item.unit} ({stallDisplay} at {siteNameDisplay}).
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

      {itemToAllocate && (
        <AlertDialog open={showAllocateDialog} onOpenChange={setShowAllocateDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Allocate Stock: {itemToAllocate.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Current master stock: {itemToAllocate.quantity} {itemToAllocate.unit} at {sitesMap[itemToAllocate.siteId!] || 'Unknown Site'}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="targetStall">Target Stall</Label>
                <Select
                  value={targetStallIdForAllocation}
                  onValueChange={setTargetStallIdForAllocation}
                  disabled={isAllocating || stallsForCurrentSite.length === 0}
                >
                  <SelectTrigger id="targetStall" className="bg-input">
                    <SelectValue placeholder={stallsForCurrentSite.length === 0 ? "No stalls in this site" : "Select target stall"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stallsForCurrentSite.map((stall) => (
                      <SelectItem key={stall.id} value={stall.id}>
                        {stall.name} ({stall.stallType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantityToAllocate">Quantity to Allocate</Label>
                <Input
                  id="quantityToAllocate"
                  type="number"
                  value={quantityToAllocate}
                  onChange={(e) => setQuantityToAllocate(e.target.value)}
                  min="1"
                  max={itemToAllocate.quantity}
                  className="bg-input"
                  disabled={isAllocating}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowAllocateDialog(false)} disabled={isAllocating}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmAllocation} disabled={isAllocating || !targetStallIdForAllocation || Number(quantityToAllocate) <= 0}>
                {isAllocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Allocation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {itemToReturn && (
        <AlertDialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Return to Master Stock: {itemToReturn.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Currently at stall: {stallsMap[itemToReturn.stallId!] || 'Unknown Stall'} (Quantity: {itemToReturn.quantity} {itemToReturn.unit}).
                Returning to Master Stock for Site: {sitesMap[itemToReturn.siteId!] || 'Unknown Site'}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
               <div>
                <Label htmlFor="quantityToReturn">Quantity to Return</Label>
                <Input
                  id="quantityToReturn"
                  type="number"
                  value={quantityToReturn}
                  onChange={(e) => setQuantityToReturn(e.target.value)}
                  min="1"
                  max={itemToReturn.quantity}
                  className="bg-input"
                  disabled={isReturning}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowReturnDialog(false)} disabled={isReturning}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmReturnToMaster} 
                disabled={isReturning || Number(quantityToReturn) <= 0 || Number(quantityToReturn) > itemToReturn.quantity}
              >
                {isReturning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Return
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

    
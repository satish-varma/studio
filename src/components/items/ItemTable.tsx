
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
import { MoreHorizontal, Edit, Trash2, PackageOpen, Loader2, Building, Store, MoveRight, Undo2, Link2Icon, Shuffle } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Timestamp,
  DocumentReference,
  DocumentSnapshot
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
  availableStallsForAllocation: Stall[]; // Stalls for the currently active site
  onDataNeedsRefresh: () => void;
}

export function ItemTable({ items, sitesMap, stallsMap, availableStallsForAllocation, onDataNeedsRefresh }: ItemTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockUpdateItem, setStockUpdateItem] = useState<StockItem | null>(null);
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

  const [itemToTransfer, setItemToTransfer] = useState<StockItem | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [destinationStallId, setDestinationStallId] = useState("");
  const [quantityToTransfer, setQuantityToTransfer] = useState<number | string>("");
  const [isTransferring, setIsTransferring] = useState(false);


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
    setStockUpdateItem(item);
    setNewQuantity(item.quantity);
  };

  const handleStockQuantityChange = async () => {
    if (stockUpdateItem === null || newQuantity === "" || isNaN(Number(newQuantity)) || Number(newQuantity) < 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid non-negative number for the quantity.", variant: "destructive" });
      return;
    }
    setIsUpdatingStock(true);
    const updatedQuantityNum = Number(newQuantity);

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, "stockItems", stockUpdateItem.id);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists()) {
          throw new Error("Item being updated not found.");
        }
        const currentItemData = itemSnap.data() as StockItem;
        const oldQuantity = currentItemData.quantity;
        const quantityDelta = updatedQuantityNum - oldQuantity;

        // If it's a stall item with a master link, prepare to read master
        let masterItemRef: DocumentReference | null = null;
        let masterItemSnap: DocumentSnapshot | null = null;
        if (currentItemData.stallId && currentItemData.originalMasterItemId) {
          masterItemRef = doc(db, "stockItems", currentItemData.originalMasterItemId);
          masterItemSnap = await transaction.get(masterItemRef); // Read master
          if (!masterItemSnap?.exists()) {
            console.warn(`Master stock item ${currentItemData.originalMasterItemId} not found. Stall stock update will proceed, but master stock cannot be adjusted.`);
            masterItemRef = null; // Nullify if not found, so no master update attempted
          }
        }

        // Perform writes after all reads
        transaction.update(itemRef, {
          quantity: updatedQuantityNum,
          lastUpdated: new Date().toISOString(),
        });

        if (masterItemRef && masterItemSnap && masterItemSnap.exists()) {
          const masterItemData = masterItemSnap.data() as StockItem;
          const newMasterQuantity = masterItemData.quantity - quantityDelta; // if delta is positive (increase in stall), master decreases. if delta is negative (decrease in stall), master also effectively decreases by abs(delta)

          transaction.update(masterItemRef, {
            quantity: Math.max(0, newMasterQuantity),
            lastUpdated: new Date().toISOString(),
          });
        }
      });

      toast({
        title: "Stock Updated",
        description: `Stock quantity for "${stockUpdateItem.name}" updated to ${updatedQuantityNum}. Master stock (if applicable) adjusted accordingly.`,
      });
      setStockUpdateItem(null);
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

        // Check if item already exists at target stall (linked to the same master item)
        const stallItemsQuery = query(
          collection(db, "stockItems"),
          where("originalMasterItemId", "==", itemToAllocate.id),
          where("stallId", "==", targetStallIdForAllocation)
        );
        // This getDocs is problematic inside a transaction. We'll query first, then read the specific doc inside.
        // For a more robust solution, structure data so you can directly get the targetStallItemRef if it exists.
        // Or, accept that this specific check for existing stall item happens outside strict transactionality for getDocs.
        // A common pattern: try to get. If not found, create. If found, update. All within transaction.
        const existingStallItemsSnap = await getDocs(stallItemsQuery); // Ideally, this is avoided or handled differently.
        let targetStallItemRef: DocumentReference;
        let existingStallItemData: StockItem | null = null;

        if (!existingStallItemsSnap.empty) {
            targetStallItemRef = existingStallItemsSnap.docs[0].ref;
            const targetStallItemSnap = await transaction.get(targetStallItemRef);
            if (targetStallItemSnap.exists()) {
                existingStallItemData = targetStallItemSnap.data() as StockItem;
            } else {
                 // Discrepancy, item might have been deleted. Treat as new.
                 targetStallItemRef = doc(collection(db, "stockItems"));
            }
        } else {
            targetStallItemRef = doc(collection(db, "stockItems"));
        }


        if (existingStallItemData) {
            transaction.update(targetStallItemRef, {
                quantity: existingStallItemData.quantity + numQuantityToAllocate,
                lastUpdated: new Date().toISOString(),
            });
        } else {
            const newStallItemDataToSave: Omit<StockItem, 'id'> = {
                name: currentMasterStock.name,
                category: currentMasterStock.category,
                quantity: numQuantityToAllocate,
                unit: currentMasterStock.unit,
                price: currentMasterStock.price,
                lowStockThreshold: currentMasterStock.lowStockThreshold,
                imageUrl: currentMasterStock.imageUrl,
                siteId: currentMasterStock.siteId,
                stallId: targetStallIdForAllocation,
                originalMasterItemId: itemToAllocate.id,
                lastUpdated: new Date().toISOString(),
            };
            transaction.set(targetStallItemRef, newStallItemDataToSave);
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
    }
    catch (error: any)
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

  const handleOpenTransferDialog = (item: StockItem) => {
    setItemToTransfer(item);
    setQuantityToTransfer(1);
    setDestinationStallId("");
    setShowTransferDialog(true);
  };

  const handleConfirmTransfer = async () => {
    if (!itemToTransfer || !itemToTransfer.stallId || !destinationStallId || quantityToTransfer === "" || Number(quantityToTransfer) <= 0) {
      toast({ title: "Invalid Input", description: "Please select a destination stall and enter a valid quantity > 0.", variant: "destructive" });
      return;
    }
    if (itemToTransfer.stallId === destinationStallId) {
      toast({ title: "Invalid Destination", description: "Source and destination stalls cannot be the same.", variant: "destructive" });
      return;
    }
    const numQuantityToTransfer = Number(quantityToTransfer);
    if (numQuantityToTransfer > itemToTransfer.quantity) {
      toast({ title: "Insufficient Stock", description: `Cannot transfer ${numQuantityToTransfer}. Only ${itemToTransfer.quantity} available at source stall.`, variant: "destructive" });
      return;
    }

    setIsTransferring(true);
    try {
      await runTransaction(db, async (transaction) => {
        const sourceItemRef = doc(db, "stockItems", itemToTransfer.id);
        const sourceItemSnap = await transaction.get(sourceItemRef);

        if (!sourceItemSnap.exists()) throw new Error("Source item not found.");
        const sourceItemData = sourceItemSnap.data() as StockItem;
        if (sourceItemData.quantity < numQuantityToTransfer) throw new Error(`Concurrent update: Not enough source stock. Available: ${sourceItemData.quantity}`);

        let destinationItemRef: DocumentReference | null = null;
        let destinationItemSnap: DocumentSnapshot | null = null;

        // If source item has master link, try to find destination item with same master link
        if (sourceItemData.originalMasterItemId) {
          const q = query(
            collection(db, "stockItems"),
            where("stallId", "==", destinationStallId),
            where("originalMasterItemId", "==", sourceItemData.originalMasterItemId)
          );
          // This getDocs is not ideal inside a transaction for finding the ref.
          // If we knew the destination doc ID, we'd use transaction.get().
          // For now, we'll query outside then read its ref inside. This has a small race condition window.
          const destQuerySnap = await getDocs(q);
          if (!destQuerySnap.empty) {
            destinationItemRef = destQuerySnap.docs[0].ref;
            destinationItemSnap = await transaction.get(destinationItemRef); // Read inside transaction
          }
        }
        // If no originalMasterItemId, or if no item found via originalMasterItemId at destination,
        // we'll create a new one or look for one by other means (simplified for now to create new).

        // Writes
        transaction.update(sourceItemRef, {
          quantity: sourceItemData.quantity - numQuantityToTransfer,
          lastUpdated: new Date().toISOString()
        });

        if (destinationItemSnap && destinationItemSnap.exists()) { // Found existing item at destination
          const destItemData = destinationItemSnap.data() as StockItem;
          transaction.update(destinationItemRef!, {
            quantity: destItemData.quantity + numQuantityToTransfer,
            lastUpdated: new Date().toISOString()
          });
        } else { // Create new item at destination
          const newDestItemRef = doc(collection(db, "stockItems"));
          transaction.set(newDestItemRef, {
            name: sourceItemData.name,
            category: sourceItemData.category,
            quantity: numQuantityToTransfer,
            unit: sourceItemData.unit,
            price: sourceItemData.price,
            lowStockThreshold: sourceItemData.lowStockThreshold,
            imageUrl: sourceItemData.imageUrl,
            siteId: sourceItemData.siteId,
            stallId: destinationStallId,
            originalMasterItemId: sourceItemData.originalMasterItemId || null, // Preserve link
            lastUpdated: new Date().toISOString(),
          });
        }
      });
      toast({
        title: "Transfer Successful",
        description: `${numQuantityToTransfer} unit(s) of ${itemToTransfer.name} transferred.`,
      });
      setShowTransferDialog(false);
      setItemToTransfer(null);
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error("Error transferring stock:", error);
      toast({ title: "Transfer Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsTransferring(false);
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
  
  const destinationStallsForTransfer = itemToTransfer?.siteId
    ? availableStallsForAllocation.filter(s => s.siteId === itemToTransfer.siteId && s.id !== itemToTransfer.stallId)
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

              let stallDisplayElement: React.ReactNode;
              if (item.stallId) {
                  const stallName = stallsMap[item.stallId] || `Stall ID: ${item.stallId.substring(0,6)}...`;
                  if (item.originalMasterItemId) {
                      stallDisplayElement = (
                          <div className="flex items-center">
                              <span>{stallName}</span>
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                      <Link2Icon className="h-3 w-3 ml-1.5 text-muted-foreground hover:text-primary cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                      <p>Allocated from master stock</p>
                                      <p className="text-xs text-muted-foreground">Master ID: {item.originalMasterItemId.substring(0,8)}...</p>
                                  </TooltipContent>
                              </Tooltip>
                          </div>
                      );
                  } else {
                      stallDisplayElement = <span>{stallName}</span>;
                  }
              } else if (item.siteId) {
                  stallDisplayElement = <span className="italic">Master Stock</span>;
              } else {
                  stallDisplayElement = <span className="italic">Unassigned</span>;
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
                      <Store size={12} className="mr-1 text-accent/70" /> {stallDisplayElement}
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
                    <Dialog open={stockUpdateItem?.id === item.id} onOpenChange={(open) => !open && setStockUpdateItem(null)}>
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
                           {item.stallId === null && item.siteId && (
                            <DropdownMenuItem onClick={() => handleOpenAllocateDialog(item)} disabled={availableStallsForAllocation.filter(s => s.siteId === item.siteId).length === 0}>
                              <MoveRight className="mr-2 h-4 w-4" /> Allocate to Stall
                            </DropdownMenuItem>
                          )}
                          {item.stallId !== null && (
                            <DropdownMenuItem onClick={() => handleOpenTransferDialog(item)} disabled={availableStallsForAllocation.filter(s => s.siteId === item.siteId && s.id !== item.stallId).length === 0}>
                                <Shuffle className="mr-2 h-4 w-4" /> Transfer to Stall
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
                                  If this is stall stock, the linked master stock will NOT be automatically adjusted by this deletion.
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
                          <DialogTitle>Update Stock for {stockUpdateItem?.name}</DialogTitle>
                          <DialogDescription>
                            Current quantity: {stockUpdateItem?.quantity} {stockUpdateItem?.unit} (
                              { stockUpdateItem?.stallId
                                ? stallsMap[stockUpdateItem.stallId] || `Stall ID: ${stockUpdateItem.stallId.substring(0,6)}...`
                                : stockUpdateItem?.siteId ? "Master Stock" : "Unassigned"
                              }
                              {stockUpdateItem?.siteId && ` at ${sitesMap[stockUpdateItem.siteId] || `Site ID: ${stockUpdateItem.siteId.substring(0,6)}...`}`}
                            ).
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
                <Label htmlFor="targetStallForAllocation">Target Stall</Label>
                <Select
                  value={targetStallIdForAllocation}
                  onValueChange={setTargetStallIdForAllocation}
                  disabled={isAllocating || stallsForCurrentSite.length === 0}
                >
                  <SelectTrigger id="targetStallForAllocation" className="bg-input">
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

      {itemToTransfer && (
        <AlertDialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Transfer Stock: {itemToTransfer.name}</AlertDialogTitle>
                    <AlertDialogDescription>
                        From: {stallsMap[itemToTransfer.stallId!] || 'Unknown Source Stall'} (Current Qty: {itemToTransfer.quantity} {itemToTransfer.unit})
                        <br />
                        Site: {sitesMap[itemToTransfer.siteId!] || 'Unknown Site'}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-2">
                    <div>
                        <Label htmlFor="destinationStall">Destination Stall</Label>
                        <Select
                            value={destinationStallId}
                            onValueChange={setDestinationStallId}
                            disabled={isTransferring || destinationStallsForTransfer.length === 0}
                        >
                            <SelectTrigger id="destinationStall" className="bg-input">
                                <SelectValue placeholder={destinationStallsForTransfer.length === 0 ? "No other stalls in this site" : "Select destination stall"} />
                            </SelectTrigger>
                            <SelectContent>
                                {destinationStallsForTransfer.map((stall) => (
                                    <SelectItem key={stall.id} value={stall.id}>
                                        {stall.name} ({stall.stallType})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label htmlFor="quantityToTransfer">Quantity to Transfer</Label>
                        <Input
                            id="quantityToTransfer"
                            type="number"
                            value={quantityToTransfer}
                            onChange={(e) => setQuantityToTransfer(e.target.value)}
                            min="1"
                            max={itemToTransfer.quantity}
                            className="bg-input"
                            disabled={isTransferring}
                        />
                    </div>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowTransferDialog(false)} disabled={isTransferring}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirmTransfer}
                        disabled={isTransferring || !destinationStallId || Number(quantityToTransfer) <= 0 || Number(quantityToTransfer) > itemToTransfer.quantity}
                    >
                        {isTransferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Transfer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}


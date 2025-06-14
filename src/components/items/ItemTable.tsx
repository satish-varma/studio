
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
import { MoreHorizontal, Edit, Trash2, PackageOpen, Loader2, Building, Store, MoveRight, Undo2, Link2Icon, Shuffle, CheckSquare, Square, Edit3, IndianRupee, ArrowUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
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
  getDoc,
  writeBatch,
  Timestamp,
  DocumentReference,
  DocumentSnapshot
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { logStockMovement } from "@/lib/stockLogger";
import { Skeleton } from "@/components/ui/skeleton";
import type { SortConfig } from "./ItemsClientPage";

const LOG_PREFIX = "[ItemTable]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface ItemTableProps {
  items: StockItem[];
  sitesMap: Record<string, string>;
  stallsMap: Record<string, string>;
  availableStallsForAllocation: Stall[];
  onDataNeedsRefresh: () => void;
  loading: boolean;
  sortConfig: SortConfig;
  requestSort: (key: keyof StockItem) => void;
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-5 w-5" /></TableCell>
    <TableCell><Skeleton className="h-10 w-10 rounded-md" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-10 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
  </TableRow>
);


export function ItemTable({ items, sitesMap, stallsMap, availableStallsForAllocation, onDataNeedsRefresh, loading, sortConfig, requestSort }: ItemTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useAuth();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [stockUpdateItem, setStockUpdateItem] = useState<StockItem | null>(null);
  const [newQuantity, setNewQuantity] = useState<number | string>("");

  const [itemToAllocate, setItemToAllocate] = useState<StockItem | null>(null);
  const [showAllocateDialog, setShowAllocateDialog] = useState(false);
  const [targetStallIdForAllocation, setTargetStallIdForAllocation] = useState("");
  const [quantityToAllocate, setQuantityToAllocate] = useState<number | string>(1);
  const [isAllocating, setIsAllocating] = useState(false);

  const [itemToReturn, setItemToReturn] = useState<StockItem | null>(null);
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [quantityToReturn, setQuantityToReturn] = useState<number | string>(1);
  const [isReturning, setIsReturning] = useState(false);

  const [itemToTransfer, setItemToTransfer] = useState<StockItem | null>(null);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [destinationStallId, setDestinationStallId] = useState("");
  const [quantityToTransfer, setQuantityToTransfer] = useState<number | string>(1);
  const [isTransferring, setIsTransferring] = useState(false);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const [showBatchUpdateStockDialog, setShowBatchUpdateStockDialog] = useState(false);
  const [batchUpdateQuantity, setBatchUpdateQuantity] = useState<number | string>("");
  const [isBatchUpdatingStock, setIsBatchUpdatingStock] = useState(false);

  const [showBatchUpdateDetailsDialog, setShowBatchUpdateDetailsDialog] = useState(false);
  const [batchUpdateCategory, setBatchUpdateCategory] = useState<string>("");
  const [batchUpdateLowStockThreshold, setBatchUpdateLowStockThreshold] = useState<string | number>("");
  const [isBatchUpdatingDetails, setIsBatchUpdatingDetails] = useState(false);

  const [showBatchUpdatePriceDialog, setShowBatchUpdatePriceDialog] = useState(false);
  const [batchUpdatePrice, setBatchUpdatePrice] = useState<string | number>("");
  const [batchUpdateCostPrice, setBatchUpdateCostPrice] = useState<string | number>("");
  const [isBatchUpdatingPrice, setIsBatchUpdatingPrice] = useState(false);

  const [itemForSingleDelete, setItemForSingleDelete] = useState<StockItem | null>(null);
  const [showSingleDeleteDialog, setShowSingleDeleteDialog] = useState(false);

  const selectableItems = useMemo(() => items.filter(item => !!item.stallId), [items]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    console.log(`${LOG_PREFIX} handleSelectAll called. Checked: ${checked}`);
    if (checked === true) {
      setSelectedItems(selectableItems.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean | 'indeterminate') => {
    const item = items.find(i => i.id === itemId);
    if (item && !item.stallId) {
      console.log(`${LOG_PREFIX} Item ${itemId} is master stock. Selection ignored.`);
      return;
    }

    console.log(`${LOG_PREFIX} handleSelectItem called. ItemID: ${itemId}, Checked: ${checked}`);
    if (checked === true) {
      setSelectedItems(prev => [...prev, itemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== itemId));
    }
  };

  const handleEdit = (itemId: string) => {
    console.log(`${LOG_PREFIX} Navigating to edit item: ${itemId}`);
    router.push(`/items/${itemId}/edit`);
    setSelectedItems([]);
  };

  const handleDelete = async (itemId: string, itemName: string) => {
    console.log(`${LOG_PREFIX} Attempting to delete item: ${itemId} (${itemName})`);
    setIsDeleting(true);
    let itemDataForLog: StockItem | null = null;
    try {
      const itemRef = doc(db, "stockItems", itemId);
      const itemDocSnap = await getDoc(itemRef);
      if (!itemDocSnap.exists()) {
        console.warn(`${LOG_PREFIX} Item ${itemId} not found for deletion.`);
        throw new Error("Item not found for deletion.");
      }
      itemDataForLog = { id: itemDocSnap.id, ...itemDocSnap.data() } as StockItem;

      if (itemDataForLog.stallId === null && itemDataForLog.siteId) {
          const linkedStallsQuery = query(
            collection(db, "stockItems"),
            where("originalMasterItemId", "==", itemId)
          );
          const linkedStallsSnap = await getDocs(linkedStallsQuery);
          if (!linkedStallsSnap.empty) {
            console.warn(`${LOG_PREFIX} Deletion prevented for master item ${itemId}. ${linkedStallsSnap.size} stall items linked.`);
            toast({
              title: "Deletion Prevented",
              description: `Master item "${itemName}" cannot be deleted because ${linkedStallsSnap.size} stall item(s) are still allocated from it. Please return or re-allocate stock from these stalls first.`,
              variant: "destructive",
              duration: 7000,
            });
            setIsDeleting(false);
            setShowSingleDeleteDialog(false);
            setItemForSingleDelete(null);
            return;
          }
      }

      await runTransaction(db, async (transaction) => {
        const masterItemRef = itemDataForLog!.originalMasterItemId ? doc(db, "stockItems", itemDataForLog!.originalMasterItemId) : null;
        let masterItemSnap: DocumentSnapshot | null = null;
        let masterData: StockItem | null = null;

        if (masterItemRef) {
          masterItemSnap = await transaction.get(masterItemRef);
          if (masterItemSnap.exists()) {
             masterData = masterItemSnap.data() as StockItem;
          } else {
             console.warn(`${LOG_PREFIX} Master item ${itemDataForLog!.originalMasterItemId} not found during deletion of stall item ${itemDataForLog!.id}. Master stock not adjusted.`);
          }
        }

        if (itemDataForLog!.stallId && masterItemRef && masterData) {
          transaction.update(masterItemRef, {
            quantity: masterData.quantity + itemDataForLog!.quantity,
            lastUpdated: new Date().toISOString(),
          });
          console.log(`${LOG_PREFIX} Master stock ${masterData.id} updated in transaction. Adding ${itemDataForLog!.quantity} due to deletion of stall item ${itemDataForLog!.id}.`);
        }
        transaction.delete(itemRef);
      });
      console.log(`${LOG_PREFIX} Item ${itemId} deleted successfully from Firestore.`);

      if (user && itemDataForLog) {
        await logStockMovement(user, {
            stockItemId: itemDataForLog.id,
            masterStockItemIdForContext: itemDataForLog.originalMasterItemId,
            siteId: itemDataForLog.siteId!,
            stallId: itemDataForLog.stallId,
            type: itemDataForLog.stallId ? 'DELETE_STALL_ITEM' : 'DELETE_MASTER_ITEM',
            quantityChange: -itemDataForLog.quantity,
            quantityBefore: itemDataForLog.quantity,
            quantityAfter: 0,
            notes: `Item "${itemDataForLog.name}" deleted. ${itemDataForLog.stallId && itemDataForLog.originalMasterItemId ? 'Quantity returned to master implicitly.' : ''}`,
        });
         if (itemDataForLog.stallId && itemDataForLog.originalMasterItemId) {
             const masterItemAfterDeletionSnap = await getDoc(doc(db, "stockItems", itemDataForLog.originalMasterItemId));
             if (masterItemAfterDeletionSnap.exists()) {
                const masterItemAfter = masterItemAfterDeletionSnap.data() as StockItem;
                console.log(`${LOG_PREFIX} Logging implicit return to master ${masterItemAfter.id}. Quantity before this log entry was ${masterItemAfter.quantity - itemDataForLog.quantity}, new quantity is ${masterItemAfter.quantity}.`);
                 await logStockMovement(user, {
                    stockItemId: itemDataForLog.originalMasterItemId,
                    siteId: masterItemAfter.siteId!,
                    stallId: null,
                    type: 'RECEIVE_RETURN_FROM_STALL',
                    quantityChange: itemDataForLog.quantity,
                    quantityBefore: masterItemAfter.quantity - itemDataForLog.quantity,
                    quantityAfter: masterItemAfter.quantity,
                    notes: `Implicit return from deleted stall item "${itemDataForLog.name}" (ID: ${itemDataForLog.id}).`,
                    linkedStockItemId: itemDataForLog.id,
                 });
             } else {
                 console.warn(`${LOG_PREFIX} Master item ${itemDataForLog.originalMasterItemId} no longer exists after deleting stall item ${itemDataForLog.id}. Cannot log return.`);
             }
         }
      }

      toast({
        title: "Item Deleted",
        description: `${itemName} has been successfully deleted. Master stock (if applicable) adjusted.`,
      });
      onDataNeedsRefresh();
      setSelectedItems(prev => prev.filter(id => id !== itemId));
      if (itemForSingleDelete?.id === itemId) {
        setShowSingleDeleteDialog(false);
        setItemForSingleDelete(null);
      }
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error deleting item ${itemId}:`, error.message, error.stack);
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not delete the item. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const parseAndCapInput = (value: string, max?: number, min: number = 0): number | string => {
    if (value === "") return "";
    let num = parseInt(value, 10);
    if (isNaN(num)) {
        return max !== undefined ? max : min;
    }
    if (max !== undefined && num > max) num = max;
    if (num < min) num = min;
    return num;
  };


  const parseAndCapFloatInput = (value: string, min: number = 0): number | string => {
    if (value === "") return "";
    if (!/^\d*\.?\d*$/.test(value) || (value.split('.').length -1 > 1)) {
        const floatVal = parseFloat(value);
        if (!isNaN(floatVal) && floatVal >= min) return floatVal.toString();
        return min.toString();
    }

    const num = parseFloat(value);
    if (isNaN(num) && value !== "." && value !== "") {
        return min.toString();
    }
    if (!isNaN(num) && num < min) return min.toString();
    return value;
  };


  const handleOpenUpdateStockDialog = (item: StockItem) => {
    console.log(`${LOG_PREFIX} Opening update stock dialog for item: ${item.id} (${item.name})`);
    setStockUpdateItem(item);
    setNewQuantity(item.quantity);
  };

  const handleStockQuantityChange = async () => {
    if (stockUpdateItem === null || newQuantity === "" || isNaN(Number(newQuantity)) || Number(newQuantity) < 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid non-negative number for the quantity.", variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Attempting to update stock for item ${stockUpdateItem.id}. New quantity: ${newQuantity}`);
    setIsUpdatingStock(true);
    const updatedQuantityNum = Number(newQuantity);

    try {
      const transactionResult = await runTransaction(db, async (transaction): Promise<{
        itemBeforeUpdate: StockItem;
        masterItemBeforeUpdate: StockItem | null;
        finalMasterQuantityAfterUpdate: number | null;
      }> => {
        const itemRef = doc(db, "stockItems", stockUpdateItem!.id);
        const itemSnap = await transaction.get(itemRef);

        if (!itemSnap.exists()) {
          console.warn(`${LOG_PREFIX} Item ${stockUpdateItem!.id} being updated not found during transaction.`);
          throw new Error("Item being updated not found.");
        }
        const itemBeforeUpdate = { id: itemSnap.id, ...itemSnap.data() } as StockItem;
        const oldQuantity = itemBeforeUpdate.quantity;

        let masterItemBeforeUpdate: StockItem | null = null;
        let finalMasterQuantityAfterUpdate: number | null = null;

        if (itemBeforeUpdate.stallId && itemBeforeUpdate.originalMasterItemId) {
            const masterItemRef = doc(db, "stockItems", itemBeforeUpdate.originalMasterItemId);
            const masterItemSnap = await transaction.get(masterItemRef);
            if (masterItemSnap.exists()) {
                masterItemBeforeUpdate = { id: masterItemSnap.id, ...masterItemSnap.data() } as StockItem;
                const quantityDelta = updatedQuantityNum - oldQuantity;
                finalMasterQuantityAfterUpdate = Math.max(0, masterItemBeforeUpdate.quantity - quantityDelta);
                transaction.update(masterItemRef, {
                    quantity: finalMasterQuantityAfterUpdate,
                    lastUpdated: new Date().toISOString(),
                });
                console.log(`${LOG_PREFIX} Master stock ${masterItemBeforeUpdate.id} updated. Old Qty: ${masterItemBeforeUpdate.quantity}, New Qty: ${finalMasterQuantityAfterUpdate}`);
            } else {
              console.warn(`${LOG_PREFIX} Master stock item ${itemBeforeUpdate.originalMasterItemId} not found. Stall stock updated, but master cannot be adjusted.`);
            }
        }

        transaction.update(itemRef, {
          quantity: updatedQuantityNum,
          lastUpdated: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Stock updated in transaction for item ${itemBeforeUpdate.id}. Old: ${oldQuantity}, New: ${updatedQuantityNum}`);
        
        return { itemBeforeUpdate, masterItemBeforeUpdate, finalMasterQuantityAfterUpdate };
      });
      
      console.log(`${LOG_PREFIX} Stock update transaction successful for item ${stockUpdateItem.id}.`);
      const { itemBeforeUpdate, masterItemBeforeUpdate, finalMasterQuantityAfterUpdate } = transactionResult;

      if (user && itemBeforeUpdate) {
         await logStockMovement(user, {
            stockItemId: itemBeforeUpdate.id,
            masterStockItemIdForContext: itemBeforeUpdate.originalMasterItemId,
            siteId: itemBeforeUpdate.siteId!,
            stallId: itemBeforeUpdate.stallId,
            type: itemBeforeUpdate.stallId ? 'DIRECT_STALL_UPDATE' : 'DIRECT_MASTER_UPDATE',
            quantityChange: updatedQuantityNum - itemBeforeUpdate.quantity,
            quantityBefore: itemBeforeUpdate.quantity,
            quantityAfter: updatedQuantityNum,
            notes: "Direct stock quantity update via item table.",
          });
        if (masterItemBeforeUpdate && finalMasterQuantityAfterUpdate !== null) {
             await logStockMovement(user, {
                stockItemId: masterItemBeforeUpdate.id,
                siteId: masterItemBeforeUpdate.siteId!,
                stallId: null,
                type: 'DIRECT_STALL_UPDATE_AFFECTS_MASTER',
                quantityChange: finalMasterQuantityAfterUpdate - masterItemBeforeUpdate.quantity,
                quantityBefore: masterItemBeforeUpdate.quantity,
                quantityAfter: finalMasterQuantityAfterUpdate,
                notes: `Master stock adjusted due to direct update of linked stall item ${itemBeforeUpdate.name} (ID: ${itemBeforeUpdate.id}).`,
                linkedStockItemId: itemBeforeUpdate.id,
            });
        }
      }

      toast({
        title: "Stock Updated",
        description: `Stock for "${stockUpdateItem.name}" updated to ${updatedQuantityNum}. Master stock (if applicable) adjusted.`,
      });
      setStockUpdateItem(null);
      setNewQuantity("");
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error updating stock for item ${stockUpdateItem.id}:`, error.message, error.stack);
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
    console.log(`${LOG_PREFIX} Opening allocate dialog for item: ${item.id} (${item.name})`);
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
    const stallsForCurrentSite = itemToAllocate?.siteId
    ? availableStallsForAllocation.filter(s => s.siteId === itemToAllocate.siteId)
    : [];
    if(stallsForCurrentSite.length === 0){
      toast({ title: "No Stalls Available", description: "There are no stalls in this site to allocate stock to.", variant: "destructive" });
      return;
    }

    const numQuantityToAllocate = Number(quantityToAllocate);
    if (numQuantityToAllocate > itemToAllocate.quantity) {
      toast({ title: "Insufficient Stock", description: `Cannot allocate ${numQuantityToAllocate}. Only ${itemToAllocate.quantity} available in master stock.`, variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Attempting allocation for item ${itemToAllocate.id}. Quantity: ${numQuantityToAllocate}, Target Stall: ${targetStallIdForAllocation}`);
    setIsAllocating(true);
    let masterStockDataBeforeTx: StockItem | null = null;
    let stallItemDataBeforeTx: StockItem | null = null;
    let newStallItemIdForLog: string | null = null;
    let existingStallItemIdForLog: string | null = null;

    try {
      await runTransaction(db, async (transaction) => {
        const masterStockRef = doc(db, "stockItems", itemToAllocate.id);
        const masterStockSnap = await transaction.get(masterStockRef);

        if (!masterStockSnap.exists()) {
          console.warn(`${LOG_PREFIX} Master stock item ${itemToAllocate.id} not found during allocation transaction.`);
          throw new Error("Master stock item not found.");
        }
        masterStockDataBeforeTx = { id: masterStockSnap.id, ...masterStockSnap.data() } as StockItem;
        if (masterStockDataBeforeTx.quantity < numQuantityToAllocate) {
          console.warn(`${LOG_PREFIX} Concurrent update for master item ${masterStockDataBeforeTx.id}. Available: ${masterStockDataBeforeTx.quantity}, Requested: ${numQuantityToAllocate}`);
          throw new Error(`Concurrent update: Not enough master stock. Available: ${masterStockDataBeforeTx.quantity}`);
        }

        const stallItemsQuery = query(
          collection(db, "stockItems"),
          where("originalMasterItemId", "==", itemToAllocate.id),
          where("stallId", "==", targetStallIdForAllocation)
        );

        let targetStallItemRef: DocumentReference | null = null;
        const existingStallItemsQuerySnap = await getDocs(stallItemsQuery);

        if (!existingStallItemsQuerySnap.empty) {
            targetStallItemRef = existingStallItemsQuerySnap.docs[0].ref;
            existingStallItemIdForLog = existingStallItemsQuerySnap.docs[0].id;
            const targetStallItemSnap = await transaction.get(targetStallItemRef);
            if (targetStallItemSnap.exists()) {
                stallItemDataBeforeTx = {id: targetStallItemSnap.id, ...targetStallItemSnap.data()} as StockItem;
            }
        }
        console.log(`${LOG_PREFIX} Allocation: Existing stall item? ${!!targetStallItemRef}. StallItem ID (if existing): ${existingStallItemIdForLog}`);

        if (targetStallItemRef && stallItemDataBeforeTx) {
            console.log(`${LOG_PREFIX} Updating existing stall item ${existingStallItemIdForLog}. Old Qty: ${stallItemDataBeforeTx.quantity}, Allocating: ${numQuantityToAllocate}`);
            transaction.update(targetStallItemRef, {
                quantity: stallItemDataBeforeTx.quantity + numQuantityToAllocate,
                lastUpdated: new Date().toISOString(),
            });
        } else {
            const newStallItemDocRef = doc(collection(db, "stockItems"));
            newStallItemIdForLog = newStallItemDocRef.id;
            console.log(`${LOG_PREFIX} Creating new stall item ${newStallItemIdForLog}. Allocating: ${numQuantityToAllocate}`);
            const newStallItemDataToSave: Omit<StockItem, 'id'> = {
                name: masterStockDataBeforeTx.name,
                category: masterStockDataBeforeTx.category,
                description: masterStockDataBeforeTx.description || "",
                quantity: numQuantityToAllocate,
                unit: masterStockDataBeforeTx.unit,
                price: masterStockDataBeforeTx.price,
                costPrice: masterStockDataBeforeTx.costPrice,
                lowStockThreshold: masterStockDataBeforeTx.lowStockThreshold,
                imageUrl: masterStockDataBeforeTx.imageUrl,
                siteId: masterStockDataBeforeTx.siteId,
                stallId: targetStallIdForAllocation,
                originalMasterItemId: itemToAllocate.id,
                lastUpdated: new Date().toISOString(),
            };
            transaction.set(newStallItemDocRef, newStallItemDataToSave);
        }

        transaction.update(masterStockRef, {
          quantity: masterStockDataBeforeTx.quantity - numQuantityToAllocate,
          lastUpdated: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Master stock ${masterStockDataBeforeTx.id} updated. Old Qty: ${masterStockDataBeforeTx.quantity}, New Qty: ${masterStockDataBeforeTx.quantity - numQuantityToAllocate}`);
      });
      console.log(`${LOG_PREFIX} Allocation transaction successful for item ${itemToAllocate.id}.`);

      if (user && masterStockDataBeforeTx) {
        await logStockMovement(user, {
          stockItemId: masterStockDataBeforeTx.id,
          siteId: masterStockDataBeforeTx.siteId!,
          stallId: null,
          type: 'ALLOCATE_TO_STALL',
          quantityChange: -numQuantityToAllocate,
          quantityBefore: masterStockDataBeforeTx.quantity,
          quantityAfter: masterStockDataBeforeTx.quantity - numQuantityToAllocate,
          notes: `Allocated ${numQuantityToAllocate} unit(s) of ${masterStockDataBeforeTx.name} to stall: ${stallsMap[targetStallIdForAllocation] || targetStallIdForAllocation}.`,
          linkedStockItemId: newStallItemIdForLog || existingStallItemIdForLog,
        });

        const stallItemLogId = newStallItemIdForLog || existingStallItemIdForLog;
        if (stallItemLogId) {
          await logStockMovement(user, {
            stockItemId: stallItemLogId,
            masterStockItemIdForContext: masterStockDataBeforeTx.id,
            siteId: masterStockDataBeforeTx.siteId!,
            stallId: targetStallIdForAllocation,
            type: 'RECEIVE_ALLOCATION',
            quantityChange: numQuantityToAllocate,
            quantityBefore: stallItemDataBeforeTx ? stallItemDataBeforeTx.quantity : 0,
            quantityAfter: (stallItemDataBeforeTx ? stallItemDataBeforeTx.quantity : 0) + numQuantityToAllocate,
            notes: `Received ${numQuantityToAllocate} unit(s) of ${masterStockDataBeforeTx.name} from master stock.`,
            linkedStockItemId: masterStockDataBeforeTx.id,
          });
        }
      }

      toast({
        title: "Stock Allocated",
        description: `${numQuantityToAllocate} unit(s) of ${itemToAllocate.name} allocated successfully.`,
      });
      setShowAllocateDialog(false);
      setItemToAllocate(null);
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error allocating stock for item ${itemToAllocate.id}:`, error.message, error.stack);
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
    console.log(`${LOG_PREFIX} Opening return dialog for item: ${item.id} (${item.name})`);
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
    console.log(`${LOG_PREFIX} Attempting to return item ${itemToReturn.id} to master. Quantity: ${numQuantityToReturn}`);
    setIsReturning(true);
    let stallItemDataBeforeTx: StockItem | null = null;
    let masterItemDataBeforeTx: StockItem | null = null;

    try {
      await runTransaction(db, async (transaction) => {
        const stallItemRef = doc(db, "stockItems", itemToReturn.id);
        const masterItemRef = doc(db, "stockItems", itemToReturn.originalMasterItemId!);

        const stallItemSnap = await transaction.get(stallItemRef);
        const masterItemSnap = await transaction.get(masterItemRef);

        if (!stallItemSnap.exists()) {
          console.warn(`${LOG_PREFIX} Stall item ${itemToReturn.id} not found during return transaction.`);
          throw new Error("Stall item not found. Cannot proceed with return.");
        }
        stallItemDataBeforeTx = {id: stallItemSnap.id, ...stallItemSnap.data()} as StockItem;

        if (!masterItemSnap.exists()) {
          console.warn(`${LOG_PREFIX} Master item ${itemToReturn.originalMasterItemId} not found during return transaction.`);
          throw new Error("Original master stock item not found. Cannot return to a non-existent master item.");
        }
        masterItemDataBeforeTx = {id: masterItemSnap.id, ...masterItemSnap.data()} as StockItem;

        if (stallItemDataBeforeTx.quantity < numQuantityToReturn) {
          console.warn(`${LOG_PREFIX} Concurrent update for stall item ${stallItemDataBeforeTx.id}. Available: ${stallItemDataBeforeTx.quantity}, Requested: ${numQuantityToReturn}`);
          throw new Error(`Concurrent update: Not enough stall stock to return. Available: ${stallItemDataBeforeTx.quantity}`);
        }

        transaction.update(masterItemRef, {
          quantity: masterItemDataBeforeTx.quantity + numQuantityToReturn,
          lastUpdated: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Master stock ${masterItemDataBeforeTx.id} updated. Old Qty: ${masterItemDataBeforeTx.quantity}, New Qty: ${masterItemDataBeforeTx.quantity + numQuantityToReturn}`);

        transaction.update(stallItemRef, {
          quantity: stallItemDataBeforeTx.quantity - numQuantityToReturn,
          lastUpdated: new Date().toISOString(),
        });
        console.log(`${LOG_PREFIX} Stall stock ${stallItemDataBeforeTx.id} updated. Old Qty: ${stallItemDataBeforeTx.quantity}, New Qty: ${stallItemDataBeforeTx.quantity - numQuantityToReturn}`);
      });
      console.log(`${LOG_PREFIX} Return to master transaction successful for item ${itemToReturn.id}.`);

      if (user && stallItemDataBeforeTx && masterItemDataBeforeTx) {
        await logStockMovement(user, {
          stockItemId: stallItemDataBeforeTx.id,
          masterStockItemIdForContext: stallItemDataBeforeTx.originalMasterItemId,
          siteId: stallItemDataBeforeTx.siteId!,
          stallId: stallItemDataBeforeTx.stallId,
          type: 'RETURN_TO_MASTER',
          quantityChange: -numQuantityToReturn,
          quantityBefore: stallItemDataBeforeTx.quantity,
          quantityAfter: stallItemDataBeforeTx.quantity - numQuantityToReturn,
          notes: `Returned ${numQuantityToReturn} unit(s) of ${stallItemDataBeforeTx.name} to master stock.`,
          linkedStockItemId: masterItemDataBeforeTx.id,
        });

        await logStockMovement(user, {
          stockItemId: masterItemDataBeforeTx.id,
          siteId: masterItemDataBeforeTx.siteId!,
          stallId: null,
          type: 'RECEIVE_RETURN_FROM_STALL',
          quantityChange: numQuantityToReturn,
          quantityBefore: masterItemDataBeforeTx.quantity,
          quantityAfter: masterItemDataBeforeTx.quantity + numQuantityToReturn,
          notes: `Received ${numQuantityToReturn} unit(s) of ${stallItemDataBeforeTx.name} from stall: ${stallsMap[stallItemDataBeforeTx.stallId!] || stallItemDataBeforeTx.stallId}.`,
          linkedStockItemId: stallItemDataBeforeTx.id,
        });
      }

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
      console.error(`${LOG_PREFIX} Error returning item ${itemToReturn.id} to master:`, error.message, error.stack);
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
    console.log(`${LOG_PREFIX} Opening transfer dialog for item: ${item.id} (${item.name})`);
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
    const destinationStallsForTransfer = itemToTransfer?.siteId
    ? availableStallsForAllocation.filter(s => s.siteId === itemToTransfer.siteId && s.id !== itemToTransfer.stallId)
    : [];
    if(destinationStallsForTransfer.length === 0){
        toast({ title: "No Other Stalls", description: "There are no other stalls in this site to transfer stock to.", variant: "destructive" });
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
    console.log(`${LOG_PREFIX} Attempting transfer for item ${itemToTransfer.id}. Qty: ${numQuantityToTransfer}, From: ${itemToTransfer.stallId}, To: ${destinationStallId}`);
    setIsTransferring(true);
    let sourceItemDataBeforeTx: StockItem | null = null;
    let destItemDataBeforeTx: StockItem | null = null;
    let newDestItemIdForLog: string | null = null;
    let existingDestItemIdForLog: string | null = null;

    try {
      await runTransaction(db, async (transaction) => {
        const sourceItemRef = doc(db, "stockItems", itemToTransfer.id);
        const sourceItemSnap = await transaction.get(sourceItemRef);
        if (!sourceItemSnap.exists()) {
            console.warn(`${LOG_PREFIX} Source item ${itemToTransfer.id} not found during transfer transaction.`);
            throw new Error("Source item not found.");
        }
        sourceItemDataBeforeTx = { id: sourceItemSnap.id, ...sourceItemSnap.data() } as StockItem;
        if (sourceItemDataBeforeTx.quantity < numQuantityToTransfer) {
            console.warn(`${LOG_PREFIX} Concurrent update for source item ${sourceItemDataBeforeTx.id}. Available: ${sourceItemDataBeforeTx.quantity}, Requested: ${numQuantityToTransfer}`);
            throw new Error(`Concurrent update: Not enough source stock. Available: ${sourceItemDataBeforeTx.quantity}`);
        }

        let destinationItemRef: DocumentReference | null = null;
        const q = query(
            collection(db, "stockItems"),
            where("stallId", "==", destinationStallId),
            where("originalMasterItemId", "==", sourceItemDataBeforeTx.originalMasterItemId ?? null)
        );
        const destQuerySnap = await getDocs(q);
        if (!destQuerySnap.empty) {
            destinationItemRef = destQuerySnap.docs[0].ref;
            existingDestItemIdForLog = destQuerySnap.docs[0].id;
            const destinationItemSnap = await transaction.get(destinationItemRef);
            if(destinationItemSnap.exists()){
                destItemDataBeforeTx = {id: destinationItemSnap.id, ...destinationItemSnap.data()} as StockItem;
            }
        }
        console.log(`${LOG_PREFIX} Transfer: Source Qty: ${sourceItemDataBeforeTx.quantity}, Destination Exists? ${!!destinationItemRef}. Dest Item ID (if existing): ${existingDestItemIdForLog}`);

        transaction.update(sourceItemRef, {
          quantity: sourceItemDataBeforeTx.quantity - numQuantityToTransfer,
          lastUpdated: new Date().toISOString()
        });
        console.log(`${LOG_PREFIX} Source item ${sourceItemDataBeforeTx.id} updated. New Qty: ${sourceItemDataBeforeTx.quantity - numQuantityToTransfer}`);

        if (destinationItemRef && destItemDataBeforeTx) {
          console.log(`${LOG_PREFIX} Updating existing destination item ${existingDestItemIdForLog}. Old Qty: ${destItemDataBeforeTx.quantity}, Transferring: ${numQuantityToTransfer}`);
          transaction.update(destinationItemRef, {
            quantity: destItemDataBeforeTx.quantity + numQuantityToTransfer,
            lastUpdated: new Date().toISOString()
          });
        } else {
          const newDestItemDocRef = doc(collection(db, "stockItems"));
          newDestItemIdForLog = newDestItemDocRef.id;
          console.log(`${LOG_PREFIX} Creating new destination item ${newDestItemIdForLog}. Transferring: ${numQuantityToTransfer}`);
          transaction.set(newDestItemDocRef, {
            name: sourceItemDataBeforeTx.name,
            category: sourceItemDataBeforeTx.category,
            description: sourceItemDataBeforeTx.description || "",
            quantity: numQuantityToTransfer,
            unit: sourceItemDataBeforeTx.unit,
            price: sourceItemDataBeforeTx.price,
            costPrice: sourceItemDataBeforeTx.costPrice,
            lowStockThreshold: sourceItemDataBeforeTx.lowStockThreshold,
            imageUrl: sourceItemDataBeforeTx.imageUrl,
            siteId: sourceItemDataBeforeTx.siteId,
            stallId: destinationStallId,
            originalMasterItemId: sourceItemDataBeforeTx.originalMasterItemId ?? null,
            lastUpdated: new Date().toISOString(),
          });
        }
      });
      console.log(`${LOG_PREFIX} Transfer transaction successful for item ${itemToTransfer.id}.`);

      if (user && sourceItemDataBeforeTx) {
        await logStockMovement(user, {
            stockItemId: sourceItemDataBeforeTx.id,
            masterStockItemIdForContext: sourceItemDataBeforeTx.originalMasterItemId,
            siteId: sourceItemDataBeforeTx.siteId!,
            stallId: sourceItemDataBeforeTx.stallId,
            type: 'TRANSFER_OUT_FROM_STALL',
            quantityChange: -numQuantityToTransfer,
            quantityBefore: sourceItemDataBeforeTx.quantity,
            quantityAfter: sourceItemDataBeforeTx.quantity - numQuantityToTransfer,
            notes: `Transferred ${numQuantityToTransfer} unit(s) of ${sourceItemDataBeforeTx.name} to stall: ${stallsMap[destinationStallId] || destinationStallId}.`,
            linkedStockItemId: newDestItemIdForLog || existingDestItemIdForLog,
        });

        const destItemLogId = newDestItemIdForLog || existingDestItemIdForLog;
        if(destItemLogId) {
             await logStockMovement(user, {
                stockItemId: destItemLogId,
                masterStockItemIdForContext: sourceItemDataBeforeTx.originalMasterItemId,
                siteId: sourceItemDataBeforeTx.siteId!,
                stallId: destinationStallId,
                type: 'TRANSFER_IN_TO_STALL',
                quantityChange: numQuantityToTransfer,
                quantityBefore: destItemDataBeforeTx ? destItemDataBeforeTx.quantity : 0,
                quantityAfter: (destItemDataBeforeTx ? destItemDataBeforeTx.quantity : 0) + numQuantityToTransfer,
                notes: `Received ${numQuantityToTransfer} unit(s) of ${sourceItemDataBeforeTx.name} from stall: ${stallsMap[sourceItemDataBeforeTx.stallId!] || sourceItemDataBeforeTx.stallId}.`,
                linkedStockItemId: sourceItemDataBeforeTx.id,
            });
        }
      }

      toast({
        title: "Transfer Successful",
        description: `${numQuantityToTransfer} unit(s) of ${itemToTransfer.name} transferred.`,
      });
      setShowTransferDialog(false);
      setItemToTransfer(null);
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error transferring stock for item ${itemToTransfer.id}:`, error.message, error.stack);
      toast({ title: "Transfer Failed", description: error.message || "Could not transfer stock. Please try again.", variant: "destructive" });
    } finally {
      setIsTransferring(false);
    }
  };

  const handleOpenBatchDeleteDialog = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No Stall Items Selected", description: "Please select stall items to delete.", variant: "default" });
      return;
    }
    console.log(`${LOG_PREFIX} Opening batch delete dialog for ${selectedItems.length} items.`);
    setShowBatchDeleteDialog(true);
  };

  const handleConfirmBatchDelete = async () => {
    console.log(`${LOG_PREFIX} Confirming batch delete for ${selectedItems.length} items.`);
    setIsBatchDeleting(true);
    let successCount = 0;
    let errorCount = 0;
    const itemsToDeleteInfo = selectedItems.map(id => items.find(item => item.id === id)).filter(item => item && !!item.stallId);

    for (const itemToDelete of itemsToDeleteInfo) {
      if (!itemToDelete) continue;
      console.log(`${LOG_PREFIX} Batch deleting item: ${itemToDelete.id} (${itemToDelete.name})`);
      let originalItemData: StockItem | null = null;
      let originalMasterData: StockItem | null = null;
      try {
        await runTransaction(db, async (transaction) => {
          const stallItemRef = doc(db, "stockItems", itemToDelete.id);
          const stallItemSnap = await transaction.get(stallItemRef);

          if (!stallItemSnap.exists()) {
            console.warn(`${LOG_PREFIX} Stall item ${itemToDelete.name} (ID: ${itemToDelete.id}) not found during batch delete transaction.`);
            throw new Error(`Stall item ${itemToDelete.name} not found during batch delete.`);
          }
          originalItemData = { id: stallItemSnap.id, ...stallItemSnap.data() } as StockItem;

          if (originalItemData.originalMasterItemId) {
            const masterItemRef = doc(db, "stockItems", originalItemData.originalMasterItemId);
            const masterItemSnap = await transaction.get(masterItemRef);
            if (masterItemSnap.exists()) {
              originalMasterData = { id: masterItemSnap.id, ...masterItemSnap.data() } as StockItem;
              transaction.update(masterItemRef, {
                quantity: originalMasterData.quantity + originalItemData.quantity,
                lastUpdated: new Date().toISOString(),
              });
              console.log(`${LOG_PREFIX} Master stock ${originalMasterData.id} updated in transaction. Adding ${originalItemData.quantity} due to batch deletion of stall item ${originalItemData.id}.`);
            } else {
              console.warn(`${LOG_PREFIX} Master item ${originalItemData.originalMasterItemId} for stall item ${originalItemData.id} not found. Master stock not adjusted during batch delete.`);
            }
          }
          transaction.delete(stallItemRef);
        });
        successCount++;
         if (user && originalItemData) {
            await logStockMovement(user, {
                stockItemId: originalItemData.id,
                masterStockItemIdForContext: originalItemData.originalMasterItemId,
                siteId: originalItemData.siteId!,
                stallId: originalItemData.stallId,
                type: 'BATCH_STALL_DELETE',
                quantityChange: -originalItemData.quantity,
                quantityBefore: originalItemData.quantity,
                quantityAfter: 0,
                notes: `Batch deleted item "${originalItemData.name}". ${originalItemData.originalMasterItemId ? 'Quantity returned to master.' : ''}`,
            });
            if (originalMasterData && originalItemData.originalMasterItemId) {
                const masterQtyAfter = originalMasterData.quantity + originalItemData.quantity;
                console.log(`${LOG_PREFIX} Logging implicit return to master ${originalMasterData.id} for batch delete. Qty before this log: ${originalMasterData.quantity}, Qty after: ${masterQtyAfter}.`);
                 await logStockMovement(user, {
                    stockItemId: originalMasterData.id,
                    siteId: originalMasterData.siteId!,
                    stallId: null,
                    type: 'RECEIVE_RETURN_FROM_STALL',
                    quantityChange: originalItemData.quantity,
                    quantityBefore: originalMasterData.quantity,
                    quantityAfter: masterQtyAfter,
                    notes: `Implicit return from batch deleted stall item "${originalItemData.name}" (ID: ${originalItemData.id}).`,
                    linkedStockItemId: originalItemData.id,
                 });
            }
         }
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Error deleting item ${itemToDelete.id} in batch:`, error.message, error.stack);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast({
        title: "Batch Delete Processed",
        description: `${successCount} stall item(s) deleted. Master stock (if applicable) adjusted.`,
      });
    }
    if (errorCount > 0) {
      toast({
        title: "Batch Delete Errors",
        description: `${errorCount} item(s) could not be deleted. Check console for details.`,
        variant: "destructive",
      });
    }

    onDataNeedsRefresh();
    setSelectedItems([]);
    setIsBatchDeleting(false);
    setShowBatchDeleteDialog(false);
  };

  const handleOpenBatchUpdateStockDialog = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No Stall Items Selected", description: "Please select stall items to update.", variant: "default" });
      return;
    }
    console.log(`${LOG_PREFIX} Opening batch update stock dialog for ${selectedItems.length} items.`);
    setBatchUpdateQuantity("");
    setShowBatchUpdateStockDialog(true);
  };

  const handleConfirmBatchUpdateStock = async () => {
    if (batchUpdateQuantity === "" || isNaN(Number(batchUpdateQuantity)) || Number(batchUpdateQuantity) < 0) {
      toast({ title: "Invalid Quantity", description: "Please enter a valid non-negative number.", variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Confirming batch update stock for ${selectedItems.length} items. New Qty: ${batchUpdateQuantity}`);
    setIsBatchUpdatingStock(true);
    const newBatchQtyNum = Number(batchUpdateQuantity);
    let successCount = 0;
    let errorCount = 0;
    const itemsToUpdateInfo = selectedItems.map(id => items.find(item => item.id === id)).filter(item => item && !!item.stallId);

    for (const itemToUpdate of itemsToUpdateInfo) {
       if (!itemToUpdate) continue;
       console.log(`${LOG_PREFIX} Batch updating stock for item: ${itemToUpdate.id} (${itemToUpdate.name})`);
       let originalStallData: StockItem | null = null;
       let originalMasterData: StockItem | null = null;
       let newMasterQtyAfterUpdate: number | null = null;
      try {
        await runTransaction(db, async (transaction) => {
          const stallItemRef = doc(db, "stockItems", itemToUpdate.id);
          const stallItemSnap = await transaction.get(stallItemRef);

          if (!stallItemSnap.exists()) {
            console.warn(`${LOG_PREFIX} Stall item ${itemToUpdate.name} (ID: ${itemToUpdate.id}) not found during batch update stock transaction.`);
            throw new Error(`Stall item ${itemToUpdate.name} not found during batch update.`);
          }
          originalStallData = { id: stallItemSnap.id, ...stallItemSnap.data() } as StockItem;
          const oldStallQuantity = originalStallData.quantity;

          let masterItemSnap: DocumentSnapshot | null = null;
          let masterItemRefToUpdate: DocumentReference | null = null;

          if (originalStallData.originalMasterItemId) {
            masterItemRefToUpdate = doc(db, "stockItems", originalStallData.originalMasterItemId);
            masterItemSnap = await transaction.get(masterItemRefToUpdate);
            if (masterItemSnap.exists()) {
                originalMasterData = { id: masterItemSnap.id, ...masterItemSnap.data() } as StockItem;
            }
          }

          transaction.update(stallItemRef, {
            quantity: newBatchQtyNum,
            lastUpdated: new Date().toISOString(),
          });
          console.log(`${LOG_PREFIX} Stall item ${originalStallData.id} updated. Old Qty: ${oldStallQuantity}, New Qty: ${newBatchQtyNum}`);

          if (masterItemSnap && masterItemSnap.exists() && masterItemRefToUpdate && originalMasterData) {
            const quantityDelta = newBatchQtyNum - oldStallQuantity;
            newMasterQtyAfterUpdate = Math.max(0, originalMasterData.quantity - quantityDelta);
            transaction.update(masterItemRefToUpdate, {
              quantity: newMasterQtyAfterUpdate,
              lastUpdated: new Date().toISOString(),
            });
            console.log(`${LOG_PREFIX} Master stock ${originalMasterData.id} updated. Old Qty: ${originalMasterData.quantity}, New Qty: ${newMasterQtyAfterUpdate}`);
          } else if (originalStallData.originalMasterItemId && !masterItemSnap?.exists()){
             console.warn(`${LOG_PREFIX} Master item ${originalStallData.originalMasterItemId} for stall item ${originalStallData.id} not found. Master stock not adjusted during batch update.`);
          }
        });
        successCount++;
         if (user && originalStallData) {
             await logStockMovement(user, {
                stockItemId: originalStallData.id,
                masterStockItemIdForContext: originalStallData.originalMasterItemId,
                siteId: originalStallData.siteId!,
                stallId: originalStallData.stallId,
                type: 'BATCH_STALL_UPDATE_SET',
                quantityChange: newBatchQtyNum - originalStallData.quantity,
                quantityBefore: originalStallData.quantity,
                quantityAfter: newBatchQtyNum,
                notes: `Batch stock update set quantity to ${newBatchQtyNum}.`,
            });
            if (originalMasterData && newMasterQtyAfterUpdate !== null) {
                console.log(`${LOG_PREFIX} Logging master stock adjustment for batch update. Master ID: ${originalMasterData.id}, Change: ${newMasterQtyAfterUpdate - originalMasterData.quantity}`);
                 await logStockMovement(user, {
                    stockItemId: originalMasterData.id,
                    siteId: originalMasterData.siteId!,
                    stallId: null,
                    type: 'DIRECT_STALL_UPDATE_AFFECTS_MASTER',
                    quantityChange: newMasterQtyAfterUpdate - originalMasterData.quantity,
                    quantityBefore: originalMasterData.quantity,
                    quantityAfter: newMasterQtyAfterUpdate,
                    notes: `Master stock adjusted due to batch update of linked stall item ${originalStallData.name} (ID: ${originalStallData.id}).`,
                    linkedStockItemId: originalStallData.id,
                });
            }
         }
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Error batch updating stock for item ${itemToUpdate.id}:`, error.message, error.stack);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast({
        title: "Batch Stock Update Processed",
        description: `${successCount} stall item(s) quantity set to ${newBatchQtyNum}. Master stock (if applicable) adjusted.`,
      });
    }
    if (errorCount > 0) {
       toast({
        title: "Batch Update Errors",
        description: `${errorCount} item(s) could not be updated. Check console for details.`,
        variant: "destructive",
      });
    }

    onDataNeedsRefresh();
    setSelectedItems([]);
    setIsBatchUpdatingStock(false);
    setShowBatchUpdateStockDialog(false);
  };

  const handleOpenBatchUpdateDetailsDialog = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No Stall Items Selected", description: "Please select stall items to edit.", variant: "default" });
      return;
    }
    const actualStallItemsSelected = items.filter(item => selectedItems.includes(item.id) && !!item.stallId);
    if (actualStallItemsSelected.length === 0) {
        toast({ title: "No Stall Items Selected", description: "This action only applies to items within specific stalls. Master stock items cannot be batch edited this way.", variant: "default" });
        return;
    }
    console.log(`${LOG_PREFIX} Opening batch update details dialog for ${actualStallItemsSelected.length} stall items.`);
    setBatchUpdateCategory("");
    setBatchUpdateLowStockThreshold("");
    setShowBatchUpdateDetailsDialog(true);
  };

  const handleConfirmBatchUpdateDetails = async () => {
    if (batchUpdateCategory.trim() === "" && (batchUpdateLowStockThreshold === "" || isNaN(Number(batchUpdateLowStockThreshold)))) {
      toast({ title: "No Changes Specified", description: "Please enter a new category and/or a new low stock threshold.", variant: "default" });
      return;
    }
    const newThresholdNumber = batchUpdateLowStockThreshold !== "" ? Number(batchUpdateLowStockThreshold) : undefined;
    if (newThresholdNumber !== undefined && (isNaN(newThresholdNumber) || newThresholdNumber < 0)) {
      toast({ title: "Invalid Threshold", description: "Low stock threshold must be a non-negative number.", variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Confirming batch update details. Category: '${batchUpdateCategory}', Threshold: ${newThresholdNumber}`);
    setIsBatchUpdatingDetails(true);
    const batch = writeBatch(db);
    let successCount = 0;
    const itemsToUpdateDetails = items.filter(item => selectedItems.includes(item.id) && !!item.stallId);

    const updateData: Partial<Pick<StockItem, 'category' | 'lowStockThreshold' | 'lastUpdated'>> = {
      lastUpdated: new Date().toISOString(),
    };
    if (batchUpdateCategory.trim() !== "") {
      updateData.category = batchUpdateCategory.trim();
    }
    if (newThresholdNumber !== undefined) {
      updateData.lowStockThreshold = newThresholdNumber;
    }

    const logNotesParts: string[] = [];
    if (updateData.category) logNotesParts.push(`Category to '${updateData.category}'`);
    if (updateData.lowStockThreshold !== undefined) logNotesParts.push(`Threshold to ${updateData.lowStockThreshold}`);
    const logNotes = `Batch update: ${logNotesParts.join(', ')}.`;

    for (const item of itemsToUpdateDetails) {
      console.log(`${LOG_PREFIX} Batch updating details for item: ${item.id} (${item.name})`);
      const itemRef = doc(db, "stockItems", item.id);
      batch.update(itemRef, updateData);
      successCount++;
      if (user) {
        logStockMovement(user, {
            stockItemId: item.id,
            masterStockItemIdForContext: item.originalMasterItemId,
            siteId: item.siteId!,
            stallId: item.stallId,
            type: 'DIRECT_STALL_UPDATE',
            quantityChange: 0,
            quantityBefore: item.quantity,
            quantityAfter: item.quantity,
            notes: logNotes,
        }).catch(logError => console.error(`${LOG_PREFIX} Error logging batch detail update for item ${item.id}:`, logError));
      }
    }

    try {
      await batch.commit();
      console.log(`${LOG_PREFIX} Batch update details committed. ${successCount} items updated.`);
      toast({
        title: "Batch Update Successful",
        description: `${successCount} stall item(s) updated. ${logNotes}`,
      });
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error batch updating item details:`, error.message, error.stack);
      toast({ title: "Batch Update Failed", description: error.message || "Could not update item details.", variant: "destructive" });
    } finally {
      setIsBatchUpdatingDetails(false);
      setShowBatchUpdateDetailsDialog(false);
      setSelectedItems([]);
    }
  };

  const handleOpenBatchUpdatePriceDialog = () => {
    if (selectedItems.length === 0) {
      toast({ title: "No Stall Items Selected", description: "Please select stall items to update prices.", variant: "default" });
      return;
    }
    const actualStallItemsSelected = items.filter(item => selectedItems.includes(item.id) && !!item.stallId);
    if (actualStallItemsSelected.length === 0) {
        toast({ title: "No Stall Items Selected", description: "This action only applies to items within specific stalls.", variant: "default" });
        return;
    }
    console.log(`${LOG_PREFIX} Opening batch update price dialog for ${actualStallItemsSelected.length} stall items.`);
    setBatchUpdatePrice("");
    setBatchUpdateCostPrice("");
    setShowBatchUpdatePriceDialog(true);
  };

  const handleConfirmBatchUpdatePrice = async () => {
    const newPrice = batchUpdatePrice !== "" ? Number(batchUpdatePrice) : undefined;
    const newCostPrice = batchUpdateCostPrice !== "" ? Number(batchUpdateCostPrice) : undefined;

    if (newPrice === undefined && newCostPrice === undefined) {
      toast({ title: "No Prices Specified", description: "Please enter a new selling price and/or cost price.", variant: "default" });
      return;
    }
    if (newPrice !== undefined && (isNaN(newPrice) || newPrice < 0)) {
      toast({ title: "Invalid Selling Price", description: "Selling price must be a non-negative number.", variant: "destructive" });
      return;
    }
    if (newCostPrice !== undefined && (isNaN(newCostPrice) || newCostPrice < 0)) {
      toast({ title: "Invalid Cost Price", description: "Cost price must be a non-negative number.", variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Confirming batch update prices. Price: ${newPrice}, Cost Price: ${newCostPrice}`);
    setIsBatchUpdatingPrice(true);
    const batch = writeBatch(db);
    let successCount = 0;
    const itemsToUpdatePrices = items.filter(item => selectedItems.includes(item.id) && !!item.stallId);

    const updateData: Partial<Pick<StockItem, 'price' | 'costPrice' | 'lastUpdated'>> = {
      lastUpdated: new Date().toISOString(),
    };
    if (newPrice !== undefined) updateData.price = newPrice;
    if (newCostPrice !== undefined) updateData.costPrice = newCostPrice;

    const logNotesParts: string[] = [];
    if (updateData.price !== undefined) logNotesParts.push(`Selling Price to ₹${updateData.price.toFixed(2)}`);
    if (updateData.costPrice !== undefined) logNotesParts.push(`Cost Price to ₹${updateData.costPrice.toFixed(2)}`);
    const logNotes = `Batch price update: ${logNotesParts.join(', ')}.`;

    for (const item of itemsToUpdatePrices) {
      console.log(`${LOG_PREFIX} Batch updating prices for item: ${item.id} (${item.name})`);
      const itemRef = doc(db, "stockItems", item.id);
      batch.update(itemRef, updateData);
      successCount++;
      if (user) {
        logStockMovement(user, {
            stockItemId: item.id,
            masterStockItemIdForContext: item.originalMasterItemId,
            siteId: item.siteId!,
            stallId: item.stallId,
            type: 'DIRECT_STALL_UPDATE',
            quantityChange: 0,
            quantityBefore: item.quantity,
            quantityAfter: item.quantity,
            notes: logNotes,
        }).catch(logError => console.error(`${LOG_PREFIX} Error logging batch price update for item ${item.id}:`, logError));
      }
    }

    try {
      await batch.commit();
      console.log(`${LOG_PREFIX} Batch update prices committed. ${successCount} items updated.`);
      toast({
        title: "Batch Price Update Successful",
        description: `${successCount} stall item(s) prices updated. ${logNotes}`,
      });
      onDataNeedsRefresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error batch updating item prices:`, error.message, error.stack);
      toast({ title: "Batch Price Update Failed", description: error.message || "Could not update item prices.", variant: "destructive" });
    } finally {
      setIsBatchUpdatingPrice(false);
      setShowBatchUpdatePriceDialog(false);
      setSelectedItems([]);
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
      console.warn(`${LOG_PREFIX} Invalid date string for formatting: ${dateString}`, e);
      return "Invalid Date";
    }
  };

  const isAllSelected = useMemo(() => selectableItems.length > 0 && selectedItems.length === selectableItems.length, [selectableItems, selectedItems]);
  const isIndeterminate = useMemo(() => selectedItems.length > 0 && selectedItems.length < selectableItems.length, [selectableItems, selectedItems]);

  const handleOpenSingleDeleteDialog = (item: StockItem) => {
    console.log(`${LOG_PREFIX} Opening single delete dialog for item: ${item.id} (${item.name})`);
    setItemForSingleDelete(item);
    setShowSingleDeleteDialog(true);
  };

  const getSortIcon = (key: keyof StockItem) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground/70" />;
    }
    return sortConfig.direction === 'ascending' ?
      <ArrowUpDown className="ml-2 h-3 w-3 text-primary" style={{ transform: 'rotate(180deg)' }}/> :
      <ArrowUpDown className="ml-2 h-3 w-3 text-primary" />;
  };



  if (loading && items.length === 0) {
    return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"><Skeleton className="h-5 w-5" /></TableHead>
              <TableHead className="w-[64px]"><Skeleton className="h-4 w-12" /></TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="p-1 h-auto -ml-2 opacity-50 cursor-default">
                  Name <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground/70" />
                </Button>
              </TableHead>
              <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="p-1 h-auto opacity-50 cursor-default">
                  Quantity <ArrowUpDown className="ml-2 h-3 w-3 text-muted-foreground/70" />
                </Button>
              </TableHead>
              <TableHead><Skeleton className="h-4 w-10" /></TableHead>
              <TableHead className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableHead>
              <TableHead className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableHead>
              <TableHead><Skeleton className="h-4 w-16" /></TableHead>
              <TableHead><Skeleton className="h-4 w-20" /></TableHead>
              <TableHead className="text-right"><Skeleton className="h-4 w-10 inline-block" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => <TableRowSkeleton key={i} />)}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (items.length === 0 && selectedItems.length === 0 && !loading) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Stock Items Found</p>
        <p className="text-muted-foreground">
          No items match your current filters for this site/stall context.
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
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
    <TooltipProvider>
      {selectedItems.length > 0 && (
        <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-md flex items-center justify-between">
          <p className="text-sm text-accent-foreground">
            {selectedItems.length} stall item(s) selected.
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
                Batch Actions <MoreHorizontal className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
               <DropdownMenuItem
                data-testid="batch-edit-details-action"
                onClick={handleOpenBatchUpdateDetailsDialog}
                disabled={isBatchUpdatingDetails || selectedItems.length === 0}
              >
                <Edit3 className="mr-2 h-4 w-4" /> Edit Category/Threshold
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="batch-edit-prices-action"
                onClick={handleOpenBatchUpdatePriceDialog}
                disabled={isBatchUpdatingPrice || selectedItems.length === 0}
              >
                <IndianRupee className="mr-2 h-4 w-4" /> Edit Prices
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="batch-set-stock-action"
                onClick={handleOpenBatchUpdateStockDialog}
                disabled={isBatchUpdatingStock || selectedItems.length === 0}
              >
                <PackageOpen className="mr-2 h-4 w-4" /> Set Stock Quantity
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="batch-delete-action"
                onClick={handleOpenBatchDeleteDialog}
                className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                disabled={isBatchDeleting || selectedItems.length === 0}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  data-testid="select-all-checkbox"
                  checked={isAllSelected || isIndeterminate}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all stall items"
                  className={cn(isIndeterminate ? '[&_svg]:hidden indeterminate-checkbox' : '')}
                  data-state={isIndeterminate ? 'indeterminate' : (isAllSelected ? 'checked' : 'unchecked')}
                  disabled={selectableItems.length === 0}
                />
                 {isIndeterminate && <Square className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 text-primary fill-current pointer-events-none" />}
              </TableHead>
              <TableHead className="w-[64px]">Image</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="p-1 h-auto -ml-2" onClick={() => requestSort('name')}>
                  Name {getSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="p-1 h-auto" onClick={() => requestSort('quantity')}>
                  Quantity {getSortIcon('quantity')}
                </Button>
              </TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Cost Price</TableHead>
              <TableHead className="text-right">Sell Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isLowStock = item.quantity <= item.lowStockThreshold;
              const isOutOfStock = item.quantity === 0;
              const isMasterStock = !item.stallId && !!item.siteId;
              const isSelected = selectedItems.includes(item.id);

              const siteNameDisplay = item.siteId ? (sitesMap[item.siteId] || `Site ID: ${item.siteId.substring(0,6)}...`) : "N/A";

              let locationDisplayElement: React.ReactNode;
              if (isMasterStock) {
                 locationDisplayElement = (
                    <div>
                        <div className="flex items-center text-foreground font-medium">
                            <Building size={14} className="mr-1 text-primary/70" /> Master Stock
                        </div>
                        <div className="text-xs text-muted-foreground/80 ml-5">
                             ({siteNameDisplay})
                        </div>
                    </div>
                );
              } else if (item.stallId) {
                  const stallName = stallsMap[item.stallId] || `Stall ID: ${item.stallId.substring(0,6)}...`;
                   locationDisplayElement = (
                      <div>
                          <div className="flex items-center text-foreground">
                              <Store size={14} className="mr-1 text-accent/70" /> {stallName}
                              {item.originalMasterItemId && (
                                  <Tooltip>
                                      <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0 hover:bg-transparent">
                                            <Link2Icon className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                          </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                          <p>Allocated from master</p>
                                          <p className="text-xs text-muted-foreground">Master ID: {item.originalMasterItemId.substring(0,8)}...</p>
                                      </TooltipContent>
                                  </Tooltip>
                              )}
                          </div>
                          <div className="text-xs text-muted-foreground/80 ml-5">
                               ({siteNameDisplay})
                          </div>
                      </div>
                  );
              } else {
                  locationDisplayElement = <span className="italic text-muted-foreground">Unassigned</span>;
              }


              return (
                <TableRow
                    key={item.id}
                    data-state={isSelected && !isMasterStock ? "selected" : ""}
                    className={cn(
                        isSelected && !isMasterStock && "bg-primary/5 hover:bg-primary/10",
                        isLowStock && !isOutOfStock && "bg-orange-500/10 hover:bg-orange-500/20",
                        isOutOfStock && "bg-destructive/10 hover:bg-destructive/20",
                        isSelected && !isMasterStock && isLowStock && !isOutOfStock && "bg-orange-500/20 hover:bg-orange-500/25",
                        isSelected && !isMasterStock && isOutOfStock && "bg-destructive/20 hover:bg-destructive/25",
                    )}
                >
                  <TableCell>
                     <Checkbox
                        data-testid={`checkbox-${item.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectItem(item.id, checked)}
                        aria-label={`Select item ${item.name}`}
                        disabled={isMasterStock}
                      />
                  </TableCell>
                  <TableCell>
                    <Image
                      src={item.imageUrl || `https://placehold.co/64x64.png?text=${item.name.substring(0,2)}`}
                      alt={item.name}
                      data-ai-hint={`${item.category || 'generic'} item`}
                      width={40}
                      height={40}
                      className="rounded-md object-cover"
                    />
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-sm">
                    {locationDisplayElement}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.category}</TableCell>
                  <TableCell className="text-right text-foreground">{item.quantity}</TableCell>
                  <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                  <TableCell className="text-right text-muted-foreground">₹{(item.costPrice ?? 0).toFixed(2)}</TableCell>
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
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`actions-button-${item.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenUpdateStockDialog(item)}>
                              <PackageOpen className="mr-2 h-4 w-4" /> Update Stock
                            </DropdownMenuItem>
                           {isMasterStock && (
                            <DropdownMenuItem
                                data-testid={`allocate-action-${item.id}`}
                                onClick={() => handleOpenAllocateDialog(item)}
                                disabled={availableStallsForAllocation.filter(s => s.siteId === item.siteId).length === 0}>
                              <MoveRight className="mr-2 h-4 w-4" /> Allocate to Stall
                            </DropdownMenuItem>
                          )}
                          {!isMasterStock && (
                            <DropdownMenuItem
                                data-testid={`transfer-action-${item.id}`}
                                onClick={() => handleOpenTransferDialog(item)}
                                disabled={!item.siteId || availableStallsForAllocation.filter(s => s.siteId === item.siteId && s.id !== item.stallId).length === 0}>
                                <Shuffle className="mr-2 h-4 w-4" /> Transfer to Stall
                            </DropdownMenuItem>
                          )}
                          {!isMasterStock && item.originalMasterItemId && (
                             <DropdownMenuItem data-testid={`return-action-${item.id}`} onClick={() => handleOpenReturnDialog(item)}>
                              <Undo2 className="mr-2 h-4 w-4" /> Return to Master
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(item.id)}>
                            <Edit className="mr-2 h-4 w-4" /> Edit Item
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleOpenSingleDeleteDialog(item)}
                            className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                            data-testid={`delete-action-${item.id}`}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Item
                          </DropdownMenuItem>
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
                              data-testid="update-stock-quantity-input"
                              type="number"
                              value={newQuantity}
                              onChange={(e) => setNewQuantity(parseAndCapInput(e.target.value))}
                              className="col-span-3 bg-input"
                              min="0"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setStockUpdateItem(null)} disabled={isUpdatingStock}>Cancel</Button>
                          <Button type="button" data-testid="update-stock-confirm-button" onClick={handleStockQuantityChange} disabled={isUpdatingStock || newQuantity === "" || Number(newQuantity) < 0}>
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

      <AlertDialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Batch Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedItems.length} selected stall item(s)? This action cannot be undone.
              For each deleted stall item linked to master stock, its quantity will be returned to the master stock.
              Master stock items cannot be batch deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBatchDeleteDialog(false)} disabled={isBatchDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="batch-delete-confirm-button" onClick={handleConfirmBatchDelete} disabled={isBatchDeleting} className="bg-destructive hover:bg-destructive/90">
              {isBatchDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Selected Items
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchUpdateStockDialog} onOpenChange={setShowBatchUpdateStockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch Update Stock Quantity for Stall Items</AlertDialogTitle>
            <AlertDialogDescription>
              This will set the quantity for all {selectedItems.length} selected stall items to the new value.
              If a selected stall item is linked to master stock, the change in its quantity will be mirrored in the master stock
              (e.g., if stall quantity increases by 5, master quantity decreases by 5, and vice-versa).
              Master stock items cannot be batch updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="batchQuantity" className="text-right col-span-1">
                New Quantity
              </Label>
              <Input
                id="batchQuantity"
                data-testid="batch-update-stock-quantity-input"
                type="number"
                value={batchUpdateQuantity}
                onChange={(e) => setBatchUpdateQuantity(parseAndCapInput(e.target.value))}
                className="col-span-3 bg-input"
                min="0"
                placeholder="Enter new quantity"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBatchUpdateStockDialog(false)} disabled={isBatchUpdatingStock}>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="batch-update-stock-confirm-button" onClick={handleConfirmBatchUpdateStock} disabled={isBatchUpdatingStock || batchUpdateQuantity === "" || Number(batchUpdateQuantity) < 0}>
              {isBatchUpdatingStock && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchUpdateDetailsDialog} onOpenChange={setShowBatchUpdateDetailsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch Edit Category/Threshold for Stall Items</AlertDialogTitle>
            <AlertDialogDescription>
              Update category and/or low stock threshold for {selectedItems.filter(id => items.find(item => item.id === id && !!item.stallId)).length} selected stall item(s).
              Leave a field blank to keep its current value. This action only applies to items within specific stalls.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="batchUpdateCategory">New Category (Optional)</Label>
              <Input
                id="batchUpdateCategory"
                data-testid="batch-update-details-category-input"
                value={batchUpdateCategory}
                onChange={(e) => setBatchUpdateCategory(e.target.value)}
                placeholder="Enter new category"
                className="bg-input"
                disabled={isBatchUpdatingDetails}
              />
            </div>
            <div>
              <Label htmlFor="batchUpdateLowStockThreshold">New Low Stock Threshold (Optional)</Label>
              <Input
                id="batchUpdateLowStockThreshold"
                data-testid="batch-update-details-threshold-input"
                type="number"
                value={batchUpdateLowStockThreshold}
                onChange={(e) => setBatchUpdateLowStockThreshold(parseAndCapInput(e.target.value))}
                placeholder="Enter new threshold"
                className="bg-input"
                min="0"
                disabled={isBatchUpdatingDetails}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBatchUpdateDetailsDialog(false)} disabled={isBatchUpdatingDetails}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="batch-update-details-confirm-button"
              onClick={handleConfirmBatchUpdateDetails}
              disabled={isBatchUpdatingDetails || (batchUpdateCategory.trim() === "" && (batchUpdateLowStockThreshold === "" || isNaN(Number(batchUpdateLowStockThreshold))))}
            >
              {isBatchUpdatingDetails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showBatchUpdatePriceDialog} onOpenChange={setShowBatchUpdatePriceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch Update Prices for Stall Items</AlertDialogTitle>
            <AlertDialogDescription>
              Update selling price and/or cost price for {selectedItems.filter(id => items.find(item => item.id === id && !!item.stallId)).length} selected stall item(s).
              Leave a field blank to keep its current value. This action only applies to items within specific stalls. Master stock prices are not affected by this batch action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="batchUpdatePrice">New Selling Price (₹) (Optional)</Label>
              <Input
                id="batchUpdatePrice"
                data-testid="batch-update-price-selling-input"
                type="text"
                value={batchUpdatePrice}
                onChange={(e) => setBatchUpdatePrice(parseAndCapFloatInput(e.target.value))}
                placeholder="e.g., 199.99"
                className="bg-input"
                disabled={isBatchUpdatingPrice}
              />
            </div>
            <div>
              <Label htmlFor="batchUpdateCostPrice">New Cost Price (₹) (Optional)</Label>
              <Input
                id="batchUpdateCostPrice"
                data-testid="batch-update-price-cost-input"
                type="text"
                value={batchUpdateCostPrice}
                onChange={(e) => setBatchUpdateCostPrice(parseAndCapFloatInput(e.target.value))}
                placeholder="e.g., 99.50"
                className="bg-input"
                disabled={isBatchUpdatingPrice}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBatchUpdatePriceDialog(false)} disabled={isBatchUpdatingPrice}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="batch-update-price-confirm-button"
              onClick={handleConfirmBatchUpdatePrice}
              disabled={isBatchUpdatingPrice || (batchUpdatePrice === "" && batchUpdateCostPrice === "") || (batchUpdatePrice !== "" && (isNaN(Number(batchUpdatePrice)) || Number(batchUpdatePrice) < 0)) || (batchUpdateCostPrice !== "" && (isNaN(Number(batchUpdateCostPrice)) || Number(batchUpdateCostPrice) < 0)) }
            >
              {isBatchUpdatingPrice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Price Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {itemForSingleDelete && (
        <AlertDialog open={showSingleDeleteDialog} onOpenChange={(open) => {
            setShowSingleDeleteDialog(open);
            if (!open) setItemForSingleDelete(null);
        }}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the item "{itemForSingleDelete.name}".
                If this is a stall item linked to master stock, its quantity will be returned to the master stock.
                If this is master stock, any stall stock items linked to it will NOT be automatically deleted and will become orphaned (unless this check prevents deletion).
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel onClick={() => {
                    setShowSingleDeleteDialog(false);
                    setItemForSingleDelete(null);
                }} disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="single-delete-confirm-button" onClick={() => handleDelete(itemForSingleDelete.id, itemForSingleDelete.name)} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete
                </AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        )}

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
                  <SelectTrigger id="targetStallForAllocation" data-testid="allocate-stall-select-trigger" className="bg-input">
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
                  data-testid="allocate-quantity-input"
                  type="number"
                  value={quantityToAllocate}
                  onChange={(e) => setQuantityToAllocate(parseAndCapInput(e.target.value, itemToAllocate.quantity, 1))}
                  min="1"
                  max={itemToAllocate.quantity}
                  className="bg-input"
                  disabled={isAllocating}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowAllocateDialog(false)} disabled={isAllocating}>Cancel</AlertDialogCancel>
              <AlertDialogAction data-testid="allocate-confirm-button" onClick={handleConfirmAllocation} disabled={isAllocating || !targetStallIdForAllocation || Number(quantityToAllocate) <= 0 || stallsForCurrentSite.length === 0}>
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
                  data-testid="return-quantity-input"
                  type="number"
                  value={quantityToReturn}
                  onChange={(e) => setQuantityToReturn(parseAndCapInput(e.target.value, itemToReturn.quantity, 1))}
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
                data-testid="return-confirm-button"
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
                            <SelectTrigger id="destinationStall" data-testid="transfer-stall-select-trigger" className="bg-input">
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
                            data-testid="transfer-quantity-input"
                            type="number"
                            value={quantityToTransfer}
                            onChange={(e) => setQuantityToTransfer(parseAndCapInput(e.target.value, itemToTransfer.quantity, 1))}
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
                        data-testid="transfer-confirm-button"
                        onClick={handleConfirmTransfer}
                        disabled={isTransferring || !destinationStallId || Number(quantityToTransfer) <= 0 || Number(quantityToTransfer) > itemToTransfer.quantity || destinationStallsForTransfer.length === 0}
                    >
                        {isTransferring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Transfer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
      <style jsx global>{`
        .indeterminate-checkbox:has(+ svg) {
          background-image: none;
        }
      `}</style>
    </TooltipProvider>
  );
}

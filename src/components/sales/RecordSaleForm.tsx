
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { StockItem, SoldItem, Stall } from "@/types";
import { PlusCircle, Trash2, IndianRupee, Loader2, Info, Store } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  runTransaction,
  Timestamp,
  QuerySnapshot,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  query,
  where,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { logStockMovement } from "@/lib/stockLogger";
import Link from "next/link";

const LOG_PREFIX = "[RecordSaleForm]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

const saleItemSchema = z.object({
  itemId: z.string().min(1, "Please select an item."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  pricePerUnit: z.coerce.number().positive("Price must be positive."),
  name: z.string(), // Not strictly required for submission but good for form state
});

const recordSaleFormSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Please add at least one item to the sale."),
});

type RecordSaleFormValues = z.infer<typeof recordSaleFormSchema>;

export default function RecordSaleForm() {
  const { toast } = useToast();
  const { user, activeSiteId, activeStallId } = useAuth();
  const [availableItems, setAvailableItems] = useState<StockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false); // Default to false
  const [totalSaleAmount, setTotalSaleAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stallsForManager, setStallsForManager] = useState<Stall[]>([]);
  const [managerSelectedStallId, setManagerSelectedStallId] = useState<string>('');

  const form = useForm<RecordSaleFormValues>({
    resolver: zodResolver(recordSaleFormSchema),
    defaultValues: {
      items: [{ itemId: "", quantity: 1, pricePerUnit: 0, name: "" }],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const effectiveStallId = user?.role === 'manager' ? managerSelectedStallId : activeStallId;

  // Fetch stalls for manager's dropdown
  useEffect(() => {
    if (user?.role === 'manager' && activeSiteId) {
      console.log(`${LOG_PREFIX} Manager detected. Fetching stalls for site: ${activeSiteId}`);
      const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
      const unsubscribe = onSnapshot(stallsQuery, (snapshot) => {
        const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForManager(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));
      }, (error) => {
        console.error(`${LOG_PREFIX} Error fetching stalls for manager:`, error);
        toast({ title: "Error", description: "Could not load stalls for this site.", variant: "destructive" });
      });
      return () => unsubscribe();
    } else {
      setStallsForManager([]);
    }
  }, [user?.role, activeSiteId, toast]);


  // Fetch available items based on effective stall ID
  useEffect(() => {
    console.log(`${LOG_PREFIX} useEffect for available items. ActiveSiteId: ${activeSiteId}, EffectiveStallId: ${effectiveStallId}`);
    if (!activeSiteId || !effectiveStallId) {
      setAvailableItems([]);
      setLoadingItems(false);
      console.log(`${LOG_PREFIX} No active site/stall. Available items cleared.`);
      return;
    }
    setLoadingItems(true);
    const itemsCollectionRef = collection(db, "stockItems");
    const q = query(
      itemsCollectionRef,
      where("siteId", "==", activeSiteId),
      where("stallId", "==", effectiveStallId)
    );

    const unsubscribe = onSnapshot(q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        } as StockItem));
        const inStockItems = fetchedItems.filter(item => item.quantity > 0);
        setAvailableItems(inStockItems.sort((a, b) => a.name.localeCompare(b.name))); // Sort items alphabetically
        console.log(`${LOG_PREFIX} Fetched ${inStockItems.length} available items for stall ${effectiveStallId}.`);
        setLoadingItems(false);
      },
      (error) => {
        console.error(`${LOG_PREFIX} Error fetching stock items for stall ${effectiveStallId}:`, error);
        toast({ title: "Error Loading Items", description: "Could not load items for the current stall. Please try again.", variant: "destructive"});
        setAvailableItems([]);
        setLoadingItems(false);
      }
    );
    return () => unsubscribe();
  }, [activeSiteId, effectiveStallId, toast]);

  const watchedItems = form.watch("items");

  useEffect(() => {
    let total = 0;
    watchedItems.forEach(item => {
      if (item.quantity > 0 && item.pricePerUnit > 0) {
        total += item.quantity * item.pricePerUnit;
      }
    });
    setTotalSaleAmount(total);
  }, [watchedItems]);

  async function onSubmit(values: RecordSaleFormValues) {
    const stallIdForSale = user?.role === 'manager' ? managerSelectedStallId : activeStallId;
    console.log(`${LOG_PREFIX} onSubmit called. Values:`, values);
    if (!user) {
      console.warn(`${LOG_PREFIX} User not authenticated. Sale recording aborted.`);
      toast({ title: "Authentication Error", description: "You must be logged in to record a sale.", variant: "destructive"});
      setIsSubmitting(false);
      return;
    }
    if (!activeSiteId || !stallIdForSale) {
      console.warn(`${LOG_PREFIX} Site or stall context missing. Sale recording aborted. Site: ${activeSiteId}, Stall: ${stallIdForSale}`);
      toast({ title: "Context Error", description: "Cannot record sale without an active site and specific stall context.", variant: "destructive"});
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);
    const saleTransactionId = doc(collection(db, "salesTransactions")).id;
    console.log(`${LOG_PREFIX} Generated SaleTransaction ID: ${saleTransactionId}`);

    try {
      await runTransaction(db, async (transaction) => {
        console.log(`${LOG_PREFIX} Starting Firestore transaction for sale ${saleTransactionId}.`);

        // Phase 1: All Reads
        const itemReads: {
          formItem: typeof values.items[0];
          stallItemRef: DocumentReference;
          masterItemRef?: DocumentReference;
        }[] = [];

        for (const formItem of values.items) {
          const stallItemRef = doc(db, "stockItems", formItem.itemId);
          itemReads.push({ formItem, stallItemRef });
        }

        const stallItemSnapshots = await Promise.all(itemReads.map(ir => transaction.get(ir.stallItemRef)));
        const masterItemRefsToRead: DocumentReference[] = [];
        const stallItemDataMap = new Map<string, StockItem>();

        for (let i = 0; i < stallItemSnapshots.length; i++) {
          const stallItemSnap = stallItemSnapshots[i];
          if (!stallItemSnap.exists()) {
            console.error(`${LOG_PREFIX} Item ${itemReads[i].formItem.name} (ID: ${itemReads[i].formItem.itemId}) not found in stock during transaction read phase.`);
            throw new Error(`Item ${itemReads[i].formItem.name} (ID: ${itemReads[i].formItem.itemId}) not found in stock.`);
          }
          const stallData = { id: stallItemSnap.id, ...stallItemSnap.data() } as StockItem;
          stallItemDataMap.set(stallData.id, stallData);
          if (stallData.originalMasterItemId) {
            const masterItemRef = doc(db, "stockItems", stallData.originalMasterItemId);
            itemReads[i].masterItemRef = masterItemRef; // Store for later use
            masterItemRefsToRead.push(masterItemRef);
          }
        }
        
        const uniqueMasterItemRefsToRead = [...new Set(masterItemRefsToRead)]; // Ensure unique master reads
        const masterItemSnapshots = await Promise.all(uniqueMasterItemRefsToRead.map(ref => transaction.get(ref)));
        const masterItemDataMap = new Map<string, StockItem>();
        masterItemSnapshots.forEach(snap => {
          if (snap.exists()) {
            masterItemDataMap.set(snap.id, { id: snap.id, ...snap.data() } as StockItem);
          }
        });
        console.log(`${LOG_PREFIX} All reads completed. Stall items read: ${stallItemSnapshots.length}, Master items read: ${masterItemSnapshots.length}`);

        // Phase 2: Validations & Calculations
        const soldItemsForTransaction: SoldItem[] = [];
        let calculatedTotalAmount = 0;
        const stockUpdates: { ref: DocumentReference; newQuantity: number; oldQuantity: number; originalMasterItemId?: string | null }[] = [];
        const masterStockUpdates: { ref: DocumentReference; newQuantity: number; oldQuantity: number }[] = [];

        for (const formItem of values.items) {
          const currentStockData = stallItemDataMap.get(formItem.itemId);
          if (!currentStockData) { // Should have been caught by initial read, but as a safeguard
            throw new Error(`Data for item ${formItem.name} (ID: ${formItem.itemId}) missing after reads.`);
          }
          console.log(`${LOG_PREFIX} Processing item ${currentStockData.name} (ID: ${currentStockData.id}) - Current Qty: ${currentStockData.quantity}, Requested: ${formItem.quantity}`);
          
          if (currentStockData.siteId !== activeSiteId || currentStockData.stallId !== stallIdForSale) {
            console.error(`${LOG_PREFIX} Item ${formItem.name} (ID: ${formItem.itemId}) does not belong to active stall ${stallIdForSale}. Item Site: ${currentStockData.siteId}, Item Stall: ${currentStockData.stallId}`);
            throw new Error(`Item ${formItem.name} does not belong to the currently active stall. Please refresh or re-select items.`);
          }
          if (currentStockData.quantity < formItem.quantity) {
            console.error(`${LOG_PREFIX} Insufficient stock for ${formItem.name}. Available: ${currentStockData.quantity}, Requested: ${formItem.quantity}`);
            throw new Error(`Not enough stock for ${formItem.name}. Available: ${currentStockData.quantity}, Requested: ${formItem.quantity}.`);
          }

          const pricePerUnit = currentStockData.price;
          soldItemsForTransaction.push({
            itemId: formItem.itemId,
            name: formItem.name,
            quantity: formItem.quantity,
            pricePerUnit: pricePerUnit,
            totalPrice: formItem.quantity * pricePerUnit,
          });
          calculatedTotalAmount += formItem.quantity * pricePerUnit;

          stockUpdates.push({ 
            ref: doc(db, "stockItems", currentStockData.id), 
            newQuantity: currentStockData.quantity - formItem.quantity,
            oldQuantity: currentStockData.quantity,
            originalMasterItemId: currentStockData.originalMasterItemId
          });

          if (currentStockData.originalMasterItemId) {
            const masterStockData = masterItemDataMap.get(currentStockData.originalMasterItemId);
            if (masterStockData) {
              masterStockUpdates.push({
                ref: doc(db, "stockItems", masterStockData.id),
                newQuantity: Math.max(0, masterStockData.quantity - formItem.quantity),
                oldQuantity: masterStockData.quantity
              });
            } else {
              console.warn(`${LOG_PREFIX} Master stock item ${currentStockData.originalMasterItemId} not found for sale of stall item ${currentStockData.id}. Master stock not adjusted.`);
            }
          }
        }

        if (Math.abs(calculatedTotalAmount - totalSaleAmount) > 0.001) {
          console.warn(`${LOG_PREFIX} Frontend total (₹${totalSaleAmount.toFixed(2)}) differs from backend calculated total (₹${calculatedTotalAmount.toFixed(2)}). Using backend total for transaction.`);
        }
        
        // Phase 3: All Writes
        stockUpdates.forEach(update => {
          transaction.update(update.ref, {
            quantity: update.newQuantity,
            lastUpdated: Timestamp.now().toDate().toISOString()
          });
           console.log(`${LOG_PREFIX} Queued update for stall item ${update.ref.id} from ${update.oldQuantity} to ${update.newQuantity}.`);
        });

        masterStockUpdates.forEach(update => {
          transaction.update(update.ref, {
            quantity: update.newQuantity,
            lastUpdated: Timestamp.now().toDate().toISOString()
          });
          console.log(`${LOG_PREFIX} Queued update for master item ${update.ref.id} from ${update.oldQuantity} to ${update.newQuantity}.`);
        });
        
        const salesDocRef = doc(db, "salesTransactions", saleTransactionId);
        transaction.set(salesDocRef, {
          items: soldItemsForTransaction,
          totalAmount: calculatedTotalAmount,
          transactionDate: Timestamp.now(),
          staffId: user.uid,
          staffName: user.displayName || user.email,
          siteId: activeSiteId,
          stallId: stallIdForSale,
          isDeleted: false,
        });
        console.log(`${LOG_PREFIX} Sale document ${saleTransactionId} created in transaction.`);
      });
      console.log(`${LOG_PREFIX} Firestore transaction for sale ${saleTransactionId} committed successfully.`);

      for (const formItem of values.items) {
          const soldStallItemSnap = await getDoc(doc(db, "stockItems", formItem.itemId));
          if (soldStallItemSnap.exists()) {
              const soldStallItem = { id: soldStallItemSnap.id, ...soldStallItemSnap.data() } as StockItem;
              const originalStallQuantity = soldStallItem.quantity + formItem.quantity; 

              await logStockMovement(user, {
                  stockItemId: soldStallItem.id,
                  siteId: soldStallItem.siteId!,
                  stallId: soldStallItem.stallId,
                  masterStockItemIdForContext: soldStallItem.originalMasterItemId,
                  type: 'SALE_FROM_STALL',
                  quantityChange: -formItem.quantity,
                  quantityBefore: originalStallQuantity,
                  quantityAfter: soldStallItem.quantity, 
                  notes: `Sale ID: ${saleTransactionId}`,
                  relatedTransactionId: saleTransactionId,
              });

              if (soldStallItem.originalMasterItemId) {
                   const masterItemDoc = await getDoc(doc(db, "stockItems", soldStallItem.originalMasterItemId));
                   if(masterItemDoc.exists()){
                       const masterItemData = { id: masterItemDoc.id, ...masterItemDoc.data() } as StockItem;
                       const originalMasterQuantity = masterItemData.quantity + formItem.quantity; 
                        await logStockMovement(user, {
                            stockItemId: soldStallItem.originalMasterItemId,
                            siteId: masterItemData.siteId!,
                            stallId: null,
                            type: 'SALE_AFFECTS_MASTER',
                            quantityChange: -formItem.quantity,
                            quantityBefore: originalMasterQuantity,
                            quantityAfter: masterItemData.quantity,
                            notes: `Linked to sale of stall item ${soldStallItem.name} (ID: ${soldStallItem.id}), Sale ID: ${saleTransactionId}`,
                            relatedTransactionId: saleTransactionId,
                            linkedStockItemId: soldStallItem.id,
                        });
                   } else {
                       console.warn(`${LOG_PREFIX} Master item ${soldStallItem.originalMasterItemId} not found for logging after sale.`);
                   }
              }
          } else {
            console.warn(`${LOG_PREFIX} Could not find item ${formItem.itemId} in 'availableItems' for post-sale logging. This might indicate a rapid stock update or an issue.`);
          }
      }

      toast({
        title: "Sale Recorded Successfully!",
        description: `Total: ₹${totalSaleAmount.toFixed(2)}. Stock levels updated. Sale ID: ${saleTransactionId.substring(0,8)}...`,
      });
      form.reset({ items: [{ itemId: "", quantity: 1, pricePerUnit: 0, name: "" }] });
      if (user?.role === 'manager') {
        setManagerSelectedStallId('');
      }

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error recording sale transaction (ID: ${saleTransactionId}):`, error.message, error.stack);
      let userMessage = "An unexpected error occurred. The sale was not recorded, and stock levels were not changed. Please check item availability and try again.";
      if (error.message.includes("Not enough stock for") || error.message.includes("not found in stock")) {
          userMessage = `Error: ${error.message} Please refresh available items or adjust quantity.`;
      } else if (error.message.includes("does not belong to the currently active stall")) {
          userMessage = `Error: ${error.message} One of the items selected is no longer valid for this stall. Please remove it or refresh your item list.`;
      }
      toast({
        title: "Sale Recording Failed",
        description: userMessage,
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleItemChange = (value: string, index: number) => {
    const selectedItem = availableItems.find(ai => ai.id === value);
    console.log(`${LOG_PREFIX} handleItemChange. Index: ${index}, Selected item ID: ${value}, Found item:`, selectedItem);
    if (selectedItem) {
      const price = selectedItem.price;
      update(index, {
        ...watchedItems[index],
        itemId: selectedItem.id,
        name: selectedItem.name,
        pricePerUnit: price,
        quantity: 1 
      });
    } else {
        update(index, {
            ...watchedItems[index],
            itemId: "",
            name: "",
            pricePerUnit: 0,
            quantity: 1
        });
    }
  };
  
  const parseAndCapQuantity = (rawValue: string, maxQuantity: number | undefined): number | "" => {
      if (rawValue === "") return "";
      let val = parseInt(rawValue, 10);
      if (isNaN(val)) return 1; 
      if (maxQuantity !== undefined && val > maxQuantity) val = maxQuantity;
      if (val < 1) val = 1;
      return val;
  };

  if (!user) {
    return (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Authenticating user...</p>
        </div>
    );
  }

  if (!activeSiteId) {
    return (
      <Alert variant="default" className="max-w-2xl mx-auto shadow-lg border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Site Context Required</AlertTitle>
        <AlertDescription>
          Please select an active site from the header bar to begin recording a sale.
        </AlertDescription>
      </Alert>
    );
  }

  if (user.role === 'staff' && !activeStallId) {
    return (
      <Alert variant="default" className="max-w-2xl mx-auto shadow-lg border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Stall Context Required for Staff</AlertTitle>
        <AlertDescription>
          As a staff member, your account needs a default stall assigned to record sales. Please contact your administrator.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <IndianRupee className="mr-2 h-6 w-6 text-accent" />
          Record New Sale
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} data-testid="record-sale-form">
          <CardContent className="space-y-6">
            {user.role === 'manager' && (
              <FormItem>
                <FormLabel>Stall for Sale</FormLabel>
                <Select
                  onValueChange={(value) => {
                    setManagerSelectedStallId(value);
                    form.reset({ items: [{ itemId: "", quantity: 1, pricePerUnit: 0, name: "" }] });
                  }}
                  value={managerSelectedStallId}
                  disabled={isSubmitting || stallsForManager.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="bg-input">
                       <Store className="mr-2 h-4 w-4 text-muted-foreground" />
                      <SelectValue placeholder="Select the stall for this sale..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {stallsForManager.map((stall) => (
                      <SelectItem key={stall.id} value={stall.id}>
                        {stall.name} ({stall.stallType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}

            {loadingItems && (
              <div className="flex justify-center items-center py-6" data-testid="loading-items-indicator">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-muted-foreground">Loading available items...</p>
              </div>
            )}

            {!loadingItems && availableItems.length === 0 && effectiveStallId && (
               <Alert variant="default" data-testid="no-items-alert">
                <Info className="h-4 w-4" />
                <AlertTitle>No Items Available at this Stall</AlertTitle>
                <AlertDescription>
                  There are no stock items available for sale at the currently selected stall, or all items are out of stock. Ensure stock is allocated or added to this stall.
                </AlertDescription>
              </Alert>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 p-4 border rounded-md bg-muted/30" data-testid={`sale-item-row-${index}`}>
                <FormField
                  control={form.control}
                  name={`items.${index}.itemId`}
                  render={({ field: formField }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Item</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          formField.onChange(value);
                          handleItemChange(value, index);
                        }}
                        value={formField.value} // Ensure value prop is used for controlled component
                        disabled={isSubmitting || loadingItems || availableItems.length === 0}
                        data-testid={`item-select-${index}`}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-input">
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableItems.map((item) => (
                            <SelectItem key={item.id} value={item.id} disabled={item.quantity <= 0}>
                              {item.name} (Stock: {item.quantity}) - ₹{item.price.toFixed(2)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2 w-full sm:w-auto">
                    <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field: formField }) => {
                        const currentItem = availableItems.find(ai => ai.id === watchedItems[index]?.itemId);
                        const maxQuantity = currentItem ? currentItem.quantity : undefined;
                        return (
                        <FormItem className="flex-grow">
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                            <Input
                                type="number"
                                placeholder="Qty"
                                {...formField}
                                className="bg-input"
                                min="1"
                                max={maxQuantity?.toString()}
                                disabled={isSubmitting || !watchedItems[index]?.itemId || availableItems.length === 0}
                                onChange={(e) => {
                                    const parsedVal = parseAndCapQuantity(e.target.value, maxQuantity);
                                    formField.onChange(parsedVal);
                                }}
                                data-testid={`quantity-input-${index}`}
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        );
                    }}
                    />
                    <FormField
                    control={form.control}
                    name={`items.${index}.pricePerUnit`}
                    render={({ field: formField }) => (
                        <FormItem className="flex-grow">
                        <FormLabel>Price/Unit (₹)</FormLabel>
                        <FormControl>
                            <Input
                                type="number"
                                placeholder="Price"
                                {...formField}
                                className="bg-input text-muted-foreground"
                                readOnly
                                disabled
                                data-testid={`price-input-${index}`}
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1 || isSubmitting}
                  className="text-destructive hover:bg-destructive/10 shrink-0"
                  data-testid={`remove-item-button-${index}`}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ itemId: "", quantity: 1, pricePerUnit: 0, name: "" })}
              className="w-full border-dashed"
              disabled={isSubmitting || loadingItems || availableItems.length === 0}
              data-testid="add-another-item-button"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Another Item
            </Button>

            <div className="pt-4 text-right">
              <p className="text-2xl font-bold text-foreground" data-testid="total-sale-amount">
                Total: ₹{totalSaleAmount.toFixed(2)}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || loadingItems || fields.some(f => !f.itemId || !f.quantity || f.quantity <=0 || f.pricePerUnit < 0 ) || availableItems.length === 0 || !user || !activeSiteId || !effectiveStallId}
              data-testid="record-sale-submit-button"
            >
              {isSubmitting ? <Loader2 className="animate-spin mr-2" data-testid="submit-loader"/> : null}
              Record Sale
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

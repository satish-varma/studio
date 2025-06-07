
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
import type { StockItem, SoldItem } from "@/types";
import { PlusCircle, Trash2, IndianRupee, Loader2, Info } from "lucide-react";
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
  getDoc
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
  name: z.string(),
});

const recordSaleFormSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Please add at least one item to the sale."),
});

type RecordSaleFormValues = z.infer<typeof recordSaleFormSchema>;

export default function RecordSaleForm() {
  const { toast } = useToast();
  const { user, activeSiteId, activeStallId } = useAuth();
  const [availableItems, setAvailableItems] = useState<StockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [totalSaleAmount, setTotalSaleAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    console.log(`${LOG_PREFIX} useEffect for available items. ActiveSiteId: ${activeSiteId}, ActiveStallId: ${activeStallId}`);
    if (!activeSiteId || !activeStallId) {
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
      where("stallId", "==", activeStallId)
    );

    const unsubscribe = onSnapshot(q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        } as StockItem));
        const inStockItems = fetchedItems.filter(item => item.quantity > 0);
        setAvailableItems(inStockItems);
        console.log(`${LOG_PREFIX} Fetched ${inStockItems.length} available items for stall ${activeStallId}.`);
        setLoadingItems(false);
      },
      (error) => {
        console.error(`${LOG_PREFIX} Error fetching stock items for stall ${activeStallId}:`, error);
        toast({ title: "Error Loading Items", description: "Could not load items for the current stall. Please try again.", variant: "destructive"});
        setAvailableItems([]);
        setLoadingItems(false);
      }
    );
    return () => unsubscribe();
  }, [activeSiteId, activeStallId, toast]);

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
    console.log(`${LOG_PREFIX} onSubmit called. Values:`, values);
    if (!user) {
      console.warn(`${LOG_PREFIX} User not authenticated. Sale recording aborted.`);
      toast({ title: "Authentication Error", description: "You must be logged in to record a sale.", variant: "destructive"});
      setIsSubmitting(false); // Ensure submitting state is reset
      return;
    }
    if (!activeSiteId || !activeStallId) {
      console.warn(`${LOG_PREFIX} Site or stall context missing. Sale recording aborted. Site: ${activeSiteId}, Stall: ${activeStallId}`);
      toast({ title: "Context Error", description: "Cannot record sale without an active site and specific stall context.", variant: "destructive"});
      setIsSubmitting(false); // Ensure submitting state is reset
      return;
    }
    setIsSubmitting(true);
    const saleTransactionId = doc(collection(db, "salesTransactions")).id;
    console.log(`${LOG_PREFIX} Generated SaleTransaction ID: ${saleTransactionId}`);

    try {
      await runTransaction(db, async (transaction) => {
        console.log(`${LOG_PREFIX} Starting Firestore transaction for sale ${saleTransactionId}.`);
        const stockItemReads: Promise<DocumentSnapshot>[] = [];
        values.items.forEach(formItem => {
          const stockItemRef = doc(db, "stockItems", formItem.itemId);
          stockItemReads.push(transaction.get(stockItemRef));
        });
        const stockItemSnapshots = await Promise.all(stockItemReads);

        const soldItemsForTransaction: SoldItem[] = [];
        let calculatedTotalAmount = 0;

        for (let i = 0; i < values.items.length; i++) {
          const formItem = values.items[i];
          const stockItemSnap = stockItemSnapshots[i];

          if (!stockItemSnap.exists()) {
            console.error(`${LOG_PREFIX} Item ${formItem.name} (ID: ${formItem.itemId}) not found in stock during transaction.`);
            throw new Error(`Item ${formItem.name} (ID: ${formItem.itemId}) not found in stock.`);
          }
          const currentStockData = { id: stockItemSnap.id, ...stockItemSnap.data() } as StockItem;
          console.log(`${LOG_PREFIX} Processing item ${currentStockData.name} (ID: ${currentStockData.id}) - Current Qty: ${currentStockData.quantity}, Requested: ${formItem.quantity}`);


          if (currentStockData.siteId !== activeSiteId || currentStockData.stallId !== activeStallId) {
             console.error(`${LOG_PREFIX} Item ${formItem.name} (ID: ${formItem.itemId}) does not belong to active stall ${activeStallId}. Item Site: ${currentStockData.siteId}, Item Stall: ${currentStockData.stallId}`);
             throw new Error(`Item ${formItem.name} does not belong to the currently active stall (${activeStallId}). Please refresh or re-select items.`);
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

          transaction.update(stockItemSnap.ref, {
            quantity: currentStockData.quantity - formItem.quantity,
            lastUpdated: Timestamp.now().toDate().toISOString()
          });
          console.log(`${LOG_PREFIX} Updated stock for item ${currentStockData.id} from ${currentStockData.quantity} to ${currentStockData.quantity - formItem.quantity}.`);

          if (currentStockData.originalMasterItemId) {
            const masterStockRef = doc(db, "stockItems", currentStockData.originalMasterItemId);
            console.log(`${LOG_PREFIX} Item ${currentStockData.id} linked to master ${currentStockData.originalMasterItemId}. Fetching master...`);
            const masterStockSnap = await transaction.get(masterStockRef);
            if (masterStockSnap.exists()) {
              const masterItemData = { id: masterStockSnap.id, ...masterStockSnap.data() } as StockItem;
              const newMasterQuantity = Math.max(0, masterItemData.quantity - formItem.quantity);
              transaction.update(masterStockRef, {
                quantity: newMasterQuantity,
                lastUpdated: Timestamp.now().toDate().toISOString()
              });
              console.log(`${LOG_PREFIX} Updated master stock ${masterItemData.id} from ${masterItemData.quantity} to ${newMasterQuantity}.`);
            } else {
              console.warn(`${LOG_PREFIX} Master stock item ${currentStockData.originalMasterItemId} not found for sale of stall item ${currentStockData.id}. Master stock not adjusted.`);
            }
          }
        }

        if (Math.abs(calculatedTotalAmount - totalSaleAmount) > 0.001) {
             console.warn(`${LOG_PREFIX} Frontend total ${totalSaleAmount} differs from backend calculated total ${calculatedTotalAmount}. Using backend total.`);
        }

        const salesDocRef = doc(db, "salesTransactions", saleTransactionId);
        transaction.set(salesDocRef, {
          items: soldItemsForTransaction,
          totalAmount: calculatedTotalAmount,
          transactionDate: Timestamp.now(),
          staffId: user.uid,
          staffName: user.displayName || user.email,
          siteId: activeSiteId,
          stallId: activeStallId,
          isDeleted: false,
        });
        console.log(`${LOG_PREFIX} Sale document ${saleTransactionId} created in transaction.`);
      });
      console.log(`${LOG_PREFIX} Firestore transaction for sale ${saleTransactionId} committed successfully.`);

      // Logging stock movements after successful transaction
      for (const formItem of values.items) {
          const soldStallItem = availableItems.find(i => i.id === formItem.itemId);
          if (soldStallItem) {
              // Original quantity before this sale would be current (just updated) quantity + sold quantity
              const originalStallQuantity = (soldStallItem.quantity - formItem.quantity) + formItem.quantity;

              await logStockMovement(user, {
                  stockItemId: soldStallItem.id,
                  siteId: soldStallItem.siteId!,
                  stallId: soldStallItem.stallId,
                  masterStockItemIdForContext: soldStallItem.originalMasterItemId,
                  type: 'SALE_FROM_STALL',
                  quantityChange: -formItem.quantity,
                  quantityBefore: originalStallQuantity,
                  quantityAfter: soldStallItem.quantity - formItem.quantity, // This is the new quantity after this sale if we refetch, or more simply (original - sold)
                  notes: `Sale ID: ${saleTransactionId}`,
                  relatedTransactionId: saleTransactionId,
              });

              if (soldStallItem.originalMasterItemId) {
                   const masterItemDoc = await getDoc(doc(db, "stockItems", soldStallItem.originalMasterItemId));
                   if(masterItemDoc.exists()){
                       const masterItemData = masterItemDoc.data() as StockItem;
                       const originalMasterQuantity = masterItemData.quantity + formItem.quantity; // Before this specific sale impact
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

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error recording sale transaction (ID: ${saleTransactionId}):`, error.message, error.stack);
      toast({
        title: "Sale Recording Failed",
        description: error.message || "An unexpected error occurred. The sale was not recorded, and stock levels were not changed. Please check item availability and try again.",
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
        pricePerUnit: price
      });
    } else {
        update(index, {
            ...watchedItems[index],
            itemId: "",
            name: "",
            pricePerUnit: 0
        });
    }
  };

  if (!user) {
    return (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Authenticating user...</p>
        </div>
    );
  }

  if (!activeSiteId || !activeStallId) {
    const message = user.role === 'admin'
      ? "Admin: Please select an active Site AND a specific Stall from the dropdowns in the header bar to record a sale. Sales cannot be made from \"Master Stock\" or \"All Stalls\" views directly."
      : "To record a sale, you need a default site and stall assigned to your profile and selected. Please go to your Profile Page to set your default operational context. If defaults are set, ensure they are valid and that stock items exist for that stall.";
    const linkMessage = user.role !== 'admin' ? <Link href="/profile" className="text-primary hover:underline font-medium">Profile Page</Link> : null;

    return (
      <Alert variant="default" className="max-w-2xl mx-auto shadow-lg border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Site & Stall Context Required</AlertTitle>
        <AlertDescription>
          {message.split("Profile Page")[0]}
          {linkMessage}
          {message.split("Profile Page")[1] || ""}
        </AlertDescription>
      </Alert>
    );
  }

  if (loadingItems) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading items for sale at the current stall...</p>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <IndianRupee className="mr-2 h-6 w-6 text-accent" />
          Record New Sale
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {availableItems.length === 0 && !loadingItems && (
               <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>No Items Available at this Stall</AlertTitle>
                <AlertDescription>
                  There are no stock items available for sale at the currently selected stall, or all items are out of stock. Ensure stock is allocated or added to this stall.
                </AlertDescription>
              </Alert>
            )}
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-4 p-4 border rounded-md bg-muted/30">
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
                        defaultValue={formField.value}
                        disabled={isSubmitting || availableItems.length === 0}
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
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field: formField }) => {
                    const currentItem = availableItems.find(ai => ai.id === watchedItems[index]?.itemId);
                    const maxQuantity = currentItem ? currentItem.quantity : undefined;
                    return (
                      <FormItem className="w-24">
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
                                let val = parseInt(e.target.value, 10);
                                if (maxQuantity !== undefined && val > maxQuantity) val = maxQuantity;
                                if (val < 1 && e.target.value !== "") val = 1;
                                formField.onChange(isNaN(val) ? "" : val);
                            }}
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
                    <FormItem className="w-28">
                      <FormLabel>Price/Unit (₹)</FormLabel>
                      <FormControl>
                        <Input
                            type="number"
                            placeholder="Price"
                            {...formField}
                            className="bg-input text-muted-foreground"
                            readOnly
                            disabled
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1 || isSubmitting}
                  className="text-destructive hover:bg-destructive/10"
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
              disabled={isSubmitting || availableItems.length === 0}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Another Item
            </Button>

            <div className="pt-4 text-right">
              <p className="text-2xl font-bold text-foreground">
                Total: ₹{totalSaleAmount.toFixed(2)}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting || loadingItems || fields.some(f => !f.itemId || !f.quantity || f.quantity <=0 || f.pricePerUnit < 0 ) || availableItems.length === 0}
            >
              {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
              Record Sale
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

    
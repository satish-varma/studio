
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
import { PlusCircle, Trash2, DollarSign, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, collection, onSnapshot, addDoc, Timestamp, doc, writeBatch, getDoc, DocumentData, QuerySnapshot } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in RecordSaleForm:", error);
  }
}
const db = getFirestore();

const saleItemSchema = z.object({
  itemId: z.string().min(1, "Please select an item."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  pricePerUnit: z.coerce.number().positive("Price must be positive."), // Price now comes from item data
  name: z.string(), // To store item name for the transaction
});

const recordSaleFormSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Please add at least one item to the sale."),
});

type RecordSaleFormValues = z.infer<typeof recordSaleFormSchema>;

export default function RecordSaleForm() {
  const { toast } = useToast();
  const { user } = useAuth();
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
    // Fetch available stock items from Firestore
    // TODO: Secure this with Firebase Security Rules
    const itemsCollectionRef = collection(db, "stockItems");
    const unsubscribe = onSnapshot(itemsCollectionRef, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        // Filter out items with 0 quantity
        setAvailableItems(fetchedItems.filter(item => item.quantity > 0));
        setLoadingItems(false);
      },
      (error) => {
        console.error("Error fetching stock items for sale form:", error);
        toast({ title: "Error", description: "Could not load items. Please try again.", variant: "destructive"});
        setLoadingItems(false);
      }
    );
    return () => unsubscribe();
  }, [toast]);

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
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to record a sale.", variant: "destructive"});
      return;
    }
    setIsSubmitting(true);

    // TODO: Implement this entire operation as a Firebase Transaction
    // This ensures that either all stock updates and the sale record are created, or none are.
    // This is CRITICAL for data consistency in production.
    // For now, using a batch write for item updates, but sale creation is separate.

    const batch = writeBatch(db);
    const soldItemsForTransaction: SoldItem[] = [];
    let canProceed = true;

    // Validate stock and prepare batch updates
    for (const item of values.items) {
      const stockItemRef = doc(db, "stockItems", item.itemId);
      try {
        const stockItemSnap = await getDoc(stockItemRef);
        if (!stockItemSnap.exists()) {
          toast({ title: "Item Error", description: `Item ${item.name} not found.`, variant: "destructive" });
          canProceed = false;
          break;
        }
        const currentStockData = stockItemSnap.data() as StockItem;
        if (currentStockData.quantity < item.quantity) {
          toast({ title: "Stock Error", description: `Not enough stock for ${item.name}. Available: ${currentStockData.quantity}`, variant: "destructive" });
          canProceed = false;
          break;
        }
        batch.update(stockItemRef, { quantity: currentStockData.quantity - item.quantity });
        soldItemsForTransaction.push({
          itemId: item.itemId,
          name: item.name, // Name is already in the form item
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit, // Price is already in the form item
          totalPrice: item.quantity * item.pricePerUnit,
        });
      } catch (error) {
        console.error("Error checking stock or preparing batch:", error);
        toast({ title: "Transaction Error", description: "Could not verify stock. Please try again.", variant: "destructive"});
        canProceed = false;
        break;
      }
    }

    if (!canProceed) {
      setIsSubmitting(false);
      return;
    }

    try {
      // Add sale transaction
      const salesCollectionRef = collection(db, "salesTransactions");
      await addDoc(salesCollectionRef, {
        items: soldItemsForTransaction,
        totalAmount: totalSaleAmount,
        transactionDate: Timestamp.now(),
        staffId: user.uid,
        staffName: user.displayName || user.email, // Store staff name for easier display
      });

      // Commit stock updates
      await batch.commit();

      toast({
        title: "Sale Recorded!",
        description: `Total: $${totalSaleAmount.toFixed(2)}. ${values.items.length} item(s) sold.`,
      });
      form.reset({ items: [{ itemId: "", quantity: 1, pricePerUnit: 0, name: "" }] });
    } catch (error) {
      console.error("Error recording sale:", error);
      toast({
        title: "Sale Recording Failed",
        description: "An error occurred while recording the sale. Stock levels may not have been updated. Please check manually or try again.",
        variant: "destructive",
      });
      // TODO: Implement a rollback mechanism or notify admin if batch commit fails after sale doc creation or vice-versa (if not using a full transaction)
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const handleItemChange = (value: string, index: number) => {
    const selectedItem = availableItems.find(ai => ai.id === value);
    if (selectedItem) {
      // Assuming price is stored in `lowStockThreshold * 2.5` as per mock, replace with actual price field in StockItem
      // For now, let's assume StockItem has a 'price' field
      // const price = selectedItem.price || (selectedItem.lowStockThreshold * 2.5); // Use actual price field
      // TODO: Your StockItem type and Firestore data should include a 'price' field.
      // Using a placeholder price logic for now.
      const price = parseFloat(((selectedItem.lowStockThreshold || 10) * 2.5).toFixed(2)); 

      update(index, { 
        ...watchedItems[index], 
        itemId: selectedItem.id, 
        name: selectedItem.name,
        pricePerUnit: price 
      });
    }
  };


  if (loadingItems) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading items for sale...</p>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <DollarSign className="mr-2 h-6 w-6 text-accent" />
          Record New Sale
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
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
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-input">
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableItems.map((item) => (
                            <SelectItem key={item.id} value={item.id} disabled={item.quantity === 0}>
                              {item.name} (Stock: {item.quantity}) 
                              {/* TODO: Add price display here: - $X.XX */}
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
                            max={maxQuantity?.toString()} // Set max based on available stock
                            disabled={isSubmitting || !watchedItems[index]?.itemId}
                            onChange={(e) => {
                                let val = parseInt(e.target.value, 10);
                                if (maxQuantity !== undefined && val > maxQuantity) val = maxQuantity;
                                if (val < 1) val = 1;
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
                      <FormLabel>Price/Unit</FormLabel>
                      <FormControl>
                        <Input 
                            type="number" 
                            placeholder="Price" 
                            {...formField} 
                            className="bg-input" 
                            readOnly // Price is set from selected item
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
              disabled={isSubmitting}
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Another Item
            </Button>

            <div className="pt-4 text-right">
              <p className="text-2xl font-bold text-foreground">
                Total: ${totalSaleAmount.toFixed(2)}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || loadingItems || fields.some(f => !f.itemId)}>
              {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
              Record Sale
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

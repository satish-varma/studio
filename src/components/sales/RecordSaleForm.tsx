
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
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  runTransaction, 
  Timestamp,
  QuerySnapshot,
  DocumentData 
} from "firebase/firestore";
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
  pricePerUnit: z.coerce.number().positive("Price must be positive."), // This will be auto-filled
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
    const itemsCollectionRef = collection(db, "stockItems");
    const unsubscribe = onSnapshot(itemsCollectionRef, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        setAvailableItems(fetchedItems.filter(item => item.quantity > 0)); // Only show items with quantity > 0
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
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(true);

    try {
      await runTransaction(db, async (transaction) => {
        const soldItemsForTransaction: SoldItem[] = [];
        
        for (const formItem of values.items) {
          const stockItemRef = doc(db, "stockItems", formItem.itemId);
          const stockItemSnap = await transaction.get(stockItemRef);

          if (!stockItemSnap.exists()) {
            throw new Error(`Item ${formItem.name} (ID: ${formItem.itemId}) not found in stock.`);
          }
          const currentStockData = stockItemSnap.data() as StockItem;
          if (currentStockData.quantity < formItem.quantity) {
            throw new Error(`Not enough stock for ${formItem.name}. Available: ${currentStockData.quantity}, Requested: ${formItem.quantity}.`);
          }
          if (currentStockData.price !== formItem.pricePerUnit) {
            // This is a safeguard, price should be auto-filled and read-only
            console.warn(`Price mismatch for ${formItem.name}. Using stored price: ${currentStockData.price}`);
            formItem.pricePerUnit = currentStockData.price;
          }


          soldItemsForTransaction.push({
            itemId: formItem.itemId,
            name: formItem.name,
            quantity: formItem.quantity,
            pricePerUnit: formItem.pricePerUnit, // Use validated/corrected price
            totalPrice: formItem.quantity * formItem.pricePerUnit,
          });
        }

        const salesCollectionRef = collection(db, "salesTransactions");
        const newSaleRef = doc(salesCollectionRef); 
        transaction.set(newSaleRef, {
          items: soldItemsForTransaction,
          totalAmount: totalSaleAmount, // Recalculate here based on potentially corrected prices if strictness is desired
          transactionDate: Timestamp.now(),
          staffId: user.uid,
          staffName: user.displayName || user.email,
        });

        for (const formItem of values.items) {
          const stockItemRef = doc(db, "stockItems", formItem.itemId);
          const stockItemSnap = await transaction.get(stockItemRef); // Re-get for atomicity, though already got it once
          const currentStockData = stockItemSnap.data() as StockItem;
          const newQuantity = currentStockData.quantity - formItem.quantity;
          
          transaction.update(stockItemRef, { 
            quantity: newQuantity,
            lastUpdated: Timestamp.now().toDate().toISOString() 
          });
        }
      });

      toast({
        title: "Sale Recorded Successfully!",
        description: `Total: $${totalSaleAmount.toFixed(2)}. Stock levels updated.`,
      });
      form.reset({ items: [{ itemId: "", quantity: 1, pricePerUnit: 0, name: "" }] });

    } catch (error: any) {
      console.error("Error recording sale transaction:", error);
      toast({
        title: "Sale Recording Failed",
        description: error.message || "An unexpected error occurred. The sale was not recorded, and stock levels were not changed.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }
  
  const handleItemChange = (value: string, index: number) => {
    const selectedItem = availableItems.find(ai => ai.id === value);
    if (selectedItem) {
      const price = selectedItem.price; // Get price from the stock item
      update(index, { 
        ...watchedItems[index], 
        itemId: selectedItem.id, 
        name: selectedItem.name,
        pricePerUnit: price // Auto-fill the price
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
                            <SelectItem key={item.id} value={item.id} disabled={item.quantity <= 0}>
                              {item.name} (Stock: {item.quantity}) - ${item.price.toFixed(2)}
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
                            disabled={isSubmitting || !watchedItems[index]?.itemId}
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
                      <FormLabel>Price/Unit</FormLabel>
                      <FormControl>
                        <Input 
                            type="number" 
                            placeholder="Price" 
                            {...formField} 
                            className="bg-input" 
                            readOnly // Price is auto-filled and not editable by user
                            disabled // Visually indicate it's not for user input
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
            <Button 
              type="submit" 
              className="w-full" 
              size="lg" 
              disabled={isSubmitting || loadingItems || fields.some(f => !f.itemId || !f.quantity || f.quantity <=0 || f.pricePerUnit <= 0 )}
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


"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription as UiCardDescription } from "@/components/ui/card"; // Aliased CardDescription
import { stockItemSchema, type StockItemFormValues } from "@/types/item";
import { Loader2, Save, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, addDoc, collection, getDoc } from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp } from "firebase/app";
import type { StockItem } from "@/types";
import { useState, useEffect } from "react"; 
import { useAuth } from "@/contexts/AuthContext";
import { logStockMovement } from "@/lib/stockLogger";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemForm:", error);
  }
}
const db = getFirestore();

interface ItemFormProps {
  initialData?: StockItem | null; 
  itemId?: string | null; 
  sitesMap?: Record<string, string>; // Optional, for displaying names
  stallsMap?: Record<string, string>; // Optional, for displaying names
}

export default function ItemForm({ initialData, itemId, sitesMap = {}, stallsMap = {} }: ItemFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, activeSiteId, activeStallId } = useAuth(); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData && !!itemId;
  const [itemStatusMessage, setItemStatusMessage] = useState<string | null>(null);

  const form = useForm<StockItemFormValues>({
    resolver: zodResolver(stockItemSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      category: initialData.category,
      quantity: initialData.quantity,
      unit: initialData.unit,
      price: initialData.price,
      lowStockThreshold: initialData.lowStockThreshold,
      imageUrl: initialData.imageUrl || "",
    } : {
      name: "",
      category: "",
      quantity: 0,
      unit: "pcs",
      price: 0.00,
      lowStockThreshold: 10,
      imageUrl: "",
    },
  });

  useEffect(() => {
    if (isEditMode && initialData) {
      let message = "Editing ";
      if (!initialData.stallId && initialData.siteId) {
        message += `Master Stock at: ${sitesMap[initialData.siteId] || `Site ID ${initialData.siteId.substring(0,6)}...`}`;
      } else if (initialData.stallId && initialData.siteId) {
        message += `Stall Stock at: ${stallsMap[initialData.stallId] || `Stall ID ${initialData.stallId.substring(0,6)}...`}, ${sitesMap[initialData.siteId] || `Site ID ${initialData.siteId.substring(0,6)}...`}`;
        if (initialData.originalMasterItemId) {
          message += ` (Linked to Master ID: ${initialData.originalMasterItemId.substring(0,6)}...)`;
        }
      } else {
        message += "Uncategorized Item";
      }
      setItemStatusMessage(message);
    } else if (!isEditMode) {
        if (activeSiteId && !activeStallId) {
            setItemStatusMessage(`Adding new Master Stock item to: ${sitesMap[activeSiteId] || `Site ID ${activeSiteId.substring(0,6)}...`}`);
        } else if (activeSiteId && activeStallId) {
            setItemStatusMessage(`Adding new Stall Stock item to: ${stallsMap[activeStallId] || `Stall ID ${activeStallId.substring(0,6)}...`} at ${sitesMap[activeSiteId] || `Site ID ${activeSiteId.substring(0,6)}...`}`);
        } else {
            setItemStatusMessage("Select a site (and optionally a stall) in the header to define where this new item will be created.");
        }
    }
  }, [isEditMode, initialData, sitesMap, stallsMap, activeSiteId, activeStallId]);


  async function onSubmit(values: StockItemFormValues) {
    if (!user) {
      toast({ title: "Error", description: "User not authenticated.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const newQuantity = Number(values.quantity);
      const baseItemData = {
        ...values,
        price: Number(values.price), 
        quantity: newQuantity, 
        lowStockThreshold: Number(values.lowStockThreshold), 
        lastUpdated: new Date().toISOString(),
      };

      if (isEditMode && itemId && initialData) {
        const itemRef = doc(db, "stockItems", itemId);
        const { siteId: initialSiteId, stallId: initialStallId, ...editableValues } = baseItemData;
        await setDoc(itemRef, editableValues, { merge: true });
        
        const oldQuantity = initialData.quantity;
        const quantityChange = newQuantity - oldQuantity;

        if (quantityChange !== 0) {
          await logStockMovement(user, {
            stockItemId: itemId,
            masterStockItemIdForContext: initialData.originalMasterItemId,
            siteId: initialData.siteId!, // Assuming siteId is always present for existing items
            stallId: initialData.stallId,
            type: initialData.stallId ? 'DIRECT_STALL_UPDATE' : 'DIRECT_MASTER_UPDATE',
            quantityChange: quantityChange,
            quantityBefore: oldQuantity,
            quantityAfter: newQuantity,
            notes: "Direct update via item form.",
          });
        }

        toast({
          title: "Item Updated",
          description: `${values.name} has been successfully updated.`,
        });
      } else { 
        if (!activeSiteId) {
          toast({ title: "Site Context Missing", description: "Please select an active site from the header to add an item.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        const itemDataToSave = {
          ...baseItemData,
          siteId: activeSiteId,
          stallId: activeStallId, 
          originalMasterItemId: null, // New items don't have this until allocated from master
        };
        const newItemRef = await addDoc(collection(db, "stockItems"), itemDataToSave);
        
        await logStockMovement(user, {
          stockItemId: newItemRef.id,
          siteId: activeSiteId,
          stallId: activeStallId,
          type: activeStallId ? 'CREATE_STALL_DIRECT' : 'CREATE_MASTER',
          quantityChange: newQuantity,
          quantityBefore: 0,
          quantityAfter: newQuantity,
          notes: "New item created.",
        });

        toast({
          title: "Item Added",
          description: `${values.name} has been successfully added. ${activeStallId ? 'To stall.' : 'To site master stock.'}`,
        });
      }
      router.push("/items");
      router.refresh(); 
    } catch (error: any) {
      console.error("Error saving item:", error);
      toast({
        title: isEditMode ? "Update Failed" : "Add Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">
          {isEditMode ? `Edit: ${initialData?.name}` : "Add New Stock Item"}
        </CardTitle>
        {itemStatusMessage && (
            <UiCardDescription className="text-sm text-muted-foreground pt-1 flex items-center">
                <Info size={14} className="mr-1.5 text-primary/80" />
                {itemStatusMessage}
            </UiCardDescription>
        )}
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Item Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Fresh Apples" {...field} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Fruits" {...field} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., pcs, kg, ltr" {...field} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price per Unit (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low Stock Threshold</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="10" {...field} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (Optional)</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://example.com/image.png" {...field} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormDescription>Enter the full URL of the item image.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
             <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || (!isEditMode && !activeSiteId) }>
              {isSubmitting ? (
                <Loader2 className="animate-spin mr-2" />
              ) : (
                <Save className="mr-2" />
              )}
              {isEditMode ? "Save Changes" : "Add Item"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}


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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription as UiCardDescription } from "@/components/ui/card";
import { stockItemSchema, type StockItemFormValues } from "@/types/item";
import { Loader2, Save, Info, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, addDoc, collection, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from "firebase/app";
import type { StockItem } from "@/types";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { logStockMovement } from "@/lib/stockLogger";
import { generateItemDescription } from "@/ai/flows/generate-item-description-flow";

const LOG_PREFIX = "[ItemForm]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface ItemFormProps {
  initialData?: StockItem | null;
  itemId?: string | null;
  sitesMap?: Record<string, string>;
  stallsMap?: Record<string, string>;
}

export default function ItemForm({ initialData, itemId, sitesMap = {}, stallsMap = {} }: ItemFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, activeSiteId, activeStallId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const isEditMode = !!initialData && !!itemId;
  const [itemStatusMessage, setItemStatusMessage] = useState<string | null>(null);

  const form = useForm<StockItemFormValues>({
    resolver: zodResolver(stockItemSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      category: initialData.category,
      description: initialData.description || "",
      quantity: initialData.quantity,
      unit: initialData.unit,
      price: initialData.price,
      costPrice: initialData.costPrice ?? 0.00, // Zod default will make this a number in 'values'
      lowStockThreshold: initialData.lowStockThreshold,
      imageUrl: initialData.imageUrl || "",
    } : {
      name: "",
      category: "",
      description: "",
      quantity: 0,
      unit: "pcs",
      price: 0.00,
      costPrice: 0.00, // Zod default will make this a number in 'values'
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
        message += "Uncategorized Item (no site/stall context)";
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

  const handleGenerateDescription = async () => {
    const itemName = form.getValues("name");
    const itemCategory = form.getValues("category");
    console.log(`${LOG_PREFIX} handleGenerateDescription called. Item: ${itemName}, Category: ${itemCategory}`);

    if (!itemName || !itemCategory) {
      toast({
        title: "Missing Information",
        description: "Please enter item name and category before generating a description.",
        variant: "default",
      });
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const result = await generateItemDescription({ itemName, itemCategory });
      form.setValue("description", result.description);
      toast({
        title: "Description Generated!",
        description: "The AI has suggested a description for your item.",
      });
      console.log(`${LOG_PREFIX} AI description generated successfully for ${itemName}.`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error generating item description for ${itemName}:`, error);
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate description. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  async function onSubmit(values: StockItemFormValues) {
    console.log(`${LOG_PREFIX} onSubmit called. Mode: ${isEditMode ? 'Edit' : 'Create'}. Values:`, values);
    if (!user) {
      console.warn(`${LOG_PREFIX} User not authenticated. Submission aborted.`);
      toast({ title: "Error", description: "User not authenticated. Please log in.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const newQuantity = Number(values.quantity);
      
      // Construct the data object explicitly to ensure correct types.
      // values.costPrice is guaranteed to be 'number' by Zod schema's .default(0).
      const dataForFirestore: Omit<StockItem, 'id'> = {
        name: values.name,
        category: values.category,
        description: values.description || "",
        quantity: newQuantity,
        unit: values.unit,
        price: Number(values.price),
        costPrice: values.costPrice, // Directly use Zod validated value
        lowStockThreshold: Number(values.lowStockThreshold),
        imageUrl: values.imageUrl || "",
        lastUpdated: new Date().toISOString(),
        // Site, Stall, and OriginalMasterItemId are set based on mode
        siteId: isEditMode && initialData ? initialData.siteId : activeSiteId,
        stallId: isEditMode && initialData ? initialData.stallId : activeStallId,
        originalMasterItemId: isEditMode && initialData ? (initialData.originalMasterItemId ?? null) : null,
      };

      if (isEditMode && itemId && initialData) {
        console.log(`${LOG_PREFIX} Updating item ID: ${itemId}`);
        const itemRef = doc(db, "stockItems", itemId);
        await setDoc(itemRef, dataForFirestore, { merge: true });
        console.log(`${LOG_PREFIX} Item ${itemId} updated successfully in Firestore.`);

        const oldQuantity = initialData.quantity;
        const quantityChange = newQuantity - oldQuantity;

        if (quantityChange !== 0) {
          await logStockMovement(user, {
            stockItemId: itemId,
            masterStockItemIdForContext: initialData.originalMasterItemId ?? undefined,
            siteId: initialData.siteId!,
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
          console.warn(`${LOG_PREFIX} Site context missing for new item. ActiveSiteId: ${activeSiteId}`);
          toast({ title: "Site Context Missing", description: "Please select an active site from the header to add an item.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        console.log(`${LOG_PREFIX} Creating new item. ActiveSiteId: ${activeSiteId}, ActiveStallId: ${activeStallId}`);
        
        const newItemRef = await addDoc(collection(db, "stockItems"), dataForFirestore);
        console.log(`${LOG_PREFIX} New item created with ID: ${newItemRef.id}`);

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
      console.error(`${LOG_PREFIX} Error saving item:`, error.message, error.stack);
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
          {isEditMode ? `Edit: ${initialData?.name ?? "Item"}` : "Add New Stock Item"}
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
                    <Input placeholder="e.g., Fresh Apples" {...field} disabled={isSubmitting || isGeneratingDesc} className="bg-input"/>
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
                    <Input placeholder="e.g., Fruits" {...field} disabled={isSubmitting || isGeneratingDesc} className="bg-input"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Description (Optional)</FormLabel>
                    <Button
                      data-testid="generate-ai-description-button"
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateDescription}
                      disabled={isGeneratingDesc || isSubmitting || !form.watch("name") || !form.watch("category")}
                      className="text-xs text-accent hover:text-accent/80"
                    >
                      {isGeneratingDesc ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                      Generate with AI
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Crisp and juicy red apples, perfect for snacking."
                      {...field}
                      disabled={isSubmitting || isGeneratingDesc}
                      className="bg-input min-h-[80px]"
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>A short description of the item.</FormDescription>
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
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Price per Unit (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormDescription>Optional. Used for profit calculation.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price per Unit (₹)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} disabled={isSubmitting} className="bg-input"/>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (Optional)</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://example.com/image.png" {...field} value={field.value ?? ""} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormDescription>Enter the full URL of the item image.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
             <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting || isGeneratingDesc}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isGeneratingDesc || (!isEditMode && !activeSiteId) }>
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

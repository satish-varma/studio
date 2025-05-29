
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
import { Textarea } from "@/components/ui/textarea"; // Assuming Textarea might be useful for description in future
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { stockItemSchema, type StockItemFormValues } from "@/types/item";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp } from "firebase/app";
import type { StockItem } from "@/types";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemForm:", error);
  }
}
const db = getFirestore();

interface ItemFormProps {
  initialData?: StockItem | null; // For editing
  itemId?: string | null; // For editing
}

export default function ItemForm({ initialData, itemId }: ItemFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData && !!itemId;

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

  async function onSubmit(values: StockItemFormValues) {
    setIsSubmitting(true);
    try {
      const itemData = {
        ...values,
        lastUpdated: new Date().toISOString(), // Or use Firestore serverTimestamp for more accuracy
      };

      if (isEditMode && itemId) {
        const itemRef = doc(db, "stockItems", itemId);
        await setDoc(itemRef, itemData, { merge: true }); // Use setDoc with merge for updates
        toast({
          title: "Item Updated",
          description: `${values.name} has been successfully updated.`,
        });
      } else {
        await addDoc(collection(db, "stockItems"), itemData);
        toast({
          title: "Item Added",
          description: `${values.name} has been successfully added to stock.`,
        });
      }
      router.push("/items"); // Redirect to items list
      router.refresh(); // Refresh server components if any
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
          {isEditMode ? "Edit Stock Item" : "Add New Stock Item"}
        </CardTitle>
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
                      <Input type="number" placeholder="0" {...field} disabled={isSubmitting} className="bg-input"/>
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
                    <FormLabel>Price per Unit ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input"/>
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
                      <Input type="number" placeholder="10" {...field} disabled={isSubmitting} className="bg-input"/>
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
            <Button type="submit" disabled={isSubmitting}>
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

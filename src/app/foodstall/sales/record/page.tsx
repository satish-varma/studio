
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { foodMealTypes, foodSaleTransactionFormSchema, type FoodSaleTransactionFormValues, paymentMethods } from "@/types/food";
import { ArrowLeft, PlusCircle, Trash2, Loader2, Info } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, collection, addDoc, Timestamp } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in RecordFoodSalePage:", error);
  }
} else {
  db = getFirestore(getApp());
}

export default function RecordFoodSalePage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [totalSaleAmount, setTotalSaleAmount] = useState(0);

  const form = useForm<FoodSaleTransactionFormValues>({
    resolver: zodResolver(foodSaleTransactionFormSchema),
    defaultValues: {
      itemsSold: [{ itemName: "", quantity: 1, pricePerUnit: 0, totalPrice: 0 }],
      paymentMethod: "Cash",
      saleDate: new Date(),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itemsSold",
  });

  const watchedItems = form.watch("itemsSold");

  useEffect(() => {
    const total = watchedItems.reduce((acc, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.pricePerUnit) || 0;
      return acc + (quantity * price);
    }, 0);
    setTotalSaleAmount(total);
    form.setValue("totalAmount", total);
  }, [watchedItems, form]);

  const handleItemChange = (index: number, field: keyof FoodSaleTransactionFormValues['itemsSold'][number], value: string | number) => {
    const currentItem = { ...watchedItems[index] };
    (currentItem as any)[field] = value;

    if (field === 'quantity' || field === 'pricePerUnit') {
      const quantity = Number(currentItem.quantity) || 0;
      const price = Number(currentItem.pricePerUnit) || 0;
      currentItem.totalPrice = quantity * price;
    }
    
    const newItems = [...watchedItems];
    newItems[index] = currentItem;
    form.setValue("itemsSold", newItems, { shouldValidate: true });
  };
  
  async function onSubmit(values: FoodSaleTransactionFormValues) {
    if (!user || !activeSiteId || !activeStallId || !db) {
      toast({
        title: "Error",
        description: "Cannot record sale. User, site, or stall context is missing, or DB not initialized.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const saleData = {
        ...values,
        siteId: activeSiteId,
        stallId: activeStallId,
        recordedByUid: user.uid,
        recordedByName: user.displayName || user.email,
        saleDate: Timestamp.fromDate(values.saleDate), // Convert to Firestore Timestamp
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "foodSaleTransactions"), saleData);
      toast({
        title: "Sale Recorded",
        description: `Sale of ₹${values.totalAmount.toFixed(2)} has been successfully recorded.`,
      });
      form.reset({
        itemsSold: [{ itemName: "", quantity: 1, pricePerUnit: 0, totalPrice: 0 }],
        paymentMethod: "Cash",
        saleDate: new Date(),
        notes: "",
        mealType: undefined
      });
    } catch (error: any) {
      console.error("Error recording food sale:", error);
      toast({
        title: "Recording Failed",
        description: error.message || "Could not record the sale. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Authenticating...</p></div>;
  }

  if (!activeSiteId || !activeStallId) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Site & Stall Context Required</AlertTitle>
          <AlertDescription>
            To record a food stall sale, please ensure you have an active Site and a specific Stall selected in the header.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record New Food Sale"
        description="Enter the details of the food items sold."
        actions={
          <Link href="/foodstall/sales">
            <Button variant="outline" disabled={isSubmitting}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sales
            </Button>
          </Link>
        }
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="max-w-3xl mx-auto shadow-lg">
            <CardHeader>
              <CardTitle>Sale Details</CardTitle>
              <CardDescription>All fields marked with * are required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <FormField control={form.control} name="saleDate" render={({ field }) => ( <FormItem><FormLabel>Sale Date & Time *</FormLabel><FormControl><Input id="saleDate" type="datetime-local" value={field.value ? new Date(field.value.getTime() - field.value.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => field.onChange(new Date(e.target.value))} disabled={isSubmitting} className="bg-input" /></FormControl><FormMessage /></FormItem> )} />
                 <FormField control={form.control} name="mealType" render={({ field }) => ( <FormItem><FormLabel>Meal Type</FormLabel><Select onValueChange={field.onChange} value={field.value || ""} disabled={isSubmitting}><FormControl><SelectTrigger id="mealType" className="bg-input"><SelectValue placeholder="Select meal type" /></SelectTrigger></FormControl><SelectContent>{foodMealTypes.map(type => ( <SelectItem key={type} value={type}>{type}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem> )} />
              </div>

              <div className="space-y-4">
                <FormLabel>Items Sold *</FormLabel>
                <div className="p-4 border rounded-md bg-muted/30 space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-1 sm:grid-cols-[1fr,80px,110px,auto] items-end gap-3">
                      <FormField control={form.control} name={`itemsSold.${index}.itemName`} render={({ field: itemField }) => (<FormItem><FormLabel className="text-xs">Item Name</FormLabel><FormControl><Input placeholder="e.g., Dosa, Coffee" {...itemField} onChange={e => handleItemChange(index, 'itemName', e.target.value)} disabled={isSubmitting} className="bg-input"/></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name={`itemsSold.${index}.quantity`} render={({ field: itemField }) => (<FormItem><FormLabel className="text-xs">Qty</FormLabel><FormControl><Input type="number" min="1" placeholder="1" {...itemField} onChange={e => handleItemChange(index, 'quantity', e.target.value)} disabled={isSubmitting} className="bg-input"/></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name={`itemsSold.${index}.pricePerUnit`} render={({ field: itemField }) => (<FormItem><FormLabel className="text-xs">Price/Unit (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...itemField} onChange={e => handleItemChange(index, 'pricePerUnit', e.target.value)} disabled={isSubmitting} className="bg-input"/></FormControl><FormMessage /></FormItem>)} />
                      <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => remove(index)} disabled={fields.length <= 1 || isSubmitting} aria-label={`Remove item ${index + 1}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={() => append({ itemName: "", quantity: 1, pricePerUnit: 0, totalPrice: 0 })} disabled={isSubmitting}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Item
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>Payment Method</FormLabel><Select onValueChange={field.onChange} value={field.value || "Cash"} disabled={isSubmitting}><FormControl><SelectTrigger id="paymentMethod" className="bg-input"><SelectValue placeholder="Select payment method" /></SelectTrigger></FormControl><SelectContent>{paymentMethods.map(method => ( <SelectItem key={method} value={method}>{method}</SelectItem> ))}</SelectContent></Select><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Customer preference, discount applied" {...field} value={field.value ?? ""} disabled={isSubmitting} className="bg-input min-h-[40px]"/></FormControl><FormMessage /></FormItem>)} />
              </div>

              <div className="pt-4 text-right">
                <p className="text-2xl font-bold">Total Sale: ₹{totalSaleAmount.toFixed(2)}</p>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record Sale
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}

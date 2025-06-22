
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { foodSaleTransactionFormSchema, type FoodSaleTransactionFormValues } from "@/types/food";
import { ArrowLeft, Loader2, Info, IndianRupee, PlusCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, getDoc, Timestamp } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { useSearchParams } from 'next/navigation';
import { format, isValid, parseISO } from "date-fns";

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

const defaultSalesFields = [
  { type: 'HungerBox', amount: 0 },
  { type: 'UPI', amount: 0 }
];

export default function RecordFoodSalePage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [totalSaleAmount, setTotalSaleAmount] = useState(0);

  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const initialDate = dateParam && isValid(parseISO(dateParam)) ? parseISO(dateParam) : new Date();
  
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);

  const form = useForm<FoodSaleTransactionFormValues>({
    resolver: zodResolver(foodSaleTransactionFormSchema),
    defaultValues: {
      saleDate: selectedDate,
      salesByPaymentType: defaultSalesFields,
      totalAmount: 0,
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "salesByPaymentType",
  });
  
  const watchedSales = form.watch("salesByPaymentType");

  useEffect(() => {
    const total = watchedSales.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    setTotalSaleAmount(total);
    if (form.getValues("totalAmount") !== total) {
      form.setValue("totalAmount", total, { shouldValidate: true });
    }
  }, [watchedSales, form]);

  
  const fetchAndSetDataForDate = useCallback(async (date: Date) => {
    if (!db || !activeStallId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    const docId = `${format(date, 'yyyy-MM-dd')}_${activeStallId}`;
    const docRef = doc(db, "foodSaleTransactions", docId);
    
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        form.reset({
          ...data,
          saleDate: (data.saleDate as Timestamp).toDate(),
          salesByPaymentType: data.salesByPaymentType || defaultSalesFields,
        });
      } else {
        // Reset to default for the new date
        form.reset({
          saleDate: date,
          salesByPaymentType: defaultSalesFields,
          totalAmount: 0,
          notes: "",
        });
      }
    } catch (error) {
        console.error("Error fetching daily sales doc:", error);
        toast({ title: "Error", description: "Could not fetch data for the selected date.", variant: "destructive"});
    } finally {
        setIsLoadingData(false);
    }
  }, [activeStallId, form, toast]);

  useEffect(() => {
    fetchAndSetDataForDate(selectedDate);
  }, [selectedDate, fetchAndSetDataForDate]);


  async function onSubmit(values: FoodSaleTransactionFormValues) {
    if (!user || !activeSiteId || !activeStallId || !db) {
      toast({ title: "Error", description: "Cannot save sale. Context is missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    const docId = `${format(values.saleDate, 'yyyy-MM-dd')}_${activeStallId}`;
    const docRef = doc(db, "foodSaleTransactions", docId);
    
    try {
      const isNewDoc = !(await getDoc(docRef)).exists();
      
      const saleData = {
        ...values,
        salesByPaymentType: values.salesByPaymentType.filter(s => s.amount > 0), // Filter out zero-amount entries
        siteId: activeSiteId,
        stallId: activeStallId,
        recordedByUid: user.uid,
        recordedByName: user.displayName || user.email,
        saleDate: Timestamp.fromDate(values.saleDate),
        updatedAt: new Date().toISOString(),
        ...(isNewDoc && { createdAt: new Date().toISOString() }),
      };

      await setDoc(docRef, saleData, { merge: true });
      toast({
        title: "Sales Saved",
        description: `Sales data for ${format(values.saleDate, 'PPP')} has been saved.`,
      });

    } catch (error: any) {
      console.error("Error saving food sale:", error);
      toast({ title: "Save Failed", description: error.message || "Could not save sales data.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Authenticating...</p></div>;

  if (!activeSiteId || !activeStallId) {
    return <div className="max-w-2xl mx-auto mt-10"><Alert variant="default" className="border-primary/50"><Info className="h-4 w-4" /><AlertTitle>Site & Stall Context Required</AlertTitle><AlertDescription>To manage daily sales, please ensure you have an active Site and Stall selected in the header.</AlertDescription></Alert></div>;
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Daily Sales"
        description="Select a date to view, edit, or create a sales entry for that day."
        actions={
          <Link href="/foodstall/sales">
            <Button variant="outline" disabled={isSubmitting}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sales List
            </Button>
          </Link>
        }
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Daily Sales Entry</CardTitle>
                    <CardDescription>Enter total sales received for each payment type.</CardDescription>
                  </div>
                  <DatePicker date={selectedDate} onDateChange={(date) => setSelectedDate(date || new Date())} disabled={isSubmitting || isLoadingData} />
              </div>
            </CardHeader>
            {isLoadingData ? (
                <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
            <CardContent className="space-y-6">
              <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                <FormLabel>Sales by Payment Type</FormLabel>
                {fields.map((field, index) => {
                    const isDefaultField = index < defaultSalesFields.length;
                    return (
                        <div key={field.id} className="flex items-end gap-3">
                             <FormField
                                control={form.control}
                                name={`salesByPaymentType.${index}.type`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        {index === 0 && <FormLabel className="text-xs">Payment Type</FormLabel>}
                                        <FormControl>
                                            <Input placeholder="e.g., Cash" {...field} disabled={isSubmitting || isDefaultField} className="bg-input"/>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name={`salesByPaymentType.${index}.amount`}
                                render={({ field }) => (
                                    <FormItem className="w-40">
                                       {index === 0 && <FormLabel className="text-xs">Amount (₹)</FormLabel>}
                                        <FormControl>
                                            <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input"/>
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
                                disabled={isDefaultField || isSubmitting}
                                className="text-destructive hover:bg-destructive/10"
                                aria-label={`Remove payment type ${index + 1}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    );
                })}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ type: "", amount: 0})}
                    className="w-full border-dashed"
                    disabled={isSubmitting}
                >
                    <PlusCircle className="mr-2 h-4 w-4"/> Add Payment Type
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t">
                 <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Evening rush, special event" {...field} value={field.value ?? ""} disabled={isSubmitting} className="bg-input min-h-[70px]"/></FormControl><FormMessage /></FormItem>)} />
                 <div className="pt-4 text-right space-y-2">
                    <div>
                        <p className="text-sm text-muted-foreground">Total Sale Amount</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="total-sale-amount">₹{totalSaleAmount.toFixed(2)}</p>
                        <FormField control={form.control} name="totalAmount" render={() => <FormMessage />} />
                    </div>
                </div>
              </div>
            </CardContent>
            )}
            <CardFooter>
              <Button type="submit" className="w-full" size="lg" disabled={isSubmitting || isLoadingData}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Daily Sales
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}

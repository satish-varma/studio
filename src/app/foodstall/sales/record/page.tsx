
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { foodSaleTransactionFormSchema, type FoodSaleTransactionFormValues, paymentMethods, type PaymentEntry } from "@/types/food";
import { ArrowLeft, Loader2, Info, IndianRupee, Utensils, Pizza, Soup, PlusCircle, Trash2 } from "lucide-react";
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
      breakfastSales: 0,
      lunchSales: 0,
      dinnerSales: 0,
      snacksSales: 0,
      totalAmount: 0,
      saleDate: selectedDate,
      notes: "",
      paymentMethods: [{ method: "Cash", amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "paymentMethods",
  });
  
  const watchedSales = form.watch(["breakfastSales", "lunchSales", "dinnerSales", "snacksSales"]);

  useEffect(() => {
    const total =
      (Number(watchedSales[0]) || 0) +
      (Number(watchedSales[1]) || 0) +
      (Number(watchedSales[2]) || 0) +
      (Number(watchedSales[3]) || 0);
    setTotalSaleAmount(total);
    form.setValue("totalAmount", total, { shouldValidate: true });
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
        });
      } else {
        // Reset to default for the new date
        form.reset({
          breakfastSales: 0,
          lunchSales: 0,
          dinnerSales: 0,
          snacksSales: 0,
          totalAmount: 0,
          saleDate: date,
          notes: "",
          paymentMethods: [{ method: "Cash", amount: 0 }],
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
          <Card className="max-w-4xl mx-auto shadow-lg">
            <CardHeader>
              <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Daily Sales Entry</CardTitle>
                    <CardDescription>Enter total revenue for each category. At least one must be greater than zero.</CardDescription>
                  </div>
                  <DatePicker date={selectedDate} onDateChange={(date) => setSelectedDate(date || new Date())} disabled={isSubmitting || isLoadingData} />
              </div>
            </CardHeader>
            {isLoadingData ? (
                <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
                 <FormField control={form.control} name="breakfastSales" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Utensils className="h-4 w-4 mr-2 text-muted-foreground"/>Breakfast Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input text-lg"/></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="lunchSales" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Soup className="h-4 w-4 mr-2 text-muted-foreground"/>Lunch Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input text-lg"/></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="dinnerSales" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Utensils className="h-4 w-4 mr-2 text-muted-foreground"/>Dinner Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input text-lg"/></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="snacksSales" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Pizza className="h-4 w-4 mr-2 text-muted-foreground"/>Snacks Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" placeholder="0.00" {...field} disabled={isSubmitting} className="bg-input text-lg"/></FormControl><FormMessage /></FormItem>)} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t">
                <div className="space-y-4">
                    <FormLabel>Payment Methods</FormLabel>
                     {fields.map((field, index) => (
                        <div key={field.id} className="flex items-end gap-2">
                            <FormField control={form.control} name={`paymentMethods.${index}.method`} render={({ field }) => (
                                <FormItem className="flex-1"><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="Method" /></SelectTrigger></FormControl><SelectContent>{paymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
                            )}/>
                            <FormField control={form.control} name={`paymentMethods.${index}.amount`} render={({ field }) => (
                                <FormItem className="flex-1"><FormControl><Input type="number" placeholder="Amount" {...field} disabled={isSubmitting} className="bg-input"/></FormControl><FormMessage /></FormItem>
                            )}/>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1} className="text-destructive"><Trash2 className="h-4 w-4"/></Button>
                        </div>
                     ))}
                     <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => append({ method: 'Cash', amount: 0})}><PlusCircle className="h-4 w-4 mr-2"/>Add Payment Method</Button>
                     <FormField control={form.control} name="paymentMethods" render={() => <FormMessage />} />
                </div>
                 <div className="space-y-4">
                    <div className="pt-4 text-right">
                        <p className="text-sm text-muted-foreground">Total Sale Amount</p>
                        <p className="text-3xl font-bold text-foreground" data-testid="total-sale-amount">₹{totalSaleAmount.toFixed(2)}</p>
                        <FormField control={form.control} name="totalAmount" render={({ field }) => (<FormItem className="h-0"><FormMessage /></FormItem>)} />
                    </div>
                    <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Evening rush, special event" {...field} value={field.value ?? ""} disabled={isSubmitting} className="bg-input min-h-[70px]"/></FormControl><FormMessage /></FormItem>)} />
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

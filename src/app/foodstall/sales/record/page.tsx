
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { foodSaleTransactionFormSchema, type FoodSaleTransactionFormValues } from "@/types/food";
import { ArrowLeft, Loader2, Info, IndianRupee, PlusCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
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

const defaultMealValues = { hungerbox: 0, upi: 0, other: 0 };

const mealCategories = ["breakfast", "lunch", "dinner", "snacks"] as const;
type MealCategory = typeof mealCategories[number];

export default function RecordFoodSalePage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const initialDate = dateParam && isValid(parseISO(dateParam)) ? parseISO(dateParam) : new Date();
  
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [subtotals, setSubtotals] = useState<Record<MealCategory, number>>({ breakfast: 0, lunch: 0, dinner: 0, snacks: 0 });
  const [paymentTotals, setPaymentTotals] = useState({ hungerbox: 0, upi: 0, other: 0 });
  const [showOther, setShowOther] = useState<Record<MealCategory, boolean>>({
    breakfast: false,
    lunch: false,
    dinner: false,
    snacks: false,
  });

  const form = useForm<FoodSaleTransactionFormValues>({
    resolver: zodResolver(foodSaleTransactionFormSchema),
    defaultValues: {
      saleDate: selectedDate,
      breakfast: defaultMealValues,
      lunch: defaultMealValues,
      dinner: defaultMealValues,
      snacks: defaultMealValues,
      totalAmount: 0,
      notes: "",
    },
  });

  const { watch, setValue } = form;
  const watchedBreakfast = watch("breakfast");
  const watchedLunch = watch("lunch");
  const watchedDinner = watch("dinner");
  const watchedSnacks = watch("snacks");

  useEffect(() => {
    const calculateTotals = () => {
      const watchedFields = {
          breakfast: watchedBreakfast,
          lunch: watchedLunch,
          dinner: watchedDinner,
          snacks: watchedSnacks,
      };
      const newSubtotals: Record<MealCategory, number> = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
      const newPaymentTotals = { hungerbox: 0, upi: 0, other: 0 };
      let grandTotal = 0;
      
      mealCategories.forEach(meal => {
          const mealData = watchedFields[meal];
          const subtotal = (mealData?.hungerbox || 0) + (mealData?.upi || 0) + (mealData?.other || 0);
          newSubtotals[meal] = subtotal;
          grandTotal += subtotal;
          
          newPaymentTotals.hungerbox += (mealData?.hungerbox || 0);
          newPaymentTotals.upi += (mealData?.upi || 0);
          newPaymentTotals.other += (mealData?.other || 0);
      });
      
      setSubtotals(newSubtotals);
      setPaymentTotals(newPaymentTotals);
      
      if (form.getValues("totalAmount") !== grandTotal) {
          setValue('totalAmount', grandTotal, { shouldValidate: true });
      }
    }
    calculateTotals();
  }, [watchedBreakfast, watchedLunch, watchedDinner, watchedSnacks, setValue, form]);

  
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
          breakfast: data.breakfast || defaultMealValues,
          lunch: data.lunch || defaultMealValues,
          dinner: data.dinner || defaultMealValues,
          snacks: data.snacks || defaultMealValues,
        });
        const newShowOtherState: Record<MealCategory, boolean> = { breakfast: false, lunch: false, dinner: false, snacks: false };
        mealCategories.forEach(meal => {
            if (data[meal]?.other > 0) {
                newShowOtherState[meal] = true;
            }
        });
        setShowOther(newShowOtherState);
      } else {
        form.reset({
          saleDate: date,
          breakfast: defaultMealValues, lunch: defaultMealValues,
          dinner: defaultMealValues, snacks: defaultMealValues,
          totalAmount: 0, notes: "",
        });
        setShowOther({ breakfast: false, lunch: false, dinner: false, snacks: false });
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
        siteId: activeSiteId, stallId: activeStallId,
        recordedByUid: user.uid, recordedByName: user.displayName || user.email,
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
  
  const renderMealCard = (meal: MealCategory, title: string) => (
    <Card>
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>Subtotal: ₹{subtotals[meal].toFixed(2)}</CardDescription>
        </div>
        {!showOther[meal] && (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowOther(prev => ({...prev, [meal]: true}))}
                className="text-muted-foreground hover:text-primary"
                aria-label={`Add other payment for ${title}`}
            >
                <PlusCircle className="h-4 w-4 mr-1" /> Add Other
            </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <FormField control={form.control} name={`${meal}.hungerbox`} render={({ field }) => (<FormItem><FormLabel className="text-xs font-normal">HungerBox</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} className="bg-input" disabled={isSubmitting || isLoadingData}/></FormControl><FormMessage/></FormItem>)}/>
        <FormField control={form.control} name={`${meal}.upi`} render={({ field }) => (<FormItem><FormLabel className="text-xs font-normal">UPI</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} className="bg-input" disabled={isSubmitting || isLoadingData}/></FormControl><FormMessage/></FormItem>)}/>
        {showOther[meal] && (
            <FormField control={form.control} name={`${meal}.other`} render={({ field }) => (<FormItem><FormLabel className="text-xs font-normal">Other (Cash/Card)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} className="bg-input" disabled={isSubmitting || isLoadingData}/></FormControl><FormMessage/></FormItem>)}/>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage Daily Sales"
        description="Select a date to view or edit the sales summary for that day, broken down by meal times."
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
                    <CardDescription>Enter total sales received for each meal type and payment method.</CardDescription>
                  </div>
                  <DatePicker date={selectedDate} onDateChange={(date) => setSelectedDate(date || new Date())} disabled={isSubmitting || isLoadingData} />
              </div>
            </CardHeader>
            {isLoadingData ? (
                <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderMealCard("breakfast", "Breakfast Sales")}
                    {renderMealCard("lunch", "Lunch Sales")}
                    {renderMealCard("dinner", "Dinner Sales")}
                    {renderMealCard("snacks", "Snacks / Other Sales")}
                </div>
                
                 <div className="pt-6 border-t">
                    <CardTitle className="text-lg mb-2">Payment-wise Totals</CardTitle>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div className="p-3 rounded-md bg-muted/50">
                            <p className="text-xs text-muted-foreground">HungerBox</p>
                            <p className="font-semibold text-lg">₹{paymentTotals.hungerbox.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-md bg-muted/50">
                            <p className="text-xs text-muted-foreground">UPI</p>
                            <p className="font-semibold text-lg">₹{paymentTotals.upi.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-md bg-muted/50">
                            <p className="text-xs text-muted-foreground">Other (Cash/Card)</p>
                            <p className="font-semibold text-lg">₹{paymentTotals.other.toFixed(2)}</p>
                        </div>
                        <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
                            <p className="text-xs text-primary/80">Grand Total</p>
                            <p className="font-bold text-lg text-primary">₹{form.getValues('totalAmount').toFixed(2)}</p>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t">
                    <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Heavy rain in evening, special event discount" {...field} value={field.value ?? ""} disabled={isSubmitting} className="bg-input min-h-[70px]"/></FormControl><FormMessage /></FormItem>)} />
                </div>
            </CardContent>
            )}
            <CardFooter className="flex flex-col sm:flex-row items-center justify-end pt-6 border-t">
              <Button type="submit" size="lg" disabled={isSubmitting || isLoadingData}>
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

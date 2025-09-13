
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { foodSaleTransactionFormSchema, type FoodSaleTransactionFormValues, foodSaleTypes } from "@/types/food";
import { ArrowLeft, Loader2, Info, IndianRupee } from "lucide-react";
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
import { logFoodStallActivity } from "@/lib/foodStallLogger";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";


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

const defaultSaleValues = { hungerbox: 0, upi: 0 };

export default function RecordFoodSalePage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const typeParam = searchParams.get('type') as 'MRP' | 'Non-MRP' | null;

  const initialDate = dateParam && isValid(parseISO(dateParam)) ? parseISO(dateParam) : new Date();
  const initialType = typeParam && foodSaleTypes.includes(typeParam) ? typeParam : 'Non-MRP';

  const [selectedDate, setSelectedDate] = useState<Date>(initialDate);
  const [selectedType, setSelectedType] = useState<'MRP' | 'Non-MRP'>(initialType);

  const form = useForm<FoodSaleTransactionFormValues>({
    resolver: zodResolver(foodSaleTransactionFormSchema),
    defaultValues: {
      saleDate: selectedDate,
      saleType: selectedType,
      sales: defaultSaleValues,
      totalAmount: 0,
      notes: "",
    },
  });

  const { watch, setValue } = form;
  const watchedSales = watch("sales");

  useEffect(() => {
    const calculateTotal = () => {
      const grandTotal = (watchedSales?.hungerbox || 0) + (watchedSales?.upi || 0);
      if (form.getValues("totalAmount") !== grandTotal) {
          setValue('totalAmount', grandTotal, { shouldValidate: true });
      }
    }
    calculateTotal();
  }, [watchedSales, setValue, form]);

  
  const fetchAndSetDataForDate = useCallback(async (date: Date, type: 'MRP' | 'Non-MRP') => {
    if (!db || !activeStallId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    const docId = `${format(date, 'yyyy-MM-dd')}_${activeStallId}_${type}`;
    const docRef = doc(db, "foodSaleTransactions", docId);
    
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        form.reset({
          ...data,
          saleDate: (data.saleDate as Timestamp).toDate(),
          saleType: data.saleType || type,
          sales: data.sales || defaultSaleValues,
        });
      } else {
        form.reset({
          saleDate: date,
          saleType: type,
          sales: defaultSaleValues,
          totalAmount: 0,
          notes: "",
        });
      }
    } catch (error) {
        console.error("Error fetching daily sales doc:", error);
        toast({ title: "Error", description: "Could not fetch data for the selected date and type.", variant: "destructive"});
    } finally {
        setIsLoadingData(false);
    }
  }, [activeStallId, form, toast]);

  useEffect(() => {
    fetchAndSetDataForDate(selectedDate, selectedType);
  }, [selectedDate, selectedType, fetchAndSetDataForDate]);

  async function onSubmit(values: FoodSaleTransactionFormValues) {
    if (!user || !activeSiteId || !activeStallId || !db) {
      toast({ title: "Error", description: "Cannot save sale. Context is missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    const docId = `${format(values.saleDate, 'yyyy-MM-dd')}_${activeStallId}_${values.saleType}`;
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

      await logFoodStallActivity(user, {
        siteId: activeSiteId,
        stallId: activeStallId,
        type: 'SALE_RECORDED_OR_UPDATED',
        relatedDocumentId: docId,
        details: {
            totalAmount: values.totalAmount,
            notes: `Type: ${values.saleType}. Notes: ${values.notes || 'N/A'}`,
        },
      });

      toast({
        title: "Sales Saved",
        description: `${values.saleType} sales for ${format(values.saleDate, 'PPP')} has been saved.`,
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
        description="Select a date and sale type to view or edit the sales summary."
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
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                  <div>
                    <CardTitle>Daily Sales Entry</CardTitle>
                    <CardDescription>Enter total sales received for each payment method.</CardDescription>
                  </div>
                  <DatePicker date={selectedDate} onDateChange={(date) => setSelectedDate(date || new Date())} disabled={isSubmitting || isLoadingData} />
              </div>
            </CardHeader>
            {isLoadingData ? (
                <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
            ) : (
            <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="saleType"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Sale Type</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={(value) => {
                            field.onChange(value);
                            setSelectedType(value as 'MRP' | 'Non-MRP');
                          }}
                          value={field.value}
                          className="flex items-center space-x-4"
                        >
                          {foodSaleTypes.map(type => (
                            <FormItem key={type} className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                    <RadioGroupItem value={type} />
                                </FormControl>
                                <FormLabel className="font-normal">{type}</FormLabel>
                            </FormItem>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-4 border rounded-md">
                    <FormField control={form.control} name="sales.hungerbox" render={({ field }) => (<FormItem><FormLabel>HungerBox Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="bg-input text-lg" disabled={isSubmitting || isLoadingData}/></FormControl><FormMessage/></FormItem>)}/>
                    <FormField control={form.control} name="sales.upi" render={({ field }) => (<FormItem><FormLabel>UPI Sales (₹)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} className="bg-input text-lg" disabled={isSubmitting || isLoadingData}/></FormControl><FormMessage/></FormItem>)}/>
                </div>
                
                 <div className="pt-6 border-t">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">Grand Total</CardTitle>
                        <p className="font-bold text-2xl text-primary">₹{form.getValues('totalAmount').toFixed(2)}</p>
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


"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import {
  foodExpenseEditFormSchema, // Use the new extended schema
  type FoodItemExpenseEditFormValues, // Use the new type for the edit form
  foodExpenseCategories,
  paymentMethods,
  type FoodItemExpense
} from "@/types/food";
import type { Site, Stall } from '@/types';
import { ArrowLeft, Loader2, Info, Building } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  query,
  where,
  onSnapshot,
  orderBy
} from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { logFoodStallActivity } from "@/lib/foodStallLogger";
import { useParams, useRouter } from 'next/navigation';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in EditFoodExpensePage:", error);
  }
} else {
  db = getFirestore(getApp());
}

export default function EditFoodExpensePage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const expenseId = params.expenseId as string;
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [vendors, setVendors] = useState<string[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);

  const form = useForm<FoodItemExpenseEditFormValues>({
    resolver: zodResolver(foodExpenseEditFormSchema),
    defaultValues: {
      category: undefined,
      otherCategoryDetails: "",
      totalCost: 0,
      paymentMethod: undefined,
      otherPaymentMethodDetails: "",
      purchaseDate: new Date(),
      vendor: undefined,
      otherVendorDetails: "",
      notes: "",
      billImageUrl: "",
      siteId: "",
      stallId: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const vendor = form.watch("vendor");
  const category = form.watch("category");
  const selectedSiteId = form.watch("siteId");
  
  // Fetch Sites, Stalls, Vendors
  useEffect(() => {
    if (!db) return;
    Promise.all([
        getDocs(query(collection(db, "sites"), orderBy("name"))),
        getDocs(query(collection(db, "stalls"), orderBy("name"))),
        getDocs(query(collection(db, "foodVendors"), orderBy("name"))),
    ]).then(([sitesSnapshot, stallsSnapshot, vendorsSnapshot]) => {
        setAllSites(sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site)));
        const allStallsData = stallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        if (selectedSiteId) {
            setStallsForSite(allStallsData.filter(s => s.siteId === selectedSiteId));
        }
        setVendors(vendorsSnapshot.docs.map(doc => doc.data().name as string));
        setLoadingVendors(false);
    }).catch(error => {
        toast({ title: "Error", description: "Could not load necessary data for editing.", variant: "destructive" });
    });
  }, [db, toast, selectedSiteId]);

  // Fetch expense data
  useEffect(() => {
    if (!db || !expenseId) return;
    setIsLoading(true);
    const docRef = doc(db, "foodItemExpenses", expenseId);
    getDoc(docRef).then(docSnap => {
        if (docSnap.exists()) {
            const data = docSnap.data() as FoodItemExpense;
            form.reset({
                ...data,
                purchaseDate: (data.purchaseDate as Timestamp).toDate(),
                vendor: vendors.includes(data.vendor || '') || !data.vendor ? data.vendor : 'Other',
                otherVendorDetails: vendors.includes(data.vendor || '') ? '' : data.vendor,
                category: foodExpenseCategories.includes(data.category as any) ? data.category as any : 'Other',
                otherCategoryDetails: foodExpenseCategories.includes(data.category as any) ? '' : data.category,
            });
        } else {
            toast({ title: "Not Found", description: "The requested expense could not be found.", variant: "destructive" });
            router.push('/foodstall/expenses');
        }
    }).catch(error => {
        toast({ title: "Error", description: "Failed to load expense data.", variant: "destructive" });
    }).finally(() => setIsLoading(false));
  }, [db, expenseId, form, router, toast, vendors]);

  async function onSubmit(values: FoodItemExpenseEditFormValues) {
    if (!user || !expenseId || !db) {
      toast({ title: "Error", description: "Cannot update expense. Context is missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const categoryToSave = values.category === 'Other' ? (values.otherCategoryDetails || "Other") : values.category;
      const expenseDocRef = doc(db, "foodItemExpenses", expenseId);
      
      const expenseDataToUpdate = {
        ...values,
        category: categoryToSave,
        purchaseDate: Timestamp.fromDate(values.purchaseDate),
        updatedAt: new Date().toISOString(),
      };
      
      delete (expenseDataToUpdate as any).otherCategoryDetails;

      await setDoc(expenseDocRef, expenseDataToUpdate, { merge: true });
      
      toast({ title: "Expense Updated", description: `Expense has been successfully updated.` });
      router.push('/foodstall/expenses');

    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message || "Could not update the expense.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit Food Stall Expense"
        description={`Editing expense record ID: ${expenseId.substring(0,8)}...`}
        actions={
          <Link href="/foodstall/expenses">
            <Button variant="outline" disabled={isSubmitting}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Expenses
            </Button>
          </Link>
        }
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardHeader><CardTitle>Update Expense Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="siteId" render={({field}) => (
                        <FormItem><FormLabel>Site *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><Building className="h-4 w-4 mr-2 text-muted-foreground"/><SelectValue placeholder="Select site..."/></SelectTrigger></FormControl>
                                <SelectContent>{allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage/>
                        </FormItem>
                    )}/>
                    <FormField control={form.control} name="stallId" render={({field}) => (
                        <FormItem><FormLabel>Stall *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={!selectedSiteId || stallsForSite.length === 0}><FormControl><SelectTrigger><SelectValue placeholder={!selectedSiteId ? "Select site first" : "Select stall..."}/></SelectTrigger></FormControl>
                                <SelectContent>{stallsForSite.map(stall => <SelectItem key={stall.id} value={stall.id}>{stall.name}</SelectItem>)}</SelectContent>
                            </Select><FormMessage/>
                        </FormItem>
                    )}/>
                </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category *</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting}><FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                        <SelectContent>{foodExpenseCategories.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
                    </Select><FormMessage/></FormItem>
                )}/>
                {category === 'Other' && (<FormField control={form.control} name="otherCategoryDetails" render={({ field }) => (<FormItem><FormLabel>Specify Other Category *</FormLabel><FormControl><Input placeholder="Category name" {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>)}
                <FormField control={form.control} name="totalCost" render={({ field }) => (<FormItem><FormLabel>Total Cost * (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>
              </div>
              <FormField control={form.control} name="vendor" render={({ field }) => (<FormItem><FormLabel>Vendor *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isSubmitting || loadingVendors}><FormControl><SelectTrigger><SelectValue placeholder={loadingVendors ? "Loading..." : "Select vendor"} /></SelectTrigger></FormControl>
                      <SelectContent>{vendors.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}<SelectItem value="Other">Other</SelectItem></SelectContent>
                  </Select><FormMessage/></FormItem>
              )}/>
              {vendor === 'Other' && (<FormField control={form.control} name="otherVendorDetails" render={({ field }) => (<FormItem><FormLabel>Specify Other Vendor *</FormLabel><FormControl><Input placeholder="Vendor name" {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>)}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>Payment Method *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger></FormControl>
                        <SelectContent>{paymentMethods.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}</SelectContent>
                    </Select><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="purchaseDate" render={({ field }) => (<FormItem><FormLabel>Purchase Date *</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} /></FormItem>)}/>
              </div>
              {paymentMethod === 'Other' && (<FormField control={form.control} name="otherPaymentMethodDetails" render={({ field }) => (<FormItem><FormLabel>Specify Other Payment *</FormLabel><FormControl><Input placeholder="e.g., Sodexo" {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>)}
              <FormField control={form.control} name="billImageUrl" render={({ field }) => (<FormItem><FormLabel>Bill Image URL</FormLabel><FormControl><Input type="url" {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>
              <FormField control={form.control} name="notes" render={({ field }) => (<FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl><FormMessage/></FormItem>)}/>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && (<Loader2 className="mr-2 h-4 w-4 animate-spin" />)} Save Changes
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}


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
  foodExpenseFormSchema,
  type FoodItemExpenseFormValues,
  foodExpenseCategories,
  paymentMethods,
  foodVendors,
} from "@/types/food";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp, getApp } from "firebase/app";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { logFoodStallActivity } from "@/lib/foodStallLogger";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in RecordFoodExpensePage:", error);
  }
} else {
  db = getFirestore(getApp());
}

export default function RecordFoodExpensePage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FoodItemExpenseFormValues>({
    resolver: zodResolver(foodExpenseFormSchema),
    defaultValues: {
      category: undefined,
      totalCost: undefined, // Let placeholder show
      paymentMethod: undefined,
      otherPaymentMethodDetails: "",
      purchaseDate: new Date(),
      vendor: undefined,
      otherVendorDetails: "",
      notes: "",
      billImageUrl: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");
  const vendor = form.watch("vendor");

  async function onSubmit(values: FoodItemExpenseFormValues) {
    if (!user || !activeSiteId || !activeStallId || !db) {
      toast({
        title: "Error",
        description:
          "Cannot record expense. User, site, or stall context is missing, or DB not initialized.",
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const expenseData = {
        ...values,
        siteId: activeSiteId,
        stallId: activeStallId,
        recordedByUid: user.uid,
        recordedByName: user.displayName || user.email,
        purchaseDate: Timestamp.fromDate(values.purchaseDate), // Convert to Firestore Timestamp
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "foodItemExpenses"), expenseData);
      
      const vendorNameForLog = values.vendor === 'Other' ? values.otherVendorDetails : values.vendor;

      await logFoodStallActivity(user, {
        siteId: activeSiteId,
        stallId: activeStallId,
        type: 'EXPENSE_RECORDED',
        relatedDocumentId: docRef.id,
        details: {
            expenseCategory: values.category,
            totalCost: values.totalCost,
            notes: `Vendor: ${vendorNameForLog || 'N/A'}. Payment: ${values.paymentMethod}${values.paymentMethod === 'Other' ? ` (${values.otherPaymentMethodDetails})` : ''}`
        }
      });
      
      toast({
        title: "Expense Recorded",
        description: `A ${
          values.category
        } expense of ₹${values.totalCost.toFixed(2)} has been recorded.`,
      });
      form.reset({
        category: undefined,
        totalCost: undefined,
        paymentMethod: undefined,
        otherPaymentMethodDetails: "",
        purchaseDate: new Date(),
        vendor: undefined,
        otherVendorDetails: "",
        notes: "",
        billImageUrl: "",
      });
    } catch (error: any) {
      console.error("Error recording food expense:", error);
      toast({
        title: "Recording Failed",
        description:
          error.message || "Could not record the expense. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Authenticating...</p>
      </div>
    );
  }

  if (!activeSiteId || !activeStallId) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Site & Stall Context Required</AlertTitle>
          <AlertDescription>
            To record a food stall expense, please ensure you have an active
            Site and a specific Stall selected in the header. This context is
            necessary to correctly associate the expense.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record New Food Stall Expense"
        description="Enter the details of the purchase or operational cost."
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
            <CardHeader>
              <CardTitle>Expense Details</CardTitle>
              <CardDescription>
                All fields marked with * are required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger id="category" className="bg-input">
                            <SelectValue placeholder="Select expense category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {foodExpenseCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
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
                  name="totalCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Cost * (₹)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isSubmitting}
                          className="bg-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

               <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger id="vendor" className="bg-input">
                            <SelectValue placeholder="Select a vendor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           {foodVendors.map((v) => (
                            <SelectItem key={v} value={v}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {vendor === 'Other' && (
                <FormField
                  control={form.control}
                  name="otherVendorDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specify Other Vendor *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter vendor name"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isSubmitting}
                          className="bg-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isSubmitting}
                      >
                        <FormControl>
                          <SelectTrigger
                            id="paymentMethod"
                            className="bg-input"
                          >
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {paymentMethods.map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
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
                  name="purchaseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Date *</FormLabel>
                      <DatePicker
                        date={field.value}
                        onDateChange={field.onChange}
                        id="expensePurchaseDate"
                        disabled={isSubmitting}
                        className="bg-input"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {paymentMethod === 'Other' && (
                <FormField
                  control={form.control}
                  name="otherPaymentMethodDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specify Other Payment Method *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Sodexo, Meal Voucher"
                          {...field}
                          value={field.value ?? ""}
                          disabled={isSubmitting}
                          className="bg-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <FormField
                control={form.control}
                name="billImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bill Image URL (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com/your-bill.jpg"
                        {...field}
                        value={field.value ?? ""}
                        disabled={isSubmitting}
                        className="bg-input"
                      />
                    </FormControl>
                    <FormDescription className="text-xs flex items-center gap-1">
                      <Info size={12} />
                      Direct file upload is not supported yet. Please upload your bill somewhere public and paste the link here.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Paid in cash, specific brand for an item"
                        {...field}
                        value={field.value ?? ""}
                        disabled={isSubmitting}
                        className="bg-input min-h-[70px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Expense
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}

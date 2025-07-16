
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { StaffDetailsFormValues, AppUser } from "@/types";
import { staffDetailsFormSchema } from "@/types/staff";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import { useState } from "react";
import { DatePicker } from "../ui/date-picker";
import type { StaffDetails } from "@/types";

const LOG_PREFIX = "[StaffDetailsForm]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface StaffDetailsFormProps {
  staffUid: string;
  initialData?: StaffDetails | null;
  staffUser: AppUser;
}

export default function StaffDetailsForm({ staffUid, initialData, staffUser }: StaffDetailsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StaffDetailsFormValues>({
    resolver: zodResolver(staffDetailsFormSchema),
    defaultValues: {
      phoneNumber: initialData?.phoneNumber || "",
      address: initialData?.address || "",
      joiningDate: initialData?.joiningDate ? new Date(initialData.joiningDate) : null,
      salary: initialData?.salary || 0,
    },
  });

  async function onSubmit(values: StaffDetailsFormValues) {
    setIsSubmitting(true);
    const detailsDocRef = doc(db, "staffDetails", staffUid);
    try {
      const dataToSave = {
        ...values,
        joiningDate: values.joiningDate ? values.joiningDate.toISOString() : null,
        salary: values.salary || 0,
        uid: staffUid, // Ensure UID is part of the doc
      };

      await setDoc(detailsDocRef, dataToSave, { merge: true });
      toast({ title: "Success", description: `${staffUser.displayName}'s details have been updated.` });
      router.back();
    } catch (error: any) {
      toast({ title: "Error", description: `Could not save details: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto shadow-lg">
      <CardHeader>
        <CardTitle>{staffUser.displayName}</CardTitle>
        <CardDescription>Role: <span className="capitalize">{staffUser.role}</span> | Email: {staffUser.email}</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField name="phoneNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="e.g., +91..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem> )} />
              <FormField name="joiningDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Joining Date</FormLabel><DatePicker date={field.value ?? undefined} onDateChange={field.onChange} /></FormItem> )} />
            </div>
            <FormField name="address" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Full address" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem> )} />
            <FormField name="salary" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Salary (Monthly, ₹)</FormLabel><FormControl><Input type="number" placeholder="e.g., 25000" {...field} value={field.value ?? 0} /></FormControl><FormMessage /></FormItem> )} />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Details
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

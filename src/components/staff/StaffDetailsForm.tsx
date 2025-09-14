
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { StaffDetailsFormValues, AppUser, StaffDetails, StaffActivityLog, SalaryAdvance, SalaryPayment, StaffAttendance } from "@/types";
import { staffDetailsFormSchema } from "@/types/staff";
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
import { Card, CardContent, CardDescription as UiCardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, History } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { doc, setDoc, updateDoc, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from '@/lib/firebaseConfig';
import { useState, useEffect } from "react";
import { DatePicker } from "../ui/date-picker";
import { logStaffActivity } from "@/lib/staffLogger";
import { useAuth } from "@/contexts/AuthContext";
import StaffHistory from "./StaffHistory";

interface StaffDetailsFormProps {
  staffUid: string;
  initialData?: StaffDetails | null;
  staffUser: AppUser;
}

export default function StaffDetailsForm({ staffUid, initialData, staffUser }: StaffDetailsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user: currentUser } = useAuth(); // Get the currently logged-in admin/manager
  
  const [activityLogs, setActivityLogs] = useState<StaffActivityLog[]>([]);
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [attendance, setAttendance] = useState<StaffAttendance[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const form = useForm<StaffDetailsFormValues>({
    resolver: zodResolver(staffDetailsFormSchema),
    defaultValues: {
      phoneNumber: initialData?.phoneNumber || "",
      address: initialData?.address || "",
      joiningDate: initialData?.joiningDate ? new Date(initialData.joiningDate) : null,
      salary: initialData?.salary || 0,
      exitDate: initialData?.exitDate ? new Date(initialData.exitDate) : null,
    },
  });

  useEffect(() => {
    const fetchHistoryData = async () => {
        if (!staffUid || !db) return;
        setLoadingHistory(true);
        try {
            const logQuery = query(collection(db, "staffActivityLogs"), where("relatedStaffUid", "==", staffUid), orderBy("timestamp", "desc"));
            const advancesQuery = query(collection(db, "advances"), where("staffUid", "==", staffUid), orderBy("date", "desc"));
            const paymentsQuery = query(collection(db, "salaryPayments"), where("staffUid", "==", staffUid), orderBy("paymentDate", "desc"));
            const attendanceQuery = query(collection(db, "staffAttendance"), where("staffUid", "==", staffUid), where("status", "==", "Leave"), orderBy("date", "desc"));

            const [logSnap, advancesSnap, paymentsSnap, attendanceSnap] = await Promise.all([
                getDocs(logQuery),
                getDocs(advancesQuery),
                getDocs(paymentsQuery),
                getDocs(attendanceQuery),
            ]);

            setActivityLogs(logSnap.docs.map(d => ({id: d.id, ...d.data()}) as StaffActivityLog));
            setAdvances(advancesSnap.docs.map(d => ({id: d.id, ...d.data()}) as SalaryAdvance));
            setPayments(paymentsSnap.docs.map(d => ({id: d.id, ...d.data()}) as SalaryPayment));
            setAttendance(attendanceSnap.docs.map(d => ({id: d.id, ...d.data()}) as StaffAttendance));

        } catch (error) {
            console.error("Error fetching staff history:", error);
            toast({ title: "Error", description: "Failed to load staff history.", variant: "destructive"});
        } finally {
            setLoadingHistory(false);
        }
    };
    fetchHistoryData();
  }, [staffUid, toast]);


  async function onSubmit(values: StaffDetailsFormValues) {
    if (!currentUser) {
        toast({ title: "Authentication Error", description: "You are not logged in.", variant: "destructive" });
        return;
    }
    if (!db) {
        toast({ title: "Database Error", description: "Firestore is not initialized.", variant: "destructive" });
        return;
    }
    setIsSubmitting(true);
    const detailsDocRef = doc(db, "staffDetails", staffUid);
    const userDocRef = doc(db, "users", staffUid);

    try {
      const dataToSave = {
        ...values,
        joiningDate: values.joiningDate ? values.joiningDate.toISOString() : null,
        exitDate: values.exitDate ? values.exitDate.toISOString() : null,
        salary: values.salary || 0,
        uid: staffUid,
      };

      await setDoc(detailsDocRef, dataToSave, { merge: true });
      
      let toastDescription = `${staffUser.displayName}'s details have been updated.`;
      if (values.exitDate && staffUser.status !== 'inactive') {
        await updateDoc(userDocRef, { status: 'inactive' });
        toastDescription = `${staffUser.displayName}'s details updated and account set to inactive.`;
      }
      
      await logStaffActivity(currentUser, {
          type: 'STAFF_DETAILS_UPDATED',
          relatedStaffUid: staffUid,
          siteId: staffUser.defaultSiteId,
          details: {
              notes: `Profile details for ${staffUser.displayName || staffUser.email} were updated.`,
          }
      });

      toast({ title: "Success", description: toastDescription });
      
      router.push('/staff/list'); // Go back to the list page
      router.refresh(); // Force a refresh of the user list data
    } catch (error: any) {
      toast({ title: "Error", description: `Could not save details: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>{staffUser.displayName}</CardTitle>
          <UiCardDescription>Role: <span className="capitalize">{staffUser.role}</span> | Email: {staffUser.email}</UiCardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField name="phoneNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input placeholder="e.g., +91..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="salary" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Salary (Monthly, ₹)</FormLabel><FormControl><Input type="number" placeholder="e.g., 25000" {...field} value={field.value ?? 0} onChange={e => field.onChange(parseInt(e.target.value, 10) || 0)}/></FormControl><FormMessage /></FormItem> )} />
              </div>
              <FormField name="address" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Address</FormLabel><FormControl><Textarea placeholder="Full address" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem> )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField name="joiningDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Joining Date</FormLabel><DatePicker date={field.value ?? undefined} onDateChange={field.onChange} /></FormItem> )} />
                <FormField name="exitDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Exit Date (Optional)</FormLabel><DatePicker date={field.value ?? undefined} onDateChange={field.onChange} /><FormDescription className="text-xs">Setting this will make the user inactive.</FormDescription></FormItem> )} />
              </div>
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
      
      <Card className="max-w-2xl mx-auto shadow-lg mt-6">
        <CardHeader>
            <CardTitle className="flex items-center"><History className="mr-2 h-5 w-5 text-primary"/> Employment History</CardTitle>
            <UiCardDescription>A log of key events for this staff member.</UiCardDescription>
        </CardHeader>
        <CardContent>
            {loadingHistory ? (
                <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin"/></div>
            ) : (
                <StaffHistory 
                    initialDetails={initialData || null}
                    logs={activityLogs} 
                    advances={advances}
                    payments={payments}
                    attendance={attendance}
                />
            )}
        </CardContent>
      </Card>
    </div>
  );
}

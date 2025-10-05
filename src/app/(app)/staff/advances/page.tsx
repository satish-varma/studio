
"use client";

import { useState, useEffect } from "react";
import type { AppUser, SalaryAdvance } from "@/types";
import { salaryAdvanceFormSchema, type SalaryAdvanceFormValues } from "@/types/staff";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc,
  doc,
  orderBy,
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Loader2, Info, PlusCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";
import { logStaffActivity } from "@/lib/staffLogger";
import { useUserManagement } from "@/hooks/use-user-management";

const LOG_PREFIX = "[SalaryAdvanceClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function SalaryAdvanceClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const { users: staffList, loading: userManagementLoading } = useUserManagement();
  
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const { toast } = useToast();

  const form = useForm<SalaryAdvanceFormValues>({
    resolver: zodResolver(salaryAdvanceFormSchema),
    defaultValues: {
      amount: undefined,
      date: new Date(),
      forDate: new Date(),
      notes: "",
    },
  });

  useEffect(() => {
    if (userManagementLoading || authLoading) {
      setLoading(true);
      return;
    }
  
    // Determine the UIDs to query for based on the view (all sites or single site)
    const staffToQuery = staffList;
    if (staffToQuery.length === 0) {
      setAdvances([]);
      setLoading(false);
      return;
    }
  
    const staffUids = staffToQuery.map(s => s.uid);
  
    // Batch UIDs for 'in' query limitation (max 30 values per 'in' query)
    const uidsBatches: string[][] = [];
    for (let i = 0; i < staffUids.length; i += 30) {
      uidsBatches.push(staffUids.slice(i, i + 30));
    }
  
    const unsubscribers = uidsBatches.map(batch => {
      const advancesQuery = query(collection(db, "advances"), where("staffUid", "in", batch), orderBy("date", "desc"));
      return onSnapshot(advancesQuery, (snapshot) => {
        const batchAdvances = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryAdvance));
        setAdvances(prev => {
          // Filter out old advances for this batch and add new ones
          const otherAdvances = prev.filter(adv => !batch.includes(adv.staffUid));
          return [...otherAdvances, ...batchAdvances].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
        setLoading(false);
      }, (error) => {
        console.error("Error fetching salary advances:", error);
        toast({ title: "Error", description: "Could not fetch salary advances.", variant: "destructive" });
        setLoading(false);
      });
    });
  
    return () => unsubscribers.forEach(unsub => unsub());
  }, [staffList, userManagementLoading, authLoading, toast]);


  const handleAddAdvance = async (values: SalaryAdvanceFormValues) => {
    const staffMember = staffList.find(s => s.uid === selectedStaff);
    if (!user || !staffMember) {
        toast({ title: "Error", description: "Current user or selected staff is missing.", variant: "destructive"});
        return;
    }

    if (!staffMember.defaultSiteId) {
        toast({ title: "Error", description: `${staffMember.displayName} is not assigned to a site. Cannot record advance.`, variant: "destructive"});
        return;
    }

    try {
        const advanceData = {
            ...values,
            staffUid: staffMember.uid,
            siteId: staffMember.defaultSiteId, // Use staff's assigned site
            date: values.date.toISOString(),
            forMonth: values.forDate.getMonth() + 1, // Store as 1-12
            forYear: values.forDate.getFullYear(),
        };
        // We don't want to save forDate to the database, so remove it
        delete (advanceData as any).forDate;

        const docRef = await addDoc(collection(db, "advances"), advanceData);
        
        await logStaffActivity(user, {
            type: 'SALARY_ADVANCE_GIVEN',
            relatedStaffUid: staffMember.uid,
            siteId: staffMember.defaultSiteId,
            details: {
                amount: values.amount,
                notes: `Advance for ${format(values.forDate, 'MMM yyyy')} given to ${staffMember.displayName || staffMember.email} on ${format(values.date, 'PPP')}.`,
                relatedDocumentId: docRef.id,
            }
        });

        toast({ title: "Success", description: "Salary advance recorded." });
        setShowAddDialog(false);
        form.reset();
        setSelectedStaff("");
    } catch (error: any) {
        toast({ title: "Error", description: `Could not record advance: ${error.message}`, variant: "destructive" });
    }
  };


  if (authLoading || userManagementLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle>Salary Advance History</CardTitle>
                <CardDescription>
                  {activeSiteId ? "Advances recorded for staff at this site." : "Advances for staff across all managed sites."}
                </CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                    <Button disabled={staffList.length === 0}><PlusCircle className="mr-2 h-4 w-4" /> Record Advance</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record New Salary Advance</DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleAddAdvance)} className="space-y-4">
                             <FormItem>
                                 <FormLabel>Staff Member *</FormLabel>
                                 <Select value={selectedStaff} onValueChange={setSelectedStaff} required>
                                     <FormControl>
                                         <SelectTrigger>
                                             <SelectValue placeholder="Select staff..." />
                                         </SelectTrigger>
                                     </FormControl>
                                     <SelectContent>
                                         {staffList
                                            .filter(s => s.uid && s.uid.trim() !== "")
                                            .map(s => <SelectItem key={s.uid} value={s.uid}>{s.displayName}</SelectItem>)}
                                     </SelectContent>
                                 </Select>
                             </FormItem>
                            <FormField name="amount" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Amount (₹) *</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)}/></FormControl><FormMessage /></FormItem> )}/>
                            <FormField name="date" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Date Given *</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} /></FormItem> )}/>
                            <FormField name="forDate" control={form.control} render={({ field }) => ( <FormItem><FormLabel>For Month *</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} /><FormDescription>Select any day in the month this advance applies to.</FormDescription></FormItem> )}/>
                            <FormField name="notes" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem> )}/>
                             <DialogFooter>
                                <Button type="submit" disabled={!selectedStaff}>Save Advance</Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
             <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : advances.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No salary advances recorded for staff in the current view.</p>
        ) : (
            <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date Given</TableHead>
                        <TableHead>For Month</TableHead>
                        <TableHead>Staff Member</TableHead>
                        <TableHead>Recorded By</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Notes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {advances.map(adv => (
                        <TableRow key={adv.id}>
                            <TableCell>{format(new Date(adv.date), 'PPP')}</TableCell>
                            <TableCell>{(adv.forYear && adv.forMonth) ? format(new Date(adv.forYear, adv.forMonth - 1), 'MMM yyyy') : "N/A"}</TableCell>
                            <TableCell>{staffList.find(s => s.uid === adv.staffUid)?.displayName || adv.staffUid.substring(0,8)}</TableCell>
                            <TableCell>{adv.recordedByName || adv.recordedByUid.substring(0,8)}</TableCell>
                            <TableCell className="text-right font-medium">₹{adv.amount.toFixed(2)}</TableCell>
                            <TableCell>{adv.notes || 'N/A'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}

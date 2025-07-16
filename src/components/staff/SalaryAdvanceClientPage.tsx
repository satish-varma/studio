
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
  doc
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
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const { toast } = useToast();

  const form = useForm<SalaryAdvanceFormValues>({
    resolver: zodResolver(salaryAdvanceFormSchema),
    defaultValues: {
      amount: undefined,
      date: new Date(),
      notes: "",
    },
  });

  useEffect(() => {
    if (authLoading || !activeSiteId) {
        if (!authLoading) setLoading(false);
        return;
    }

    const usersQuery = query(
        collection(db, "users"),
        where("role", "in", ["staff", "manager"]),
        where("defaultSiteId", "==", activeSiteId)
    );
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const fetchedStaff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
        setStaffList(fetchedStaff);
        
        // After fetching staff, fetch their advances
        if (fetchedStaff.length > 0) {
            const staffUids = fetchedStaff.map(s => s.uid);
            const advancesQuery = query(collection(db, "advances"), where("staffUid", "in", staffUids));
            const unsubscribeAdvances = onSnapshot(advancesQuery, (advSnapshot) => {
                setAdvances(advSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalaryAdvance)));
                setLoading(false);
            });
            return () => unsubscribeAdvances(); // Return inner unsubscribe
        } else {
            setAdvances([]);
            setLoading(false);
        }
    }, (error) => {
        console.error("Error fetching staff list for advances:", error);
        toast({ title: "Error", description: "Could not fetch staff list.", variant: "destructive" });
        setLoading(false);
    });

    return () => {
        unsubscribeUsers();
    };
  }, [activeSiteId, authLoading, toast]);


  const handleAddAdvance = async (values: SalaryAdvanceFormValues) => {
    const staffMember = staffList.find(s => s.uid === selectedStaff);
    if (!user || !activeSiteId || !staffMember) {
        toast({ title: "Error", description: "User context or selected staff is missing.", variant: "destructive"});
        return;
    }

    try {
        const advanceData = {
            ...values,
            staffUid: staffMember.uid,
            siteId: activeSiteId,
            date: values.date.toISOString(),
            recordedByUid: user.uid,
            recordedByName: user.displayName || user.email,
        };
        const docRef = await addDoc(collection(db, "advances"), advanceData);
        
        await logStaffActivity(user, {
            type: 'SALARY_ADVANCE_GIVEN',
            relatedStaffUid: staffMember.uid,
            siteId: activeSiteId,
            details: {
                amount: values.amount,
                notes: `Advance given to ${staffMember.displayName || staffMember.email} on ${format(values.date, 'PPP')}.`,
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


  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!activeSiteId) return (
    <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>Please select a site to manage salary advances.</AlertDescription>
    </Alert>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
            <div>
                <CardTitle>Salary Advance History</CardTitle>
                <CardDescription>All advances recorded for staff at this site.</CardDescription>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                    <Button><PlusCircle className="mr-2 h-4 w-4" /> Record Advance</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record New Salary Advance</DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleAddAdvance)} className="space-y-4">
                             <FormItem>
                                 <FormLabel>Staff Member</FormLabel>
                                 <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                                     <FormControl>
                                         <SelectTrigger>
                                             <SelectValue placeholder="Select staff..." />
                                         </SelectTrigger>
                                     </FormControl>
                                     <SelectContent>
                                         {staffList.map(s => <SelectItem key={s.uid} value={s.uid}>{s.displayName}</SelectItem>)}
                                     </SelectContent>
                                 </Select>
                             </FormItem>
                            <FormField name="amount" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                            <FormField name="date" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Date</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} /></FormItem> )}/>
                            <FormField name="notes" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem> )}/>
                             <DialogFooter>
                                <Button type="submit">Save Advance</Button>
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
            <p className="text-center text-muted-foreground py-6">No salary advances recorded for this site yet.</p>
        ) : (
            <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Staff Member</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Notes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {advances.map(adv => (
                        <TableRow key={adv.id}>
                            <TableCell>{format(new Date(adv.date), 'PPP')}</TableCell>
                            <TableCell>{staffList.find(s => s.uid === adv.staffUid)?.displayName || adv.staffUid.substring(0,8)}</TableCell>
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

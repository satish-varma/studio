
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, IndianRupee, TrendingUp } from "lucide-react";
import { getFirestore, collection, addDoc, doc, setDoc } from "firebase/firestore";
import { db } from '@/lib/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DatePicker } from '../ui/date-picker';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';
import { logStaffActivity } from '@/lib/staffLogger';
import type { AppUser, SalaryHistory, SalaryHistoryFormValues } from '@/types';
import { salaryHistoryFormSchema } from '@/types/staff';

interface SalaryHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  staffUser: AppUser;
  currentSalary: number;
  salaryHistory: SalaryHistory[];
}

export default function SalaryHistoryDialog({ isOpen, onClose, staffUser, currentSalary, salaryHistory }: SalaryHistoryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const form = useForm<SalaryHistoryFormValues>({
    resolver: zodResolver(salaryHistoryFormSchema),
    defaultValues: {
      newSalary: undefined,
      effectiveDate: new Date(),
      notes: "",
    },
  });

  const handleRecordAppraisal = async (values: SalaryHistoryFormValues) => {
    if (!currentUser || !db) return;
    setIsSubmitting(true);

    try {
      // 1. Add to salaryHistory collection
      await addDoc(collection(db, "salaryHistory"), {
        staffUid: staffUser.uid,
        newSalary: values.newSalary,
        effectiveDate: format(values.effectiveDate, 'yyyy-MM-dd'),
        notes: values.notes,
        recordedByUid: currentUser.uid,
        recordedByName: currentUser.displayName || currentUser.email,
        recordedAt: new Date().toISOString(),
      });

      // 2. Update the main salary field in staffDetails
      const staffDetailsRef = doc(db, "staffDetails", staffUser.uid);
      await setDoc(staffDetailsRef, { salary: values.newSalary }, { merge: true });
      
      // 3. Log the activity
      await logStaffActivity(currentUser, {
        type: 'STAFF_DETAILS_UPDATED',
        relatedStaffUid: staffUser.uid,
        siteId: staffUser.defaultSiteId,
        details: {
            notes: `Salary appraisal recorded. New salary: ₹${values.newSalary.toFixed(2)} effective ${format(values.effectiveDate, 'PPP')}.`,
        }
      });

      toast({ title: "Appraisal Recorded", description: `${staffUser.displayName}'s salary has been updated.` });
      form.reset();
      onClose();

    } catch (error: any) {
      console.error("Error recording appraisal:", error);
      toast({ title: "Error", description: "Could not record salary change.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salary Appraisal for {staffUser.displayName}</DialogTitle>
          <DialogDescription>
            Record a new salary and view past appraisals. The current salary is ₹{currentSalary.toFixed(2)}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleRecordAppraisal)} className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField name="newSalary" control={form.control} render={({field}) => (
                  <FormItem>
                      <FormLabel>New Salary (Monthly, ₹)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(parseFloat(e.target.value))} placeholder="e.g., 32000"/></FormControl>
                      <FormMessage />
                  </FormItem>
              )}/>
              <FormField name="effectiveDate" control={form.control} render={({field}) => (
                  <FormItem>
                      <FormLabel>Effective Date</FormLabel>
                      <DatePicker date={field.value} onDateChange={field.onChange} />
                      <FormMessage />
                  </FormItem>
              )}/>
            </div>
            <FormField name="notes" control={form.control} render={({field}) => (
                <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea {...field} placeholder="e.g., Annual performance review appraisal"/></FormControl><FormMessage/></FormItem>
            )}/>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : <TrendingUp className="h-4 w-4" />}
              <span className="ml-2">Save New Salary</span>
            </Button>
          </form>
        </Form>
        
        <div className="pt-4 border-t">
            <h4 className="font-medium mb-2 text-sm">Salary History</h4>
            <ScrollArea className="h-48 border rounded-md p-2">
                {salaryHistory.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">No previous salary records found.</p>
                ) : (
                    <div className="space-y-3">
                        {salaryHistory.map(entry => (
                            <div key={entry.id} className="text-sm">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-accent">₹{entry.newSalary.toFixed(2)}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(entry.effectiveDate), 'MMM dd, yyyy')}</p>
                                </div>
                                {entry.notes && <p className="text-xs text-muted-foreground italic">"{entry.notes}"</p>}
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

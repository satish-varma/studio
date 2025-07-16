
"use client";

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from '../ui/textarea';
import { DatePicker } from '../ui/date-picker';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { PayrollData } from "./PayrollClientPage";
import { salaryPaymentFormSchema, type SalaryPaymentFormValues } from "@/types/staff";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, addDoc } from "firebase/firestore";
import { logStaffActivity } from '@/lib/staffLogger';
import { Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';

const db = getFirestore();

interface PayrollTableProps {
  data: PayrollData[];
  month: number;
  year: number;
}

const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

export function PayrollTable({ data, month, year }: PayrollTableProps) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SalaryPaymentFormValues>({
    resolver: zodResolver(salaryPaymentFormSchema),
    defaultValues: { notes: "" }
  });

  const handleOpenDialog = (payroll: PayrollData) => {
    setSelectedPayroll(payroll);
    form.reset({
      amountPaid: payroll.netPayable - payroll.paidAmount > 0 ? payroll.netPayable - payroll.paidAmount : 0,
      paymentDate: new Date(),
      notes: ""
    });
  };

  const handleCloseDialog = () => {
    setSelectedPayroll(null);
    form.reset();
  };

  const onSubmit = async (values: SalaryPaymentFormValues) => {
    if (!currentUser || !selectedPayroll) return;
    setIsSubmitting(true);
    
    try {
        const paymentData = {
            ...values,
            staffUid: selectedPayroll.user.uid,
            forMonth: month,
            forYear: year,
            siteId: selectedPayroll.user.defaultSiteId!,
            recordedByUid: currentUser.uid,
            recordedByName: currentUser.displayName || currentUser.email!,
            paymentDate: values.paymentDate.toISOString(),
        };

        const docRef = await addDoc(collection(db, "salaryPayments"), paymentData);
        
        await logStaffActivity(currentUser, {
            type: 'SALARY_PAID',
            relatedStaffUid: selectedPayroll.user.uid,
            siteId: selectedPayroll.user.defaultSiteId,
            details: {
                amount: values.amountPaid,
                notes: `Salary for ${format(new Date(year, month-1), 'MMM yyyy')} paid. Notes: ${values.notes || 'N/A'}.`,
                relatedDocumentId: docRef.id,
            }
        });

        toast({ title: "Success", description: "Salary payment recorded." });
        handleCloseDialog();
    } catch (error: any) {
        toast({ title: "Error", description: `Failed to record payment: ${error.message}`, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Staff Members Found</p>
        <p className="text-muted-foreground">
          No staff members are assigned to the selected site.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border shadow-sm bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff Member</TableHead>
            <TableHead className="text-right">Base Salary</TableHead>
            <TableHead className="text-right">Advances</TableHead>
            <TableHead className="text-right">Net Payable</TableHead>
            <TableHead className="text-right">Paid Amount</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map(item => (
            <TableRow key={item.user.uid}>
              <TableCell className="font-medium">{item.user.displayName || item.user.email}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.details?.salary || 0)}</TableCell>
              <TableCell className="text-right text-orange-600">{formatCurrency(item.advances)}</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(item.netPayable)}</TableCell>
              <TableCell className="text-right text-green-600">{formatCurrency(item.paidAmount)}</TableCell>
              <TableCell className="text-center">
                <Badge variant={item.isPaid ? 'default' : 'secondary'}>{item.isPaid ? 'Paid' : 'Pending'}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => handleOpenDialog(item)}>Pay Salary</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      
      {selectedPayroll && (
        <Dialog open={!!selectedPayroll} onOpenChange={(isOpen) => !isOpen && handleCloseDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pay Salary for {selectedPayroll.user.displayName}</DialogTitle>
              <DialogDescription>
                For {format(new Date(year, month - 1), 'MMMM yyyy')}. Net Payable: {formatCurrency(selectedPayroll.netPayable)}.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField name="amountPaid" control={form.control} render={({field}) => (
                    <FormItem><FormLabel>Amount to Pay (₹)</FormLabel><FormControl><Input type="number" {...field}/></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField name="paymentDate" control={form.control} render={({field}) => (
                    <FormItem><FormLabel>Payment Date</FormLabel><DatePicker date={field.value} onDateChange={field.onChange}/></FormItem>
                )}/>
                <FormField name="notes" control={form.control} render={({field}) => (
                    <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea {...field} /></FormControl></FormItem>
                )}/>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Record Payment
                    </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

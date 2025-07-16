
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { AppUser, StaffDetails, SalaryAdvance, SalaryPayment, Site } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { Button } from "../ui/button";
import { PayrollTable } from "./PayrollTable";

const LOG_PREFIX = "[PayrollClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export interface PayrollData {
    user: AppUser;
    details: StaffDetails | null;
    advances: number;
    netPayable: number;
    paidAmount: number;
    isPaid: boolean;
}

export default function PayrollClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToCurrentMonth = () => setCurrentMonth(new Date());

  const staffQuery = useMemo(() => {
    if (authLoading || !user) return null;
    if (user.role !== 'manager' && user.role !== 'admin') return null;
    
    let q = query(collection(db, "users"), where("role", "in", ["staff", "manager"]));
    if (activeSiteId) {
      q = query(q, where("defaultSiteId", "==", activeSiteId));
    }
    return q;
  }, [activeSiteId, authLoading, user]);

  useEffect(() => {
    if (!staffQuery) {
        if (!authLoading) setLoading(false);
        return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(staffQuery, async (staffSnapshot) => {
        const staffList = staffSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
        
        if (staffList.length === 0) {
            setPayrollData([]);
            setLoading(false);
            return;
        }

        try {
            const uids = staffList.map(s => s.uid);
            
            const [detailsDocs, advancesDocs, paymentsDocs] = await Promise.all([
                getDocs(query(collection(db, "staffDetails"), where("__name__", "in", uids))),
                getDocs(query(collection(db, "advances"), where("staffUid", "in", uids), where("date", ">=", startOfMonth(currentMonth).toISOString()), where("date", "<=", endOfMonth(currentMonth).toISOString()))),
                getDocs(query(collection(db, "salaryPayments"), where("staffUid", "in", uids), where("forMonth", "==", currentMonth.getMonth() + 1), where("forYear", "==", currentMonth.getFullYear())))
            ]);

            const detailsMap = new Map<string, StaffDetails>();
            detailsDocs.forEach(doc => detailsMap.set(doc.id, { uid: doc.id, ...doc.data() } as StaffDetails));

            const advancesMap = new Map<string, number>();
            advancesDocs.forEach(doc => {
                const advance = doc.data() as SalaryAdvance;
                advancesMap.set(advance.staffUid, (advancesMap.get(advance.staffUid) || 0) + advance.amount);
            });
            
            const paymentsMap = new Map<string, number>();
            paymentsDocs.forEach(doc => {
                const payment = doc.data() as SalaryPayment;
                paymentsMap.set(payment.staffUid, (paymentsMap.get(payment.staffUid) || 0) + payment.amountPaid);
            });

            const newPayrollData = staffList.map(u => {
                const details = detailsMap.get(u.uid) || null;
                const salary = details?.salary || 0;
                const advances = advancesMap.get(u.uid) || 0;
                const paidAmount = paymentsMap.get(u.uid) || 0;
                const netPayable = salary - advances;
                return {
                    user: u,
                    details,
                    advances,
                    netPayable,
                    paidAmount,
                    isPaid: paidAmount >= netPayable && netPayable > 0,
                };
            }).sort((a,b) => (a.user.displayName || "").localeCompare(b.user.displayName || ""));

            setPayrollData(newPayrollData);
        } catch (error: any) {
            console.error("Error fetching payroll details:", error);
            toast({ title: "Error", description: `Could not calculate payroll: ${error.message}`, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, (error) => {
        console.error("Error fetching staff for payroll:", error);
        setLoading(false);
    });
    
    return () => unsubscribe();

  }, [staffQuery, currentMonth, toast]);

  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!activeSiteId && user?.role !== 'admin') return (
    <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>Please select a site to manage payroll.</AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-4">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToCurrentMonth}>Current Month</Button>
        </div>
        {loading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Calculating payroll...</p></div>
        ) : (
            <PayrollTable data={payrollData} month={currentMonth.getMonth()+1} year={currentMonth.getFullYear()} />
        )}
    </div>
  );
}

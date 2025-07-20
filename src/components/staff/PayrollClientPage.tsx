
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { AppUser, StaffDetails, SalaryAdvance, SalaryPayment, Site, Holiday, StaffAttendance } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, getDaysInMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { PayrollTable } from "./PayrollTable";
import { useUserManagement } from "@/hooks/use-user-management";
import PageHeader from "@/components/shared/PageHeader";

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
    workingDays: number;
    presentDays: number;
    earnedSalary: number;
}

export default function PayrollClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const {
    users: staffList,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
    error: userManagementError,
  } = useUserManagement();
  
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loadingPayrollCalcs, setLoadingPayrollCalcs] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToCurrentMonth = () => setCurrentMonth(new Date());


  const calculateWorkingDays = useCallback((month: Date, holidays: Holiday[], staffSiteId?: string | null) => {
    const totalDays = getDaysInMonth(month);
    let workingDays = 0;
    for(let i=1; i<=totalDays; i++){
        const currentDate = new Date(month.getFullYear(), month.getMonth(), i);
        const dayOfWeek = currentDate.getDay();
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isGlobalHoliday = holidays.some(h => h.date === dateStr && h.siteId === null);
        const isSiteHoliday = staffSiteId ? holidays.some(h => h.date === dateStr && h.siteId === staffSiteId) : false;

        if(!isWeekend && !isGlobalHoliday && !isSiteHoliday) {
            workingDays++;
        }
    }
    return workingDays;
  }, []);

  useEffect(() => {
    if (userManagementLoading) {
        setLoadingPayrollCalcs(true);
        return;
    }

    if (staffList.length === 0) {
        setPayrollData([]);
        setLoadingPayrollCalcs(false);
        return;
    }

    setLoadingPayrollCalcs(true);
    const uids = staffList.map(s => s.uid);
    
    // Batch UIDs for 'in' queries
    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsBatches.push(uids.slice(i, i + 30));
    }
    
    const firstDayOfMonth = startOfMonth(currentMonth);
    const lastDayOfMonth = endOfMonth(currentMonth);

    const fetchPayrollDependencies = async () => {
        try {
            const [advancesDocs, paymentsDocs, holidaysDocs, attendanceDocs] = await Promise.all([
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), where("staffUid", "in", batch), where("date", ">=", firstDayOfMonth.toISOString()), where("date", "<=", lastDayOfMonth.toISOString()))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "salaryPayments"), where("staffUid", "in", batch), where("forMonth", "==", currentMonth.getMonth() + 1), where("forYear", "==", currentMonth.getFullYear()))))),
                getDocs(query(collection(db, "holidays"), where("date", ">=", format(firstDayOfMonth, 'yyyy-MM-dd')), where("date", "<=", format(lastDayOfMonth, 'yyyy-MM-dd')))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), where("staffUid", "in", batch), where("date", ">=", format(firstDayOfMonth, 'yyyy-MM-dd')), where("date", "<=", format(lastDayOfMonth, 'yyyy-MM-dd'))))))
            ]);

            const advancesMap = new Map<string, number>();
            advancesDocs.flat().forEach(snapshot => snapshot.forEach(doc => {
                const advance = doc.data() as SalaryAdvance;
                advancesMap.set(advance.staffUid, (advancesMap.get(advance.staffUid) || 0) + advance.amount);
            }));
            
            const paymentsMap = new Map<string, number>();
            paymentsDocs.flat().forEach(snapshot => snapshot.forEach(doc => {
                const payment = doc.data() as SalaryPayment;
                paymentsMap.set(payment.staffUid, (paymentsMap.get(payment.staffUid) || 0) + payment.amountPaid);
            }));
            
            const fetchedHolidays = holidaysDocs.docs.map(doc => doc.data() as Holiday);
            
            const attendanceMap = new Map<string, { present: number, halfDay: number }>();
            attendanceDocs.flat().forEach(snapshot => snapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const current = attendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
                if (att.status === 'Present') current.present++;
                if (att.status === 'Half-day') current.halfDay++;
                attendanceMap.set(att.staffUid, current);
            }));

            const newPayrollData = staffList.map(u => {
                const details = staffDetailsMap.get(u.uid) || null;
                const salary = details?.salary || 0;
                const advances = advancesMap.get(u.uid) || 0;
                const paidAmount = paymentsMap.get(u.uid) || 0;
                
                const workingDays = calculateWorkingDays(currentMonth, fetchedHolidays, u.defaultSiteId);
                const attendance = attendanceMap.get(u.uid) || { present: 0, halfDay: 0 };
                const presentDays = attendance.present + (attendance.halfDay * 0.5);
                
                const perDaySalary = workingDays > 0 ? salary / workingDays : 0;
                const earnedSalary = perDaySalary * presentDays;
                
                const netPayable = earnedSalary - advances;

                return {
                    user: u,
                    details,
                    advances,
                    netPayable,
                    paidAmount,
                    isPaid: paidAmount >= netPayable && netPayable > 0,
                    workingDays,
                    presentDays,
                    earnedSalary,
                };
            }).sort((a,b) => (a.user.displayName || "").localeCompare(b.user.displayName || ""));

            setPayrollData(newPayrollData);

        } catch (error: any) {
             console.error("Error fetching payroll details:", error);
            toast({ title: "Error", description: `Could not calculate payroll: ${error.message}`, variant: "destructive" });
        } finally {
            setLoadingPayrollCalcs(false);
        }
    };
    
    fetchPayrollDependencies();

  }, [staffList, staffDetailsMap, currentMonth, toast, calculateWorkingDays, userManagementLoading]);

  const loading = authLoading || userManagementLoading || loadingPayrollCalcs;
  const error = userManagementError;

  if (loading && payrollData.length === 0) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /><p className="ml-2">Loading Payroll Data...</p></div>;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;

  if (!activeSiteId && user?.role !== 'admin') return (
    <div className="space-y-6">
        <PageHeader title="Staff Payroll" description="Calculate net payable salary for staff members."/>
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>Please select a site to manage payroll, or select "All Sites" if you are an administrator.</AlertDescription>
        </Alert>
    </div>
  );

  return (
    <div className="space-y-6">
        <PageHeader title="Staff Payroll" description="Calculate net payable salary for the current month and record payments."/>
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month" disabled={loading}><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month" disabled={loading}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToCurrentMonth} disabled={loading}>Current Month</Button>
        </div>
        {loading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Recalculating payroll...</p></div>
        ) : (
            <PayrollTable data={payrollData} month={currentMonth.getMonth()+1} year={currentMonth.getFullYear()} />
        )}
    </div>
  );
}

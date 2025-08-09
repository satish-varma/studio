
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { AppUser, StaffDetails, SalaryAdvance, SalaryPayment, Site, Holiday, StaffAttendance, UserStatus } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs,
  onSnapshot
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ChevronLeft, ChevronRight, Filter, IndianRupee, HandCoins, CalendarDays } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isAfter, isBefore, max, min, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { PayrollTable } from "@/components/staff/PayrollTable";
import { useUserManagement } from "@/hooks/use-user-management";
import PageHeader from "@/components/shared/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";


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

const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

export default function PayrollClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const {
    users: allUsersForContext,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
    error: userManagementError,
  } = useUserManagement();

  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loadingPayrollCalcs, setLoadingPayrollCalcs] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('active');

  const staffList = useMemo(() => {
    const baseList = allUsersForContext.filter(u => u.role === 'staff' || u.role === 'manager');
    if (statusFilter === 'all') {
      return baseList;
    }
    return baseList.filter(u => (u.status || 'active') === statusFilter);
  }, [allUsersForContext, statusFilter]);
  

  // State for fetched data
  const [monthlyAdvances, setMonthlyAdvances] = useState<Map<string, number>>(new Map());
  const [monthlyPayments, setMonthlyPayments] = useState<Map<string, number>>(new Map());
  const [monthlyHolidays, setMonthlyHolidays] = useState<Holiday[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<Map<string, { present: number, halfDay: number }>>(new Map());
  
  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToCurrentMonth = () => setCurrentMonth(new Date());

  const calculateWorkingDaysForEmployee = useCallback((month: Date, holidays: Holiday[], staff: AppUser, details: StaffDetails | null) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const joiningDate = details?.joiningDate ? startOfDay(new Date(details.joiningDate)) : null;
    const exitDate = details?.exitDate ? startOfDay(new Date(details.exitDate)) : null;

    const effectiveStartDate = joiningDate ? max([monthStart, joiningDate]) : monthStart;
    const effectiveEndDate = exitDate ? min([monthEnd, exitDate]) : monthEnd;
    
    if (isAfter(effectiveStartDate, effectiveEndDate)) return 0;

    let workingDays = 0;
    let currentDate = new Date(effectiveStartDate); 

    while(currentDate <= effectiveEndDate) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isGlobalHoliday = holidays.some(h => h.date === dateStr && h.siteId === null);
      const isSiteHoliday = staff.defaultSiteId ? holidays.some(h => h.date === dateStr && h.siteId === staff.defaultSiteId) : false;

      if (!isWeekend && !isGlobalHoliday && !isSiteHoliday) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  }, []);
  
  // Effect for one-time fetches per month (advances, payments, holidays)
  useEffect(() => {
    if (userManagementLoading || staffList.length === 0) {
        if(!userManagementLoading) setLoadingPayrollCalcs(false);
        return;
    }

    setLoadingPayrollCalcs(true);
    const uids = staffList.map(s => s.uid);
    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsBatches.push(uids.slice(i, i + 30));
    }
    
    const firstDayOfMonth = startOfMonth(currentMonth);
    const lastDayOfMonth = endOfMonth(currentMonth);

    const fetchStaticData = async () => {
        try {
            const [advancesDocs, paymentsDocs, holidaysDocs] = await Promise.all([
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), where("staffUid", "in", batch), where("date", ">=", firstDayOfMonth.toISOString()), where("date", "<=", lastDayOfMonth.toISOString()))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "salaryPayments"), where("staffUid", "in", batch), where("forMonth", "==", currentMonth.getMonth() + 1), where("forYear", "==", currentMonth.getFullYear()))))),
                getDocs(query(collection(db, "holidays"), where("date", ">=", format(firstDayOfMonth, 'yyyy-MM-dd')), where("date", "<=", format(lastDayOfMonth, 'yyyy-MM-dd'))))
            ]);

            const advancesMap = new Map<string, number>();
            advancesDocs.flat().forEach(snapshot => snapshot.forEach(doc => {
                const advance = doc.data() as SalaryAdvance;
                advancesMap.set(advance.staffUid, (advancesMap.get(advance.staffUid) || 0) + advance.amount);
            }));
            setMonthlyAdvances(advancesMap);

            const paymentsMap = new Map<string, number>();
            paymentsDocs.flat().forEach(snapshot => snapshot.forEach(doc => {
                const payment = doc.data() as SalaryPayment;
                paymentsMap.set(payment.staffUid, (paymentsMap.get(payment.staffUid) || 0) + payment.amountPaid);
            }));
            setMonthlyPayments(paymentsMap);

            setMonthlyHolidays(holidaysDocs.docs.map(doc => doc.data() as Holiday));
        } catch (error: any) {
            console.error("Error fetching payroll static details:", error);
            toast({ title: "Error", description: `Could not load advances/payments: ${error.message}`, variant: "destructive" });
        }
    };
    fetchStaticData();
  }, [staffList, currentMonth, toast, userManagementLoading]);

  // Dedicated real-time effect for attendance
  useEffect(() => {
    if (userManagementLoading || staffList.length === 0) return;

    setLoadingPayrollCalcs(true);
    const uids = staffList.map(s => s.uid);
    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsBatches.push(uids.slice(i, i + 30));
    }
    
    const firstDayOfMonth = startOfMonth(currentMonth);
    const lastDayOfMonth = endOfMonth(currentMonth);

    const unsubscribers = uidsBatches.map(batch => {
      if (batch.length === 0) return () => {};
      const q = query(collection(db, "staffAttendance"), 
        where("staffUid", "in", batch),
        where("date", ">=", format(firstDayOfMonth, 'yyyy-MM-dd')),
        where("date", "<=", format(lastDayOfMonth, 'yyyy-MM-dd'))
      );
      return onSnapshot(q, (snapshot) => {
          setMonthlyAttendance(prevMap => {
              const newMap = new Map(prevMap);
              // First, clear old entries for this batch to handle deletions
              batch.forEach(uid => newMap.delete(uid));
              // Then, process new data
              const batchAttendanceMap = new Map<string, { present: number, halfDay: number }>();
              snapshot.forEach(doc => {
                  const att = doc.data() as StaffAttendance;
                  const current = batchAttendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
                  if (att.status === 'Present') current.present++;
                  if (att.status === 'Half-day') current.halfDay++;
                  batchAttendanceMap.set(att.staffUid, current);
              });
              batchAttendanceMap.forEach((value, key) => newMap.set(key, value));
              return newMap;
          });
          setLoadingPayrollCalcs(false); // Mark loading as false once listener is active
      }, (error) => {
          console.error("Error on attendance snapshot:", error);
          toast({ title: "Real-time Error", description: "Could not get live attendance updates.", variant: "destructive" });
          setLoadingPayrollCalcs(false);
      });
    });

    return () => unsubscribers.forEach(unsub => unsub());

  }, [staffList, currentMonth, toast, userManagementLoading]);


  // Effect to re-calculate payroll whenever any data changes
  useEffect(() => {
    if (userManagementLoading) return;
    setLoadingPayrollCalcs(true);
    const newPayrollData = staffList.map(u => {
      const details = staffDetailsMap.get(u.uid) || null;
      const salary = details?.salary || 0;
      const advances = monthlyAdvances.get(u.uid) || 0;
      const paidAmount = monthlyPayments.get(u.uid) || 0;
      
      const workingDays = calculateWorkingDaysForEmployee(currentMonth, monthlyHolidays, u, details);
      const attendance = monthlyAttendance.get(u.uid) || { present: 0, halfDay: 0 };
      const presentDays = attendance.present + (attendance.halfDay * 0.5);
      
      const perDaySalary = workingDays > 0 ? salary / workingDays : 0;
      const earnedSalary = perDaySalary * presentDays;
      
      const netPayable = earnedSalary - advances;

      return {
          user: u, details, advances, netPayable, paidAmount,
          isPaid: paidAmount >= netPayable && netPayable > 0,
          workingDays, presentDays, earnedSalary,
      };
    }).sort((a,b) => (a.user.displayName || "").localeCompare(b.user.displayName || ""));
    
    setPayrollData(newPayrollData);
    setLoadingPayrollCalcs(false);
  }, [staffList, staffDetailsMap, monthlyAdvances, monthlyPayments, monthlyHolidays, monthlyAttendance, currentMonth, calculateWorkingDaysForEmployee, userManagementLoading]);

  const totalNetPayable = useMemo(() => {
    return payrollData.reduce((acc, item) => acc + (item.netPayable > item.paidAmount ? item.netPayable - item.paidAmount : 0), 0);
  }, [payrollData]);

  const totalEarnedSalary = useMemo(() => {
    return payrollData.reduce((acc, item) => acc + item.earnedSalary, 0);
  }, [payrollData]);

  const totalAdvances = useMemo(() => {
    return payrollData.reduce((acc, item) => acc + item.advances, 0);
  }, [payrollData]);

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month" disabled={loading}><ChevronLeft className="h-4 w-4" /></Button>
                <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
                <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month" disabled={loading}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="outline" onClick={handleGoToCurrentMonth} disabled={loading}>Current Month</Button>
            </div>
             <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                  <SelectTrigger className="w-[180px] bg-input">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active Staff</SelectItem>
                    <SelectItem value="inactive">Inactive Staff</SelectItem>
                    <SelectItem value="all">All Staff</SelectItem>
                  </SelectContent>
                </Select>
            </div>
        </div>

         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earned Salary</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-8 w-32" /> : formatCurrency(totalEarnedSalary)}
              </div>
              <p className="text-xs text-muted-foreground">Based on attendance for {format(currentMonth, "MMMM")}</p>
            </CardContent>
          </Card>
           <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Advances Paid</CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {loading ? <Skeleton className="h-8 w-28" /> : formatCurrency(totalAdvances)}
              </div>
              <p className="text-xs text-muted-foreground">Advances given in {format(currentMonth, "MMMM")}</p>
            </CardContent>
          </Card>
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Net Payable (Outstanding)</CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                {loading ? <Skeleton className="h-8 w-32" /> : formatCurrency(totalNetPayable)}
              </div>
              <p className="text-xs text-muted-foreground">Amount left to be paid for {format(currentMonth, "MMMM")}</p>
            </CardContent>
          </Card>
        </div>

        {loading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Recalculating payroll...</p></div>
        ) : (
            <PayrollTable data={payrollData} month={currentMonth.getMonth()+1} year={currentMonth.getFullYear()} />
        )}
    </div>
  );
}

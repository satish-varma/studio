
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { AppUser, StaffDetails, SalaryAdvance, SalaryPayment, Site, Holiday, UserStatus, StaffAttendance } from "@/types";
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
import { Loader2, Info, ChevronLeft, ChevronRight, Filter, IndianRupee, HandCoins, CalendarDays, Wallet, Building } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isAfter, isBefore, max, min, startOfDay, getDate } from "date-fns";
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
    sites, // Now using sites from the hook
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
    error: userManagementError,
  } = useUserManagement();

  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [loadingPayrollCalcs, setLoadingPayrollCalcs] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('active');
  const [siteFilter, setSiteFilter] = useState<string>('all'); // New state for site filter

  const staffList = useMemo(() => {
    // This hook now correctly returns all users for admin, or users from managed sites for manager
    return allUsersForContext.filter(u => u.role === 'staff' || u.role === 'manager');
  }, [allUsersForContext]);
  
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
      
      const siteIdForHolidayCheck = staff.role === 'manager' ? null : staff.defaultSiteId;
      const isSiteHoliday = siteIdForHolidayCheck ? holidays.some(h => h.date === dateStr && h.siteId === siteIdForHolidayCheck) : false;

      if (!isWeekend && !isGlobalHoliday && !isSiteHoliday) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return workingDays;
  }, []);
  
  const refetchData = useCallback(async () => {
    if (userManagementLoading || staffList.length === 0 || !db) {
        console.log(`${LOG_PREFIX} refetchData skipped. Loading: ${userManagementLoading}, StaffCount: ${staffList.length}`);
        return;
    }
    console.log(`${LOG_PREFIX} refetchData triggered.`);

    setLoadingPayrollCalcs(true);

    const uids = staffList.map(s => s.uid);
    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsBatches.push(uids.slice(i, i + 30));
    }

    const payrollMonthStart = startOfMonth(currentMonth);
    const payrollMonthEnd = endOfMonth(currentMonth);
    
    try {
        const [advancesSnapshots, paymentsSnapshots, holidaysSnapshot, attendanceSnapshots] = await Promise.all([
            // Query for advances FOR this payroll month
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), where("staffUid", "in", batch), where("forMonth", "==", currentMonth.getMonth() + 1), where("forYear", "==", currentMonth.getFullYear()))))),
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "salaryPayments"), where("staffUid", "in", batch), where("forMonth", "==", currentMonth.getMonth() + 1), where("forYear", "==", currentMonth.getFullYear()))))),
            getDocs(query(collection(db, "holidays"), where("date", ">=", format(payrollMonthStart, 'yyyy-MM-dd')), where("date", "<=", format(payrollMonthEnd, 'yyyy-MM-dd')))),
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), where("staffUid", "in", batch), where("date", ">=", format(payrollMonthStart, 'yyyy-MM-dd')), where("date", "<=", format(payrollMonthEnd, 'yyyy-MM-dd')))))),
        ]);
        
        const newAdvancesMap = new Map<string, number>();
        advancesSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
            const data = doc.data() as SalaryAdvance;
            newAdvancesMap.set(data.staffUid, (newAdvancesMap.get(data.staffUid) || 0) + data.amount);
        }));
        setMonthlyAdvances(newAdvancesMap);

        const newPaymentsMap = new Map<string, number>();
        paymentsSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
            const payment = doc.data() as SalaryPayment;
            newPaymentsMap.set(payment.staffUid, (newPaymentsMap.get(payment.staffUid) || 0) + payment.amountPaid);
        }));
        setMonthlyPayments(newPaymentsMap);
        
        setMonthlyHolidays(holidaysSnapshot.docs.map(doc => doc.data() as Holiday));

        const newAttendanceMap = new Map<string, { present: number, halfDay: number }>();
        attendanceSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
            const att = doc.data() as StaffAttendance;
            const current = newAttendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
            if (att.status === 'Present') current.present++;
            if (att.status === 'Half-day') current.halfDay++;
            newAttendanceMap.set(att.staffUid, current);
        }));
        setMonthlyAttendance(newAttendanceMap);

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error in refetchData:`, error);
        toast({ title: "Error Refetching Payroll Data", description: error.message, variant: "destructive"});
    }
  }, [staffList, currentMonth, toast, userManagementLoading, db]);

  // Effect to re-calculate payroll whenever any data changes
  useEffect(() => {
    if (userManagementLoading || staffList.length === 0) {
      if(!userManagementLoading) setLoadingPayrollCalcs(false);
      return;
    }
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

  // Initial and month-change data fetch
  useEffect(() => {
    refetchData();
  }, [currentMonth, refetchData]);

  const filteredPayrollData = useMemo(() => {
    let siteFilteredData = payrollData;
    if (user?.role === 'admin' && siteFilter !== 'all') {
      siteFilteredData = payrollData.filter(p => {
        if(p.user.role === 'manager') {
            return p.user.managedSiteIds?.includes(siteFilter);
        }
        return p.user.defaultSiteId === siteFilter;
      });
    } else if (user?.role === 'manager' && activeSiteId) {
      siteFilteredData = payrollData.filter(p => {
         if(p.user.role === 'manager') {
            return p.user.managedSiteIds?.includes(activeSiteId);
        }
        return p.user.defaultSiteId === activeSiteId;
      });
    }
    
    if (statusFilter === 'all') {
      return siteFilteredData;
    }
    return siteFilteredData.filter(p => (p.user.status || 'active') === statusFilter);
  }, [payrollData, statusFilter, siteFilter, user?.role, activeSiteId]);
  

  const totalProjectedSalary = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    return filteredPayrollData.reduce((acc, item) => {
        const details = item.details;
        if (details?.exitDate && isBefore(new Date(details.exitDate), monthStart)) {
            return acc;
        }
        if(item.user.role === 'manager' && siteFilter !== 'all') {
            const managedCount = item.user.managedSiteIds?.length || 1;
            return acc + ((details?.salary || 0) / managedCount);
        }
        return acc + (details?.salary || 0);
    }, 0);
  }, [filteredPayrollData, currentMonth, siteFilter]);

  const totalNetPayable = useMemo(() => {
    return filteredPayrollData.reduce((acc, item) => {
        let net = item.netPayable > item.paidAmount ? item.netPayable - item.paidAmount : 0;
        if(item.user.role === 'manager' && siteFilter !== 'all') {
            const managedCount = item.user.managedSiteIds?.length || 1;
            net = net / managedCount;
        }
        return acc + net;
    }, 0);
  }, [filteredPayrollData, siteFilter]);

  const totalEarnedSalary = useMemo(() => {
    return filteredPayrollData.reduce((acc, item) => {
        let earned = item.earnedSalary;
        if(item.user.role === 'manager' && siteFilter !== 'all') {
            const managedCount = item.user.managedSiteIds?.length || 1;
            earned = earned / managedCount;
        }
        return acc + earned;
    }, 0);
  }, [filteredPayrollData, siteFilter]);

  const totalAdvances = useMemo(() => {
    return filteredPayrollData.reduce((acc, item) => {
        let adv = item.advances;
        if(item.user.role === 'manager' && siteFilter !== 'all') {
            const managedCount = item.user.managedSiteIds?.length || 1;
            adv = adv / managedCount;
        }
        return acc + adv;
    }, 0);
  }, [filteredPayrollData, siteFilter]);

  const loading = authLoading || userManagementLoading || loadingPayrollCalcs;
  const error = userManagementError;

  if (loading && payrollData.length === 0) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /><p className="ml-2">Loading Payroll Data...</p></div>;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;

  if (!activeSiteId && user?.role === 'manager') return (
    <div className="space-y-6">
        <PageHeader title="Staff Payroll" description="Calculate net payable salary for staff members."/>
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>Please select a site to manage payroll.</AlertDescription>
        </Alert>
    </div>
  );

  return (
    <div className="space-y-6">
        <PageHeader title="Staff Payroll" description="Calculate net payable salary for the current month and record payments."/>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month" disabled={loading}><ChevronLeft className="h-4 w-4" /></Button>
                <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
                <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month" disabled={loading}><ChevronRight className="h-4 w-4" /></Button>
                <Button variant="outline" onClick={handleGoToCurrentMonth} disabled={loading}>Current Month</Button>
            </div>
             <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-input">
                    <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active Staff</SelectItem>
                    <SelectItem value="inactive">Inactive Staff</SelectItem>
                    <SelectItem value="all">All Staff</SelectItem>
                  </SelectContent>
                </Select>
                {user?.role === 'admin' && (
                    <Select value={siteFilter} onValueChange={setSiteFilter}>
                      <SelectTrigger className="w-full sm:w-[180px] bg-input">
                        <Building className="mr-2 h-4 w-4 text-muted-foreground"/>
                        <SelectValue placeholder="Filter by site" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sites</SelectItem>
                        {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                )}
            </div>
        </div>

         <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Projected Salary</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? <Skeleton className="h-8 w-32" /> : formatCurrency(totalProjectedSalary)}
              </div>
              <p className="text-xs text-muted-foreground">Total base salary of filtered staff</p>
            </CardContent>
          </Card>
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
              <CardTitle className="text-sm font-medium">Total Advances (for {format(currentMonth, "MMM")})</CardTitle>
              <HandCoins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {loading ? <Skeleton className="h-8 w-28" /> : formatCurrency(totalAdvances)}
              </div>
              <p className="text-xs text-muted-foreground">Advances applied to this month's payroll</p>
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
            <PayrollTable data={filteredPayrollData} month={currentMonth.getMonth()+1} year={currentMonth.getFullYear()} onPaymentSuccess={refetchData} />
        )}
    </div>
  );
}

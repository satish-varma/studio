
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { AppUser, StaffDetails, SalaryAdvance, SalaryPayment, Site, Holiday, UserStatus, StaffAttendance } from "@/types";
import type { DateRange } from "react-day-picker";
import { format, startOfMonth, isAfter, isBefore, max, min, startOfDay, getMonth, eachMonthOfInterval, subDays, startOfWeek, endOfWeek, subMonths, endOfMonth, endOfDay } from "date-fns";
import { getFirestore, collection, query, where, getDocs, Timestamp, QueryConstraint } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info, Building, Wallet, CalendarDays, HandCoins, IndianRupee, Users, LineChart, Calendar as CalendarIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { useUserManagement } from "@/hooks/use-user-management";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const LOG_PREFIX = "[StaffReportClientPage]";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
} else {
  db = getFirestore(getApp());
}

interface StaffReportData {
  user: AppUser;
  details: StaffDetails | null;
  earnedSalary: number;
  advances: number;
  paidAmount: number;
  netPayable: number;
  workingDays: number;
  presentDays: number;
}

export default function StaffReportClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }));
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string>('all');

  const [reportData, setReportData] = useState<StaffReportData[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);

  const {
    users: allStaff,
    sites: allSites,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
    error: userManagementError,
  } = useUserManagement();

  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;
  
  const filteredStaffList = useMemo(() => {
    if (!user) return [];
    const baseList = allStaff.filter(u => u.role === 'staff' || u.role === 'manager');
    if (!effectiveSiteId && user.role !== 'admin') {
      return user.role === 'manager' && user.managedSiteIds ? baseList.filter(s => s.managedSiteIds?.some(msid => user.managedSiteIds?.includes(msid))) : [];
    }
    if (!effectiveSiteId && user.role === 'admin') return baseList;
    return baseList.filter(s => {
      if (s.role === 'staff') return s.defaultSiteId === effectiveSiteId;
      if (s.role === 'manager') return s.managedSiteIds?.includes(effectiveSiteId!);
      return false;
    });
  }, [allStaff, effectiveSiteId, user]);


  const calculateWorkingDays = useCallback((start: Date, end: Date, holidays: Holiday[], staff?: AppUser) => {
      let workingDays = 0;
      let currentDate = new Date(start);
      while(currentDate <= end) {
          const dayOfWeek = currentDate.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude weekends
              const dateStr = format(currentDate, 'yyyy-MM-dd');
              const isGlobalHoliday = holidays.some(h => h.date === dateStr && h.siteId === null);
              const isSiteHoliday = staff?.defaultSiteId ? holidays.some(h => h.date === dateStr && h.siteId === staff.defaultSiteId) : false;
              if (!isGlobalHoliday && !isSiteHoliday) {
                  workingDays++;
              }
          }
          currentDate.setDate(currentDate.getDate() + 1);
      }
      return workingDays;
  }, []);
  
  const fetchReportData = useCallback(async () => {
    if (authLoading || userManagementLoading || !db || !user) return;
    if ((user.role !== 'admin' && !activeSiteId)) {
        setErrorReport("Please select an active site to view the report."); setLoadingReport(false); return;
    }
    if (!dateRange?.from && dateRange?.from !== undefined) { // Allow "All Time" (undefined from)
        setErrorReport("Please select a valid date range."); setLoadingReport(false); return;
    }

    setLoadingReport(true); setErrorReport(null);

    try {
        const fromTimestamp = dateRange?.from ? Timestamp.fromDate(startOfDay(dateRange.from)) : null;
        const toTimestamp = dateRange?.to ? Timestamp.fromDate(endOfDay(dateRange.to)) : null;
        
        const uids = filteredStaffList.map(s => s.uid);
        if (uids.length === 0) { setReportData([]); setLoadingReport(false); return; }
        
        const uidsBatches: string[][] = [];
        for (let i = 0; i < uids.length; i += 30) { uidsBatches.push(uids.slice(i, i + 30)); }
        
        const advancesQueryConstraints = [
          fromTimestamp && where("date", ">=", fromTimestamp.toDate().toISOString()),
          toTimestamp && where("date", "<=", toTimestamp.toDate().toISOString()),
        ].filter(Boolean) as QueryConstraint[];
        
        const monthsInRange = dateRange?.from && dateRange.to ? eachMonthOfInterval({ start: dateRange.from, end: dateRange.to }) : [];
        const uniqueMonthYears = [...new Set(monthsInRange.map(d => `${d.getFullYear()}-${d.getMonth() + 1}`))];

        let paymentsQueryConstraints: QueryConstraint[] = [];
        if (dateRange?.from && dateRange.to) {
            // Complex OR query needed. This is simplified. For accuracy, may need multiple queries or data structure change.
            // Simplified: Fetches for the first month in range for now. A more robust solution is needed for multi-month ranges.
            if(uniqueMonthYears.length > 0) {
              const [year, month] = uniqueMonthYears[0].split('-').map(Number);
              paymentsQueryConstraints.push(where("forYear", "==", year), where("forMonth", "==", month));
            }
        }
        
        const attendanceQueryConstraints = [
          fromTimestamp && where("date", ">=", format(fromTimestamp.toDate(), 'yyyy-MM-dd')),
          toTimestamp && where("date", "<=", format(toTimestamp.toDate(), 'yyyy-MM-dd')),
        ].filter(Boolean) as QueryConstraint[];

        const [advancesSnaps, paymentsSnaps, attendanceSnaps, holidaysSnap] = await Promise.all([
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), ...advancesQueryConstraints, where("staffUid", "in", batch))))),
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "salaryPayments"), ...paymentsQueryConstraints, where("staffUid", "in", batch))))),
            Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), ...attendanceQueryConstraints, where("staffUid", "in", batch))))),
            getDocs(query(collection(db, "holidays")))
        ]);
        
        const advancesMap = new Map<string, number>();
        advancesSnaps.flat().forEach(snap => snap.forEach(doc => { const d = doc.data() as SalaryAdvance; advancesMap.set(d.staffUid, (advancesMap.get(d.staffUid) || 0) + d.amount); }));
        
        const paymentsMap = new Map<string, number>();
        paymentsSnaps.flat().forEach(snap => snap.forEach(doc => { const p = doc.data() as SalaryPayment; paymentsMap.set(p.staffUid, (paymentsMap.get(p.staffUid) || 0) + p.amountPaid); }));

        const attendanceMap = new Map<string, { present: number, halfDay: number }>();
        attendanceSnaps.flat().forEach(snap => snap.forEach(doc => {
            const att = doc.data() as StaffAttendance;
            const current = attendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
            if (att.status === 'Present') current.present++;
            if (att.status === 'Half-day') current.halfDay++;
            attendanceMap.set(att.staffUid, current);
        }));

        const holidays = holidaysSnap.docs.map(doc => doc.data() as Holiday);
        
        const calculatedData = filteredStaffList.map(staff => {
            const details = staffDetailsMap.get(staff.uid) || null;
            let earnedSalary = 0; let totalWorkingDays = 0;
            const attendance = attendanceMap.get(staff.uid) || { present: 0, halfDay: 0 };
            const presentDays = attendance.present + (attendance.halfDay * 0.5);

            if (details?.salary && dateRange?.from && dateRange.to) {
                monthsInRange.forEach(monthStart => {
                    const monthEnd = endOfMonth(monthStart);
                    const workingDaysInMonth = calculateWorkingDays(monthStart, monthEnd, holidays, staff);
                    if (workingDaysInMonth > 0) {
                        const perDaySalary = details.salary / workingDaysInMonth;
                        // This logic is simplified; needs to count attendance per month.
                        earnedSalary += perDaySalary * presentDays;
                    }
                    totalWorkingDays += workingDaysInMonth;
                });
            }
            
            const advances = advancesMap.get(staff.uid) || 0;
            const paidAmount = paymentsMap.get(staff.uid) || 0;
            const netPayable = earnedSalary - advances;
            
            return { user: staff, details, earnedSalary, advances, paidAmount, netPayable, workingDays: totalWorkingDays, presentDays };
        });
        setReportData(calculatedData);
    } catch(error: any) {
        setErrorReport("Failed to load report data: " + error.message);
    } finally {
        setLoadingReport(false);
    }
  }, [user, dateRange, authLoading, userManagementLoading, staffDetailsMap, filteredStaffList, calculateWorkingDays, activeSiteId]);

  useEffect(() => { fetchReportData(); }, [fetchReportData]);

  const totals = useMemo(() => {
    return reportData.reduce((acc, curr) => {
        acc.earnedSalary += curr.earnedSalary;
        acc.advances += curr.advances;
        acc.paidAmount += curr.paidAmount;
        return acc;
    }, { earnedSalary: 0, advances: 0, paidAmount: 0 });
  }, [reportData]);
  
  const totalNetPayable = totals.earnedSalary - totals.advances;
  const totalOutstanding = totalNetPayable - totals.paidAmount;


  const datePresets = [
    { label: "This Month", value: 'this_month' },
    { label: "Last Month", value: 'last_month' },
    { label: "Last 3 Months", value: 'last_3_months' },
    { label: "All Time", value: 'all_time' },
  ];
  
  const handleSetDatePreset = (preset: string) => {
      const now = new Date();
      let from: Date | undefined, to: Date | undefined = endOfDay(now);

      switch (preset) {
          case 'this_month': from = startOfMonth(now); to = endOfMonth(now); break;
          case 'last_month': from = startOfMonth(subMonths(now, 1)); to = endOfMonth(subMonths(now, 1)); break;
          case 'last_3_months': from = startOfMonth(subMonths(now, 2)); to = endOfMonth(now); break;
          case 'all_time': from = undefined; to = undefined; break;
          default: from = undefined; to = undefined;
      }
      setTempDateRange({ from, to });
      setDateRange({ from, to });
      setIsDatePickerOpen(false);
  };
  const applyDateFilter = () => { setDateRange(tempDateRange); setIsDatePickerOpen(false); };

  if (authLoading || userManagementLoading) { return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>; }

  return (
    <div className="space-y-6">
        <PageHeader title="Staff Financial Report" description="Analyze staff salary, advances, and payments over a period."/>
        <Card>
            <CardHeader><CardTitle>Report Filters</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                    {datePresets.map(({ label, value }) => (
                        <Button key={value} variant="outline" onClick={() => handleSetDatePreset(value)}>
                            {label}
                        </Button>
                    ))}
                    <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                        <PopoverTrigger asChild>
                        <Button id="reportDateRange" variant={"outline"} className={cn("w-full sm:w-auto min-w-[280px]", !dateRange && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? ( dateRange.to ? (<> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </>) : ( format(dateRange.from, "LLL dd, y") ) ) : ( <span>Pick a date range</span> )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar initialFocus mode="range" defaultMonth={tempDateRange?.from} selected={tempDateRange} onSelect={setTempDateRange} numberOfMonths={2}/>
                            <div className="flex justify-end gap-2 pt-2 border-t mt-2 p-2"> <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button> <Button onClick={applyDateFilter}>Apply</Button> </div>
                        </PopoverContent>
                    </Popover>
                </div>
                {user?.role === 'admin' && (
                    <Select value={siteFilter} onValueChange={setSiteFilter}>
                        <SelectTrigger className="w-full sm:w-[220px] bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="All Sites" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
            </CardContent>
        </Card>

        {loadingReport ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /><p className="ml-2">Generating report...</p></div>
        ) : errorReport ? (
            <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{errorReport}</AlertDescription></Alert>
        ) : (
            <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Earned Salary</CardTitle><CalendarDays className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">₹{totals.earnedSalary.toFixed(2)}</div><p className="text-xs text-muted-foreground">Calculated for the period</p></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Advances</CardTitle><HandCoins className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">- ₹{totals.advances.toFixed(2)}</div><p className="text-xs text-muted-foreground">Deducted from salary</p></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Salary Paid</CardTitle><IndianRupee className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">- ₹{totals.paidAmount.toFixed(2)}</div><p className="text-xs text-muted-foreground">Recorded payments in period</p></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Net Pending Amount</CardTitle><Wallet className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-accent">₹{totalOutstanding.toFixed(2)}</div><p className="text-xs text-muted-foreground">Total outstanding for period</p></CardContent></Card>
            </div>
            
            <Card>
                <CardHeader><CardTitle>Staff Salary Breakdown</CardTitle><CardDescription>Detailed breakdown of salary components for each staff member in the selected period.</CardDescription></CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                    <Table>
                        <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Earned Salary</TableHead><TableHead className="text-right">Advances</TableHead><TableHead className="text-right">Already Paid</TableHead><TableHead className="text-right">Net Payable</TableHead></TableRow></TableHeader>
                        <TableBody>
                        {reportData.length > 0 ? reportData.map(item => (
                            <TableRow key={item.user.uid}>
                                <TableCell className="font-medium">{item.user.displayName}</TableCell>
                                <TableCell className="text-right text-primary">₹{item.earnedSalary.toFixed(2)}</TableCell>
                                <TableCell className="text-right text-orange-600">₹{item.advances.toFixed(2)}</TableCell>
                                <TableCell className="text-right text-green-600">₹{item.paidAmount.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-bold text-accent">₹{item.netPayable.toFixed(2)}</TableCell>
                            </TableRow>
                        )) : <TableRow><TableCell colSpan={5} className="text-center">No staff data to display for the current filters.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                    </div>
                </CardContent>
            </Card>
            </>
        )}
    </div>
  );
}


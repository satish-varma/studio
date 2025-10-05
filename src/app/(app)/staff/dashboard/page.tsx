
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserX, UserRoundCheck, HandCoins, CalendarDays, Wallet, Building, Calendar as CalendarIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import type { AppUser, StaffAttendance, SalaryAdvance, Holiday, StaffDetails, Site } from "@/types";
import { format, startOfMonth, endOfMonth, getDaysInMonth, startOfDay, endOfDay, subDays, startOfWeek, subMonths } from "date-fns";
import { Loader2, Info, IndianRupee } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUserManagement } from "@/hooks/use-user-management";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";


const db = getFirestore();
type SummaryViewOption = 'by_projected_salary' | 'by_advances' | 'by_attendance' | 'by_earned_salary' | 'by_today_status';

interface AttendanceSummary {
    uid: string;
    name: string;
    present: number;
    halfDay: number;
}

interface EarnedSalarySummary {
    uid: string;
    name: string;
    earnedSalary: number;
}

export default function StaffDashboardPage() {
    const { user, activeSiteId, loading: authLoading } = useAuth();
    
    const {
        users: allStaff,
        sites: allSites,
        staffDetails: staffDetailsMap,
        loading: userManagementLoading,
        error: userManagementError,
    } = useUserManagement();

    const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
      from: startOfMonth(new Date()),
      to: endOfDay(new Date()),
    }));
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    
    const [siteFilter, setSiteFilter] = useState<string>('all');

    const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;
    
    const filteredStaffList = useMemo(() => {
        if (!effectiveSiteId) return allStaff;
        return allStaff.filter(s => s.defaultSiteId === effectiveSiteId || (s.role === 'manager' && s.managedSiteIds?.includes(effectiveSiteId)));
    }, [allStaff, effectiveSiteId]);


    const [stats, setStats] = useState({ 
        totalStaff: 0, 
        presentToday: 0, 
        advancesForPeriod: 0, 
        notPresentToday: 0,
        salaryForPeriod: 0,
        projectedSalary: 0,
    });
    const [recentAdvances, setRecentAdvances] = useState<SalaryAdvance[]>([]);
    const [advancesSummary, setAdvancesSummary] = useState<{uid: string, name: string, totalAmount: number}[]>([]);
    const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary[]>([]);
    const [earnedSalarySummary, setEarnedSalarySummary] = useState<EarnedSalarySummary[]>([]);
    const [staffOnLeaveOrAbsent, setStaffOnLeaveOrAbsent] = useState<StaffAttendance[]>([]);
    const [loadingCalculations, setLoadingCalculations] = useState(true);
    const [summaryView, setSummaryView] = useState<SummaryViewOption>('by_projected_salary');

    const getStaffName = useCallback((uid: string) => {
        return allStaff.find(s => s.uid === uid)?.displayName || uid.substring(0, 8);
    }, [allStaff]);

    const isHoliday = useCallback((date: Date, holidays: Holiday[], staffSiteId?: string | null) => {
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Assuming Saturday (6) and Sunday (0) are weekends
            return true;
        }
        const dateStr = format(date, 'yyyy-MM-dd');
        const isGlobalHoliday = holidays.some(h => h.date === dateStr && h.siteId === null);
        if (isGlobalHoliday) return true;

        if (staffSiteId) {
            const isSiteHoliday = holidays.some(h => h.date === dateStr && h.siteId === staffSiteId);
            if (isSiteHoliday) return true;
        }
        return false;
    }, []);

    const calculateWorkingDays = useCallback((month: Date, holidays: Holiday[], staff?: AppUser) => {
        const totalDays = getDaysInMonth(month);
        let workingDays = 0;
        for (let i = 1; i <= totalDays; i++) {
            const currentDate = new Date(month.getFullYear(), month.getMonth(), i);
            if (!isHoliday(currentDate, holidays, staff?.defaultSiteId)) { 
                workingDays++;
            }
        }
        return workingDays;
    }, [isHoliday]);

    useEffect(() => {
        if (userManagementLoading || filteredStaffList.length === 0) {
            if (!userManagementLoading) {
                setLoadingCalculations(false);
                setStats({ totalStaff: 0, presentToday: 0, advancesForPeriod: 0, notPresentToday: 0, salaryForPeriod: 0, projectedSalary: 0 });
                setRecentAdvances([]);
                setAdvancesSummary([]);
                setAttendanceSummary([]);
                setEarnedSalarySummary([]);
                setStaffOnLeaveOrAbsent([]);
            }
            return;
        }

        setLoadingCalculations(true);
        const staffUids = filteredStaffList.map(s => s.uid);
        
        const uidsBatches: string[][] = [];
        for (let i = 0; i < staffUids.length; i += 30) {
            uidsBatches.push(staffUids.slice(i, i + 30));
        }
        
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : undefined;
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : undefined;

        const fetchDependencies = async () => {
            const advancesQueryConstraints = fromDate && toDate
                ? [where("date", ">=", fromDate.toISOString()), where("date", "<=", toDate.toISOString())]
                : [];
            
            const attendanceQueryConstraints = fromDate && toDate
                ? [where("date", ">=", format(fromDate, 'yyyy-MM-dd')), where("date", "<=", format(toDate, 'yyyy-MM-dd'))]
                : [];

            const [
                advancesSnapshots, 
                attendanceTodaySnapshots,
                attendancePeriodSnapshots,
                holidaysSnapshot
            ] = await Promise.all([
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), ...advancesQueryConstraints, where("staffUid", "in", batch))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), where("date", "==", todayStr), where("staffUid", "in", batch))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), ...attendanceQueryConstraints, where("staffUid", "in", batch))))),
                getDocs(query(collection(db, "holidays")))
            ]);
            
            const allAdvances = advancesSnapshots.flat().flatMap(s => s.docs.map(doc => ({id: doc.id, ...doc.data()} as SalaryAdvance)));
            const totalAdvance = allAdvances.reduce((sum, adv) => sum + adv.amount, 0);
            
            const advancesByStaff: Record<string, number> = {};
            allAdvances.forEach(adv => { advancesByStaff[adv.staffUid] = (advancesByStaff[adv.staffUid] || 0) + adv.amount; });
            setAdvancesSummary(Object.entries(advancesByStaff).map(([uid, totalAmount]) => ({ uid, name: getStaffName(uid), totalAmount })).sort((a,b) => b.totalAmount - a.totalAmount));
            setRecentAdvances(allAdvances.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5));

            const attendanceTodayDocs = attendanceTodaySnapshots.flat().flatMap(s => s.docs);
            const activeStaffList = filteredStaffList.filter(s => (s.role === 'staff' || s.role === 'manager') && (s.status === 'active' || !s.status));
            const activeStaffCount = activeStaffList.length;

            const notPresentRecords = attendanceTodayDocs.filter(doc => ['Leave', 'Absent', 'Half-day'].includes((doc.data() as StaffAttendance).status)).map(doc => ({ id: doc.id, ...doc.data() } as StaffAttendance));
            
            const presentTodayUids = new Set(attendanceTodayDocs
                .filter(doc => (doc.data() as StaffAttendance).status === 'Present' || (doc.data() as StaffAttendance).status === 'Half-day')
                .map(doc => (doc.data() as StaffAttendance).staffUid)
            );
            const presentCount = activeStaffList.filter(s => presentTodayUids.has(s.uid)).length;

            setStaffOnLeaveOrAbsent(notPresentRecords);
            
            const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
            
            const periodAttendanceMap = new Map<string, {present: number, halfDay: number}>();
            attendancePeriodSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const current = periodAttendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
                if (att.status === 'Present') current.present++;
                if (att.status === 'Half-day') current.halfDay++;
                periodAttendanceMap.set(att.staffUid, current);
            }));

            setAttendanceSummary(Array.from(periodAttendanceMap.entries()).map(([uid, data]) => ({ uid, name: getStaffName(uid), present: data.present, halfDay: data.halfDay })).sort((a,b) => b.present - a.present || b.halfDay - a.halfDay));

            let salaryForPeriod = 0;
            let projectedSalary = 0;
            const earnedSalarySummaryData: EarnedSalarySummary[] = [];
            
            activeStaffList.forEach(staff => {
                const details = staffDetailsMap.get(staff.uid);
                projectedSalary += details?.salary || 0;
                
                if (!fromDate) return; // Cannot calculate earned salary for "All Time"

                const workingDaysInMonth = calculateWorkingDays(startOfMonth(fromDate), holidays, staff);
                
                const attendance = periodAttendanceMap.get(staff.uid);
                if (details?.salary && attendance && workingDaysInMonth > 0) {
                    const perDaySalary = details.salary / workingDaysInMonth;
                    const presentDays = attendance.present + (attendance.halfDay * 0.5);
                    const earned = perDaySalary * presentDays;
                    salaryForPeriod += earned;
                    earnedSalarySummaryData.push({ uid: staff.uid, name: getStaffName(staff.uid), earnedSalary: earned });
                }
            });

            setEarnedSalarySummary(earnedSalarySummaryData.sort((a, b) => b.earnedSalary - a.earnedSalary));
            
            setStats({ 
                totalStaff: activeStaffCount, 
                presentToday: presentCount, 
                advancesForPeriod: totalAdvance, 
                notPresentToday: notPresentRecords.length,
                salaryForPeriod,
                projectedSalary,
            });
            setLoadingCalculations(false);
        };
        fetchDependencies().catch(err => {
            console.error("Failed to fetch dashboard dependencies:", err);
            setLoadingCalculations(false);
        });
        
    }, [userManagementLoading, filteredStaffList, staffDetailsMap, calculateWorkingDays, getStaffName, dateRange]);
    
    const applyDateFilter = () => {
        setDateRange(tempDateRange);
        setIsDatePickerOpen(false);
    };

    const datePresets = [
        { label: "Today", value: 'today' },
        { label: "This Week", value: 'this_week' },
        { label: "This Month", value: 'this_month' },
        { label: "Last Month", value: 'last_month' },
        { label: "Last 3 Months", value: 'last_3_months' },
        { label: "All Time", value: 'all_time' },
    ];
    
    const handleSetDatePreset = (preset: string) => {
        const now = new Date();
        let from: Date | undefined, to: Date | undefined = endOfDay(now);

        switch (preset) {
            case 'today': from = startOfDay(now); break;
            case 'this_week': from = startOfWeek(now); break;
            case 'this_month': from = startOfMonth(now); break;
            case 'last_month': from = startOfMonth(subMonths(now, 1)); to = endOfMonth(subMonths(now, 1)); break;
            case 'last_3_months': from = startOfMonth(subMonths(now, 2)); break;
            case 'all_time': from = undefined; to = undefined; break;
            default: from = undefined; to = undefined;
        }
        setTempDateRange({ from, to });
    };

    const loading = authLoading || userManagementLoading || loadingCalculations;

    if (authLoading || userManagementLoading) {
      return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }
  
    if (!activeSiteId && user?.role !== 'admin') {
      return (
        <div className="space-y-6">
          <PageHeader title="Staff Dashboard" description="Overview of staff attendance, advances, and key metrics." />
           <Alert variant="default" className="border-primary/50">
              <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
              <AlertDescription>Please select a site from the header to view staff management details.</AlertDescription>
          </Alert>
        </div>
      );
    }
    
    if (loading) {
       return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /><p className="ml-2">Loading dashboard data...</p></div>;
    }

    const statCards = [
        { title: "Active Staff", value: stats.totalStaff, icon: Users, description: "Total active staff in this context." },
        { title: "Projected Salary", value: `₹${stats.projectedSalary.toFixed(2)}`, icon: Wallet, description: "Total base salary of active staff." },
        { title: "Salary Bill (Period)", value: `₹${stats.salaryForPeriod.toFixed(2)}`, icon: CalendarDays, description: "Earned salary based on attendance." },
        { title: "Present Today", value: stats.presentToday, icon: UserRoundCheck, description: `${stats.presentToday} of ${stats.totalStaff} staff present.` },
        { title: "Advances (Period)", value: `₹${stats.advancesForPeriod.toFixed(2)}`, icon: HandCoins, description: "Total salary advance in period." },
        { title: "Leave/Absent Today", value: stats.notPresentToday, icon: UserX, description: "Staff not marked as 'Present'." },
    ];

    const getStatusBadge = (status: 'Leave' | 'Absent' | 'Half-day') => {
        switch (status) {
            case 'Absent': return <Badge variant="destructive">Absent</Badge>;
            case 'Leave': return <Badge variant="outline" className="text-amber-600 border-amber-500">Leave</Badge>;
            case 'Half-day': return <Badge variant="secondary">Half-day</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };
    
    const projectedSalaryList = filteredStaffList
        .filter(s => (s.role === 'staff' || s.role === 'manager') && (s.status === 'active' || !s.status))
        .map(s => ({ ...s, salary: staffDetailsMap.get(s.uid)?.salary || 0 }))
        .sort((a,b) => b.salary - a.salary);
        
    const renderPivotTable = () => {
        switch(summaryView) {
            case 'by_projected_salary':
                return (
                    <Table><TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Projected Monthly Salary</TableHead></TableRow></TableHeader>
                        <TableBody>{projectedSalaryList.length > 0 ? projectedSalaryList.map(item => ( <TableRow key={item.uid}><TableCell>{item.displayName}</TableCell><TableCell className="text-right font-medium">₹{item.salary.toFixed(2)}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No active staff with salary data.</TableCell></TableRow>}</TableBody>
                    </Table>
                );
            case 'by_earned_salary':
                return (
                    <Table><TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Earned Salary (Period)</TableHead></TableRow></TableHeader>
                        <TableBody>{earnedSalarySummary.length > 0 ? earnedSalarySummary.map(item => ( <TableRow key={item.uid}><TableCell>{item.name}</TableCell><TableCell className="text-right font-medium">₹{item.earnedSalary.toFixed(2)}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No salary data for this period.</TableCell></TableRow>}</TableBody>
                    </Table>
                );
            case 'by_advances': return ( <Table><TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Total Advances (Period)</TableHead></TableRow></TableHeader><TableBody>{advancesSummary.length > 0 ? advancesSummary.map(item => ( <TableRow key={item.uid}><TableCell>{item.name}</TableCell><TableCell className="text-right font-medium">₹{item.totalAmount.toFixed(2)}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No advances recorded for this period.</TableCell></TableRow>}</TableBody></Table>);
            case 'by_attendance':
                return (
                    <Table><TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-center">Present Days</TableHead><TableHead className="text-center">Half Days</TableHead></TableRow></TableHeader>
                        <TableBody>{attendanceSummary.length > 0 ? attendanceSummary.map(item => ( <TableRow key={item.uid}><TableCell>{item.name}</TableCell><TableCell className="text-center font-medium text-green-600">{item.present}</TableCell><TableCell className="text-center font-medium text-blue-600">{item.halfDay}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No attendance data for this period.</TableCell></TableRow>}</TableBody>
                    </Table>
                );
            case 'by_today_status': return ( <Table><TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-center">Status Today</TableHead></TableRow></TableHeader><TableBody>{staffOnLeaveOrAbsent.length > 0 ? staffOnLeaveOrAbsent.map(item => ( <TableRow key={item.id}><TableCell>{getStaffName(item.staffUid)}</TableCell><TableCell className="text-center">{getStatusBadge(item.status as any)}</TableCell></TableRow>)) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">All active staff are present today.</TableCell></TableRow>}</TableBody></Table>);
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Staff Dashboard" description="Overview of staff attendance, advances, and key metrics for the active site." />

             <Card>
                <CardHeader>
                  <CardTitle>Filters</CardTitle>
                  <CardDescription>Select a site and date range to analyze staff metrics.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="flex flex-wrap items-center gap-2">
                        {datePresets.map(({ label, value }) => (
                            <Button key={value} variant={dateRange?.from?.getTime() === tempDateRange?.from?.getTime() && dateRange?.to?.getTime() === tempDateRange?.to?.getTime() ? 'default' : 'outline'} onClick={() => handleSetDatePreset(value)}>
                                {label}
                            </Button>
                        ))}
                        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                            <PopoverTrigger asChild>
                            <Button
                                id="dateRangePicker" variant={'outline'}
                                className={cn("w-full sm:w-[300px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? ( dateRange.to ? (
                                    <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </>
                                ) : ( format(dateRange.from, "LLL dd, y") )
                                ) : ( <span>Pick a date range</span> )}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 flex" align="start">
                                <div className="p-2 border-r">
                                    <div className="flex flex-col items-stretch gap-1">
                                        {datePresets.map(({label, value}) => (
                                            <Button key={value} variant="ghost" className="justify-start" onClick={() => handleSetDatePreset(value)}>{label}</Button>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-2">
                                     <Calendar
                                        initialFocus mode="range" defaultMonth={tempDateRange?.from}
                                        selected={tempDateRange} onSelect={setTempDateRange} numberOfMonths={2}
                                        disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                                    />
                                    <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                                         <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button>
                                         <Button onClick={applyDateFilter}>Apply</Button>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {user?.role === 'admin' && (
                        <div className="max-w-xs">
                            <Label htmlFor="site-filter">Site</Label>
                            <Select value={siteFilter} onValueChange={setSiteFilter}>
                                <SelectTrigger id="site-filter" className="w-full bg-input">
                                    <Building className="mr-2 h-4 w-4 text-muted-foreground"/>
                                    <SelectValue placeholder="Filter by site" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Sites</SelectItem>
                                    {allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </CardContent>
              </Card>


            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {statCards.map(card => (
                    <Card key={card.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                            <card.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                            <p className="text-xs text-muted-foreground">{card.description}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                 <Card className="lg:col-span-3">
                    <CardHeader>
                         <div className="flex items-center justify-between">
                            <CardTitle>Dynamic Summary</CardTitle>
                             <Select value={summaryView} onValueChange={(v) => setSummaryView(v as SummaryViewOption)}>
                                <SelectTrigger className="w-[240px] bg-input"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="by_projected_salary">Projected Salary</SelectItem>
                                    <SelectItem value="by_earned_salary">Earned Salary (Period)</SelectItem>
                                    <SelectItem value="by_advances">Advances by Staff</SelectItem>
                                    <SelectItem value="by_attendance">Attendance Summary</SelectItem>
                                    <SelectItem value="by_today_status">Today's Absences/Leaves</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <CardDescription>A dynamic breakdown of staff data.</CardDescription>
                    </CardHeader>
                    <CardContent><ScrollArea className="h-72">{renderPivotTable()}</ScrollArea></CardContent>
                </Card>

                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Recent Salary Advances</CardTitle><CardDescription>Last 5 salary advances recorded in period.</CardDescription></CardHeader>
                        <CardContent>{recentAdvances.length === 0 ? ( <p className="text-sm text-muted-foreground text-center py-4">No advances recorded for this period.</p>) : ( <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Staff</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{recentAdvances.map(adv => ( <TableRow key={adv.id}><TableCell>{format(new Date(adv.date), 'MMM dd, yyyy')}</TableCell><TableCell>{getStaffName(adv.staffUid)}</TableCell><TableCell className="text-right font-medium">₹{adv.amount.toFixed(2)}</TableCell></TableRow>))}</TableBody></Table>)}</CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Staff on Leave/Absent Today</CardTitle><CardDescription>Attendance status for staff not marked as "Present".</CardDescription></CardHeader>
                        <CardContent>{staffOnLeaveOrAbsent.length === 0 ? ( <p className="text-sm text-muted-foreground text-center py-4">All active staff are present today.</p>) : ( <Table><TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{staffOnLeaveOrAbsent.map(att => ( <TableRow key={att.id}><TableCell>{getStaffName(att.staffUid)}</TableCell><TableCell>{getStatusBadge(att.status as any)}</TableCell></TableRow>))}</TableBody></Table>)}</CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

    
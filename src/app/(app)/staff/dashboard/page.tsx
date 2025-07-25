
"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserX, UserRoundCheck, HandCoins, CalendarDays, Wallet, BarChart, IndianRupee, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import type { AppUser, StaffAttendance, SalaryAdvance, Holiday, StaffDetails } from "@/types";
import { format, startOfMonth, endOfMonth, getDaysInMonth } from "date-fns";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useUserManagement } from "@/hooks/use-user-management";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const db = getFirestore();
type SummaryViewOption = 'by_projected_salary' | 'by_advances' | 'by_attendance' | 'by_earned_salary';

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
        users: staffList,
        staffDetails: staffDetailsMap,
        loading: userManagementLoading,
        error: userManagementError,
    } = useUserManagement();
    
    const [stats, setStats] = useState({ 
        totalStaff: 0, 
        presentToday: 0, 
        advancesThisMonth: 0, 
        notPresentToday: 0,
        salaryToday: 0,
        salaryThisMonth: 0,
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
        return staffList.find(s => s.uid === uid)?.displayName || uid.substring(0, 8);
    }, [staffList]);

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

    const calculateWorkingDays = useCallback((month: Date, holidays: Holiday[]) => {
        const totalDays = getDaysInMonth(month);
        let workingDays = 0;
        for (let i = 1; i <= totalDays; i++) {
            const currentDate = new Date(month.getFullYear(), month.getMonth(), i);
            if (!isHoliday(currentDate, holidays, null)) { // Check against global holidays for a general count
                workingDays++;
            }
        }
        return workingDays;
    }, [isHoliday]);


    useEffect(() => {
        if (userManagementLoading) {
            setLoadingCalculations(true);
            return;
        }
        
        if (staffList.length === 0) {
            setLoadingCalculations(false);
            setStats({ totalStaff: 0, presentToday: 0, advancesThisMonth: 0, notPresentToday: 0, salaryToday: 0, salaryThisMonth: 0, projectedSalary: 0 });
            setRecentAdvances([]);
            setAdvancesSummary([]);
            setAttendanceSummary([]);
            setEarnedSalarySummary([]);
            setStaffOnLeaveOrAbsent([]);
            return;
        }

        setLoadingCalculations(true);
        const staffUids = staffList.map(s => s.uid);
        
        const uidsBatches: string[][] = [];
        for (let i = 0; i < staffUids.length; i += 30) {
            uidsBatches.push(staffUids.slice(i, i + 30));
        }
        
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const monthStart = startOfMonth(new Date());
        const monthEnd = endOfMonth(new Date());

        const fetchDependencies = async () => {
            const [
                advancesSnapshots, 
                attendanceTodaySnapshots,
                attendanceMonthSnapshots,
                holidaysSnapshot
            ] = await Promise.all([
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "advances"), where("date", ">=", monthStart.toISOString()), where("date", "<=", monthEnd.toISOString()), where("staffUid", "in", batch))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), where("date", "==", todayStr), where("staffUid", "in", batch))))),
                Promise.all(uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), where("date", ">=", format(monthStart, 'yyyy-MM-dd')), where("date", "<=", format(monthEnd, 'yyyy-MM-dd')), where("staffUid", "in", batch))))),
                getDocs(query(collection(db, "holidays")))
            ]);
            
            // --- Advances ---
            const allAdvances = advancesSnapshots.flat().flatMap(s => s.docs.map(doc => ({id: doc.id, ...doc.data()} as SalaryAdvance)));
            const totalAdvance = allAdvances.reduce((sum, adv) => sum + adv.amount, 0);
            
            const advancesByStaff: Record<string, number> = {};
            allAdvances.forEach(adv => {
                advancesByStaff[adv.staffUid] = (advancesByStaff[adv.staffUid] || 0) + adv.amount;
            });
            const advancesSummaryData = Object.entries(advancesByStaff).map(([uid, totalAmount]) => ({
                uid, name: getStaffName(uid), totalAmount
            })).sort((a,b) => b.totalAmount - a.totalAmount);
            setAdvancesSummary(advancesSummaryData);
            
            setRecentAdvances(allAdvances.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5));

            // --- Today's Attendance & Salary ---
            const attendanceTodayDocs = attendanceTodaySnapshots.flat().flatMap(s => s.docs);
            
            const activeStaffList = staffList.filter(s => s.role === 'staff' && (s.status === 'active' || !s.status));
            const activeStaffCount = activeStaffList.length;

            const notPresentRecords = attendanceTodayDocs
                .filter(doc => ['Leave', 'Absent', 'Half-day'].includes((doc.data() as StaffAttendance).status))
                .map(doc => ({ id: doc.id, ...doc.data() } as StaffAttendance));
            
            const presentCount = activeStaffCount - notPresentRecords.length;

            setStaffOnLeaveOrAbsent(notPresentRecords);
            
            const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
            const workingDaysInMonth = calculateWorkingDays(new Date(), holidays);
            let salaryToday = 0;
            attendanceTodayDocs.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const details = staffDetailsMap.get(att.staffUid);
                if (details?.salary && workingDaysInMonth > 0) {
                    const perDaySalary = details.salary / workingDaysInMonth;
                    if (att.status === 'Present') salaryToday += perDaySalary;
                    if (att.status === 'Half-day') salaryToday += perDaySalary / 2;
                }
            });

            // --- Monthly Salary Bill & Attendance Summary ---
            const monthlyAttendanceMap = new Map<string, {present: number, halfDay: number}>();
            attendanceMonthSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const current = monthlyAttendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
                if (att.status === 'Present') current.present++;
                if (att.status === 'Half-day') current.halfDay++;
                monthlyAttendanceMap.set(att.staffUid, current);
            }));

            const attendanceSummaryData = Array.from(monthlyAttendanceMap.entries()).map(([uid, data]) => ({
                uid,
                name: getStaffName(uid),
                present: data.present,
                halfDay: data.halfDay
            })).sort((a,b) => b.present - a.present || b.halfDay - a.halfDay);
            setAttendanceSummary(attendanceSummaryData);


            let salaryThisMonth = 0;
            let projectedSalary = 0;
            const earnedSalarySummaryData: EarnedSalarySummary[] = [];
            
            activeStaffList.forEach(staff => {
                const details = staffDetailsMap.get(staff.uid);
                projectedSalary += details?.salary || 0;

                const attendance = monthlyAttendanceMap.get(staff.uid);
                if (details?.salary && attendance && workingDaysInMonth > 0) {
                    const perDaySalary = details.salary / workingDaysInMonth;
                    const presentDays = attendance.present + (attendance.halfDay * 0.5);
                    const earned = perDaySalary * presentDays;
                    salaryThisMonth += earned;
                    earnedSalarySummaryData.push({ uid: staff.uid, name: getStaffName(staff.uid), earnedSalary: earned });
                }
            });

            setEarnedSalarySummary(earnedSalarySummaryData.sort((a, b) => b.earnedSalary - a.earnedSalary));
            
            setStats({ 
                totalStaff: activeStaffCount, 
                presentToday: presentCount, 
                advancesThisMonth: totalAdvance, 
                notPresentToday: notPresentRecords.length,
                salaryToday: salaryToday,
                salaryThisMonth: salaryThisMonth,
                projectedSalary: projectedSalary,
            });
            setLoadingCalculations(false);
        };
        fetchDependencies().catch(err => {
            console.error("Failed to fetch dashboard dependencies:", err);
            setLoadingCalculations(false);
        });
        
    }, [staffList, staffDetailsMap, userManagementLoading, calculateWorkingDays, getStaffName]);

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
        { title: "Active Staff", value: stats.totalStaff, icon: Users, description: "Total active staff members." },
        { title: "Projected Salary", value: `₹${stats.projectedSalary.toFixed(2)}`, icon: Wallet, description: "Total base salary of active staff." },
        { title: "Salary Bill (This Month)", value: `₹${stats.salaryThisMonth.toFixed(2)}`, icon: CalendarDays, description: "Earned salary based on attendance." },
        { title: "Present Today", value: stats.presentToday, icon: UserRoundCheck, description: `${stats.presentToday} of ${stats.totalStaff} staff present.` },
        { title: "Advances (This Month)", value: `₹${stats.advancesThisMonth.toFixed(2)}`, icon: HandCoins, description: "Total salary advance this month." },
        { title: "Leave/Absent Today", value: stats.notPresentToday, icon: UserX, description: "Staff not marked as 'Present'." },
    ];

    const getStatusBadge = (status: 'Leave' | 'Absent' | 'Half-day') => {
        switch (status) {
            case 'Absent':
                return <Badge variant="destructive">Absent</Badge>;
            case 'Leave':
                return <Badge variant="outline" className="text-amber-600 border-amber-500">Leave</Badge>;
            case 'Half-day':
                return <Badge variant="secondary">Half-day</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };
    
    const projectedSalaryList = staffList
        .filter(s => (s.status === 'active' || !s.status))
        .map(s => ({
            ...s,
            salary: staffDetailsMap.get(s.uid)?.salary || 0
        }))
        .sort((a,b) => b.salary - a.salary);
        
    const renderPivotTable = () => {
        switch(summaryView) {
            case 'by_projected_salary':
                return (
                    <Table>
                        <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Projected Monthly Salary</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {projectedSalaryList.length > 0 ? projectedSalaryList.map(item => (
                                <TableRow key={item.uid}>
                                    <TableCell>{item.displayName}</TableCell>
                                    <TableCell className="text-right font-medium">₹{item.salary.toFixed(2)}</TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No active staff with salary data.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                );
            case 'by_earned_salary':
                return (
                    <Table>
                        <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Earned Salary (This Month)</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {earnedSalarySummary.length > 0 ? earnedSalarySummary.map(item => (
                                <TableRow key={item.uid}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="text-right font-medium">₹{item.earnedSalary.toFixed(2)}</TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No salary data for this month.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                );
            case 'by_advances':
                 return (
                    <Table>
                        <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-right">Total Advances (This Month)</TableHead></TableRow></TableHeader>
                        <TableBody>
                           {advancesSummary.length > 0 ? advancesSummary.map(item => (
                                <TableRow key={item.uid}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="text-right font-medium">₹{item.totalAmount.toFixed(2)}</TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No advances recorded this month.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                );
            case 'by_attendance':
                return (
                    <Table>
                        <TableHeader><TableRow><TableHead>Staff Member</TableHead><TableHead className="text-center">Present Days</TableHead><TableHead className="text-center">Half Days</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {attendanceSummary.length > 0 ? attendanceSummary.map(item => (
                                <TableRow key={item.uid}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell className="text-center font-medium text-green-600">{item.present}</TableCell>
                                    <TableCell className="text-center font-medium text-blue-600">{item.halfDay}</TableCell>
                                </TableRow>
                            )) : <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No attendance data for this month.</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Staff Dashboard" description="Overview of staff attendance, advances, and key metrics for the active site." />

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
                            <CardTitle className="flex items-center"><BarChart className="mr-2 h-5 w-5 text-primary"/>Dynamic Summary</CardTitle>
                             <Select value={summaryView} onValueChange={(v) => setSummaryView(v as SummaryViewOption)}>
                                <SelectTrigger className="w-[240px] bg-input"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="by_projected_salary"><Wallet className="mr-2 h-4 w-4" />Projected Salary</SelectItem>
                                    <SelectItem value="by_earned_salary"><IndianRupee className="mr-2 h-4 w-4" />Earned Salary Bill</SelectItem>
                                    <SelectItem value="by_advances"><HandCoins className="mr-2 h-4 w-4" />Advances by Staff</SelectItem>
                                    <SelectItem value="by_attendance"><UserCheck className="mr-2 h-4 w-4" />Attendance Summary</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <CardDescription>
                            A dynamic breakdown of staff data.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-72">
                             {renderPivotTable()}
                        </ScrollArea>
                    </CardContent>
                </Card>

                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent Salary Advances</CardTitle>
                            <CardDescription>Last 5 salary advances recorded this month.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {recentAdvances.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No advances recorded this month.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Staff</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentAdvances.map(adv => (
                                            <TableRow key={adv.id}>
                                                <TableCell>{format(new Date(adv.date), 'MMM dd, yyyy')}</TableCell>
                                                <TableCell>{getStaffName(adv.staffUid)}</TableCell>
                                                <TableCell className="text-right font-medium">₹{adv.amount.toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Staff on Leave/Absent Today</CardTitle>
                            <CardDescription>Attendance status for staff not marked as "Present".</CardDescription>
                        </CardHeader>
                        <CardContent>
                        {staffOnLeaveOrAbsent.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">All staff are marked present.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Staff</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {staffOnLeaveOrAbsent.map(att => (
                                            <TableRow key={att.id}>
                                                <TableCell>{getStaffName(att.staffUid)}</TableCell>
                                                <TableCell>{getStatusBadge(att.status as any)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

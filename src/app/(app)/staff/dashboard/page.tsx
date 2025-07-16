
"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserX, UserRoundCheck, HandCoins, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import type { AppUser, StaffAttendance, SalaryAdvance, Holiday, StaffDetails } from "@/types";
import { format, startOfMonth, endOfMonth, getDaysInMonth } from "date-fns";
import { Loader2, Info, IndianRupee } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const db = getFirestore();

export default function StaffDashboardPage() {
    const { user, activeSiteId, loading: authLoading } = useAuth();
    const [stats, setStats] = useState({ 
        totalStaff: 0, 
        presentToday: 0, 
        advancesThisMonth: 0, 
        notPresentToday: 0,
        salaryToday: 0,
        salaryThisMonth: 0,
    });
    const [recentAdvances, setRecentAdvances] = useState<SalaryAdvance[]>([]);
    const [staffOnLeaveOrAbsent, setStaffOnLeaveOrAbsent] = useState<StaffAttendance[]>([]);
    const [staffList, setStaffList] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);

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
        if (authLoading || !activeSiteId) {
            if (!authLoading) setLoading(false);
            return;
        }

        setLoading(true);

        const staffQuery = query(collection(db, "users"), where("defaultSiteId", "==", activeSiteId));
        const unsubscribeStaff = onSnapshot(staffQuery, async (staffSnapshot) => {
            const fetchedStaff = staffSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
            setStaffList(fetchedStaff);
            setStats(prev => ({ ...prev, totalStaff: fetchedStaff.length }));

            if (fetchedStaff.length === 0) {
                setLoading(false);
                setStats({ totalStaff: 0, presentToday: 0, advancesThisMonth: 0, notPresentToday: 0, salaryToday: 0, salaryThisMonth: 0 });
                setRecentAdvances([]);
                setStaffOnLeaveOrAbsent([]);
                return;
            }

            const staffUids = fetchedStaff.map(s => s.uid);
            
            // --- Parallel Data Fetching ---
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const monthStart = startOfMonth(new Date());
            const monthEnd = endOfMonth(new Date());

            const [
                detailsSnapshot, 
                advancesSnapshot, 
                attendanceTodaySnapshot,
                attendanceMonthSnapshot,
                holidaysSnapshot
            ] = await Promise.all([
                getDocs(query(collection(db, "staffDetails"), where("__name__", "in", staffUids))),
                getDocs(query(collection(db, "advances"), where("date", ">=", monthStart.toISOString()), where("date", "<=", monthEnd.toISOString()), where("staffUid", "in", staffUids))),
                getDocs(query(collection(db, "staffAttendance"), where("siteId", "==", activeSiteId), where("date", "==", todayStr), where("staffUid", "in", staffUids))),
                getDocs(query(collection(db, "staffAttendance"), where("siteId", "==", activeSiteId), where("date", ">=", format(monthStart, 'yyyy-MM-dd')), where("date", "<=", format(monthEnd, 'yyyy-MM-dd')), where("staffUid", "in", staffUids))),
                getDocs(query(collection(db, "holidays")))
            ]);
            
            const staffDetailsMap = new Map<string, StaffDetails>();
            detailsSnapshot.forEach(doc => staffDetailsMap.set(doc.id, doc.data() as StaffDetails));

            // --- Advances ---
            const totalAdvance = advancesSnapshot.docs.reduce((sum, doc) => sum + (doc.data() as SalaryAdvance).amount, 0);
            const fetchedAdvances = advancesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data() } as SalaryAdvance)).slice(0, 5); 
            setRecentAdvances(fetchedAdvances);

            // --- Today's Attendance & Salary ---
            const presentCount = attendanceTodaySnapshot.docs.filter(doc => (doc.data() as StaffAttendance).status === 'Present').length;
            const notPresentRecords = attendanceTodaySnapshot.docs
                .filter(doc => ['Leave', 'Absent', 'Half-day'].includes((doc.data() as StaffAttendance).status))
                .map(doc => doc.data() as StaffAttendance);
            setStaffOnLeaveOrAbsent(notPresentRecords);
            
            const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
            const workingDaysInMonth = calculateWorkingDays(new Date(), holidays);
            let salaryToday = 0;
            attendanceTodaySnapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const details = staffDetailsMap.get(att.staffUid);
                if (details?.salary && workingDaysInMonth > 0) {
                    const perDaySalary = details.salary / workingDaysInMonth;
                    if (att.status === 'Present') salaryToday += perDaySalary;
                    if (att.status === 'Half-day') salaryToday += perDaySalary / 2;
                }
            });

            // --- Monthly Salary Bill ---
            const monthlyAttendanceMap = new Map<string, {present: number, halfDay: number}>();
            attendanceMonthSnapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const current = monthlyAttendanceMap.get(att.staffUid) || { present: 0, halfDay: 0 };
                if (att.status === 'Present') current.present++;
                if (att.status === 'Half-day') current.halfDay++;
                monthlyAttendanceMap.set(att.staffUid, current);
            });

            let salaryThisMonth = 0;
            fetchedStaff.forEach(staff => {
                const details = staffDetailsMap.get(staff.uid);
                const attendance = monthlyAttendanceMap.get(staff.uid);
                if (details?.salary && attendance && workingDaysInMonth > 0) {
                    const perDaySalary = details.salary / workingDaysInMonth;
                    const presentDays = attendance.present + (attendance.halfDay * 0.5);
                    salaryThisMonth += perDaySalary * presentDays;
                }
            });

            setStats({ 
                totalStaff: fetchedStaff.length, 
                presentToday: presentCount, 
                advancesThisMonth: totalAdvance, 
                notPresentToday: notPresentRecords.length,
                salaryToday: salaryToday,
                salaryThisMonth: salaryThisMonth
            });
            setLoading(false);
        });
        
        return () => unsubscribeStaff();
    }, [activeSiteId, authLoading, calculateWorkingDays]);

    if (authLoading) {
      return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }
  
    if (!activeSiteId && !authLoading) {
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
        { title: "Total Staff", value: stats.totalStaff, icon: Users, description: "Active staff at this site." },
        { title: "Present Today", value: stats.presentToday, icon: UserRoundCheck, description: `${stats.presentToday} of ${stats.totalStaff} staff present.` },
        { title: "Salary Today", value: `₹${stats.salaryToday.toFixed(2)}`, icon: IndianRupee, description: "Calculated from today's attendance." },
        { title: "Salary Bill this Month", value: `₹${stats.salaryThisMonth.toFixed(2)}`, icon: CalendarDays, description: "Total earned salary this month." },
        { title: "Advances this Month", value: `₹${stats.advancesThisMonth.toFixed(2)}`, icon: HandCoins, description: "Total salary advance this month." },
        { title: "Leave/Absent Today", value: stats.notPresentToday, icon: UserX, description: "Staff not marked as 'Present'." },
    ];

    const getStaffName = (uid: string) => staffList.find(s => s.uid === uid)?.displayName || uid.substring(0, 8);

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

            <div className="grid gap-6 lg:grid-cols-2">
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
    );
}

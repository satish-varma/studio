
"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, HandCoins, AlertTriangle, UserX, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot } from "firebase/firestore";
import type { AppUser, StaffAttendance, SalaryAdvance } from "@/types";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const db = getFirestore();

export default function StaffDashboardPage() {
    const { user, activeSiteId, loading: authLoading } = useAuth();
    const [stats, setStats] = useState({ totalStaff: 0, presentToday: 0, advancesThisMonth: 0 });
    const [recentAdvances, setRecentAdvances] = useState<SalaryAdvance[]>([]);
    const [staffOnLeaveOrAbsent, setStaffOnLeaveOrAbsent] = useState<StaffAttendance[]>([]);
    const [staffList, setStaffList] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading || !activeSiteId) {
            if (!authLoading) setLoading(false);
            return;
        }

        setLoading(true);

        // Fetch staff for the active site
        const staffQuery = query(collection(db, "users"), where("defaultSiteId", "==", activeSiteId));
        const unsubscribeStaff = onSnapshot(staffQuery, (snapshot) => {
            const fetchedStaff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
            setStaffList(fetchedStaff);
            setStats(prev => ({ ...prev, totalStaff: fetchedStaff.length }));

            const staffUids = fetchedStaff.map(s => s.uid);
            if (staffUids.length === 0) {
                setLoading(false);
                setStats({ totalStaff: 0, presentToday: 0, advancesThisMonth: 0 });
                setRecentAdvances([]);
                setStaffOnLeaveOrAbsent([]);
                return;
            }

            // Fetch attendance for today for these staff members
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const attendanceQuery = query(
                collection(db, "staffAttendance"),
                where("siteId", "==", activeSiteId),
                where("date", "==", todayStr),
                where("staffUid", "in", staffUids)
            );
            const unsubscribeAttendance = onSnapshot(attendanceQuery, (attSnapshot) => {
                const presentCount = attSnapshot.docs.filter(doc => (doc.data() as StaffAttendance).status === 'Present').length;
                const leaveOrAbsent = attSnapshot.docs
                    .filter(doc => ['Leave', 'Absent', 'Half-day'].includes((doc.data() as StaffAttendance).status))
                    .map(doc => doc.data() as StaffAttendance);
                
                setStats(prev => ({ ...prev, presentToday: presentCount }));
                setStaffOnLeaveOrAbsent(leaveOrAbsent);
            });

            // Fetch salary advances for this month for these staff members
            const start = startOfMonth(new Date()).toISOString();
            const end = endOfMonth(new Date()).toISOString();
            const advancesQuery = query(
                collection(db, "advances"),
                where("date", ">=", start),
                where("date", "<=", end),
                where("staffUid", "in", staffUids)
            );
            const unsubscribeAdvances = onSnapshot(advancesQuery, (advSnapshot) => {
                const totalAdvance = advSnapshot.docs.reduce((sum, doc) => sum + (doc.data() as SalaryAdvance).amount, 0);
                const fetchedAdvances = advSnapshot.docs.map(doc => ({id: doc.id, ...doc.data() } as SalaryAdvance)).slice(0, 5); // Take top 5 recent
                setStats(prev => ({ ...prev, advancesThisMonth: totalAdvance }));
                setRecentAdvances(fetchedAdvances);
            });

            setLoading(false);
            return () => {
                unsubscribeAttendance();
                unsubscribeAdvances();
            };
        });

        return () => unsubscribeStaff();

    }, [activeSiteId, authLoading]);

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
        { title: "Advances this Month", value: `₹${stats.advancesThisMonth.toFixed(2)}`, icon: HandCoins, description: "Total salary advance this month." },
        { title: "Leave/Absent Today", value: staffOnLeaveOrAbsent.length, icon: UserX, description: "Staff not fully present today." },
    ];

    const getStaffName = (uid: string) => staffList.find(s => s.uid === uid)?.displayName || uid.substring(0, 8);

    return (
        <div className="space-y-6">
            <PageHeader title="Staff Dashboard" description="Overview of staff attendance, advances, and key metrics for the active site." />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                           <p className="text-sm text-muted-foreground text-center py-4">All active staff are marked present.</p>
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
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded-full text-xs ${
                                                    att.status === 'Absent' ? 'bg-destructive/20 text-destructive' :
                                                    att.status === 'Leave' ? 'bg-yellow-500/20 text-yellow-600' :
                                                    'bg-blue-500/20 text-blue-600'
                                                }`}>
                                                    {att.status}
                                                </span>
                                            </TableCell>
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

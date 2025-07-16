
"use client";

import { useState, useEffect } from "react";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  doc, 
  setDoc,
  onSnapshot
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { format, isValid } from 'date-fns';
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppUser, StaffAttendance, AttendanceStatus } from "@/types";
import { attendanceStatuses } from "@/types/staff";
import { Loader2, Info, UserCheck, UserX, CalendarClock, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const LOG_PREFIX = "[StaffAttendanceClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface AttendanceStats {
    totalStaff: number;
    present: number;
    absentOrLeave: number;
}

export default function StaffAttendanceClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [stats, setStats] = useState<AttendanceStats>({ totalStaff: 0, present: 0, absentOrLeave: 0 });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading || !activeSiteId) {
        if (!authLoading) setLoading(false);
        return;
    }
    setLoading(true);

    const usersQuery = query(
        collection(db, "users"),
        where("role", "in", ["staff", "manager"]),
        where("defaultSiteId", "==", activeSiteId)
    );

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const fetchedStaff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
        setStaffList(fetchedStaff);
        setStats(prev => ({...prev, totalStaff: fetchedStaff.length }));
        setLoading(false);
    }, (error) => {
        console.error("Error fetching staff for site:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeSiteId, authLoading]);

  useEffect(() => {
    if (staffList.length === 0 || !isValid(selectedDate) || !activeSiteId) {
        setAttendance({});
        setStats(prev => ({...prev, present: 0, absentOrLeave: 0}));
        return;
    };

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const uids = staffList.map(s => s.uid);
    setAttendance({}); // Reset for new date/staff list

    // This query is slightly inefficient if there are many staff, as "in" queries are limited.
    // For larger scale, consider querying all attendance for the day/site and mapping.
    const attendanceQuery = query(
        collection(db, "staffAttendance"),
        where("siteId", "==", activeSiteId),
        where("date", "==", dateStr),
        where("staffUid", "in", uids)
    );

    const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
        const newAttendance: Record<string, AttendanceStatus> = {};
        let presentCount = 0;
        let absentOrLeaveCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data() as StaffAttendance;
            newAttendance[data.staffUid] = data.status;
            if (data.status === 'Present') presentCount++;
            if (data.status === 'Absent' || data.status === 'Leave') absentOrLeaveCount++;
        });
        setAttendance(newAttendance);
        setStats(prev => ({...prev, present: presentCount, absentOrLeave: absentOrLeaveCount}));
    });

    return () => unsubscribe();
  }, [selectedDate, staffList, activeSiteId]);

  const handleStatusChange = async (staffUid: string, status: AttendanceStatus) => {
    if (!user || !activeSiteId || !isValid(selectedDate)) {
        toast({ title: "Error", description: "Missing context to save attendance.", variant: "destructive"});
        return;
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const docId = `${dateStr}_${staffUid}`;
    const docRef = doc(db, "staffAttendance", docId);
    
    try {
        await setDoc(docRef, {
            staffUid,
            date: dateStr,
            status,
            siteId: activeSiteId,
            recordedByUid: user.uid,
            recordedByName: user.displayName || user.email,
        }, { merge: true });

        // Optimistically update local state
        setAttendance(prev => ({...prev, [staffUid]: status}));
    } catch(error: any) {
        console.error("Error saving attendance:", error);
        toast({ title: "Save Failed", description: error.message, variant: "destructive"});
    }
  };
  
  const getStatusBadgeVariant = (status?: AttendanceStatus) => {
    switch (status) {
        case 'Present': return 'default';
        case 'Absent': return 'destructive';
        case 'Leave': return 'outline';
        case 'Half-day': return 'secondary';
        default: return 'outline';
    }
  };


  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!activeSiteId) return (
    <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>Please select a site from the header to manage staff attendance.</AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             <CalendarClock className="h-8 w-8 text-primary" />
             <div>
                <h2 className="text-xl font-semibold">Attendance for {format(selectedDate, "PPP")}</h2>
                <p className="text-sm text-muted-foreground">Select a date to view or mark attendance.</p>
             </div>
          </div>
          <DatePicker date={selectedDate} onDateChange={(d) => setSelectedDate(d || new Date())} />
        </div>
        
        <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Staff</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold">{stats.totalStaff}</div>}</CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Present</CardTitle><UserCheck className="h-4 w-4 text-green-500" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold text-green-600">{stats.present}</div>}</CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Absent / Leave</CardTitle><UserX className="h-4 w-4 text-red-500" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold text-red-600">{stats.absentOrLeave}</div>}</CardContent></Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Attendance Register</CardTitle>
                <CardDescription>Mark the attendance status for each staff member below.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Loading staff list...</p></div>
                ) : staffList.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No staff found for the selected site.</div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Staff Member</TableHead>
                                    <TableHead className="w-[200px]">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staffList.map(staff => (
                                    <TableRow key={staff.uid}>
                                        <TableCell className="font-medium">{staff.displayName || staff.email}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={attendance[staff.uid] || ""}
                                                onValueChange={(status) => handleStatusChange(staff.uid, status as AttendanceStatus)}
                                            >
                                                <SelectTrigger className={cn("w-full sm:w-[160px]", 
                                                  attendance[staff.uid] === "Present" && "bg-green-500/10 border-green-500/50 text-green-700 font-semibold",
                                                  attendance[staff.uid] === "Absent" && "bg-red-500/10 border-red-500/50 text-red-700 font-semibold",
                                                  attendance[staff.uid] === "Leave" && "bg-yellow-500/10 border-yellow-500/50 text-yellow-700",
                                                )}>
                                                    <SelectValue placeholder="Mark attendance..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {attendanceStatuses.map(status => (
                                                        <SelectItem key={status} value={status}>{status}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

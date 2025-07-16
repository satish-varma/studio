
"use client";

import { useState, useEffect } from "react";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  doc, 
  setDoc,
  onSnapshot,
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { format, isValid, addDays, subDays } from 'date-fns';
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppUser, StaffAttendance, AttendanceStatus, Site } from "@/types";
import { attendanceStatuses } from "@/types/staff";
import { Loader2, Info, UserCheck, UserX, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});

  const isAllSitesView = user?.role === 'admin' && !activeSiteId;

  const handlePrevDay = () => setSelectedDate(prev => subDays(prev, 1));
  const handleNextDay = () => setSelectedDate(prev => addDays(prev, 1));
  const handleGoToToday = () => setSelectedDate(new Date());

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== 'manager' && user?.role !== 'admin') {
      setLoading(false);
      return;
    }
    if (!isAllSitesView && !activeSiteId) {
      setLoading(false);
      setStaffList([]);
      return;
    }

    setLoading(true);

    let usersQuery;
    if (isAllSitesView) {
        console.log(`${LOG_PREFIX} Admin in All Sites view. Fetching all staff/managers and sites.`);
        usersQuery = query(
            collection(db, "users"),
            where("role", "in", ["staff", "manager"])
        );
        // Fetch sites map for display
        getDocs(collection(db, "sites")).then(sitesSnapshot => {
            const newSitesMap: Record<string, string> = {};
            sitesSnapshot.forEach(doc => { newSitesMap[doc.id] = (doc.data() as Site).name; });
            setSitesMap(newSitesMap);
        });

    } else {
        console.log(`${LOG_PREFIX} Fetching staff for active site: ${activeSiteId}`);
        usersQuery = query(
            collection(db, "users"),
            where("role", "in", ["staff", "manager"]),
            where("defaultSiteId", "==", activeSiteId)
        );
    }

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
        const fetchedStaff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
        setStaffList(fetchedStaff.sort((a,b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")));
        setStats(prev => ({...prev, totalStaff: fetchedStaff.length }));
        setLoading(false);
    }, (error) => {
        console.error("Error fetching staff:", error);
        toast({ title: "Error", description: "Could not fetch staff list.", variant: "destructive"});
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeSiteId, authLoading, user?.role, isAllSitesView, toast]);

  useEffect(() => {
    if (staffList.length === 0 || !isValid(selectedDate)) {
        setAttendance({});
        setStats(prev => ({...prev, present: 0, absentOrLeave: 0}));
        return;
    };

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const uids = staffList.map(s => s.uid);
    setAttendance({}); 
    setStats(prev => ({...prev, present: 0, absentOrLeave: 0}));
    
    if (uids.length === 0) return;

    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsBatches.push(uids.slice(i, i + 30));
    }
    
    let unsubscribers: (()=>void)[] = [];

    uidsBatches.forEach(batch => {
        const attendanceQuery = query(
            collection(db, "staffAttendance"),
            where("date", "==", dateStr),
            where("staffUid", "in", batch)
        );
        
        const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
            let newAttendanceForBatch: Record<string, AttendanceStatus> = {};
            snapshot.forEach(doc => {
                const data = doc.data() as StaffAttendance;
                newAttendanceForBatch[data.staffUid] = data.status;
            });
            setAttendance(prev => {
                const updatedAttendance = {...prev, ...newAttendanceForBatch};
                 const presentCount = Object.values(updatedAttendance).filter(s => s === 'Present').length;
                const absentOrLeaveCount = Object.values(updatedAttendance).filter(s => ['Absent', 'Leave', 'Half-day'].includes(s)).length;
                setStats(prevStats => ({...prevStats, present: presentCount, absentOrLeave: absentOrLeaveCount }));
                return updatedAttendance;
            });
        });
        unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [selectedDate, staffList]);

  const handleStatusChange = async (staffUid: string, status: AttendanceStatus) => {
    const staffMember = staffList.find(s => s.uid === staffUid);
    if (!user || !staffMember || !staffMember.defaultSiteId || !isValid(selectedDate)) {
        toast({ title: "Error", description: "Missing context to save attendance. The selected staff member must have a default site assigned.", variant: "destructive"});
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
            siteId: staffMember.defaultSiteId,
            recordedByUid: user.uid,
            recordedByName: user.displayName || user.email,
        }, { merge: true });

        setAttendance(prev => ({...prev, [staffUid]: status}));
    } catch(error: any) {
        console.error("Error saving attendance:", error);
        toast({ title: "Save Failed", description: error.message, variant: "destructive"});
    }
  };
  
  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!isAllSitesView && !activeSiteId) return (
    <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>Please select a site from the header to manage staff attendance, or select "All Sites" if you are an admin.</AlertDescription>
    </Alert>
  );

  return (
    <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Attendance Register</h2>
            <p className="text-sm text-muted-foreground">{isAllSitesView ? "Viewing all staff across all sites." : "Viewing staff for the selected site."}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevDay} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button>
            <DatePicker date={selectedDate} onDateChange={(d) => setSelectedDate(d || new Date())} />
            <Button variant="outline" size="icon" onClick={handleNextDay} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToToday}>Today</Button>
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Staff</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold">{stats.totalStaff}</div>}</CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Present</CardTitle><UserCheck className="h-4 w-4 text-green-500" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold text-green-600">{stats.present}</div>}</CardContent></Card>
            <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Absent / Leave</CardTitle><UserX className="h-4 w-4 text-red-500" /></CardHeader><CardContent>{loading ? <Skeleton className="h-8 w-12"/> : <div className="text-2xl font-bold text-red-600">{stats.absentOrLeave}</div>}</CardContent></Card>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Attendance for {format(selectedDate, "PPP")}</CardTitle>
                <CardDescription>
                  {isAllSitesView 
                    ? "Viewing all staff. To mark attendance, please select a specific site from the header." 
                    : "Mark the attendance status for each staff member below."}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Loading staff list...</p></div>
                ) : staffList.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">No staff found for the selected context.</div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Staff Member</TableHead>
                                    <TableHead className="w-[380px]">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {staffList.map(staff => (
                                    <TableRow key={staff.uid}>
                                        <TableCell className="font-medium">
                                          <div>{staff.displayName || staff.email}</div>
                                          {isAllSitesView && (
                                            <div className="text-xs text-muted-foreground">{staff.defaultSiteId ? (sitesMap[staff.defaultSiteId] || "Unknown Site") : "No site assigned"}</div>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                {(attendanceStatuses).map((status) => {
                                                    const isActive = attendance[staff.uid] === status;
                                                    return (
                                                        <Button
                                                            key={status}
                                                            variant={isActive ? 'default' : 'outline'}
                                                            size="sm"
                                                            onClick={() => handleStatusChange(staff.uid, status)}
                                                            className={cn(
                                                                "text-xs h-8 px-3",
                                                                isActive && status === 'Present' && "bg-green-600 hover:bg-green-700",
                                                                isActive && status === 'Absent' && "bg-red-600 hover:bg-red-700",
                                                                isActive && status === 'Leave' && "bg-yellow-500 hover:bg-yellow-600 text-white",
                                                                isActive && status === 'Half-day' && "bg-blue-500 hover:bg-blue-600"
                                                            )}
                                                            disabled={isAllSitesView}
                                                        >
                                                            {status}
                                                        </Button>
                                                    )
                                                })}
                                            </div>
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

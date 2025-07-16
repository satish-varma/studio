
"use client";

import { useState, useEffect } from "react";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  doc, 
  setDoc,
  getDoc,
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
import { Loader2, Info, UserCheck, UserX, CalendarClock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const LOG_PREFIX = "[StaffAttendanceClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function StaffAttendanceClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
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
        setLoading(false);
    }, (error) => {
        console.error("Error fetching staff for site:", error);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [activeSiteId, authLoading]);

  useEffect(() => {
    if (staffList.length === 0 || !isValid(selectedDate) || !activeSiteId) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const uids = staffList.map(s => s.uid);
    setAttendance({}); // Reset for new date/staff list

    const attendanceQuery = query(
        collection(db, "staffAttendance"),
        where("siteId", "==", activeSiteId),
        where("date", "==", dateStr),
        where("staffUid", "in", uids)
    );

    const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
        const newAttendance: Record<string, AttendanceStatus> = {};
        snapshot.forEach(doc => {
            const data = doc.data() as StaffAttendance;
            newAttendance[data.staffUid] = data.status;
        });
        setAttendance(newAttendance);
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

        setAttendance(prev => ({...prev, [staffUid]: status}));
    } catch(error: any) {
        console.error("Error saving attendance:", error);
        toast({ title: "Save Failed", description: error.message, variant: "destructive"});
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
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Daily Attendance Sheet</CardTitle>
            <CardDescription>Select a date and mark attendance for staff at the active site.</CardDescription>
          </div>
          <DatePicker date={selectedDate} onDateChange={(d) => setSelectedDate(d || new Date())} />
        </div>
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
                                        <SelectTrigger>
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
  );
}

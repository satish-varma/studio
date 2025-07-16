
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { Button } from "@/components/ui/button";
import type { AppUser, StaffAttendance, Site, Holiday, AttendanceStatus } from "@/types";
import { Loader2, Info, ChevronLeft, ChevronRight, CalendarDays, ThumbsUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import { AttendanceRegisterTable } from "./AttendanceRegisterTable";
import ManageHolidaysDialog from "./ManageHolidaysDialog";
import { logStaffActivity } from "@/lib/staffLogger";

const LOG_PREFIX = "[StaffAttendanceClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

const statusCycle: (AttendanceStatus | null)[] = ["Present", "Absent", "Leave", "Half-day", null];


export default function StaffAttendanceClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<string, StaffAttendance>> | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [sites, setSites] = useState<Site[]>([]);
  const [isHolidaysDialogOpen, setIsHolidaysDialogOpen] = useState(false);

  const isAllSitesView = user?.role === 'admin' && !activeSiteId;

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToCurrentMonth = () => setCurrentMonth(new Date());

  const staffQuery = useMemo(() => {
    if (authLoading || !user) return null;
    if (user.role !== 'manager' && user.role !== 'admin') return null;
    
    let q = query(collection(db, "users"), where("role", "in", ["staff", "manager"]));
    if (activeSiteId) {
      q = query(q, where("defaultSiteId", "==", activeSiteId));
    }
    return q;
  }, [activeSiteId, authLoading, user]);

  useEffect(() => {
    if (!staffQuery) {
      if (!authLoading) setLoading(false);
      setStaffList([]);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(staffQuery, (snapshot) => {
      const fetchedStaff = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
      setStaffList(fetchedStaff.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "")));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching staff:", error);
      toast({ title: "Error", description: "Could not fetch staff list.", variant: "destructive" });
      setLoading(false);
    });
    return () => unsubscribe();
  }, [staffQuery, toast]);
  
  useEffect(() => {
      getDocs(collection(db, "sites")).then(sitesSnapshot => {
        const newSitesMap: Record<string, string> = {};
        const sitesList: Site[] = [];
        sitesSnapshot.forEach(doc => {
            const siteData = { id: doc.id, ...doc.data() } as Site;
            newSitesMap[doc.id] = siteData.name;
            sitesList.push(siteData);
        });
        setSitesMap(newSitesMap);
        setSites(sitesList);
    });
  }, []);

  useEffect(() => {
    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);

    const uids = staffList.map(s => s.uid);
    setAttendance({});

    if (uids.length > 0) {
        const uidsBatches: string[][] = [];
        for (let i = 0; i < uids.length; i += 30) {
            uidsBatches.push(uids.slice(i, i + 30));
        }
        
        const unsubscribers: (() => void)[] = [];

        uidsBatches.forEach(batch => {
            if (batch.length === 0) return;
            const attendanceQuery = query(
                collection(db, "staffAttendance"),
                where("date", ">=", format(firstDay, 'yyyy-MM-dd')),
                where("date", "<=", format(lastDay, 'yyyy-MM-dd')),
                where("staffUid", "in", batch)
            );
            const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
                const batchAttendance: Record<string, Record<string, StaffAttendance>> = {};
                snapshot.forEach(doc => {
                    const data = doc.data() as StaffAttendance;
                    if (!batchAttendance[data.staffUid]) batchAttendance[data.staffUid] = {};
                    batchAttendance[data.staffUid][data.date] = data;
                });
                setAttendance(prev => ({...prev, ...batchAttendance}));
            });
            unsubscribers.push(unsubscribe);
        });

        return () => unsubscribers.forEach(unsub => unsub());
    }
  }, [currentMonth, staffList]);

  useEffect(() => {
    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const holidaysQuery = query(
        collection(db, "holidays"),
        where("date", ">=", format(firstDay, 'yyyy-MM-dd')),
        where("date", "<=", format(lastDay, 'yyyy-MM-dd'))
    );
     const unsubscribeHolidays = onSnapshot(holidaysQuery, (snapshot) => {
      const fetchedHolidays = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday));
      setHolidays(fetchedHolidays);
    });
    return () => unsubscribeHolidays();
  }, [currentMonth]);
  
  const isHoliday = useCallback((date: Date, staffSiteId?: string | null) => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
      return { holiday: true, name: "Weekend" };
    }
    const dateStr = format(date, 'yyyy-MM-dd');
    const globalHoliday = holidays.find(h => h.date === dateStr && h.siteId === null);
    if (globalHoliday) return { holiday: true, name: globalHoliday.name };

    if (staffSiteId) {
      const siteHoliday = holidays.find(h => h.date === dateStr && h.siteId === staffSiteId);
      if (siteHoliday) return { holiday: true, name: siteHoliday.name };
    }
    return { holiday: false, name: null };
  }, [holidays]);

  const handleStatusChange = useCallback(async (staff: AppUser, date: Date) => {
    const holidayInfo = isHoliday(date, staff.defaultSiteId);
    if (!user || !staff.defaultSiteId || isAllSitesView || holidayInfo.holiday) {
      if(isAllSitesView) toast({title: "Read-only", description: "Select a specific site to mark attendance."});
      if(holidayInfo.holiday) toast({ title: "Holiday", description: `Cannot mark attendance on ${holidayInfo.name}.`, variant: "default" });
      return;
    }
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const docId = `${dateStr}_${staff.uid}`;
    
    const currentStatus = attendance?.[staff.uid]?.[dateStr]?.status;
    const nextIndex = currentStatus ? (statusCycle.indexOf(currentStatus) + 1) % statusCycle.length : 0;
    const newStatus = statusCycle[nextIndex];
    
    const docRef = doc(db, "staffAttendance", docId);
    const prevAttendance = JSON.parse(JSON.stringify(attendance || {}));

    // Optimistic UI update
    setAttendance(prev => {
        const newAttendance = JSON.parse(JSON.stringify(prev || {}));
        if (!newAttendance[staff.uid]) newAttendance[staff.uid] = {};
        if (newStatus === null) {
            delete newAttendance[staff.uid][dateStr];
        } else {
            newAttendance[staff.uid][dateStr] = {
                id: docId, staffUid: staff.uid, date: dateStr, status: newStatus,
                siteId: staff.defaultSiteId!, recordedByUid: user.uid, recordedByName: user.displayName || user.email!
            };
        }
        return newAttendance;
    });

    try {
      if (newStatus === null) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, {
            staffUid: staff.uid,
            date: dateStr,
            status: newStatus,
            siteId: staff.defaultSiteId,
            recordedByUid: user.uid,
            recordedByName: user.displayName || user.email,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      await logStaffActivity(user, {
        type: 'ATTENDANCE_MARKED',
        relatedStaffUid: staff.uid,
        siteId: staff.defaultSiteId,
        details: {
            date: dateStr,
            status: newStatus || 'Cleared',
            notes: `Attendance for ${staff.displayName || staff.email} on ${dateStr} set to ${newStatus || 'Cleared'}`
        }
      });

    } catch(error: any) {
      console.error("Error saving attendance:", error);
      toast({ title: "Save Failed", description: `Failed to save status for ${staff.displayName}. Reverting change.`, variant: "destructive"});
      setAttendance(prevAttendance); // Revert UI on failure
    }
  }, [user, attendance, isHoliday, isAllSitesView, toast]);


  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Attendance Register"
        description={isAllSitesView ? "Viewing all staff across all sites." : "Viewing staff for the selected site."}
        actions={user?.role === 'admin' ? (
          <Button variant="outline" onClick={() => setIsHolidaysDialogOpen(true)}>
            <CalendarDays className="mr-2 h-4 w-4" /> Manage Holidays
          </Button>
        ) : undefined}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToCurrentMonth}>Today</Button>
          </div>
          <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md">
            Click on a cell to cycle through: Present (P), Absent (A), Leave (L), Half-day (H).
          </div>
        </div>

      {!isAllSitesView && !activeSiteId && !authLoading ? (
         <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>Please select a site from the header to manage staff attendance, or select "All Sites" if you are an admin.</AlertDescription>
        </Alert>
      ) : loading || attendance === null ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Loading staff and attendance data...</p></div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No staff found for the selected context.</div>
      ) : (
        <AttendanceRegisterTable
            staffList={staffList}
            attendanceData={attendance}
            month={currentMonth}
            isAllSitesView={isAllSitesView}
            sitesMap={sitesMap}
            holidays={holidays}
            onStatusChange={handleStatusChange}
            isHoliday={isHoliday}
        />
      )}
      {user?.role === 'admin' && (
        <ManageHolidaysDialog
          isOpen={isHolidaysDialogOpen}
          onClose={() => setIsHolidaysDialogOpen(false)}
          sites={sites}
        />
      )}
    </div>
  );
}


"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppUser, StaffAttendance, AttendanceStatus, Site } from "@/types";
import { Loader2, Info, UserCheck, UserX, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { AttendanceRegisterTable } from "./AttendanceRegisterTable";

const LOG_PREFIX = "[StaffAttendanceClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface MonthlyStats {
    totalStaff: number;
    totalPossibleWorkDays: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
}

export default function StaffAttendanceClientPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [attendance, setAttendance] = useState<Record<string, Record<string, StaffAttendance>>>();
  const [stats, setStats] = useState<MonthlyStats>({ totalStaff: 0, totalPossibleWorkDays: 0, totalPresent: 0, totalAbsent: 0, totalLeave: 0 });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});

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
      if (isAllSitesView) {
           getDocs(collection(db, "sites")).then(sitesSnapshot => {
            const newSitesMap: Record<string, string> = {};
            sitesSnapshot.forEach(doc => { newSitesMap[doc.id] = (doc.data() as Site).name; });
            setSitesMap(newSitesMap);
        });
      }
  }, [isAllSitesView]);

  useEffect(() => {
    if (!staffQuery || staffList.length === 0) {
        setAttendance({});
        return;
    }

    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const uids = staffList.map(s => s.uid);
    setAttendance({}); // Reset on month change

    if (uids.length === 0) return;

    const uidsBatches: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
      uidsBatches.push(uids.slice(i, i + 30));
    }

    const unsubscribers: (() => void)[] = [];

    uidsBatches.forEach(batch => {
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
          if (!batchAttendance[data.staffUid]) {
            batchAttendance[data.staffUid] = {};
          }
          batchAttendance[data.staffUid][data.date] = data;
        });
        setAttendance(prev => ({...prev, ...batchAttendance}));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }, [currentMonth, staffList, staffQuery]);


  if (authLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Attendance Register"
        description={isAllSitesView ? "Viewing all staff across all sites." : "Viewing staff for the selected site."}
      />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToCurrentMonth}>Today</Button>
          </div>
        </div>

      {!isAllSitesView && !activeSiteId && !authLoading ? (
         <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>Please select a site from the header to manage staff attendance, or select "All Sites" if you are an admin.</AlertDescription>
        </Alert>
      ) : loading ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Loading staff and attendance data...</p></div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No staff found for the selected context.</div>
      ) : (
        <AttendanceRegisterTable
            staffList={staffList}
            attendanceData={attendance || {}}
            month={currentMonth}
            isAllSitesView={isAllSitesView}
            sitesMap={sitesMap}
        />
      )}
    </div>
  );
}

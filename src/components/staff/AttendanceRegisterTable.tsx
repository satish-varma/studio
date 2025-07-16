
"use client";

import { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, getDaysInMonth, startOfMonth, addDays, getDay } from 'date-fns';
import { cn } from "@/lib/utils";
import type { AppUser, StaffAttendance, AttendanceStatus, Site, Holiday } from "@/types";
import { attendanceStatuses } from "@/types/staff";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AttendanceRegisterTableProps {
  staffList: AppUser[];
  attendanceData: Record<string, Record<string, StaffAttendance>>;
  month: Date;
  isAllSitesView: boolean;
  sitesMap: Record<string, string>;
  holidays: Holiday[];
}

const db = getFirestore();

const statusCycle: AttendanceStatus[] = ["Present", "Absent", "Leave", "Half-day"];

const statusBadgeClasses: Record<AttendanceStatus, string> = {
    "Present": "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800",
    "Absent": "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800",
    "Leave": "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800",
    "Half-day": "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800",
};

export function AttendanceRegisterTable({ staffList, attendanceData, month, isAllSitesView, sitesMap, holidays }: AttendanceRegisterTableProps) {
  const { user, activeSiteId } = useAuth();
  const { toast } = useToast();
  
  const daysInMonth = useMemo(() => getDaysInMonth(month), [month]);
  const firstDayOfMonth = useMemo(() => startOfMonth(month), [month]);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => addDays(firstDayOfMonth, i));

  const holidaysMap = useMemo(() => {
    const map = new Map<string, Holiday>();
    holidays.forEach(holiday => {
      // Key: YYYY-MM-DD_siteId (or YYYY-MM-DD_global for global holidays)
      const key = `${holiday.date}_${holiday.siteId || 'global'}`;
      map.set(key, holiday);
    });
    return map;
  }, [holidays]);

  const isHoliday = (date: Date, staffSiteId?: string | null) => {
    const dayOfWeek = getDay(date);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { holiday: true, name: "Weekend" };
    }
    const dateStr = format(date, 'yyyy-MM-dd');
    const globalHoliday = holidaysMap.get(`${dateStr}_global`);
    if (globalHoliday) return { holiday: true, name: globalHoliday.name };

    if (staffSiteId) {
      const siteHoliday = holidaysMap.get(`${dateStr}_${staffSiteId}`);
      if (siteHoliday) return { holiday: true, name: siteHoliday.name };
    }
    return { holiday: false, name: null };
  };

  const handleStatusChange = async (staff: AppUser, date: Date) => {
    if (!user || !staff.defaultSiteId || isAllSitesView || isHoliday(date, staff.defaultSiteId).holiday) {
      if(isAllSitesView) toast({title: "Read-only", description: "Select a specific site to mark attendance."});
      if(isHoliday(date, staff.defaultSiteId).holiday) toast({ title: "Holiday", description: "Cannot mark attendance on a holiday.", variant: "default" });
      return;
    }
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const currentStatus = attendanceData[staff.uid]?.[dateStr]?.status;
    const nextIndex = currentStatus ? (statusCycle.indexOf(currentStatus) + 1) % statusCycle.length : 0;
    const newStatus = statusCycle[nextIndex];
    
    const docId = `${dateStr}_${staff.uid}`;
    const docRef = doc(db, "staffAttendance", docId);
    
    try {
      await setDoc(docRef, {
        staffUid: staff.uid,
        date: dateStr,
        status: newStatus,
        siteId: staff.defaultSiteId,
        recordedByUid: user.uid,
        recordedByName: user.displayName || user.email,
      }, { merge: true });
    } catch(error: any) {
      console.error("Error saving attendance:", error);
      toast({ title: "Save Failed", description: error.message, variant: "destructive"});
    }
  };

  return (
    <TooltipProvider>
    <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
      <Table className="min-w-full border-collapse">
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-20 min-w-[200px] font-semibold text-foreground">Staff Member</TableHead>
            {daysArray.map(day => {
              const { holiday, name } = isHoliday(day, activeSiteId); // Check holiday for the active site context for header color
              return (
                <TableHead key={format(day, 'yyyy-MM-dd')} className={cn("text-center p-1 border-l", holiday && "bg-muted/60")}>
                  <div className="text-xs text-muted-foreground">{format(day, 'EEE')}</div>
                  <div className="text-sm font-bold">{format(day, 'd')}</div>
                </TableHead>
              );
            })}
            <TableHead className="text-center min-w-[100px] border-l">Totals</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staffList.map(staff => {
            let presentCount = 0; let absentCount = 0; let leaveCount = 0; let halfDayCount = 0;
            return (
                <TableRow key={staff.uid}>
                    <TableCell className="sticky left-0 bg-card z-10 border-r min-w-[200px]">
                        <div className="font-medium text-foreground">{staff.displayName || staff.email}</div>
                        {isAllSitesView && (
                            <div className="text-xs text-muted-foreground">{staff.defaultSiteId ? (sitesMap[staff.defaultSiteId] || "Unknown Site") : "No site assigned"}</div>
                        )}
                    </TableCell>
                    {daysArray.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const status = attendanceData[staff.uid]?.[dateStr]?.status;
                        const { holiday, name: holidayName } = isHoliday(day, staff.defaultSiteId);

                        if (!holiday) {
                            if (status === 'Present') presentCount++;
                            if (status === 'Absent') absentCount++;
                            if (status === 'Leave') leaveCount++;
                            if (status === 'Half-day') {
                                presentCount += 0.5;
                                halfDayCount++;
                            }
                        }

                        const cellContent = holiday ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">H</div>
                                </TooltipTrigger>
                                <TooltipContent><p>{holidayName}</p></TooltipContent>
                            </Tooltip>
                        ) : (
                            <div className={cn("h-full w-full flex items-center justify-center font-bold text-xs min-h-[40px] cursor-pointer", 
                                status ? statusBadgeClasses[status] : "hover:bg-muted/50"
                            )}>
                                {status ? status.charAt(0) : '-'}
                            </div>
                        );

                        return (
                            <TableCell 
                                key={dateStr} 
                                className={cn("text-center p-0 border-l", holiday && "bg-muted/60")}
                                onClick={() => handleStatusChange(staff, day)}
                            >
                               {cellContent}
                            </TableCell>
                        );
                    })}
                    <TableCell className="border-l text-center text-xs text-muted-foreground p-1">
                        <div>P: <span className="font-bold text-green-600">{presentCount}</span></div>
                        <div>A: <span className="font-bold text-red-600">{absentCount}</span></div>
                        <div>L: <span className="font-bold text-yellow-600">{leaveCount}</span></div>
                    </TableCell>
                </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
    </TooltipProvider>
  );
}

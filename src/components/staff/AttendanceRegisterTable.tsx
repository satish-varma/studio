
"use client";

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isBefore, isAfter, startOfDay } from 'date-fns';
import { cn } from "@/lib/utils";
import type { AppUser, StaffAttendance, AttendanceStatus, Holiday, StaffDetails } from "@/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from '../ui/checkbox';

interface AttendanceRegisterTableProps {
  staffList: AppUser[];
  staffDetailsMap: Map<string, StaffDetails>;
  attendanceData: Record<string, Record<string, StaffAttendance>>;
  month: Date;
  isAllSitesView: boolean;
  sitesMap: Record<string, string>;
  holidays: Holiday[];
  onStatusChange: (staff: AppUser, date: Date) => void;
  isHoliday: (date: Date, staffSiteId?: string | null) => { holiday: boolean; name: string | null };
  selectedStaffUids: string[];
  onSelectionChange: (uids: string[]) => void;
}

const statusBadgeClasses: Record<AttendanceStatus, string> = {
    "Present": "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800",
    "Absent": "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800",
    "Leave": "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800",
    "Half-day": "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800",
};

export function AttendanceRegisterTable({
  staffList,
  staffDetailsMap,
  attendanceData,
  month,
  isAllSitesView,
  sitesMap,
  holidays,
  onStatusChange,
  isHoliday,
  selectedStaffUids,
  onSelectionChange
}: AttendanceRegisterTableProps) {
  
  const daysArray = useMemo(() => {
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    return Array.from({ length: daysInMonth }, (_, i) => new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth(), i + 1));
  }, [month]);
  
  const isAllSelected = useMemo(() => staffList.length > 0 && selectedStaffUids.length === staffList.length, [staffList, selectedStaffUids]);
  const isIndeterminate = useMemo(() => selectedStaffUids.length > 0 && selectedStaffUids.length < staffList.length, [staffList, selectedUserIds]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectionChange(checked === true ? staffList.map(u => u.uid) : []);
  };
  
  const handleSelectOne = (userId: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      onSelectionChange([...selectedStaffUids, userId]);
    } else {
      onSelectionChange(selectedStaffUids.filter(id => id !== userId));
    }
  };


  return (
    <TooltipProvider>
    <div className="overflow-x-auto rounded-lg border shadow-sm bg-card">
      <Table className="min-w-full border-collapse">
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            <TableHead className="sticky left-0 bg-card z-20 min-w-[250px] font-semibold text-foreground">
              <div className="flex items-center gap-4">
                <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all staff for bulk action"
                    data-state={isIndeterminate ? 'indeterminate' : isAllSelected ? 'checked' : 'unchecked'}
                />
                Staff Member
              </div>
            </TableHead>
            {daysArray.map(day => {
              const { holiday } = isHoliday(day); // Check global holiday for header color
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
            let presentCount = 0; let absentCount = 0; let leaveCount = 0;
            const details = staffDetailsMap.get(staff.uid);
            const joiningDate = details?.joiningDate ? startOfDay(new Date(details.joiningDate)) : null;
            const exitDate = details?.exitDate ? startOfDay(new Date(details.exitDate)) : null;

            return (
                <TableRow key={staff.uid} data-state={selectedStaffUids.includes(staff.uid) ? "selected" : ""}>
                    <TableCell className="sticky left-0 bg-card z-10 border-r min-w-[250px] data-[state=selected]:bg-primary/10">
                      <div className="flex items-center gap-4">
                        <Checkbox
                            checked={selectedStaffUids.includes(staff.uid)}
                            onCheckedChange={(checked) => handleSelectOne(staff.uid, checked)}
                            aria-label={`Select staff member ${staff.displayName}`}
                        />
                        <div>
                          <div className="font-medium text-foreground">{staff.displayName || staff.email}</div>
                          {isAllSitesView && (
                              <div className="text-xs text-muted-foreground">{staff.defaultSiteId ? (sitesMap[staff.defaultSiteId] || "Unknown Site") : "No site assigned"}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    {daysArray.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const status = attendanceData?.[staff.uid]?.[dateStr]?.status;
                        const { holiday, name: holidayName } = isHoliday(day, staff.defaultSiteId);
                        
                        const isBeforeJoining = joiningDate && isBefore(day, joiningDate);
                        const isAfterExit = exitDate && isAfter(day, exitDate);
                        const isUnemployedPeriod = isBeforeJoining || isAfterExit;

                        if (!holiday && !isUnemployedPeriod) {
                            if (status === 'Present') presentCount++;
                            if (status === 'Absent') absentCount++;
                            if (status === 'Leave') leaveCount++;
                            if (status === 'Half-day') presentCount += 0.5;
                        }

                        const cellContent = holiday ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">H</div>
                                </TooltipTrigger>
                                <TooltipContent><p>{holidayName}</p></TooltipContent>
                            </Tooltip>
                        ) : isUnemployedPeriod ? (
                            <div className="h-full w-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 cursor-not-allowed"></div>
                        ) : (
                            <div className={cn("h-full w-full flex items-center justify-center font-bold text-xs min-h-[40px]", 
                                status ? statusBadgeClasses[status] : "hover:bg-muted/50 cursor-pointer"
                            )}>
                                {status ? status.charAt(0) : '-'}
                            </div>
                        );

                        return (
                            <TableCell 
                                key={dateStr} 
                                className={cn("text-center p-0 border-l", (holiday || isUnemployedPeriod) && "bg-muted/60")}
                                onClick={() => onStatusChange(staff, day)}
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

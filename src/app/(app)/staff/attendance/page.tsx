
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
  writeBatch,
  QueryConstraint
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isBefore, isAfter, startOfDay, eachDayOfInterval } from 'date-fns';
import { Button } from "@/components/ui/button";
import type { AppUser, StaffAttendance, Site, Holiday, AttendanceStatus, UserStatus, StaffDetails } from "@/types";
import { Loader2, Info, ChevronLeft, ChevronRight, CalendarDays, Filter, XCircle, Calendar as CalendarIcon, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import { AttendanceRegisterTable } from "@/components/staff/AttendanceRegisterTable";
import ManageHolidaysDialog from "@/components/staff/ManageHolidaysDialog";
import { logStaffActivity } from "@/lib/staffLogger";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useUserManagement } from "@/hooks/use-user-management";
import type { DateRange } from "react-day-picker";

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
  const [attendance, setAttendance] = useState<Record<string, Record<string, StaffAttendance>> | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const { toast } = useToast();
  const [isHolidaysDialogOpen, setIsHolidaysDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('active');

  const [selectedStaffUids, setSelectedStaffUids] = useState<string[]>([]);
  const [bulkUpdateDateRange, setBulkUpdateDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Use the optimized hook to fetch users and related data
  const {
    users: allStaffForContext,
    sites,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
    error: userManagementError,
  } = useUserManagement();

  const sitesMap: Record<string, string> = useMemo(() => sites.reduce((acc, site) => {
    acc[site.id] = site.name;
    return acc;
  }, {} as Record<string, string>), [sites]);

  const isAllSitesView = user?.role === 'admin' && !activeSiteId;

  const handlePrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const handleNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const handleGoToCurrentMonth = () => setCurrentMonth(new Date());

  const filteredStaffList = useMemo(() => {
    if (statusFilter === 'all') {
      return allStaffForContext;
    }
    return allStaffForContext.filter(u => (u.status || 'active') === statusFilter);
  }, [allStaffForContext, statusFilter]);
  
  useEffect(() => {
    setSelectedStaffUids([]);
  }, [statusFilter, currentMonth, activeSiteId]);
  
  useEffect(() => {
    const firstDay = startOfMonth(currentMonth);
    const lastDay = endOfMonth(currentMonth);
    const uids = allStaffForContext.map(s => s.uid);

    if (uids.length === 0) {
      setAttendance({});
      return;
    }

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
            snapshot.docs.forEach(doc => {
                const data = doc.data() as StaffAttendance;
                if (!batchAttendance[data.staffUid]) batchAttendance[data.staffUid] = {};
                batchAttendance[data.staffUid][data.date] = data;
            });
            setAttendance(prev => {
                const newAttendanceState = { ...(prev || {}) };
                snapshot.docChanges().forEach(change => {
                  const data = change.doc.data() as StaffAttendance;
                  if (!newAttendanceState[data.staffUid]) newAttendanceState[data.staffUid] = {};
                  if (change.type === "removed") {
                    delete newAttendanceState[data.staffUid][data.date];
                  } else {
                    newAttendanceState[data.staffUid][data.date] = data;
                  }
                });
                return newAttendanceState;
            });
        }, (err) => {
          console.error("Error in attendance onSnapshot:", err);
          toast({ title: "Real-time Error", description: "Could not sync attendance updates. Please refresh.", variant: "destructive" });
        });
        unsubscribers.push(unsubscribe);
    });

    const holidaysQuery = query(
        collection(db, "holidays"),
        where("date", ">=", format(firstDay, 'yyyy-MM-dd')),
        where("date", "<=", format(lastDay, 'yyyy-MM-dd'))
    );
    const unsubHolidays = onSnapshot(holidaysQuery, (snapshot) => {
      setHolidays(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday)));
    }, (err) => {
       console.error("Error in holidays onSnapshot:", err);
       toast({ title: "Real-time Error", description: "Could not sync holiday updates.", variant: "destructive" });
    });
    unsubscribers.push(unsubHolidays);

    return () => {
      console.log("Cleaning up attendance listeners.");
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentMonth, allStaffForContext, toast]);
  
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
    if (!user) return;
    
    let siteIdForAttendance: string | null = staff.defaultSiteId;
    
    if (staff.role === 'manager' && !siteIdForAttendance) {
        if (activeSiteId) {
            siteIdForAttendance = activeSiteId;
        } else if (staff.managedSiteIds && staff.managedSiteIds.length > 0) {
            siteIdForAttendance = staff.managedSiteIds[0];
        }
    }

    if (!siteIdForAttendance) {
        toast({
            title: "Site Context Required",
            description: `To mark attendance for ${staff.displayName}, a site must be assigned to them or selected in the header.`,
            variant: "destructive",
            duration: 7000
        });
        return;
    }

    const holidayInfo = isHoliday(date, siteIdForAttendance);
    if (holidayInfo.holiday) {
      toast({ title: "Holiday", description: `Cannot mark attendance on ${holidayInfo.name}.`, variant: "default" });
      return;
    }
    
    const details = staffDetailsMap.get(staff.uid);
    const joiningDate = details?.joiningDate ? startOfDay(new Date(details.joiningDate)) : null;
    const exitDate = details?.exitDate ? startOfDay(new Date(details.exitDate)) : null;

    if (joiningDate && isBefore(date, joiningDate)) {
        toast({ title: "Invalid Date", description: `${staff.displayName} had not joined yet.`, variant: "default" });
        return;
    }
    if (exitDate && isAfter(date, exitDate)) {
        toast({ title: "Invalid Date", description: `${staff.displayName} has already exited.`, variant: "default" });
        return;
    }
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const docId = `${dateStr}_${staff.uid}`;
    
    const currentStatus = attendance?.[staff.uid]?.[dateStr]?.status;
    const nextIndex = currentStatus ? (statusCycle.indexOf(currentStatus) + 1) % statusCycle.length : 0;
    const newStatus = statusCycle[nextIndex];
    
    const docRef = doc(db, "staffAttendance", docId);
    
    try {
      if (newStatus === null) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, {
            staffUid: staff.uid,
            date: dateStr,
            status: newStatus,
            siteId: siteIdForAttendance,
            recordedByUid: user.uid,
            recordedByName: user.displayName || user.email,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      await logStaffActivity(user, {
        type: 'ATTENDANCE_MARKED',
        relatedStaffUid: staff.uid,
        siteId: siteIdForAttendance,
        details: {
            date: dateStr,
            status: newStatus || 'Cleared',
            notes: `Attendance for ${staff.displayName || staff.email} on ${dateStr} set to ${newStatus || 'Cleared'}`
        }
      });

    } catch(error: any) {
      console.error("Error saving attendance:", error);
      toast({ title: "Save Failed", description: `Failed to save status for ${staff.displayName}.`, variant: "destructive"});
    }
  }, [user, attendance, isHoliday, toast, staffDetailsMap, activeSiteId]);

  const processBulkAction = async (action: (batch: ReturnType<typeof writeBatch>, staff: AppUser, date: Date) => { valid: boolean; status?: AttendanceStatus }) => {
    if (!user) {
      toast({ title: "Not Authenticated", description: "You must be logged in." });
      return;
    }
    if (selectedStaffUids.length === 0 || !bulkUpdateDateRange?.from) {
      toast({ title: "Missing Info", description: "Please select staff members and a date range." });
      return;
    }
  
    setIsBulkUpdating(true);
    const dateRange = eachDayOfInterval({ start: bulkUpdateDateRange.from, end: bulkUpdateDateRange.to || bulkUpdateDateRange.from });
    const batch = writeBatch(db);
    let validOperations = 0;
    let skippedCount = 0;
    let finalStatus: AttendanceStatus | 'Cleared' | undefined;
  
    for (const uid of selectedStaffUids) {
      const staff = allStaffForContext.find(s => s.uid === uid);
      const details = staffDetailsMap.get(uid);
      if (!staff || !staff.defaultSiteId) {
        skippedCount += dateRange.length;
        continue;
      }
      const joiningDate = details?.joiningDate ? startOfDay(new Date(details.joiningDate)) : null;
      const exitDate = details?.exitDate ? startOfDay(new Date(details.exitDate)) : null;
  
      for (const date of dateRange) {
        const holidayInfo = isHoliday(date, staff.defaultSiteId);
        if (holidayInfo.holiday || (joiningDate && isBefore(date, joiningDate)) || (exitDate && isAfter(date, exitDate))) {
          skippedCount++;
          continue;
        }
  
        const { valid, status } = action(batch, staff, date);
        if (valid) {
          validOperations++;
          finalStatus = status || 'Cleared';
        }
      }
    }
  
    if (validOperations === 0) {
      toast({ title: "No Valid Actions", description: `Could not update any of the selected staff for the chosen dates (check employment dates, holidays, or site assignments).`, variant: "default" });
      setIsBulkUpdating(false);
      return;
    }
  
    try {
      await batch.commit();
      await logStaffActivity(user, {
        type: 'ATTENDANCE_MARKED', relatedStaffUid: 'MULTIPLE', siteId: activeSiteId,
        details: {
          date: `${format(bulkUpdateDateRange.from, 'PPP')} to ${format(bulkUpdateDateRange.to || bulkUpdateDateRange.from, 'PPP')}`,
          status: finalStatus, notes: `Bulk action for ${selectedStaffUids.length} staff: ${validOperations} operations performed, ${skippedCount} skipped.`,
        }
      });
      toast({ title: "Bulk Action Successful", description: `${validOperations} attendance records updated.` });
      setSelectedStaffUids([]);
    } catch (error: any) {
      console.error("Bulk action failed:", error);
      toast({ title: "Bulk Action Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };
  
  const handleBulkUpdate = (status: AttendanceStatus) => {
    processBulkAction((batch, staff, date) => {
      const docId = `${format(date, 'yyyy-MM-dd')}_${staff.uid}`;
      const docRef = doc(db, "staffAttendance", docId);
      batch.set(docRef, {
        staffUid: staff.uid, date: format(date, 'yyyy-MM-dd'), status,
        siteId: staff.defaultSiteId, recordedByUid: user!.uid,
        recordedByName: user!.displayName || user!.email, updatedAt: new Date().toISOString(),
      }, { merge: true });
      return { valid: true, status };
    });
  };
  
  const handleBulkClear = () => {
    processBulkAction((batch, staff, date) => {
      const docId = `${format(date, 'yyyy-MM-dd')}_${staff.uid}`;
      const docRef = doc(db, "staffAttendance", docId);
      batch.delete(docRef);
      return { valid: true }; // status is undefined for delete, handled as 'Cleared'
    });
  };

  const handleMarkTodayAttendance = async () => {
    if (!user) {
      toast({ title: "Not Authenticated", description: "You must be logged in." });
      return;
    }
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    const holidayInfo = isHoliday(today);
    if (holidayInfo.holiday) {
      toast({ title: "Today is a Holiday", description: `Cannot mark attendance on ${holidayInfo.name}.`, variant: "default" });
      return;
    }
    
    setIsBulkUpdating(true);
    const activeStaff = allStaffForContext.filter(s => (s.status || 'active') === 'active');
    const todayAttendanceQuery = query(collection(db, "staffAttendance"), where("date", "==", todayStr));
    
    try {
      const todayAttendanceSnapshot = await getDocs(todayAttendanceQuery);
      const staffWithAttendanceToday = new Set(todayAttendanceSnapshot.docs.map(d => d.data().staffUid));

      const staffToMark = activeStaff.filter(staff => {
        if (!staff.defaultSiteId) return false; // Must be assigned to a site
        if (staffWithAttendanceToday.has(staff.uid)) return false; // Skip if already marked

        const details = staffDetailsMap.get(staff.uid);
        const joiningDate = details?.joiningDate ? startOfDay(new Date(details.joiningDate)) : null;
        const exitDate = details?.exitDate ? startOfDay(new Date(details.exitDate)) : null;

        if ((joiningDate && isBefore(today, joiningDate)) || (exitDate && isAfter(today, exitDate))) {
          return false;
        }
        return true;
      });

      if (staffToMark.length === 0) {
        toast({ title: "No Action Needed", description: "All active staff have their attendance marked for today or are not eligible.", variant: "default" });
        setIsBulkUpdating(false);
        return;
      }

      const batch = writeBatch(db);
      staffToMark.forEach(staff => {
        const docId = `${todayStr}_${staff.uid}`;
        const docRef = doc(db, "staffAttendance", docId);
        batch.set(docRef, {
          staffUid: staff.uid, date: todayStr, status: 'Present',
          siteId: staff.defaultSiteId, recordedByUid: user.uid,
          recordedByName: user.displayName || user.email, updatedAt: new Date().toISOString(),
        }, { merge: true });
      });

      await batch.commit();
      await logStaffActivity(user, {
        type: 'ATTENDANCE_MARKED', relatedStaffUid: 'MULTIPLE', siteId: activeSiteId,
        details: { date: todayStr, status: 'Present', notes: `Marked today's attendance for ${staffToMark.length} staff.` }
      });
      toast({ title: "Attendance Marked", description: `Successfully marked ${staffToMark.length} staff member(s) as present for today.` });

    } catch (error: any) {
      console.error("Mark Today's Attendance failed:", error);
      toast({ title: "Action Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  if (authLoading || userManagementLoading) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

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
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="text-xl font-semibold text-center min-w-[150px]">{format(currentMonth, "MMMM yyyy")}</h2>
            <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={handleGoToCurrentMonth}>Current Month</Button>
            <Button variant="secondary" onClick={handleMarkTodayAttendance} disabled={isBulkUpdating}>
                {isBulkUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Check className="mr-2 h-4 w-4"/>}
                Mark Today's Attendance
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
              <SelectTrigger className="w-[180px] bg-input">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Staff</SelectItem>
                <SelectItem value="inactive">Inactive Staff</SelectItem>
                <SelectItem value="all">All Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      
      {selectedStaffUids.length > 0 && (
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-md flex flex-col md:flex-row items-center gap-4">
            <div className="flex-grow">
                <p className="font-semibold text-primary">{selectedStaffUids.length} staff member(s) selected.</p>
                <p className="text-xs text-muted-foreground">Select a date range and status to mark attendance for all selected members.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="bulkUpdateDateRange" variant={"outline"}
                        className={cn("w-[260px] justify-start text-left font-normal bg-background", !bulkUpdateDateRange && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bulkUpdateDateRange?.from ? (
                          bulkUpdateDateRange.to ? (
                            <>
                              {format(bulkUpdateDateRange.from, "LLL dd, y")} - {format(bulkUpdateDateRange.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(bulkUpdateDateRange.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar initialFocus mode="range" defaultMonth={bulkUpdateDateRange?.from} selected={bulkUpdateDateRange} onSelect={setBulkUpdateDateRange} numberOfMonths={2}/>
                    </PopoverContent>
                  </Popover>

                <Button size="sm" variant="outline" className="bg-green-50 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800" onClick={() => handleBulkUpdate('Present')} disabled={isBulkUpdating}>Mark Present</Button>
                <Button size="sm" variant="outline" className="bg-red-100 text-red-800 border-red-200 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800" onClick={() => handleBulkUpdate('Absent')} disabled={isBulkUpdating}>Mark Absent</Button>
                <Button size="sm" variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-400 dark:border-yellow-800" onClick={() => handleBulkUpdate('Leave')} disabled={isBulkUpdating}>Mark Leave</Button>
                <Button size="sm" variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800" onClick={() => handleBulkUpdate('Half-day')} disabled={isBulkUpdating}>Mark Half-day</Button>
                <Button size="sm" variant="destructive" onClick={handleBulkClear} disabled={isBulkUpdating}><XCircle className="h-4 w-4 mr-1"/>Clear</Button>
                {isBulkUpdating && <Loader2 className="h-5 w-5 animate-spin"/>}
            </div>
        </div>
      )}

      {userManagementError ? (
         <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{userManagementError}</AlertDescription></Alert>
      ) : !activeSiteId && !isAllSitesView ? (
         <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>Please select a site from the header to manage staff attendance.</AlertDescription>
        </Alert>
      ) : userManagementLoading || attendance === null ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /><p className="ml-2">Loading staff and attendance data...</p></div>
      ) : filteredStaffList.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No staff matching the current filters found for the selected context.</div>
      ) : (
        <AttendanceRegisterTable
            staffList={filteredStaffList}
            staffDetailsMap={staffDetailsMap}
            attendanceData={attendance}
            month={currentMonth}
            isAllSitesView={isAllSitesView}
            sitesMap={sitesMap}
            holidays={holidays}
            onStatusChange={handleStatusChange}
            isHoliday={isHoliday}
            selectedStaffUids={selectedStaffUids}
            onSelectionChange={setSelectedStaffUids}
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

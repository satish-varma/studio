
"use client";

import { useState, useEffect, useCallback } from "react";
import type { StaffActivityLog, Site, AppUser, StaffActivityType } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy,
  getDocs,
  limit,
  startAfter,
  DocumentSnapshot,
  DocumentData,
  endBefore,
  where,
  QueryConstraint,
  Timestamp
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert, ListFilter, Calendar as CalendarIcon, Building } from "lucide-react";
import { StaffActivityLogTable } from "@/components/staff/StaffActivityLogTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfWeek, startOfWeek, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const LOG_PREFIX = "[StaffActivityLogClientPage]";
const LOGS_PER_PAGE = 25;

const staffActivityTypes: StaffActivityType[] = [
  'ATTENDANCE_MARKED',
  'SALARY_ADVANCE_GIVEN',
  'STAFF_DETAILS_UPDATED',
  'SALARY_PAID',
  'USER_STATUS_CHANGED',
];

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

export default function StaffActivityLogClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<StaffActivityLog[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [allAdminsAndManagers, setAllAdminsAndManagers] = useState<AppUser[]>([]);
  
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [firstLogDoc, setFirstLogDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastLogDoc, setLastLogDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isLoadingPrevPage, setIsLoadingPrevPage] = useState(false);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);

  // Filter states
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: startOfDay(subDays(new Date(), 6)),
    to: endOfDay(new Date())
  }));
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

   const datePresets = [
    { label: "Today", value: 'today' },
    { label: "Yesterday", value: 'yesterday' },
    { label: "This Week", value: 'this_week' },
    { label: "Last Week", value: 'last_week' },
    { label: "Last 7 Days", value: 'last_7_days' },
    { label: "This Month", value: 'this_month' },
    { label: "Last Month", value: 'last_month' },
    { label: "All Time", value: 'all_time' },
  ];
  
  const handleSetDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date | undefined, to: Date | undefined = endOfDay(now);

    switch (preset) {
        case 'today': from = startOfDay(now); break;
        case 'yesterday': from = startOfDay(subDays(now, 1)); to = endOfDay(subDays(now, 1)); break;
        case 'this_week': from = startOfWeek(now); break;
        case 'last_week': from = startOfWeek(subDays(now, 7)); to = endOfWeek(subDays(now, 7)); break;
        case 'last_7_days': from = startOfDay(subDays(now, 6)); break;
        case 'this_month': from = startOfMonth(now); break;
        case 'last_month': from = startOfMonth(subDays(startOfMonth(now), 1)); to = endOfMonth(subDays(startOfMonth(now), 1)); break;
        case 'all_time': from = undefined; to = undefined; break;
        default: from = undefined; to = undefined;
    }
    setTempDateRange({ from, to });
  };
  
  const applyDateFilter = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };


  const fetchContextMaps = useCallback(async () => {
    if (!db) return false;
    console.log(`${LOG_PREFIX} Fetching context maps (sites, users).`);
    try {
      const sitesSnapshot = await getDocs(query(collection(db, "sites"), orderBy("name")));
      const newSitesMap: Record<string, string> = {};
      const fetchedSites: Site[] = [];
      sitesSnapshot.forEach(doc => {
        const siteData = { id: doc.id, ...doc.data() } as Site;
        newSitesMap[doc.id] = siteData.name;
        fetchedSites.push(siteData);
      });
      setSitesMap(newSitesMap);
      setAllSites(fetchedSites);

      const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
      const newUsersMap: Record<string, string> = {};
      const fetchedAdminsManagers: AppUser[] = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data() as Omit<AppUser, 'uid'>;
        newUsersMap[doc.id] = userData.displayName || userData.email || doc.id;
        if (userData.role === 'admin' || userData.role === 'manager') {
            fetchedAdminsManagers.push({ uid: doc.id, ...userData } as AppUser);
        }
      });
      setUsersMap(newUsersMap);
      setAllAdminsAndManagers(fetchedAdminsManagers);
      console.log(`${LOG_PREFIX} Context maps fetched successfully.`);
      return true;
    } catch (mapError: any) {
      console.error(`${LOG_PREFIX} Error fetching context maps:`, mapError);
      setErrorData("Failed to load context data for filters. " + mapError.message);
      return false;
    }
  }, []);

  const fetchLogsPage = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      setErrorData("Access Denied: You do not have permission to view this page.");
      setLoadingData(false);
      return;
    }
    console.log(`${LOG_PREFIX} fetchLogsPage called. Direction: ${direction}, Filters:`, {siteFilter, userFilter, typeFilter, dateRange});

    if (direction === 'initial') setLoadingData(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorData(null);

    const logsCollectionRef = collection(db, "staffActivityLogs");
    let qConstraints: QueryConstraint[] = [orderBy("timestamp", "desc")];
    
    if (siteFilter !== 'all') qConstraints.push(where("siteId", "==", siteFilter));
    if (userFilter !== 'all') qConstraints.push(where("userId", "==", userFilter));
    if (typeFilter !== 'all') qConstraints.push(where("type", "==", typeFilter));
    if (dateRange?.from) qConstraints.push(where("timestamp", ">=", dateRange.from.toISOString()));
    if (dateRange?.to) qConstraints.push(where("timestamp", "<=", endOfDay(dateRange.to).toISOString()));

    if (direction === 'next' && lastLogDoc) qConstraints.push(startAfter(lastLogDoc));
    else if (direction === 'prev' && firstLogDoc) qConstraints.push(endBefore(firstLogDoc));
    qConstraints.push(limit(LOGS_PER_PAGE + 1));
    
    const q = query(logsCollectionRef, ...qConstraints);
    
    try {
        const snapshot = await getDocs(q);
        let fetchedLogs: StaffActivityLog[] = snapshot.docs.map(docSnapshot => ({
            id: docSnapshot.id, ...docSnapshot.data() } as StaffActivityLog));
        
        const hasMore = fetchedLogs.length > LOGS_PER_PAGE;
        if (hasMore) fetchedLogs.pop();

        setLogs(fetchedLogs);
        
        if (snapshot.docs.length > 0) {
            setFirstLogDoc(snapshot.docs[0]);
            setLastLogDoc(snapshot.docs[fetchedLogs.length - 1]);
            setIsLastPage(!hasMore);
            if (direction === 'initial') setIsFirstPageReached(true);
            else if (direction === 'next') setIsFirstPageReached(false);
        } else {
            if (direction === 'next') setIsLastPage(true);
            if (direction === 'initial') { setIsLastPage(true); setIsFirstPageReached(true); }
        }
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error fetching activity logs:`, error);
        setErrorData("Failed to load activity logs. " + error.message);
    } finally {
        setLoadingData(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
    }
  }, [currentUser, lastLogDoc, firstLogDoc, siteFilter, userFilter, typeFilter, dateRange]);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      setErrorData("Access Denied: You do not have permission to view this page.");
      setLoadingData(false);
      return;
    }
    const initFetch = async () => {
      setLoadingData(true);
      const mapsSuccess = await fetchContextMaps();
      if (mapsSuccess) {
        await fetchLogsPage('initial');
      }
      setLoadingData(false);
    };
    initFetch();
  }, [currentUser, authLoading, fetchContextMaps]);

  useEffect(() => {
    fetchLogsPage('initial');
  }, [siteFilter, userFilter, typeFilter, dateRange, fetchLogsPage]);


  if (authLoading || (loadingData && logs.length === 0 && !errorData)) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading activity log...</p></div>;
  }

  if (errorData) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{errorData}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="flex items-center"><ListFilter className="mr-2 h-5 w-5"/> Filters</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 border-t pt-4">
             <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                <Button
                    id="logDateRange" variant={'outline'}
                    className={cn("w-full lg:w-[300px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? ( dateRange.to ? (
                        <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </>
                    ) : ( format(dateRange.from, "LLL dd, y") )
                    ) : ( <span>Pick a date range</span> )}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 flex" align="start">
                     <div className="p-2 border-r">
                        <div className="flex flex-col items-stretch gap-1">
                            {datePresets.map(({label, value}) => (
                                <Button key={value} variant="ghost" className="justify-start" onClick={() => handleSetDatePreset(value)}>{label}</Button>
                            ))}
                        </div>
                    </div>
                    <div className="p-2">
                        <div className="flex justify-between items-center mb-2 px-2">
                          <p className="text-sm font-medium">Start: <span className="font-normal text-muted-foreground">{tempDateRange?.from ? format(tempDateRange.from, 'PPP') : '...'}</span></p>
                          <p className="text-sm font-medium">End: <span className="font-normal text-muted-foreground">{tempDateRange?.to ? format(tempDateRange.to, 'PPP') : '...'}</span></p>
                        </div>
                        <Calendar
                            initialFocus mode="range" defaultMonth={tempDateRange?.from}
                            selected={tempDateRange} onSelect={setTempDateRange} numberOfMonths={2}
                            disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                        />
                        <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                             <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button>
                             <Button onClick={applyDateFilter}>Apply</Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                    <SelectTrigger className="w-full bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Filter by site" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger className="w-full bg-input"><ListFilter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Filter by performer" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Performers</SelectItem>{allAdminsAndManagers.map(u => <SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full bg-input"><ListFilter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Filter by type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {staffActivityTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>
      <StaffActivityLogTable
        logs={logs}
        sitesMap={sitesMap}
        usersMap={usersMap}
        isLoadingNextPage={isLoadingNextPage}
        isLoadingPrevPage={isLoadingPrevPage}
        isLastPage={isLastPage}
        isFirstPage={isFirstPageReached}
        onNextPage={() => fetchLogsPage('next')}
        onPrevPage={() => fetchLogsPage('prev')}
      />
    </div>
  );
}

    
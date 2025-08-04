
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoodStallActivityLog, Site, Stall, AppUser, FoodStallActivityType } from "@/types";
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
import { FoodActivityLogTable } from "@/components/foodstall/FoodActivityLogTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

const LOG_PREFIX = "[FoodActivityLogClientPage]";
const LOGS_PER_PAGE = 25;

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time' | 'custom';

const foodActivityTypes: FoodStallActivityType[] = [
  'EXPENSE_RECORDED',
  'EXPENSE_UPDATED',
  'EXPENSE_BULK_IMPORTED',
  'SALE_RECORDED_OR_UPDATED',
];

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

export default function FoodActivityLogClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<FoodStallActivityLog[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
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
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all_time');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  useEffect(() => {
    const now = new Date();
    switch (dateFilter) {
        case 'today':
            setDateRange({ from: startOfDay(now), to: endOfDay(now) });
            break;
        case 'last_7_days':
            setDateRange({ from: startOfDay(subDays(now, 6)), to: endOfDay(now) });
            break;
        case 'this_month':
            setDateRange({ from: startOfMonth(now), to: endOfDay(now) });
            break;
        case 'all_time':
            setDateRange(undefined); // Clear custom range
            break;
        case 'custom':
            break; // Custom range is handled by onDateRangeChange
    }
  }, [dateFilter]);

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
      setDateRange(newRange);
      setDateFilter('custom');
  }

  const fetchContextMaps = useCallback(async () => {
    if (!db) return false;
    console.log(`${LOG_PREFIX} Fetching context maps (sites, users, stalls).`);
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

      const stallsSnapshot = await getDocs(collection(db, "stalls"));
      const newStallsMap: Record<string, string> = {};
      stallsSnapshot.forEach(doc => {
          newStallsMap[doc.id] = (doc.data() as Stall).name;
      });
      setStallsMap(newStallsMap);

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
    console.log(`${LOG_PREFIX} fetchLogsPage called. Direction: ${direction}, Filters:`, {siteFilter, userFilter, typeFilter, dateFilter});

    if (direction === 'initial') setLoadingData(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorData(null);

    const logsCollectionRef = collection(db, "foodStallActivityLogs");
    let qConstraints: QueryConstraint[] = [orderBy("timestamp", "desc")];
    
    // Apply filters
    if (siteFilter !== 'all') qConstraints.push(where("siteId", "==", siteFilter));
    if (userFilter !== 'all') qConstraints.push(where("userId", "==", userFilter));
    if (typeFilter !== 'all') qConstraints.push(where("type", "==", typeFilter));
    if (dateRange?.from) qConstraints.push(where("timestamp", ">=", dateRange.from.toISOString()));
    if (dateRange?.to) qConstraints.push(where("timestamp", "<=", endOfDay(dateRange.to).toISOString()));

    // Apply pagination
    if (direction === 'next' && lastLogDoc) qConstraints.push(startAfter(lastLogDoc));
    else if (direction === 'prev' && firstLogDoc) qConstraints.push(endBefore(firstLogDoc));
    qConstraints.push(limit(LOGS_PER_PAGE + 1));
    
    const q = query(logsCollectionRef, ...qConstraints);
    
    try {
        const snapshot = await getDocs(q);
        let fetchedLogs: FoodStallActivityLog[] = snapshot.docs.map(docSnapshot => ({
            id: docSnapshot.id, ...docSnapshot.data() } as FoodStallActivityLog));
        
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
  }, [currentUser, lastLogDoc, firstLogDoc, siteFilter, userFilter, typeFilter, dateFilter, dateRange]);

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
            <div className="flex flex-wrap items-center gap-2">
                 <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => setDateFilter('today')}>Today</Button>
                 <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => setDateFilter('last_7_days')}>Last 7 Days</Button>
                 <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => setDateFilter('this_month')}>This Month</Button>
                 <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => setDateFilter('all_time')}>All Time</Button>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        id="logDateRange" variant={dateFilter === 'custom' ? 'default' : 'outline'}
                        className={cn("w-[260px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? ( dateRange.to ? (
                            <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </>
                        ) : ( format(dateRange.from, "LLL dd, y") )
                        ) : ( <span>Pick a date range</span> )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus mode="range" defaultMonth={dateRange?.from}
                        selected={dateRange} onSelect={handleDateRangeChange} numberOfMonths={2}
                        disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                    />
                    </PopoverContent>
                </Popover>
            </div>
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
                      {foodActivityTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>
      <FoodActivityLogTable
        logs={logs}
        sitesMap={sitesMap}
        stallsMap={stallsMap}
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

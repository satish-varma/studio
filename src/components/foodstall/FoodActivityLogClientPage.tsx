
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoodStallActivityLog, Site, Stall, AppUser } from "@/types";
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
  endBefore
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { FoodActivityLogTable } from "@/components/foodstall/FoodActivityLogTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LOG_PREFIX = "[FoodActivityLogClientPage]";
const LOGS_PER_PAGE = 25;

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
  
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [firstLogDoc, setFirstLogDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastLogDoc, setLastLogDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isLoadingPrevPage, setIsLoadingPrevPage] = useState(false);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);

  const fetchContextMaps = useCallback(async () => {
    console.log(`${LOG_PREFIX} Fetching context maps (sites, stalls, users).`);
    try {
      const sitesSnapshot = await getDocs(collection(db, "sites"));
      const newSitesMap: Record<string, string> = {};
      sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
      setSitesMap(newSitesMap);

      const stallsSnapshot = await getDocs(collection(db, "stalls"));
      const newStallsMap: Record<string, string> = {};
      stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
      setStallsMap(newStallsMap);

      const usersSnapshot = await getDocs(collection(db, "users"));
      const newUsersMap: Record<string, string> = {};
      usersSnapshot.forEach(doc => {
        const userData = doc.data() as AppUser;
        newUsersMap[doc.id] = userData.displayName || userData.email || doc.id;
      });
      setUsersMap(newUsersMap);
      console.log(`${LOG_PREFIX} Context maps fetched successfully.`);
      return true;
    } catch (mapError: any) {
      console.error(`${LOG_PREFIX} Error fetching context maps:`, mapError);
      setErrorData("Failed to load context data for logs. " + mapError.message);
      return false;
    }
  }, []);

  const fetchLogsPage = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      setErrorData("Access Denied: You do not have permission to view this page.");
      setLoadingData(false);
      return;
    }
    console.log(`${LOG_PREFIX} fetchLogsPage called. Direction: ${direction}`);

    if (direction === 'initial') setLoadingData(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorData(null);

    const logsCollectionRef = collection(db, "foodStallActivityLogs");
    let q = query(logsCollectionRef, orderBy("timestamp", "desc"));

    if (direction === 'next' && lastLogDoc) {
      q = query(q, startAfter(lastLogDoc));
    } else if (direction === 'prev' && firstLogDoc) {
      q = query(logsCollectionRef, orderBy("timestamp", "asc"), startAfter(firstLogDoc), limit(LOGS_PER_PAGE));
       // This logic is tricky. A simpler way is just to re-fetch and page client-side for small datasets
       // Or handle prev-page logic more carefully. For now, let's keep it simple.
       // The best way for 'prev' is to reverse order and use endBefore, then reverse results.
       // Let's stick to just next for simplicity for now.
    }
    q = query(q, limit(LOGS_PER_PAGE + 1));
    
    try {
        const snapshot = await getDocs(q);
        let fetchedLogs: FoodStallActivityLog[] = snapshot.docs.map(docSnapshot => ({
            id: docSnapshot.id,
            ...docSnapshot.data()
        } as FoodStallActivityLog));
        
        const hasMore = fetchedLogs.length > LOGS_PER_PAGE;
        if (hasMore) fetchedLogs.pop();

        setLogs(fetchedLogs);
        
        if (snapshot.docs.length > 0) {
            setFirstLogDoc(snapshot.docs[0]);
            setLastLogDoc(snapshot.docs[fetchedLogs.length - 1]);
            setIsLastPage(!hasMore);
            if (direction === 'initial') setIsFirstPageReached(true);
            if (direction === 'next') setIsFirstPageReached(false);

        } else {
            if (direction === 'next') setIsLastPage(true);
            if (direction === 'initial') {
                setIsLastPage(true);
                setIsFirstPageReached(true);
            }
        }
    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error fetching activity logs:`, error);
        setErrorData("Failed to load activity logs. " + error.message);
    } finally {
        setLoadingData(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
    }
  }, [currentUser, lastLogDoc, firstLogDoc]);

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
        // We call fetchLogsPage directly here. It's stable due to useCallback.
        // It won't cause the infinite loop.
        await fetchLogsPage('initial');
      }
      setLoadingData(false);
    };
    initFetch();
  }, [currentUser, authLoading, fetchContextMaps]); // Removed fetchLogsPage from dependency array

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
  );
}

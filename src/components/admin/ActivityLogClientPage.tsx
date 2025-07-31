
"use client";

import { useState, useEffect, useCallback } from "react";
import type { StockMovementLog } from "@/types/log";
import type { Site, Stall, StockItem, AppUser } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  orderBy,
  getDocs,
  limit,
  startAfter,
  DocumentSnapshot as FirestoreDocumentSnapshot,
  DocumentData,
  endBefore
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityLogTable } from "@/components/admin/ActivityLogTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LOG_PREFIX = "[ActivityLogClientPage]";
const LOGS_PER_PAGE = 25;

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function ActivityLogClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<StockMovementLog[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [itemsMap, setItemsMap] = useState<Record<string, string>>({});
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  const [firstLogDoc, setFirstLogDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [lastLogDoc, setLastLogDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isLoadingPrevPage, setIsLoadingPrevPage] = useState(false);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);

  const fetchContextMaps = useCallback(async () => {
    console.log(`${LOG_PREFIX} Fetching context maps (sites, stalls, items, users).`);
    try {
      const sitesCollectionRef = collection(db, "sites");
      const sitesSnapshot = await getDocs(sitesCollectionRef);
      const newSitesMap: Record<string, string> = {};
      sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
      setSitesMap(newSitesMap);

      const stallsCollectionRef = collection(db, "stalls");
      const stallsSnapshot = await getDocs(stallsCollectionRef);
      const newStallsMap: Record<string, string> = {};
      stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
      setStallsMap(newStallsMap);

      const itemsCollectionRef = collection(db, "stockItems");
      const itemsSnapshot = await getDocs(itemsCollectionRef);
      const newItemsMap: Record<string, string> = {};
      itemsSnapshot.forEach(doc => newItemsMap[doc.id] = (doc.data() as StockItem).name);
      setItemsMap(newItemsMap);

      const usersCollectionRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersCollectionRef);
      const newUsersMap: Record<string, string> = {};
      usersSnapshot.forEach(doc => {
        const userData = doc.data() as AppUser;
        newUsersMap[doc.id] = userData.displayName || userData.email || doc.id;
      });
      setUsersMap(newUsersMap);
      console.log(`${LOG_PREFIX} Context maps fetched successfully.`);
      return true;
    } catch (mapError: any) {
      console.error(`${LOG_PREFIX} Error fetching context maps:`, mapError.message, mapError.stack);
      setErrorData(prev => (prev ? prev + "\n" : "") + "Failed to load context data for logs. " + mapError.message);
      return false;
    }
  }, []);

  const fetchLogsPage = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading) return;
    if (!currentUser || currentUser.role !== 'admin') {
        setLoadingData(false);
        setErrorData("Access Denied: You do not have permission to view this page.");
        return;
    }
    console.log(`${LOG_PREFIX} fetchLogsPage called. Direction: ${direction}`);

    if (direction === 'initial') setLoadingData(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorData(null);

    const logsCollectionRef = collection(db, "stockMovementLogs");
    let q = query(logsCollectionRef, orderBy("timestamp", "desc"));

    if (direction === 'next' && lastLogDoc) {
        q = query(q, startAfter(lastLogDoc), limit(LOGS_PER_PAGE + 1));
    } else if (direction === 'prev' && firstLogDoc) {
        q = query(logsCollectionRef, orderBy("timestamp", "asc"), startAfter(firstLogDoc), limit(LOGS_PER_PAGE));
    } else {
        q = query(q, limit(LOGS_PER_PAGE + 1));
    }
    
    try {
        const snapshot = await getDocs(q);
        console.log(`${LOG_PREFIX} Logs snapshot received. Docs: ${snapshot.docs.length}, Empty: ${snapshot.empty}`);
        let fetchedLogs: StockMovementLog[] = snapshot.docs.map(docSnapshot => ({
            id: docSnapshot.id,
            ...docSnapshot.data()
        } as StockMovementLog));
        
        const hasMore = fetchedLogs.length > LOGS_PER_PAGE;
        if (hasMore && (direction === 'initial' || direction === 'next')) {
            fetchedLogs.pop();
        }
        
        setLogs(fetchedLogs);
        
        if (snapshot.docs.length > 0) {
            if (direction === 'initial') setIsFirstPageReached(true);
            else if (direction === 'next') setIsFirstPageReached(false);
            else if (direction === 'prev' && fetchedLogs.length < LOGS_PER_PAGE) setIsFirstPageReached(true);
            
            setFirstLogDoc(snapshot.docs[0]);
            setLastLogDoc(snapshot.docs[fetchedLogs.length - 1]);
            setIsLastPage(!hasMore && (direction === 'initial' || direction === 'next'));
        } else {
            if (direction === 'initial') {
                setIsFirstPageReached(true);
                setIsLastPage(true);
            } else if (direction === 'next') {
                setIsLastPage(true);
            } else if (direction === 'prev') {
                 setIsFirstPageReached(true);
            }
            setFirstLogDoc(null);
            setLastLogDoc(null);
        }
        console.log(`${LOG_PREFIX} Processed logs: ${fetchedLogs.length}. HasMore: ${hasMore}. IsLastPage: ${isLastPage}. IsFirstPage: ${isFirstPageReached}`);

    } catch (error: any) {
        console.error(`${LOG_PREFIX} Error fetching activity logs:`, error.message, error.stack);
        setErrorData("Failed to load activity logs. " + error.message);
    } finally {
        setLoadingData(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
    }
  }, [authLoading, currentUser, lastLogDoc, firstLogDoc]);


  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || currentUser.role !== 'admin') {
      console.warn(`${LOG_PREFIX} User not authorized. CurrentUser: ${!!currentUser}, Role: ${currentUser?.role}`);
      setLoadingData(false);
      setErrorData("Access Denied: You do not have permission to view this page.");
      return;
    }

    const initFetch = async () => {
      setLoadingData(true);
      const mapsSuccess = await fetchContextMaps();
      if (mapsSuccess) {
        await fetchLogsPage('initial');
      } else {
        setLoadingData(false); 
      }
    };
    initFetch();
  }, [currentUser, authLoading, fetchContextMaps, fetchLogsPage]); 


  if (authLoading || (loadingData && logs.length === 0 && !errorData)) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading activity log and context data...</p>
      </div>
    );
  }

  if (errorData && logs.length === 0) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive">
            <ShieldAlert className="mr-2 h-5 w-5" />
            Access Restricted or Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{errorData}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ActivityLogTable 
        logs={logs} 
        sitesMap={sitesMap} 
        stallsMap={stallsMap}
        itemsMap={itemsMap}
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

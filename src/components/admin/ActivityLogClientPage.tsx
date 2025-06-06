
"use client";

import { useState, useEffect } from "react";
import type { StockMovementLog } from "@/types/log";
import type { Site, Stall } from "@/types"; // Import Site and Stall types
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  QuerySnapshot,
  DocumentData,
  getDocs // Import getDocs for one-time fetch of sites/stalls
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityLogTable } from "@/components/admin/ActivityLogTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ActivityLogClientPage:", error);
  }
}
const db = getFirestore();

export default function ActivityLogClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const [logs, setLogs] = useState<StockMovementLog[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true); // Combined loading state
  const [errorData, setErrorData] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser || currentUser.role !== 'admin') {
      setLoadingData(false);
      setErrorData("Access Denied: You do not have permission to view this page.");
      return;
    }

    setLoadingData(true);
    setErrorData(null);

    const fetchMapsAndLogs = async () => {
      try {
        // Fetch Sites Map
        const sitesCollectionRef = collection(db, "sites");
        const sitesSnapshot = await getDocs(sitesCollectionRef);
        const newSitesMap: Record<string, string> = {};
        sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
        setSitesMap(newSitesMap);

        // Fetch Stalls Map
        const stallsCollectionRef = collection(db, "stalls");
        const stallsSnapshot = await getDocs(stallsCollectionRef);
        const newStallsMap: Record<string, string> = {};
        stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
        setStallsMap(newStallsMap);

        // Subscribe to Logs
        const logsCollectionRef = collection(db, "stockMovementLogs");
        const q = query(logsCollectionRef, orderBy("timestamp", "desc")); 

        const unsubscribeLogs = onSnapshot(q, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedLogs: StockMovementLog[] = snapshot.docs.map(docSnapshot => ({
              id: docSnapshot.id,
              ...docSnapshot.data()
            } as StockMovementLog));
            setLogs(fetchedLogs);
            // Only set loading to false after logs are also fetched for the first time
            // Subsequent log updates won't change this overall page loading state
            if (loadingData) setLoadingData(false); 
            setErrorData(null);
          },
          (error) => {
            console.error("Error fetching activity logs:", error);
            setErrorData("Failed to load activity logs. Please try again later.");
            setLoadingData(false);
          }
        );
        return unsubscribeLogs; // Return the unsubscribe function for logs

      } catch (mapError) {
        console.error("Error fetching site/stall maps:", mapError);
        setErrorData("Failed to load site/stall context data.");
        setLoadingData(false);
        return null; // No unsubscribe function to return if maps fail
      }
    };
    
    let unsubscribeLogs: (() => void) | null = null;
    fetchMapsAndLogs().then(unsub => {
        if (unsub) unsubscribeLogs = unsub;
    });

    return () => {
      if (unsubscribeLogs) unsubscribeLogs();
    };
  }, [currentUser, authLoading, loadingData]); // Rerun if loadingData was true and maps finished, to init log listener

  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading activity log and context data...</p>
      </div>
    );
  }

  if (errorData) {
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
      <ActivityLogTable logs={logs} sitesMap={sitesMap} stallsMap={stallsMap} />
    </div>
  );
}

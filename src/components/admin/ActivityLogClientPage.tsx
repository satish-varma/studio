
"use client";

import { useState, useEffect } from "react";
import type { StockMovementLog } from "@/types/log";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  QuerySnapshot,
  DocumentData
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
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [errorLogs, setErrorLogs] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser || currentUser.role !== 'admin') {
      setLoadingLogs(false);
      setErrorLogs("Access Denied: You do not have permission to view this page.");
      return;
    }

    const logsCollectionRef = collection(db, "stockMovementLogs");
    const q = query(logsCollectionRef, orderBy("timestamp", "desc")); // Fetch newest logs first

    const unsubscribe = onSnapshot(q, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedLogs: StockMovementLog[] = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        } as StockMovementLog));
        setLogs(fetchedLogs);
        setLoadingLogs(false);
        setErrorLogs(null);
      },
      (error) => {
        console.error("Error fetching activity logs:", error);
        setErrorLogs("Failed to load activity logs. Please try again later.");
        setLoadingLogs(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser, authLoading]);

  if (authLoading || loadingLogs) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading activity logs...</p>
      </div>
    );
  }

  if (errorLogs) {
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
            <AlertDescription>{errorLogs}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ActivityLogTable logs={logs} />
    </div>
  );
}

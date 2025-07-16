
"use client";

import { useState, useEffect } from "react";
import type { AppUser, Site } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query,
  orderBy
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StaffListTable } from "@/components/staff/StaffListTable";

const LOG_PREFIX = "[StaffListClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function StaffListClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  
  const [staffUsers, setStaffUsers] = useState<AppUser[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      setErrorData("Access Denied: You do not have permission to view this page.");
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const usersQuery = query(
        collection(db, "users"), 
        orderBy("displayName", "asc")
    );
    
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser))
            .filter(u => u.role === 'staff' || u.role === 'manager'); // Show staff and managers
        setStaffUsers(fetchedUsers);
        setLoadingData(false);
    }, (error) => {
        console.error("Error fetching staff users:", error);
        setErrorData("Failed to load staff list.");
        setLoadingData(false);
    });

    const sitesQuery = query(collection(db, "sites"));
    const unsubscribeSites = onSnapshot(sitesQuery, (snapshot) => {
        const newSitesMap: Record<string, string> = {};
        snapshot.forEach(doc => {
            newSitesMap[doc.id] = (doc.data() as Site).name;
        });
        setSitesMap(newSitesMap);
    });

    return () => {
        unsubscribeUsers();
        unsubscribeSites();
    };
  }, [currentUser, authLoading]);

  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading staff data...</p>
      </div>
    );
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
    <StaffListTable users={staffUsers} sitesMap={sitesMap} />
  );
}

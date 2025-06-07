
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2, ShieldAlert, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { StallsTable } from "@/components/admin/StallsTable";
import type { Stall } from "@/types/stall";
import type { Site } from "@/types/site";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  getDoc,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

const LOG_PREFIX = "[StallsClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function StallsClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const siteId = params.siteId as string;
  
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);

  useEffect(() => {
    console.log(`${LOG_PREFIX} Mounted. AuthLoading: ${authLoading}, SiteID: ${siteId}`);
    if (authLoading) return;

    if (!currentUser) {
        console.warn(`${LOG_PREFIX} No current user. Auth may still be loading or user not logged in.`);
        setLoadingData(false);
        setErrorData("Authentication is required to manage stalls.");
        return;
    }
    if (currentUser.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Access denied. User role: ${currentUser.role}`);
      setLoadingData(false);
      setErrorData("Access Denied: You do not have permission to manage stalls.");
      return;
    }

    if (!siteId) {
      console.warn(`${LOG_PREFIX} Site ID is missing. Redirecting to sites page.`);
      setLoadingData(false);
      setErrorData("Site ID is missing. Cannot load stalls.");
      router.replace("/admin/sites");
      return;
    }
    
    let unsubscribeSite: (() => void) | null = null;
    let unsubscribeStalls: (() => void) | null = null;

    const fetchData = async () => {
      console.log(`${LOG_PREFIX} Starting fetchData for site ${siteId}.`);
      setLoadingData(true);
      setErrorData(null);
      try {
        const siteDocRef = doc(db, "sites", siteId);
        unsubscribeSite = onSnapshot(siteDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            console.log(`${LOG_PREFIX} Site document for ${siteId} received:`, docSnapshot.data());
            setSite({ id: docSnapshot.id, ...docSnapshot.data() } as Site);
          } else {
            console.warn(`${LOG_PREFIX} Parent site ${siteId} not found.`);
            setErrorData("Parent site not found. Cannot load stalls.");
            setSite(null);
            setStalls([]);
          }
        }, (error) => {
          console.error(`${LOG_PREFIX} Error fetching site details for ${siteId}:`, error.message, error.stack);
          setErrorData(`Failed to load site details: ${error.message}.`);
          setSite(null);
        });

        const stallsCollectionRef = collection(db, "stalls");
        const q = query(stallsCollectionRef, where("siteId", "==", siteId));
        console.log(`${LOG_PREFIX} Subscribing to stalls for site ${siteId}.`);
        unsubscribeStalls = onSnapshot(q, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedStalls: Stall[] = snapshot.docs.map(docSnapshot => ({
              id: docSnapshot.id,
              ...docSnapshot.data()
            } as Stall)).sort((a,b) => (b.createdAt && a.createdAt) ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : 0);
            console.log(`${LOG_PREFIX} Stalls snapshot received for site ${siteId}. ${fetchedStalls.length} stalls fetched.`);
            setStalls(fetchedStalls);
          },
          (error) => {
            console.error(`${LOG_PREFIX} Error fetching stalls for site ${siteId}:`, error.message, error.stack);
            setErrorData(`Failed to load stalls: ${error.message}. Please try again later.`);
          }
        );

      } catch (err: any) {
         console.error(`${LOG_PREFIX} Error in fetchData setup for site ${siteId}:`, err.message, err.stack);
         setErrorData(`An unexpected error occurred: ${err.message}.`);
      } finally {
        setLoadingData(false); 
        console.log(`${LOG_PREFIX} Initial data fetch attempt for site ${siteId} finished.`);
      }
    };

    fetchData();

    return () => {
      console.log(`${LOG_PREFIX} Unmounted for site ${siteId}. Unsubscribing...`);
      if (unsubscribeSite) unsubscribeSite();
      if (unsubscribeStalls) unsubscribeStalls();
    };
  }, [currentUser, authLoading, siteId, router]);

  if (authLoading || loadingData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading stall data...</p>
      </div>
    );
  }

  if (errorData) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive">
            <ShieldAlert className="mr-2 h-5 w-5" />
             {currentUser?.role !== 'admin' ? "Access Restricted" : "Error Loading Stalls"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-10 text-destructive">{errorData}</p>
          <div className="text-center mt-4">
            <Button onClick={() => router.push("/admin/sites")} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sites
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!site) {
     return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Site Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-10 text-muted-foreground">The requested site (ID: {siteId}) could not be found.</p>
           <div className="text-center mt-4">
            <Button onClick={() => router.push("/admin/sites")} variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sites
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Manage Stalls for "${site.name}"`}
        description="Create, view, and manage stalls within this site."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/sites')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sites
            </Button>
            <Button onClick={() => router.push(`/admin/sites/${siteId}/stalls/new`)}>
              <PlusCircle className="mr-2 h-5 w-5" /> Add New Stall
            </Button>
          </div>
        }
      />
      <StallsTable stalls={stalls} />
    </div>
  );
}

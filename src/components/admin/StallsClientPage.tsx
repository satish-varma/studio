
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

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in StallsClientPage:", error);
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
    if (authLoading) return;

    if (!currentUser || currentUser.role !== 'admin') {
      setLoadingData(false);
      setErrorData("Access Denied: You do not have permission to manage stalls.");
      return;
    }

    if (!siteId) {
      setLoadingData(false);
      setErrorData("Site ID is missing.");
      router.replace("/admin/sites"); // Redirect if no siteId
      return;
    }
    
    let unsubscribeSite: (() => void) | null = null;
    let unsubscribeStalls: (() => void) | null = null;

    const fetchData = async () => {
      setLoadingData(true);
      setErrorData(null);
      try {
        // Fetch Site Details
        const siteDocRef = doc(db, "sites", siteId);
        unsubscribeSite = onSnapshot(siteDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            setSite({ id: docSnapshot.id, ...docSnapshot.data() } as Site);
          } else {
            setErrorData("Parent site not found.");
            setSite(null);
            setStalls([]); // Clear stalls if site not found
          }
        }, (error) => {
          console.error("Error fetching site details:", error);
          setErrorData("Failed to load site details.");
        });

        // Fetch Stalls for this Site
        const stallsCollectionRef = collection(db, "stalls");
        const q = query(stallsCollectionRef, where("siteId", "==", siteId));
        
        unsubscribeStalls = onSnapshot(q, 
          (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedStalls: Stall[] = snapshot.docs.map(docSnapshot => ({
              id: docSnapshot.id,
              ...docSnapshot.data()
            } as Stall)).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setStalls(fetchedStalls);
          },
          (error) => {
            console.error("Error fetching stalls:", error);
            setErrorData("Failed to load stalls. Please try again later.");
          }
        );

      } catch (err) {
         console.error("Error in fetchData setup:", err);
         setErrorData("An unexpected error occurred.");
      } finally {
        // Initial loading is done after subscriptions are set up
        // The onSnapshot callbacks will handle subsequent loading state if needed.
        setLoadingData(false); 
      }
    };

    fetchData();

    return () => {
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
            Access Restricted or Error
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
          <p className="text-center py-10 text-muted-foreground">The requested site could not be found.</p>
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

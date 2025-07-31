
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { SitesTable } from "@/components/admin/SitesTable";
import type { Site } from "@/types/site";
import { getFirestore, collection, onSnapshot, QuerySnapshot, DocumentData, getDocs, query, orderBy } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LOG_PREFIX = "[SitesClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function SitesClientPage() {
  const { user: currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [sites, setSites] = useState<Site[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [errorSites, setErrorSites] = useState<string | null>(null);

  useEffect(() => {
    console.log(`${LOG_PREFIX} Mounted. AuthLoading: ${authLoading}`);
    if (authLoading) return;

    if (!currentUser) {
        console.warn(`${LOG_PREFIX} No current user. Auth may still be loading or user not logged in.`);
        setLoadingSites(false);
        setErrorSites("Authentication is required to view sites.");
        return;
    }
    
    if (currentUser.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Access denied. User role: ${currentUser.role}`);
      setLoadingSites(false);
      setErrorSites("Access Denied: You do not have permission to manage sites.");
      return;
    }

    const fetchSites = async () => {
      console.log(`${LOG_PREFIX} Fetching sites collection.`);
      setLoadingSites(true);
      try {
        const sitesCollectionRef = collection(db, "sites");
        const q = query(sitesCollectionRef, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        
        const fetchedSites: Site[] = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        } as Site));
        
        console.log(`${LOG_PREFIX} Sites snapshot received. ${fetchedSites.length} sites fetched.`);
        setSites(fetchedSites);
        setErrorSites(null);
      } catch (error: any) {
        console.error(`${LOG_PREFIX} Error fetching sites:`, error.message, error.stack);
        setErrorSites(`Failed to load sites: ${error.message}. Please try again later.`);
      } finally {
        setLoadingSites(false);
      }
    };
    
    fetchSites();

  }, [currentUser, authLoading]);

  if (authLoading || loadingSites) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading site data...</p>
      </div>
    );
  }

  if (errorSites) {
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive">
            <ShieldAlert className="mr-2 h-5 w-5" />
            {currentUser?.role !== 'admin' ? "Access Restricted" : "Error Loading Sites"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center py-10 text-destructive">{errorSites}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Manage Sites"
        description="Create, view, and manage your business sites/locations."
        actions={
          <Button onClick={() => router.push('/admin/sites/new')}>
            <PlusCircle className="mr-2 h-5 w-5" /> Add New Site
          </Button>
        }
      />
      <SitesTable sites={sites} />
    </div>
  );
}

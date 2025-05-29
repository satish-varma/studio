
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle, Loader2, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { SitesTable } from "@/components/admin/SitesTable";
import type { Site } from "@/types/site";
import { getFirestore, collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SitesClientPage:", error);
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
    if (authLoading) return;

    if (!currentUser || currentUser.role !== 'admin') {
      setLoadingSites(false);
      setErrorSites("Access Denied: You do not have permission to manage sites.");
      return;
    }

    const sitesCollectionRef = collection(db, "sites");
    const unsubscribe = onSnapshot(sitesCollectionRef, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedSites: Site[] = snapshot.docs.map(docSnapshot => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        } as Site)).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by creation date desc
        setSites(fetchedSites);
        setLoadingSites(false);
        setErrorSites(null);
      },
      (error) => {
        console.error("Error fetching sites:", error);
        setErrorSites("Failed to load sites. Please try again later.");
        setLoadingSites(false);
      }
    );

    return () => unsubscribe();
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
            Access Restricted or Error
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

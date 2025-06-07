
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import SiteForm from "@/components/admin/SiteForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { Site } from '@/types/site';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const LOG_PREFIX = "[EditSitePage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function EditSitePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const siteId = params.siteId as string;

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(`${LOG_PREFIX} Mounted. SiteID from params: ${siteId}`);
    if (siteId) {
      const fetchSite = async () => {
        console.log(`${LOG_PREFIX} Fetching site data for ID: ${siteId}`);
        setLoading(true);
        setError(null);
        try {
          const siteDocRef = doc(db, "sites", siteId);
          const siteDocSnap = await getDoc(siteDocRef);

          if (siteDocSnap.exists()) {
            console.log(`${LOG_PREFIX} Site document found for ID: ${siteId}`, siteDocSnap.data());
            setSite({ id: siteDocSnap.id, ...siteDocSnap.data() } as Site);
          } else {
            console.warn(`${LOG_PREFIX} Site not found for ID: ${siteId}. Redirecting.`);
            setError("Site not found.");
            toast({ title: "Error", description: "Site not found.", variant: "destructive" });
            router.replace("/admin/sites");
          }
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Error fetching site (ID: ${siteId}):`, err.message, err.stack);
          setError(`Failed to load site data: ${err.message}`);
          toast({ title: "Error", description: `Failed to load site data: ${err.message}`, variant: "destructive" });
        } finally {
          setLoading(false);
          console.log(`${LOG_PREFIX} Site data fetching attempt finished for ID: ${siteId}. Loading: false.`);
        }
      };
      fetchSite();
    } else {
      console.warn(`${LOG_PREFIX} No site ID provided in params. Redirecting.`);
      setLoading(false);
      setError("No site ID provided.");
      router.replace("/admin/sites");
    }
  }, [siteId, router, toast]);

  useEffect(() => {
    if (site?.name) {
      document.title = `Edit ${site.name} - StallSync`;
    }
    return () => { document.title = "StallSync - Stock Management"; }
  }, [site?.name]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading site details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Site" />
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={() => router.push("/admin/sites")} className="mt-4">
            Back to Sites
          </Button>
        </div>
      </div>
    );
  }

  if (!site) {
     return (
      <div className="flex justify-center items-center py-10">
        <p className="ml-2">Site data could not be loaded. This might happen if the site ID is invalid or was recently deleted.</p>
         <Button onClick={() => router.push("/admin/sites")} className="mt-4 ml-2">
            Back to Sites
          </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Site: ${site.name}`}
        description="Update the details for this site."
      />
      <SiteForm initialData={site} siteId={siteId} />
    </div>
  );
}

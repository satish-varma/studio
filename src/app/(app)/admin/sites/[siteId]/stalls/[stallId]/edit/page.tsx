
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import StallForm from "@/components/admin/StallForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { Stall } from '@/types/stall';
import type { Site } from '@/types/site';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const LOG_PREFIX = "[EditStallPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

export default function EditStallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const siteId = params.siteId as string;
  const stallId = params.stallId as string;

  const [stall, setStall] = useState<Stall | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log(`${LOG_PREFIX} Mounted. SiteID: ${siteId}, StallID: ${stallId}`);
    if (siteId && stallId) {
      const fetchStallAndSite = async () => {
        console.log(`${LOG_PREFIX} Fetching stall and site data. SiteID: ${siteId}, StallID: ${stallId}`);
        setLoading(true);
        setError(null);
        try {
          const siteDocRef = doc(db, "sites", siteId);
          const siteDocSnap = await getDoc(siteDocRef);
          if (siteDocSnap.exists()) {
            console.log(`${LOG_PREFIX} Parent site document found for ID: ${siteId}`, siteDocSnap.data());
            setSite({ id: siteDocSnap.id, ...siteDocSnap.data() } as Site);
          } else {
             console.warn(`${LOG_PREFIX} Parent site not found for ID: ${siteId}.`);
             throw new Error("Parent site not found.");
          }

          const stallDocRef = doc(db, "stalls", stallId);
          const stallDocSnap = await getDoc(stallDocRef);

          if (stallDocSnap.exists()) {
            console.log(`${LOG_PREFIX} Stall document found for ID: ${stallId}`, stallDocSnap.data());
            const stallData = stallDocSnap.data() as Omit<Stall, 'id'>;
            if (stallData.siteId !== siteId) {
                console.error(`${LOG_PREFIX} Stall-Site mismatch. Stall's siteId (${stallData.siteId}) != URL siteId (${siteId}). Redirecting.`);
                setError("Stall does not belong to the specified site.");
                toast({ title: "Error", description: "Stall-Site mismatch. Redirecting.", variant: "destructive" });
                router.replace(`/admin/sites/${siteId}/stalls`);
                return;
            }
            setStall({ id: stallDocSnap.id, ...stallData });
          } else {
            console.warn(`${LOG_PREFIX} Stall not found for ID: ${stallId}. Redirecting.`);
            setError("Stall not found.");
            toast({ title: "Error", description: "Stall not found.", variant: "destructive" });
            router.replace(`/admin/sites/${siteId}/stalls`);
          }
        } catch (err: any) {
          console.error(`${LOG_PREFIX} Error fetching stall/site (SiteID: ${siteId}, StallID: ${stallId}):`, err.message, err.stack);
          setError(`Failed to load data: ${err.message}`);
          toast({ title: "Error", description: `Failed to load data: ${err.message}`, variant: "destructive" });
        } finally {
          setLoading(false);
          console.log(`${LOG_PREFIX} Stall/site data fetching attempt finished. Loading: false.`);
        }
      };
      fetchStallAndSite();
    } else {
      console.warn(`${LOG_PREFIX} Missing site or stall ID. Redirecting. SiteID: ${siteId}, StallID: ${stallId}`);
      setLoading(false);
      setError("Missing site or stall ID.");
      router.replace("/admin/sites");
    }
  }, [siteId, stallId, router, toast]);

  useEffect(() => {
    if (stall?.name && site?.name) {
      document.title = `Edit ${stall.name} at ${site.name} - StallSync`;
    }
    return () => { document.title = "StallSync - Stock Management"; }
  }, [stall?.name, site?.name]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading stall details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Stall" />
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={() => router.push(siteId ? `/admin/sites/${siteId}/stalls` : '/admin/sites')} className="mt-4">
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!stall || !site) { // Added !site check
     return (
      <div className="flex justify-center items-center py-10">
        <p className="ml-2">Stall or Site data could not be loaded. This might happen if the IDs are invalid or data was recently deleted.</p>
         <Button onClick={() => router.push(siteId ? `/admin/sites/${siteId}/stalls` : '/admin/sites')} className="mt-4 ml-2">
            Back
          </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Stall: ${stall.name}`}
        description={`Update details for this stall at site: ${site?.name || 'Unknown Site'}.`}
      />
      <StallForm initialData={stall} stallId={stallId} />
    </div>
  );
}

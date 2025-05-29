
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

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in EditSitePage:", error);
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
    if (siteId) {
      const fetchSite = async () => {
        setLoading(true);
        setError(null);
        try {
          const siteDocRef = doc(db, "sites", siteId);
          const siteDocSnap = await getDoc(siteDocRef);

          if (siteDocSnap.exists()) {
            setSite({ id: siteDocSnap.id, ...siteDocSnap.data() } as Site);
          } else {
            setError("Site not found.");
            toast({ title: "Error", description: "Site not found.", variant: "destructive" });
            router.replace("/admin/sites");
          }
        } catch (err: any) {
          console.error("Error fetching site:", err);
          setError("Failed to load site data.");
          toast({ title: "Error", description: "Failed to load site data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchSite();
    } else {
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
        <p className="ml-2">Site data could not be loaded.</p>
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

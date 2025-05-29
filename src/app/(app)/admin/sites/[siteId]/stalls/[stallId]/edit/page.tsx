
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

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in EditStallPage:", error);
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
    if (siteId && stallId) {
      const fetchStallAndSite = async () => {
        setLoading(true);
        setError(null);
        try {
          // Fetch Site
          const siteDocRef = doc(db, "sites", siteId);
          const siteDocSnap = await getDoc(siteDocRef);
          if (siteDocSnap.exists()) {
            setSite({ id: siteDocSnap.id, ...siteDocSnap.data() } as Site);
          } else {
             throw new Error("Parent site not found.");
          }

          // Fetch Stall
          const stallDocRef = doc(db, "stalls", stallId);
          const stallDocSnap = await getDoc(stallDocRef);

          if (stallDocSnap.exists()) {
            const stallData = stallDocSnap.data() as Omit<Stall, 'id'>;
            if (stallData.siteId !== siteId) {
                setError("Stall does not belong to the specified site.");
                toast({ title: "Error", description: "Stall-Site mismatch.", variant: "destructive" });
                router.replace(`/admin/sites/${siteId}/stalls`);
                return;
            }
            setStall({ id: stallDocSnap.id, ...stallData });
          } else {
            setError("Stall not found.");
            toast({ title: "Error", description: "Stall not found.", variant: "destructive" });
            router.replace(`/admin/sites/${siteId}/stalls`);
          }
        } catch (err: any) {
          console.error("Error fetching stall/site:", err);
          setError("Failed to load data.");
          toast({ title: "Error", description: "Failed to load data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchStallAndSite();
    } else {
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

  if (!stall) {
     return (
      <div className="flex justify-center items-center py-10">
        <p className="ml-2">Stall data could not be loaded.</p>
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

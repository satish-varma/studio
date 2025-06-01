
import PageHeader from "@/components/shared/PageHeader";
import StallForm from "@/components/admin/StallForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { Metadata } from 'next';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.warn("Firebase initialization error in AddNewStallPage (metadata):", error);
  }
}
const db = getFirestore();

async function getSiteName(siteId: string): Promise<string | null> {
  if (!db || !siteId) return null;
  try {
    const siteDocRef = doc(db, "sites", siteId);
    const siteDocSnap = await getDoc(siteDocRef);
    if (siteDocSnap.exists()) {
      return siteDocSnap.data()?.name || "Unknown Site";
    }
    return null;
  } catch (error: any) {
    console.warn("Warning fetching site name for metadata in AddNewStallPage:", error);
    return null;
  }
}

interface DynamicPageProps {
  params: Promise<{ siteId: string }>;
}

export async function generateMetadata({ params: paramsPromise }: DynamicPageProps): Promise<Metadata> {
  if (!paramsPromise || typeof paramsPromise.then !== 'function') {
    console.warn("generateMetadata in AddNewStallPage received non-Promise params:", paramsPromise);
    return { title: "Error Loading Site - StallSync" };
  }
  try {
    const actualParams = await paramsPromise;
    const siteName = await getSiteName(actualParams.siteId);
    if (!siteName) {
      return { title: "Site Not Found - StallSync" };
    }
    return {
      title: `Add New Stall to ${siteName} - StallSync`,
    };
  } catch (error: any) {
    console.error("Error in generateMetadata AddNewStallPage:", error);
    return { title: "Metadata Error - StallSync" };
  }
}

export default async function AddNewStallPage({ params: paramsPromise }: DynamicPageProps) {
  let siteName: string | null = null;
  let siteIdFromParams: string | null = null;

  if (!paramsPromise || typeof paramsPromise.then !== 'function') {
    console.warn("AddNewStallPage received non-Promise params:", paramsPromise);
    // Handle case where paramsPromise is not a Promise, though type signature should prevent this
    // For robustness, we might try to use it as-is if it looks like resolved params
    if (paramsPromise && typeof (paramsPromise as any).siteId === 'string') {
        siteIdFromParams = (paramsPromise as any).siteId;
        siteName = await getSiteName(siteIdFromParams as string);
    }
  } else {
    try {
      const actualParams = await paramsPromise;
      siteIdFromParams = actualParams.siteId;
      siteName = await getSiteName(actualParams.siteId);
    } catch (error: any) {
      console.error("Error processing params in AddNewStallPage:", error);
      // Attempt to extract siteId if actualParams might be the error object itself in some edge cases
      if (error && typeof error.siteId === 'string') {
         siteIdFromParams = error.siteId;
      } else if (paramsPromise && typeof (paramsPromise as any).siteId === 'string' && !siteIdFromParams) {
         // Fallback if await fails but paramsPromise had the shape
         siteIdFromParams = (paramsPromise as any).siteId;
      }
    }
  }
  
  if (!siteName && siteIdFromParams) {
     console.warn(`Site with ID ${siteIdFromParams} not found for AddNewStallPage content.`);
  }


  return (
    <div className="space-y-6">
      <PageHeader
        title={siteName ? `Add New Stall to "${siteName}"` : "Add New Stall"}
        description="Fill in the details below to add a new stall to this site."
      />
      <StallForm /> {/* siteId is derived from URL in StallForm via useParams() hook */}
    </div>
  );
}

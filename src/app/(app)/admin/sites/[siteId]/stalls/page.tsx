
import StallsClientPage from "@/components/admin/StallsClientPage";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { Metadata } from 'next';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.warn("Firebase initialization error in ManageStallsPage (metadata):", error);
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
    console.warn("Warning fetching site name for metadata in ManageStallsPage:", error);
    return null;
  }
}

interface PageDynamicParams {
  siteId: string;
}

interface DynamicPageProps {
  params: Promise<PageDynamicParams>;
}

export async function generateMetadata({ params: paramsPromise }: DynamicPageProps): Promise<Metadata> {
  if (!paramsPromise || typeof paramsPromise.then !== 'function') {
    console.warn("generateMetadata in ManageStallsPage received non-Promise params:", paramsPromise);
    // Fallback for non-promise params, though ideally types prevent this.
    const resolvedParams = paramsPromise as unknown as PageDynamicParams;
    const siteName = await getSiteName(resolvedParams.siteId);
     if (!siteName) {
      return { title: "Site Not Found - StallSync" };
    }
    return {
      title: `Manage Stalls at ${siteName} - StallSync`,
    };
  }

  try {
    const actualParams = await paramsPromise;
    const siteName = await getSiteName(actualParams.siteId);
    if (!siteName) {
      return { title: "Site Not Found - StallSync" };
    }
    return {
      title: `Manage Stalls at ${siteName} - StallSync`,
    };
  } catch (error: any) {
    console.error("Error in generateMetadata ManageStallsPage:", error);
    return { title: "Metadata Error - StallSync" };
  }
}


// Admins only route - further protection should be via security rules & auth context checks in client component
export default async function ManageStallsPage({ params: paramsPromise }: DynamicPageProps) {
  // Even if actualParams.siteId isn't directly used here for rendering (as StallsClientPage uses useParams),
  // awaiting paramsPromise ensures the component matches the expected signature if PageProps
  // indeed expects params to be a Promise.
  try {
    const actualParams = await paramsPromise;
    // You could log actualParams.siteId here if needed for debugging.
  } catch (error) {
    console.error("Error resolving params in ManageStallsPage (page component):", error);
    // Potentially render an error state or redirect, though StallsClientPage might also handle missing siteId.
  }
  
  // The StallsClientPage will handle fetching site details and stalls based on the siteId from params (using useParams hook)
  return <StallsClientPage />;
}


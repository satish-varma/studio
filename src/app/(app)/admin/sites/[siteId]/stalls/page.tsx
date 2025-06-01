
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

interface ManageStallsPageProps {
  params: Promise<{ siteId: string }>; // Corrected: params is a Promise
}

export async function generateMetadata({ params: paramsPromise }: ManageStallsPageProps): Promise<Metadata> {
  try {
    const params = await paramsPromise; // Await the promise to get actual params
    const siteName = await getSiteName(params.siteId);
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
export default async function ManageStallsPage({ params: paramsPromise }: ManageStallsPageProps) {
  // The StallsClientPage will handle fetching site details and stalls based on the siteId from params (using useParams hook)
  // The 'params' prop here is primarily for server-side logic like generateMetadata or if data was fetched directly on this page.
  // We can log it here if needed for debugging or future server-side data fetching.
  // const params = await paramsPromise; // Await if you need to use params directly in this server component
  // console.log("ManageStallsPage received params promise, resolved to:", params);
  
  return <StallsClientPage />;
}

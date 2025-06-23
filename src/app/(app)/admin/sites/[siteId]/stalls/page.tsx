
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

export async function generateMetadata({ params }: { params: { siteId: string } }): Promise<Metadata> {
  try {
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

// Admins only route - further protection is handled by client component.
// This server component simply renders the client page.
export default function ManageStallsPage() {
  // The client component will get the siteId from the URL using useParams hook.
  // This parent component doesn't need to handle props.
  return <StallsClientPage />;
}

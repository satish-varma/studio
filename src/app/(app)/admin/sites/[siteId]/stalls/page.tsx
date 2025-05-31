
import StallsClientPage from "@/components/admin/StallsClientPage";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';

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
  } catch (error) {
    console.warn("Warning fetching site name for metadata in ManageStallsPage:", error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: { siteId: string } }) {
  const siteName = await getSiteName(params.siteId);
  if (!siteName) {
    return { title: "Site Not Found - StallSync" };
  }
  return {
    title: `Manage Stalls at ${siteName} - StallSync`,
  };
}


// Admins only route - further protection should be via security rules & auth context checks in client component
export default function ManageStallsPage({ params }: { params: { siteId: string } }) {
  // The StallsClientPage will handle fetching site details and stalls based on the siteId from params
  return <StallsClientPage />;
}


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

interface AddNewStallPageProps {
  params: { siteId: string };
}

export async function generateMetadata({ params }: AddNewStallPageProps): Promise<Metadata> {
  try {
    const siteName = await getSiteName(params.siteId);
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

export default async function AddNewStallPage({ params }: AddNewStallPageProps) {
  let siteName: string | null = null;
  
  try {
    siteName = await getSiteName(params.siteId);
  } catch (error: any) {
    console.error("Error processing params in AddNewStallPage:", error);
  }
  
  if (!siteName && params.siteId) {
     console.warn(`Site with ID ${params.siteId} not found for AddNewStallPage content.`);
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

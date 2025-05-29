
import PageHeader from "@/components/shared/PageHeader";
import StallForm from "@/components/admin/StallForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import { notFound } from 'next/navigation';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error:", error);
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
    console.error("Error fetching site name:", error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: { siteId: string } }) {
  const siteName = await getSiteName(params.siteId);
  if (!siteName) {
    return { title: "Site Not Found - StallSync" };
  }
  return {
    title: `Add New Stall to ${siteName} - StallSync`,
  };
}

// Admins only route
export default async function AddNewStallPage({ params }: { params: { siteId: string } }) {
  const siteName = await getSiteName(params.siteId);

  if (!siteName) {
    // This could redirect to a 404 page or show an error
    // For now, let's assume if siteName isn't found, the form might still render but lack context
    // Ideally, you'd handle this more gracefully, perhaps with a `notFound()` call from next/navigation
     console.warn(`Site with ID ${params.siteId} not found for AddNewStallPage.`);
     // notFound(); // Or handle this state in the UI
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={siteName ? `Add New Stall to "${siteName}"` : "Add New Stall"}
        description="Fill in the details below to add a new stall to this site."
      />
      <StallForm /> {/* siteId is derived from URL in StallForm */}
    </div>
  );
}

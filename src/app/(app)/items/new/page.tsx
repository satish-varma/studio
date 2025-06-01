
"use client"; // Changed to client component to use hooks for maps

import { useEffect, useState } from 'react';
import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/items/ItemForm";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { Site, Stall } from '@/types';
import { Loader2 } from 'lucide-react';

// Metadata might need to be static or handled differently if maps are truly dynamic for the "new" page title
// For now, keeping title generic.
// export const metadata = {
// title: "Add New Item - StallSync",
// };

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in AddNewItemPage:", error);
  }
}
const db = getFirestore();


export default function AddNewItemPage() {
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [loadingMaps, setLoadingMaps] = useState(true);

  useEffect(() => {
    const fetchMaps = async () => {
      setLoadingMaps(true);
      try {
        const sitesCollectionRef = collection(db, "sites");
        const sitesSnapshot = await getDocs(sitesCollectionRef);
        const newSitesMap: Record<string, string> = {};
        sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
        setSitesMap(newSitesMap);

        const stallsCollectionRef = collection(db, "stalls");
        const stallsSnapshot = await getDocs(stallsCollectionRef);
        const newStallsMap: Record<string, string> = {};
        stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
        setStallsMap(newStallsMap);
      } catch (error) {
        console.error("Error fetching maps for New Item Page:", error);
        // Handle error if necessary, e.g., show a toast
      } finally {
        setLoadingMaps(false);
      }
    };
    fetchMaps();
  }, []);
  
  useEffect(() => {
      document.title = "Add New Item - StallSync";
      return () => { document.title = "StallSync - Stock Management"; } 
  }, []);


  if (loadingMaps) {
     return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading context...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add New Stock Item"
        description="Fill in the details below to add a new item to your inventory."
      />
      <ItemForm sitesMap={sitesMap} stallsMap={stallsMap} />
    </div>
  );
}

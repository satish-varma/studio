
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/items/ItemForm";
import { getFirestore, doc, getDoc, collection, getDocs } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { StockItem, Site, Stall } from '@/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in EditItemPage:", error);
  }
}
const db = getFirestore();

export default function EditItemPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const itemId = params.itemId as string;

  const [item, setItem] = useState<StockItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});


  useEffect(() => {
    if (itemId) {
      const fetchItemAndMaps = async () => {
        setLoading(true);
        setError(null);
        try {
          // Fetch sites map
          const sitesCollectionRef = collection(db, "sites");
          const sitesSnapshot = await getDocs(sitesCollectionRef);
          const newSitesMap: Record<string, string> = {};
          sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
          setSitesMap(newSitesMap);

          // Fetch stalls map
          const stallsCollectionRef = collection(db, "stalls");
          const stallsSnapshot = await getDocs(stallsCollectionRef);
          const newStallsMap: Record<string, string> = {};
          stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
          setStallsMap(newStallsMap);
          
          // Fetch item
          const itemDocRef = doc(db, "stockItems", itemId);
          const itemDocSnap = await getDoc(itemDocRef);

          if (itemDocSnap.exists()) {
            setItem({ id: itemDocSnap.id, ...itemDocSnap.data() } as StockItem);
          } else {
            setError("Item not found.");
            toast({ title: "Error", description: "Item not found.", variant: "destructive" });
            router.replace("/items"); 
          }
        } catch (err: any) {
          console.error("Error fetching item or maps:", err);
          setError("Failed to load item data.");
          toast({ title: "Error", description: "Failed to load item data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchItemAndMaps();
    } else {
      setLoading(false);
      setError("No item ID provided.");
      router.replace("/items");
    }
  }, [itemId, router, toast]);

  useEffect(() => {
    if (item?.name) {
      document.title = `Edit ${item.name} - StallSync`;
    }
    return () => { document.title = "StallSync - Stock Management"; } 
  }, [item?.name]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading item details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Item" />
        <div className="text-center py-10 text-destructive">
          <p>{error}</p>
          <Button onClick={() => router.push("/items")} className="mt-4">
            Back to Items
          </Button>
        </div>
      </div>
    );
  }

  if (!item) {
     return ( 
      <div className="flex justify-center items-center py-10">
        <p className="ml-2">Item data could not be loaded.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Item: ${item.name}`}
        description="Update the details for this stock item."
      />
      <ItemForm 
        initialData={item} 
        itemId={itemId} 
        sitesMap={sitesMap}
        stallsMap={stallsMap}
      />
    </div>
  );
}

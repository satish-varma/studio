
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/shared/PageHeader";
import ItemForm from "@/components/items/ItemForm";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { StockItem } from '@/types';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

  useEffect(() => {
    if (itemId) {
      const fetchItem = async () => {
        setLoading(true);
        setError(null);
        try {
          const itemDocRef = doc(db, "stockItems", itemId);
          const itemDocSnap = await getDoc(itemDocRef);

          if (itemDocSnap.exists()) {
            setItem({ id: itemDocSnap.id, ...itemDocSnap.data() } as StockItem);
          } else {
            setError("Item not found.");
            toast({ title: "Error", description: "Item not found.", variant: "destructive" });
            router.replace("/items"); // Redirect if item doesn't exist
          }
        } catch (err: any) {
          console.error("Error fetching item:", err);
          setError("Failed to load item data.");
          toast({ title: "Error", description: "Failed to load item data.", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      };
      fetchItem();
    } else {
      setLoading(false);
      setError("No item ID provided.");
      router.replace("/items");
    }
  }, [itemId, router, toast]);

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
     return ( // Should be caught by error state, but as a fallback
      <div className="flex justify-center items-center py-10">
        <p className="ml-2">Item data could not be loaded.</p>
      </div>
    );
  }
  
  // Dynamically set metadata title - this needs to be handled differently in App Router for server-side metadata.
  // For client components, document.title can be used, or a Head component for simpler cases.
  // For now, we set a generic title for the page component itself via export const metadata.
  // This effect is a client-side title update.
  useEffect(() => {
    if (item?.name) {
      document.title = \`Edit \${item.name} - StallSync\`;
    }
    return () => { document.title = "StallSync - Stock Management"; } // Reset on unmount
  }, [item?.name]);


  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit Item: ${item.name}`}
        description="Update the details for this stock item."
      />
      <ItemForm initialData={item} itemId={itemId} />
    </div>
  );
}

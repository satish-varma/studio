
"use client";

import { useState, useMemo, useEffect } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import type { StockItem } from "@/types";
import { getFirestore, collection, onSnapshot, QuerySnapshot, DocumentData } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2 } from "lucide-react";

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemsClientPage:", error);
  }
}
const db = getFirestore();

export default function ItemsClientPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  
  const [items, setItems] = useState<StockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [errorItems, setErrorItems] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Secure this data fetching with Firebase Security Rules.
    // Only authenticated users, and potentially users with specific roles, should be able to read stock items.
    const itemsCollectionRef = collection(db, "stockItems");
    
    const unsubscribe = onSnapshot(itemsCollectionRef, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        setItems(fetchedItems);
        setLoadingItems(false);
        setErrorItems(null);
      },
      (error) => {
        console.error("Error fetching stock items:", error);
        setErrorItems("Failed to load stock items. Please try again later.");
        setLoadingItems(false);
      }
    );

    return () => unsubscribe(); // Cleanup subscription on component unmount
  }, []);

  const uniqueCategories = useMemo(() => {
    const categories = new Set(items.map(item => item.category));
    return Array.from(categories).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearchTerm = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      
      let matchesStockStatus = true;
      if (stockStatusFilter !== "all") {
        const isLowStock = item.quantity <= item.lowStockThreshold;
        const isOutOfStock = item.quantity === 0;
        if (stockStatusFilter === "in-stock") matchesStockStatus = !isLowStock && !isOutOfStock;
        else if (stockStatusFilter === "low-stock") matchesStockStatus = isLowStock && !isOutOfStock;
        else if (stockStatusFilter === "out-of-stock") matchesStockStatus = isOutOfStock;
      }
      
      return matchesSearchTerm && matchesCategory && matchesStockStatus;
    });
  }, [items, searchTerm, categoryFilter, stockStatusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Stock Items"
        description="Manage your inventory, update stock levels, and view item details."
      />
      <ItemControls
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        stockStatusFilter={stockStatusFilter}
        onStockStatusFilterChange={setStockStatusFilter}
        categories={uniqueCategories}
      />
      {loadingItems && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading items...</p>
        </div>
      )}
      {errorItems && (
        <div className="text-center py-10 text-destructive">
          <p>{errorItems}</p>
        </div>
      )}
      {!loadingItems && !errorItems && <ItemTable items={filteredItems} />}
    </div>
  );
}

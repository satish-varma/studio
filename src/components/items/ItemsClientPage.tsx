
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import type { StockItem, Stall, Site } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  where,
  QueryConstraint,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemsClientPage:", error);
  }
}
const db = getFirestore();

export default function ItemsClientPage() {
  const { user, activeSiteId } = useAuth(); // activeStallId from AuthContext is for global context, not local filtering here.
  
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all"); // "all", "master", or specific stallId

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilter, setStallsForFilter] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingStalls, setLoadingStalls] = useState(false);
  const [errorItems, setErrorItems] = useState<string | null>(null);

  // Fetch sites for mapping IDs to names
  useEffect(() => {
    const sitesCollectionRef = collection(db, "sites");
    const unsubscribe = onSnapshot(sitesCollectionRef, (snapshot) => {
      const newSitesMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newSitesMap[doc.id] = (doc.data() as Site).name;
      });
      setSitesMap(newSitesMap);
    }, (error) => console.error("Error fetching sites map:", error));
    return () => unsubscribe();
  }, []);
  
  // Fetch stalls for filter dropdown when activeSiteId changes AND for mapping IDs to names
   useEffect(() => {
    const stallsCollectionRef = collection(db, "stalls");
    const unsubscribeStallsMap = onSnapshot(stallsCollectionRef, (snapshot) => {
      const newStallsMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newStallsMap[doc.id] = (doc.data() as Stall).name;
      });
      setStallsMap(newStallsMap);
    }, (error) => console.error("Error fetching stalls map:", error));

    let unsubscribeStallsForFilter: () => void = () => {};
    if (activeSiteId) {
      setLoadingStalls(true);
      const q = query(collection(db, "stalls"), where("siteId", "==", activeSiteId), orderBy("name"));
      unsubscribeStallsForFilter = onSnapshot(q, (snapshot) => {
        const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForFilter(fetchedStalls);
        setLoadingStalls(false);
      }, (error) => {
        console.error("Error fetching stalls for filter:", error);
        setStallsForFilter([]);
        setLoadingStalls(false);
      });
    } else {
      setStallsForFilter([]); // Clear stalls if no site is active
      setLoadingStalls(false);
    }
    return () => {
      unsubscribeStallsMap();
      unsubscribeStallsForFilter();
    };
  }, [activeSiteId]);


  // Fetch Stock Items based on activeSiteId and stallFilterOption
  useEffect(() => {
    if (!user) {
      setLoadingItems(false);
      setErrorItems("Please log in to view items.");
      setItems([]);
      return;
    }

    if (!activeSiteId) {
      setItems([]);
      setLoadingItems(false);
      setErrorItems(user.role === 'admin' ? "Admin: Please select a site to view its stock." : "Please select an active site to view stock items.");
      return;
    }

    setLoadingItems(true);
    setErrorItems(null);

    const itemsCollectionRef = collection(db, "stockItems");
    let qConstraints: QueryConstraint[] = [
      orderBy("name"),
      where("siteId", "==", activeSiteId)
    ];

    if (stallFilterOption === "master") {
      qConstraints.push(where("stallId", "==", null));
    } else if (stallFilterOption !== "all") { // Specific stall ID
      qConstraints.push(where("stallId", "==", stallFilterOption));
    }
    // If stallFilterOption is "all", no additional stallId constraint is added,
    // so it fetches all items for the activeSiteId (master + all stalls).

    const q = query(itemsCollectionRef, ...qConstraints);
    
    const unsubscribe = onSnapshot(q, 
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedItems: StockItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        setItems(fetchedItems);
        setLoadingItems(false);
      },
      (error) => {
        console.error("Error fetching stock items:", error);
        setErrorItems("Failed to load stock items. Please try again later.");
        setItems([]);
        setLoadingItems(false);
      }
    );
    return () => unsubscribe(); 
  }, [user, activeSiteId, stallFilterOption]);

  const uniqueCategories = useMemo(() => {
    // Filter items based on current site and stallFilterOption BEFORE extracting categories
    // This makes categories relevant to the current view.
    // However, for simplicity and better UX, often categories are from ALL items.
    // Let's use all items for category filter for now.
    const allFetchedItemsCategories = new Set(items.map(item => item.category));
    return Array.from(allFetchedItemsCategories).sort();
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
        description="Manage your inventory. Add items to site master stock or a specific stall."
      />
      <ItemControls
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        stockStatusFilter={stockStatusFilter}
        onStockStatusFilterChange={setStockStatusFilter}
        stallFilterOption={stallFilterOption}
        onStallFilterOptionChange={setStallFilterOption}
        categories={uniqueCategories}
        availableStalls={stallsForFilter}
        isSiteActive={!!activeSiteId}
      />
      
      {(loadingItems || (activeSiteId && loadingStalls)) && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading items...</p>
        </div>
      )}
      {errorItems && (
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>{errorItems}</AlertDescription>
        </Alert>
      )}
      {!loadingItems && !errorItems && (
        <ItemTable items={filteredItems} sitesMap={sitesMap} stallsMap={stallsMap} />
      )}
    </div>
  );
}

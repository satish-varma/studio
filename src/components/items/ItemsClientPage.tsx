
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import type { StockItem, Stall, Site } from "@/types";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  where,
  QueryConstraint,
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in ItemsClientPage:", error);
  }
} else {
  db = getFirestore(getApp());
}

export default function ItemsClientPage() {
  const { user, activeSiteId } = useAuth();

  // Initialize filter states from user defaults or component defaults
  const [searchTerm, setSearchTerm] = useState(() => user?.defaultItemSearchTerm || "");
  const [categoryFilter, setCategoryFilter] = useState(() => user?.defaultItemCategoryFilter || "all");
  const [stockStatusFilter, setStockStatusFilter] = useState(() => user?.defaultItemStockStatusFilter || "all");
  const [stallFilterOption, setStallFilterOption] = useState(() => {
    // If user has a default stall, and it's for the *current* active site, use it.
    // Otherwise, use their general default, or "all".
    // This logic might need refinement if activeSiteId changes and defaultStallOption is for a different site.
    return user?.defaultItemStallFilterOption || "all";
  });

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingData, setLoadingData] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);
  
  // Effect to update filters if user context changes (e.g., after profile update)
  useEffect(() => {
    if (user) {
      setSearchTerm(user.defaultItemSearchTerm || "");
      setCategoryFilter(user.defaultItemCategoryFilter || "all");
      setStockStatusFilter(user.defaultItemStockStatusFilter || "all");
      // Potentially more complex logic for stallFilterOption if it depends on activeSiteId synchronicity
      setStallFilterOption(user.defaultItemStallFilterOption || "all");
    }
  }, [user]);


  const fetchSupportingDataAndItems = useCallback(async () => {
    if (!user) {
      setErrorData("Please log in to view items.");
      setItems([]);
      setStallsForFilterDropdown([]);
      setSitesMap({});
      setStallsMap({});
      setLoadingData(false);
      return;
    }
    if (!db) {
      setErrorData("Firestore DB instance is not available.");
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setErrorData(null);

    try {
      const sitesCollectionRef = collection(db, "sites");
      const sitesSnapshot = await getDocs(sitesCollectionRef);
      const newSitesMap: Record<string, string> = {};
      sitesSnapshot.forEach(doc => {
        newSitesMap[doc.id] = (doc.data() as Site).name;
      });
      setSitesMap(newSitesMap);

      const allStallsCollectionRef = collection(db, "stalls");
      const allStallsSnapshot = await getDocs(allStallsCollectionRef);
      const newStallsMap: Record<string, string> = {};
      allStallsSnapshot.forEach(doc => {
        newStallsMap[doc.id] = (doc.data() as Stall).name;
      });
      setStallsMap(newStallsMap);

      if (activeSiteId) {
        const qStalls = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
        const querySnapshotStalls = await getDocs(qStalls);
        const fetchedStalls = querySnapshotStalls.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        fetchedStalls.sort((a, b) => a.name.localeCompare(b.name));
        setStallsForFilterDropdown(fetchedStalls);
        
        // If current stallFilterOption is a specific stall ID that's not in the new list for this site, reset it
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master' && !fetchedStalls.find(s => s.id === stallFilterOption)) {
            setStallFilterOption('all'); // Or user.defaultItemStallFilterOption if that's also for this site
        }

      } else {
        setStallsForFilterDropdown([]);
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master') {
             setStallFilterOption('all'); // Reset if no active site but a specific stall was selected
        }
      }

      if (!activeSiteId) {
        setItems([]);
        setErrorData(user.role === 'admin' ? "Admin: Please select a site to view its stock." : "Please select an active site to view stock items.");
      } else {
        const itemsCollectionRef = collection(db, "stockItems");
        let qConstraints: QueryConstraint[] = [
          where("siteId", "==", activeSiteId)
        ];

        if (stallFilterOption === "master") {
          qConstraints.push(where("stallId", "==", null));
        } else if (stallFilterOption !== "all" && stallFilterOption !== "master") {
          qConstraints.push(where("stallId", "==", stallFilterOption));
        }

        const finalItemsQuery = query(itemsCollectionRef, ...qConstraints);
        const itemsSnapshot = await getDocs(finalItemsQuery);
        let fetchedItems: StockItem[] = itemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name));
        setItems(fetchedItems);
      }

    } catch (error: any) {
      console.error("ItemsClientPage: Error fetching data:", error);
      const errorMessage = error.message && error.message.includes("requires an index")
          ? `Query requires a Firestore index. Please create it using the link in the console: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load data. Error: " + error.message;
      setErrorData(errorMessage);
      setItems([]);
      setStallsForFilterDropdown([]);
    } finally {
      setLoadingData(false);
    }
  }, [user, activeSiteId, stallFilterOption, db]); // stallFilterOption is a dependency now

  useEffect(() => {
    fetchSupportingDataAndItems();
  }, [fetchSupportingDataAndItems]); // fetchSupportingDataAndItems itself changes when its deps change.


  const uniqueCategories = useMemo(() => {
    const allFetchedItemsCategories = new Set(items.map(item => item.category));
    return Array.from(allFetchedItemsCategories).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearchTerm = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === "all" || !categoryFilter || item.category === categoryFilter;

      let matchesStockStatus = true;
      if (stockStatusFilter && stockStatusFilter !== "all") {
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
        availableStalls={stallsForFilterDropdown}
        isSiteActive={!!activeSiteId}
      />

      {loadingData && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading items and context data...</p>
        </div>
      )}
      {errorData && !loadingData && (
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information / Error</AlertTitle>
            <AlertDescription>{errorData}</AlertDescription>
        </Alert>
      )}
      {!loadingData && !errorData && (
        <ItemTable
            items={filteredItems}
            sitesMap={sitesMap}
            stallsMap={stallsMap}
            availableStallsForAllocation={stallsForFilterDropdown}
            onDataNeedsRefresh={fetchSupportingDataAndItems} 
        />
      )}
    </div>
  );
}

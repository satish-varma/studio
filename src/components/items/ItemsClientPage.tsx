
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
import Link from "next/link";

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
  const { user, activeSiteId, loading: authLoading } = useAuth(); // Use authLoading

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all");

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingPageData, setLoadingPageData] = useState(true); // Renamed for clarity
  const [errorPageData, setErrorPageData] = useState<string | null>(null); // Renamed for clarity
  
  useEffect(() => {
    if (user && !authLoading) { // Only set from user defaults once auth is done and user is available
      setSearchTerm(user.defaultItemSearchTerm || "");
      setCategoryFilter(user.defaultItemCategoryFilter || "all");
      setStockStatusFilter(user.defaultItemStockStatusFilter || "all");
      setStallFilterOption(user.defaultItemStallFilterOption || "all");
    }
  }, [user, authLoading]);


  const fetchSupportingDataAndItems = useCallback(async () => {
    if (authLoading) { // If auth is still loading, don't proceed
        setLoadingPageData(true); // Ensure page shows loading
        return;
    }

    if (!user) {
      setErrorPageData("Please log in to view items.");
      setItems([]);
      setStallsForFilterDropdown([]);
      setSitesMap({});
      setStallsMap({});
      setLoadingPageData(false);
      return;
    }
    if (!db) {
      setErrorPageData("Firestore DB instance is not available.");
      setLoadingPageData(false);
      return;
    }

    setLoadingPageData(true);
    setErrorPageData(null);

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
        
        // If current stallFilterOption is a specific stall ID that's no longer in the fetchedStalls for the new activeSiteId, reset it.
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master' && !fetchedStalls.find(s => s.id === stallFilterOption)) {
            setStallFilterOption('all'); 
        }
      } else {
        setStallsForFilterDropdown([]);
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master') {
             setStallFilterOption('all'); 
        }
      }

      if (!activeSiteId) {
        setItems([]);
        let message = "Please select an active site to view stock items.";
        if (user.role === 'staff') {
          message = "Your account does not have a default site assigned, or it's not yet active. Please contact an administrator to assign one. If a site was recently assigned, you might need to log out and log back in.";
        } else if (user.role === 'admin') {
          message = "Admin: Please select a site from the header to view its stock.";
        } else if (user.role === 'manager') {
          message = "Manager: Please select one of your managed sites from the header to view its stock.";
        }
        setErrorPageData(message);
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
      setErrorPageData(errorMessage);
      setItems([]);
      setStallsForFilterDropdown([]);
    } finally {
      setLoadingPageData(false);
    }
  }, [user, activeSiteId, stallFilterOption, db, authLoading]); // Added authLoading

  useEffect(() => {
    // This effect now primarily triggers based on authLoading, user, activeSiteId changes,
    // ensuring fetchSupportingDataAndItems runs when these critical context values are stable.
    fetchSupportingDataAndItems();
  }, [fetchSupportingDataAndItems]); // fetchSupportingDataAndItems itself now depends on authLoading


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


  if (authLoading || loadingPageData) { // Check both authLoading and page-specific loading
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading items and context data...</p>
      </div>
    );
  }

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

      {errorPageData && !loadingPageData && ( // Check page-specific loading and error
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>
              {errorPageData.includes("contact an administrator") ? (
                <>
                  {errorPageData.split("contact an administrator")[0]}
                  contact an administrator
                  {errorPageData.split("contact an administrator")[1].includes("log out and log back in") ? (
                    <>
                      {errorPageData.split("contact an administrator")[1].split("log out and log back in")[0]}
                      <Link href="/profile" className="text-primary hover:underline font-medium">log out and log back in</Link>
                      {errorPageData.split("log out and log back in")[1]}
                    </>
                  ): (
                     errorPageData.split("contact an administrator")[1]
                  )}
                </>
              ) : (
                errorPageData
              )}
            </AlertDescription>
        </Alert>
      )}
      {!loadingPageData && !errorPageData && (
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
    

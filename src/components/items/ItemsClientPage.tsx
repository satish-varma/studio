
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

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all"); 

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingDropdownStalls, setLoadingDropdownStalls] = useState(false);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [errorData, setErrorData] = useState<string | null>(null);


  useEffect(() => {
    const fetchMaps = async () => {
      if (!db) {
        setErrorData("Firestore DB instance is not available for fetching maps.");
        setLoadingMaps(false);
        return;
      }
      setLoadingMaps(true);
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
        console.log("ItemsClientPage: Successfully fetched sitesMap and stallsMap using getDocs.");
      } catch (error) {
        console.error("ItemsClientPage: Error fetching sitesMap or stallsMap:", error);
        setErrorData("Failed to load site/stall context data.");
      } finally {
        setLoadingMaps(false);
      }
    };
    fetchMaps();
  }, [db]);


  useEffect(() => {
    console.log("ItemsClientPage: useEffect for stallsForFilterDropdown triggered.");
    console.log("ItemsClientPage: Current activeSiteId:", activeSiteId);
    console.log("ItemsClientPage: db instance:", db ? "defined" : "undefined");

    if (!db) {
      setErrorData(prev => prev || "Firestore DB instance is not available for fetching stalls.");
      setLoadingDropdownStalls(false);
      setStallsForFilterDropdown([]);
      return; 
    }

    if (!activeSiteId) {
      console.log("ItemsClientPage: activeSiteId is null/undefined. Clearing stall dropdown and not fetching.");
      setStallsForFilterDropdown([]);
      setLoadingDropdownStalls(false); 
      return; 
    }
    
    const fetchStallsWithGetDocs = async () => {
        setLoadingDropdownStalls(true);
        // Reset only the part of the error relevant to this fetch, if any.
        setErrorData(prev => prev?.includes("stalls for filtering") ? null : prev); 
        try {
            console.log(`ItemsClientPage: Attempting to fetch stalls with getDocs for siteId: ${activeSiteId}`);
            const qStalls = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
            const querySnapshot = await getDocs(qStalls);
            const fetchedStalls = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
            fetchedStalls.sort((a, b) => a.name.localeCompare(b.name)); // Client-side sort
            setStallsForFilterDropdown(fetchedStalls);
            console.log(`ItemsClientPage: Successfully fetched ${fetchedStalls.length} stalls with getDocs.`);
        } catch (error: any) {
            console.error("ItemsClientPage: Error fetching stalls for filter dropdown (using getDocs):", error);
            const errorMessage = error.message && error.message.includes("requires an index")
                ? `Query for stalls requires a Firestore index. Please create it. Link: ${error.message.substring(error.message.indexOf('https://'))}`
                : "Failed to load stalls for filtering. Error: " + error.message;
            setErrorData(prevError => prevError || errorMessage); 
            setStallsForFilterDropdown([]);
        } finally {
            setLoadingDropdownStalls(false);
        }
    };

    fetchStallsWithGetDocs();
  }, [activeSiteId, db]);


  useEffect(() => {
    const fetchItems = async () => {
      if (!user) {
        setLoadingItems(false);
        setErrorData("Please log in to view items.");
        setItems([]);
        return;
      }

      if (!activeSiteId) {
        setItems([]);
        setLoadingItems(false);
        setErrorData(user.role === 'admin' ? "Admin: Please select a site to view its stock." : "Please select an active site to view stock items.");
        return;
      }
      if (!db) {
        setErrorData("Firestore DB instance is not available for fetching items.");
        setLoadingItems(false);
        return;
      }

      setLoadingItems(true);
      setErrorData(null); 
    
      const itemsCollectionRef = collection(db, "stockItems");
      let qConstraints: QueryConstraint[] = [
        where("siteId", "==", activeSiteId)
      ];

      if (stallFilterOption === "master") {
        qConstraints.push(where("stallId", "==", null));
      } else if (stallFilterOption !== "all" && stallFilterOption !== "master") { 
        qConstraints.push(where("stallId", "==", stallFilterOption));
      }
    
      const finalQuery = query(itemsCollectionRef, ...qConstraints);

      try {
        const querySnapshot = await getDocs(finalQuery);
        let fetchedItems: StockItem[] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name)); 
        setItems(fetchedItems);
        console.log(`ItemsClientPage: Successfully fetched ${fetchedItems.length} stock items with getDocs for siteId ${activeSiteId} and stallFilter ${stallFilterOption}.`);

      } catch (error: any) {
        console.error("ItemsClientPage: Error fetching stock items with getDocs:", error);
        const itemErrorMessage = error.message && error.message.includes("requires an index")
            ? `Query for items requires a Firestore index. Please create it using the link in the console: ${error.message.substring(error.message.indexOf('https://'))}`
            : "Failed to load stock items. Error: " + error.message;
        setErrorData(itemErrorMessage);
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchItems();
  }, [user, activeSiteId, stallFilterOption, db]);

  const uniqueCategories = useMemo(() => {
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
        availableStalls={stallsForFilterDropdown}
        isSiteActive={!!activeSiteId}
      />

      {(loadingItems || loadingMaps || (activeSiteId && loadingDropdownStalls)) && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading items and context data...</p>
        </div>
      )}
      {errorData && !(loadingItems || loadingMaps || loadingDropdownStalls) && ( 
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information / Error</AlertTitle>
            <AlertDescription>{errorData}</AlertDescription>
        </Alert>
      )}
      {!loadingItems && !loadingMaps && !errorData && (
        <ItemTable 
            items={filteredItems} 
            sitesMap={sitesMap} 
            stallsMap={stallsMap}
            availableStallsForAllocation={stallsForFilterDropdown} 
        />
      )}
      
      {/* CSV Export and Google Sheets Integration Cards are hidden for now
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      </div>
      */}
    </div>
  );
}

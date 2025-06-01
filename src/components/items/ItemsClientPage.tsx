
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
  const [errorItems, setErrorItems] = useState<string | null>(null);

  // Fetch all sites for mapping IDs to names
  useEffect(() => {
    const sitesCollectionRef = collection(db, "sites");
    const unsubscribeSites = onSnapshot(sitesCollectionRef, (snapshot) => {
      const newSitesMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newSitesMap[doc.id] = (doc.data() as Site).name;
      });
      setSitesMap(newSitesMap);
      setLoadingMaps(prev => stallsMap && Object.keys(stallsMap).length > 0 ? false : prev);
    }, (error) => console.error("Error fetching sites map:", error));
    
    return () => unsubscribeSites();
  }, [stallsMap]);
  
  // Fetch all stalls for mapping IDs to names (used by ItemTable)
  // AND stalls for the active site for the filter dropdown
  useEffect(() => {
    const allStallsCollectionRef = collection(db, "stalls");
    const unsubscribeAllStalls = onSnapshot(allStallsCollectionRef, (snapshot) => {
      const newStallsMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newStallsMap[doc.id] = (doc.data() as Stall).name;
      });
      setStallsMap(newStallsMap);
      setLoadingMaps(prev => sitesMap && Object.keys(sitesMap).length > 0 ? false : prev);
    }, (error) => console.error("Error fetching all stalls map:", error));

    let unsubscribeDropdownStalls: () => void = () => {};
    if (activeSiteId) {
      setLoadingDropdownStalls(true);
      const q = query(collection(db, "stalls"), where("siteId", "==", activeSiteId), orderBy("name"));
      unsubscribeDropdownStalls = onSnapshot(q, (snapshot) => {
        const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForFilterDropdown(fetchedStalls);
        setLoadingDropdownStalls(false);
      }, (error) => {
        console.error("Error fetching stalls for filter dropdown:", error);
        setStallsForFilterDropdown([]);
        setLoadingDropdownStalls(false);
      });
    } else {
      setStallsForFilterDropdown([]); 
      setLoadingDropdownStalls(false);
    }
    return () => {
      unsubscribeAllStalls();
      unsubscribeDropdownStalls();
    };
  }, [activeSiteId, sitesMap]);


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
    } else if (stallFilterOption !== "all") { 
      qConstraints.push(where("stallId", "==", stallFilterOption));
    }
    
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
      {errorItems && (
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription>{errorItems}</AlertDescription>
        </Alert>
      )}
      {!loadingItems && !loadingMaps && !errorItems && (
        <ItemTable items={filteredItems} sitesMap={sitesMap} stallsMap={stallsMap} />
      )}
    </div>
  );
}

    
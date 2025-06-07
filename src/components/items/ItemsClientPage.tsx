
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import type { StockItem, Stall, Site, UserRole } from "@/types";
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
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth(); 

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all");

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingPageData, setLoadingPageData] = useState(true); 
  const [errorPageData, setErrorPageData] = useState<string | null>(null); 
  
  useEffect(() => {
    if (user && !authLoading) { 
      setSearchTerm(user.defaultItemSearchTerm || "");
      setCategoryFilter(user.defaultItemCategoryFilter || "all");
      setStockStatusFilter(user.defaultItemStockStatusFilter || "all");
      if (user.role !== 'staff') {
        setStallFilterOption(user.defaultItemStallFilterOption || "all");
      } else {
        // For staff, their stall filter is determined by their activeStallId (or master if null)
        setStallFilterOption(activeStallId || "master");
      }
      console.log("ItemsClientPage: User defaults applied to filters.", { 
        defaultSearch: user.defaultItemSearchTerm, 
        defaultCategory: user.defaultItemCategoryFilter,
        defaultStockStatus: user.defaultItemStockStatusFilter,
        defaultStallOption: user.defaultItemStallFilterOption,
        activeSiteIdFromAuth: activeSiteId,
        activeStallIdForStaff: user.role === 'staff' ? activeStallId : 'N/A'
      });
    }
  }, [user, authLoading, activeSiteId, activeStallId]);


  const fetchSupportingDataAndItems = useCallback(async () => {
    console.log(`ItemsClientPage: fetchSupportingDataAndItems called. AuthLoading: ${authLoading}, User: ${!!user}, ActiveSiteId: ${activeSiteId}, ActiveStallId (for staff): ${user?.role === 'staff' ? activeStallId : 'N/A'}, StallFilterOption (for admin/mgr): ${user?.role !== 'staff' ? stallFilterOption : 'N/A'}`);
    if (authLoading) { 
        setLoadingPageData(true); 
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

      if (activeSiteId && user.role !== 'staff') {
        const qStalls = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
        const querySnapshotStalls = await getDocs(qStalls);
        const fetchedStalls = querySnapshotStalls.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        fetchedStalls.sort((a, b) => a.name.localeCompare(b.name));
        setStallsForFilterDropdown(fetchedStalls);
        
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master' && !fetchedStalls.find(s => s.id === stallFilterOption)) {
             console.log("ItemsClientPage: Current stallFilterOption", stallFilterOption, "not found in new site's stalls. Resetting to 'all'.");
            setStallFilterOption('all'); 
        }
      } else {
        setStallsForFilterDropdown([]);
         if (user.role !== 'staff' && stallFilterOption !== 'all' && stallFilterOption !== 'master') {
             console.log("ItemsClientPage: No active site or user is staff. Clearing stall dropdown and resetting stallFilterOption to 'all'.");
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

        let effectiveStallFilter = stallFilterOption;
        if (user.role === 'staff') {
            effectiveStallFilter = activeStallId || "master"; // Staff use their assigned stall or master
        }
        console.log(`ItemsClientPage: Effective stall filter for query: ${effectiveStallFilter}`);

        if (effectiveStallFilter === "master") {
            qConstraints.push(where("stallId", "==", null));
            console.log(`ItemsClientPage: Querying for site ${activeSiteId}, master stock (stallId is null)`);
        } else if (effectiveStallFilter !== "all") { // This means specific stall ID
            qConstraints.push(where("stallId", "==", effectiveStallFilter));
            console.log(`ItemsClientPage: Querying for site ${activeSiteId}, specific stall ${effectiveStallFilter}`);
        } else { // stallFilterOption is "all" (for Admin/Manager when "all" is explicitly chosen)
            console.log(`ItemsClientPage: Querying for site ${activeSiteId}, all items (no stallId constraint)`);
        }

        const finalItemsQuery = query(itemsCollectionRef, ...qConstraints);
        const itemsSnapshot = await getDocs(finalItemsQuery);
        let fetchedItems: StockItem[] = itemsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name));
        setItems(fetchedItems);
        console.log("ItemsClientPage: Items fetched:", fetchedItems.length);
      }

    } catch (error: any) {
      console.error("ItemsClientPage: Error fetching data:", error);
      const errorMessage = error.message && error.message.includes("requires an index")
          ? `Query requires a Firestore index. Please create it. Details: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load data. Error: " + error.message;
      setErrorPageData(errorMessage);
      setItems([]);
      setStallsForFilterDropdown([]);
    } finally {
      setLoadingPageData(false);
    }
  }, [user, activeSiteId, activeStallId, stallFilterOption, db, authLoading]);

  useEffect(() => {
    fetchSupportingDataAndItems();
  }, [fetchSupportingDataAndItems]);


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

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Manage your inventory."; // Default or loading state

    if (!activeSite) {
      if (user.role === 'staff') {
        return "Your account needs a default site assigned. Please contact an administrator.";
      }
      return "Select a site to view and manage its inventory.";
    }

    let desc = "Manage your inventory. Currently viewing: ";
    desc += `Site: "${activeSite.name}"`;

    if (activeStall) {
      desc += ` (Stall: "${activeStall.name}")`;
    } else if (user.role !== 'staff') { // If admin/manager and no specific stall, but site is active
        // Check the stallFilterOption to be more specific
        if (stallFilterOption === 'master') {
            desc += " (Master Stock).";
        } else if (stallFilterOption === 'all' || !stallFilterOption) {
            desc += " (All items in site).";
        } else if (stallsMap[stallFilterOption]) { // A specific stall IS selected via filter
            desc += ` (Stall: "${stallsMap[stallFilterOption]}").`;
        } else {
             desc += " (All items in site).";
        }
    } else if (user.role === 'staff' && !activeStallId) { // Staff with active site but no specific stall (i.e., master stock)
        desc += " (Master Stock).";
    }
     desc += ".";
    return desc;
  }, [user, activeSite, activeStall, activeStallId, stallFilterOption, stallsMap]);


  if (authLoading || loadingPageData) { 
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
        description={pageHeaderDescription}
      />
      <ItemControls
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        stockStatusFilter={stockStatusFilter}
        onStockStatusFilterChange={setStockStatusFilter}
        
        userRole={user?.role}
        stallFilterOption={user?.role === 'staff' ? (activeStallId || "master") : stallFilterOption}
        onStallFilterOptionChange={setStallFilterOption}
        staffsEffectiveStallId={user?.role === 'staff' ? activeStallId : undefined}
        staffsAssignedStallName={user?.role === 'staff' && activeStallId ? stallsMap[activeStallId] : undefined}
        
        categories={uniqueCategories}
        availableStalls={stallsForFilterDropdown}
        isSiteActive={!!activeSiteId}
      />

      {errorPageData && !loadingPageData && ( 
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

    

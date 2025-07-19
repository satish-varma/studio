
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
import { useToast } from "@/hooks/use-toast";
import CsvImportDialog from "@/components/shared/CsvImportDialog";

const LOG_PREFIX = "[ItemsClientPage]";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
} else {
  db = getFirestore(getApp());
}

export type SortConfig = {
  key: keyof StockItem | null;
  direction: 'ascending' | 'descending' | null;
};

export default function ItemsClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'name', direction: 'ascending' });

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingPageData, setLoadingPageData] = useState(true);
  const [errorPageData, setErrorPageData] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      console.log(`${LOG_PREFIX} Setting initial filters from user preferences:`, user);
      setSearchTerm(user.defaultItemSearchTerm || "");
      setCategoryFilter(user.defaultItemCategoryFilter || "all");
      setStockStatusFilter(user.defaultItemStockStatusFilter || "all");
      if (user.role !== 'staff') {
        setStallFilterOption(user.defaultItemStallFilterOption || "all");
      } else {
        setStallFilterOption(activeStallId || "master"); 
      }
    }
  }, [user, authLoading, activeSiteId, activeStallId]);

  const fetchSupportingDataAndItems = useCallback(async () => {
    console.log(`${LOG_PREFIX} fetchSupportingDataAndItems called. AuthLoading: ${authLoading}, User: ${!!user}, DB: ${!!db}`);
    setLoadingPageData(true);
    setErrorPageData(null); 

    if (authLoading) return;
    if (!user) {
      setErrorPageData("Please log in to view items.");
      setItems([]); setLoadingPageData(false); return;
    }
    if (!db) {
      setErrorPageData("Firestore DB instance is not available. Cannot fetch data.");
      setLoadingPageData(false); return;
    }

    console.log(`${LOG_PREFIX} Starting data fetch. User: ${user.uid}, ActiveSite: ${activeSiteId}, ActiveStall: ${activeStallId}, StallFilter: ${stallFilterOption}`);
    try {
      const sitesSnapshot = await getDocs(collection(db, "sites"));
      const newSitesMap: Record<string, string> = {};
      sitesSnapshot.forEach(doc => { newSitesMap[doc.id] = (doc.data() as Site).name; });
      setSitesMap(newSitesMap);

      const allStallsSnapshot = await getDocs(collection(db, "stalls"));
      const newStallsMap: Record<string, string> = {};
      allStallsSnapshot.forEach(doc => { newStallsMap[doc.id] = (doc.data() as Stall).name; });
      setStallsMap(newStallsMap);

      if (activeSiteId && user.role !== 'staff') {
        const qStalls = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
        const querySnapshotStalls = await getDocs(qStalls);
        const fetchedStalls = querySnapshotStalls.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        fetchedStalls.sort((a, b) => a.name.localeCompare(b.name));
        setStallsForFilterDropdown(fetchedStalls);
        if (stallFilterOption !== 'all' && stallFilterOption !== 'master' && !fetchedStalls.find(s => s.id === stallFilterOption)) {
            setStallFilterOption('all'); 
        }
      } else {
        setStallsForFilterDropdown([]);
         if (user.role !== 'staff' && stallFilterOption !== 'all' && stallFilterOption !== 'master' && !activeSiteId) {
             setStallFilterOption('all');
        }
      }

      if (!activeSiteId) {
        setItems([]);
        let message = "Please select an active site to view stock items.";
         if (user.role === 'staff') {
          message = "Your account does not have a default site assigned. Please contact an administrator.";
        } else if (user.role === 'admin') {
          message = "Admin: Please select a site from the header to view its stock.";
        } else if (user.role === 'manager') {
          message = "Manager: Please select one of your managed sites from the header.";
        }
        setErrorPageData(message);
      } else {
        const itemsCollectionRef = collection(db, "stockItems");
        let qConstraints: QueryConstraint[] = [ where("siteId", "==", activeSiteId) ];

        let effectiveStallFilter = stallFilterOption;
        if (user.role === 'staff') {
            effectiveStallFilter = activeStallId || "master"; 
        }
        if (effectiveStallFilter === "master") {
            qConstraints.push(where("stallId", "==", null));
        } else if (effectiveStallFilter !== "all") { 
            qConstraints.push(where("stallId", "==", effectiveStallFilter));
        }

        const finalItemsQuery = query(itemsCollectionRef, ...qConstraints);
        const itemsSnapshot = await getDocs(finalItemsQuery);
        let fetchedItems: StockItem[] = itemsSnapshot.docs.map(doc => ({
          id: doc.id, ...doc.data() } as StockItem));
        setItems(fetchedItems);
      }
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching data:`, error);
      const errorMessage = error.message && error.message.includes("requires an index")
          ? `Query requires a Firestore index. Please create it. Details: ${error.message.substring(error.message.indexOf('https://'))}`
          : `Failed to load data. Error: ${error.message || "Unknown error"}.`;
      setErrorPageData(errorMessage);
    } finally {
      setLoadingPageData(false);
    }
  }, [user, activeSiteId, activeStallId, stallFilterOption, db, authLoading]);

  useEffect(() => {
    fetchSupportingDataAndItems();
  }, [fetchSupportingDataAndItems]);

  const uniqueCategories = useMemo(() => Array.from(new Set(items.map(item => item.category))).sort(), [items]);

  const requestSort = (key: keyof StockItem) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const sortedAndFilteredItems = useMemo(() => {
    let sortableItems = [...items];
    if (sortConfig.key !== null && sortConfig.direction !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key!]; const valB = b[sortConfig.key!];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'ascending' ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortConfig.direction === 'ascending' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }

    return sortableItems.filter(item => {
      const matchesSearchTerm = item.name.toLowerCase().includes(searchTerm.toLowerCase());
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
  }, [items, searchTerm, categoryFilter, stockStatusFilter, sortConfig]);

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Manage your inventory.";
    if (!activeSite) {
      return user.role === 'staff' ? "Your account needs a default site assigned." : "Select a site to view its inventory.";
    }
    let desc = "Currently viewing: ";
    desc += `Site: "${activeSite.name}"`;
    if (activeStall) {
      desc += ` (Stall: "${activeStall.name}")`;
    } else if (user.role !== 'staff') {
        if (stallFilterOption === 'master') desc += " (Master Stock)";
        else if (stallFilterOption === 'all' || !stallFilterOption) desc += " (All items in site)";
        else if (stallsMap[stallFilterOption]) desc += ` (Stall: "${stallsMap[stallFilterOption]}")`;
        else desc += " (All items in site)";
    } else if (user.role === 'staff' && !activeStallId) {
        desc += " (Master Stock)";
    }
     desc += ".";
    return desc;
  }, [user, activeSite, activeStall, activeStallId, stallFilterOption, stallsMap]);
  
  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) return "";
    const stringData = String(cellData);
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${minutes}`;
  };

  const downloadCsv = (csvString: string, filename: string) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExport = async () => {
    if (!db || !activeSiteId) {
        toast({ title: "Export Error", description: "Cannot export without an active site context.", variant: "destructive"});
        return;
    }
    setIsExporting(true);
    toast({ title: "Exporting...", description: "Fetching all matching items for export. Please wait."});
    
    try {
        const itemsCollectionRef = collection(db, "stockItems");
        let qConstraints: QueryConstraint[] = [ where("siteId", "==", activeSiteId) ];

        // Apply same filtering logic as the main view
        let effectiveStallFilter = stallFilterOption;
        if (user?.role === 'staff') {
            effectiveStallFilter = activeStallId || "master"; 
        }
        if (effectiveStallFilter === "master") {
            qConstraints.push(where("stallId", "==", null));
        } else if (effectiveStallFilter !== "all") { 
            qConstraints.push(where("stallId", "==", effectiveStallFilter));
        }
        // NOTE: Firestore does not support 'not-equal' or OR queries on different fields in a single query.
        // Client-side filtering for search term, category, and stock status will be applied after fetching.
        // This means we fetch all items for the site/stall context and then filter locally for the export.
        const exportQuery = query(itemsCollectionRef, ...qConstraints);
        const itemsSnapshot = await getDocs(exportQuery);
        const allFetchedItems: StockItem[] = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));

        // Now apply the remaining client-side filters
        const itemsToExport = allFetchedItems.filter(item => {
            const matchesSearchTerm = item.name.toLowerCase().includes(searchTerm.toLowerCase());
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

        if (itemsToExport.length === 0) {
            toast({ title: "No Data", description: "No items match the current filters to export.", variant: "default" });
            setIsExporting(false);
            return;
        }

        const headers = ["ID", "Name", "Category", "Description", "Quantity", "Unit", "Cost Price (₹)", "Selling Price (₹)", "Low Stock Threshold", "Image URL", "Site Name", "Stall Name", "Original Master Item ID"];
        const csvRows = [headers.join(",")];
        itemsToExport.forEach(item => {
            const row = [
            escapeCsvCell(item.id), escapeCsvCell(item.name), escapeCsvCell(item.category),
            escapeCsvCell(item.description), escapeCsvCell(item.quantity), escapeCsvCell(item.unit),
            escapeCsvCell((item.costPrice ?? 0).toFixed(2)), escapeCsvCell(item.price.toFixed(2)),
            escapeCsvCell(item.lowStockThreshold), escapeCsvCell(item.imageUrl || ""),
            escapeCsvCell(item.siteId ? sitesMap[item.siteId] || item.siteId : "N/A"),
            escapeCsvCell(item.stallId ? stallsMap[item.stallId] || item.stallId : "N/A"),
            escapeCsvCell(item.originalMasterItemId || "")
            ];
            csvRows.push(row.join(","));
        });
        const siteNameForFile = activeSite?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'export';
        downloadCsv(csvRows.join("\n"), `stallsync_stock_${siteNameForFile}_${getFormattedTimestamp()}.csv`);
        toast({ title: "Export Successful", description: `${itemsToExport.length} items exported to CSV.` });
    } catch (error: any) {
        toast({ title: "Export Failed", description: `Could not export stock items. ${error.message}`, variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };

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
      <PageHeader title="Stock Items" description={pageHeaderDescription} />
      <ItemControls
        searchTerm={searchTerm} onSearchTermChange={setSearchTerm}
        categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter}
        stockStatusFilter={stockStatusFilter} onStockStatusFilterChange={setStockStatusFilter}
        userRole={user?.role}
        stallFilterOption={user?.role === 'staff' ? (activeStallId || "master") : stallFilterOption}
        onStallFilterOptionChange={setStallFilterOption}
        staffsEffectiveStallId={user?.role === 'staff' ? activeStallId : undefined}
        staffsAssignedStallName={user?.role === 'staff' && activeStallId ? stallsMap[activeStallId] : undefined}
        categories={uniqueCategories}
        availableStalls={stallsForFilterDropdown}
        isSiteActive={!!activeSiteId}
        onExportClick={handleExport}
        onImportClick={() => setShowImportDialog(true)}
        isExporting={isExporting}
      />
      {errorPageData && !loadingPageData && (
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information</AlertTitle>
            <AlertDescription> {errorPageData} </AlertDescription>
        </Alert>
      )}
      <ItemTable
          items={sortedAndFilteredItems}
          sitesMap={sitesMap}
          stallsMap={stallsMap}
          availableStallsForAllocation={stallsForFilterDropdown}
          onDataNeedsRefresh={fetchSupportingDataAndItems}
          loading={loadingPageData}
          sortConfig={sortConfig}
          requestSort={requestSort}
      />
      <CsvImportDialog
        dataType="stock"
        isOpen={showImportDialog}
        onClose={() => {
          setShowImportDialog(false);
          fetchSupportingDataAndItems(); // Refresh data after import dialog closes
        }}
      />
    </div>
  );
}

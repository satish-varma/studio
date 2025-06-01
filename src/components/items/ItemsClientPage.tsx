
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
  DocumentData,
  getDocs // Import getDocs
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2, Info } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";


if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemsClientPage:", error);
  }
}
const db = getFirestore();

export default function ItemsClientPage() {
  const { user, activeSiteId, auth } = useAuth(); 
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [stallFilterOption, setStallFilterOption] = useState("all"); // "all", "master", or stallId

  const [items, setItems] = useState<StockItem[]>([]);
  const [stallsForFilterDropdown, setStallsForFilterDropdown] = useState<Stall[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingDropdownStalls, setLoadingDropdownStalls] = useState(false);
  const [loadingMaps, setLoadingMaps] = useState(true);
  const [errorItems, setErrorItems] = useState<string | null>(null);


  useEffect(() => {
    const sitesCollectionRef = collection(db, "sites");
    const unsubscribeSites = onSnapshot(sitesCollectionRef, (snapshot) => {
      const newSitesMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newSitesMap[doc.id] = (doc.data() as Site).name;
      });
      setSitesMap(newSitesMap);
      checkMapsLoaded(newSitesMap, stallsMap);
    }, (error) => {
      console.error("Error fetching sites map:", error);
      setErrorItems("Failed to load site context data.");
      setLoadingMaps(false);
    });

    const allStallsCollectionRef = collection(db, "stalls");
    const unsubscribeAllStalls = onSnapshot(allStallsCollectionRef, (snapshot) => {
      const newStallsMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        newStallsMap[doc.id] = (doc.data() as Stall).name;
      });
      setStallsMap(newStallsMap);
      checkMapsLoaded(sitesMap, newStallsMap);
    }, (error) => {
      console.error("Error fetching all stalls map:", error);
      setErrorItems("Failed to load stall context data.");
      setLoadingMaps(false);
    });
    
    const checkMapsLoaded = (currentSitesMap: Record<string, string>, currentStallsMap: Record<string, string>) => {
        if (Object.keys(currentSitesMap).length > 0 && Object.keys(currentStallsMap).length > 0) {
            setLoadingMaps(false);
        } else if (Object.keys(currentSitesMap).length > 0 && !activeSiteId) {
            setLoadingMaps(false);
        }
    };


    // Fetch stalls for filter dropdown
    console.log("ItemsClientPage: useEffect for stallsForFilterDropdown triggered.");
    console.log("ItemsClientPage: Current activeSiteId:", activeSiteId);
    console.log("ItemsClientPage: db instance:", db ? "defined" : "undefined");

    if (!db) {
      setErrorItems(prev => prev || "Firestore DB instance is not available for fetching stalls.");
      setLoadingDropdownStalls(false);
      setStallsForFilterDropdown([]);
      return; // Exit if db is not defined
    }

    if (!activeSiteId) {
      console.log("ItemsClientPage: activeSiteId is null/undefined. Clearing stall dropdown and not fetching.");
      setStallsForFilterDropdown([]);
      setLoadingDropdownStalls(false); // Ensure loading is set to false
      return; // Do not proceed if activeSiteId is not set
    }
    
    // --- TEMPORARY TEST: Use getDocs instead of onSnapshot ---
    const fetchStallsWithGetDocs = async () => {
        setLoadingDropdownStalls(true);
        // Reset only the part of the error relevant to this fetch, if any.
        // This allows other errors (like main items fetch error) to persist if they occurred.
        setErrorItems(prev => prev?.includes("stalls for filtering") ? null : prev); 
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
            setErrorItems(prevError => prevError || errorMessage); // Append or set if no prev error
            setStallsForFilterDropdown([]);
        } finally {
            setLoadingDropdownStalls(false);
        }
    };

    fetchStallsWithGetDocs();
    // --- END TEMPORARY TEST ---

    // Original onSnapshot logic (commented out for the test)
    /*
    setLoadingDropdownStalls(true);
    setErrorItems(null); 
    const qStallsForDropdown = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
    const unsubscribeDropdownStalls = onSnapshot(qStallsForDropdown, (snapshot) => {
      const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
      fetchedStalls.sort((a, b) => a.name.localeCompare(b.name)); // Client-side sort
      setStallsForFilterDropdown(fetchedStalls);
      setLoadingDropdownStalls(false);
    }, (error) => {
      console.error("ItemsClientPage: Error fetching stalls for filter dropdown:", error);
      const specificErrorMessage = error.message && error.message.includes("requires an index")
          ? `Query for stalls requires a Firestore index. Please create it. Link: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load stalls for filtering. Error: " + error.message;
      setErrorItems(prevError => prevError || specificErrorMessage);
      setStallsForFilterDropdown([]);
      setLoadingDropdownStalls(false);
    });
    */

    return () => {
      unsubscribeSites();
      unsubscribeAllStalls();
      // if (unsubscribeDropdownStalls) unsubscribeDropdownStalls(); // Only if using onSnapshot
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
    
    const itemsCollectionRef = collection(db, "stockItems");
    let qConstraints: QueryConstraint[] = [
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
        let fetchedItems: StockItem[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as StockItem));
        fetchedItems.sort((a, b) => a.name.localeCompare(b.name)); // Client-side sort
        setItems(fetchedItems);
        setLoadingItems(false);
        // Clear general item error if this fetch succeeds, but preserve specific stall dropdown error if it exists
        setErrorItems(prev => prev?.includes("stalls for filtering") ? prev : null);
      },
      (error) => {
        console.error("Error fetching stock items:", error);
        const itemErrorMessage = error.message && error.message.includes("requires an index")
            ? `Query for items requires a Firestore index. Please create it. Link: ${error.message.substring(error.message.indexOf('https://'))}`
            : "Failed to load stock items. Error: " + error.message;
        setErrorItems(prevError => prevError || itemErrorMessage);
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
      {errorItems && !loadingItems && ( 
        <Alert variant="default" className="border-primary/30">
            <Info className="h-4 w-4" />
            <AlertTitle>Information / Error</AlertTitle>
            <AlertDescription>{errorItems}</AlertDescription>
        </Alert>
      )}
      {!loadingItems && !loadingMaps && !errorItems && (
        <ItemTable 
            items={filteredItems} 
            sitesMap={sitesMap} 
            stallsMap={stallsMap}
            availableStallsForAllocation={stallsForFilterDropdown} 
        />
      )}
      
      {/* 
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="mr-2 h-5 w-5 text-primary" />
              Export Data (CSV)
            </CardTitle>
            <CardDescription>Download stock items or sales history.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => callGoogleSheetsApiForItemActions('exportStockItems', 'stock')}
              disabled={isProcessingStockCsvExport}
            >
              {isProcessingStockCsvExport ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export Stock Items (CSV)
            </Button>
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <SheetIcon className="mr-2 h-5 w-5 text-green-600" />
              Google Sheets Integration
            </CardTitle>
            <CardDescription>Import or export stock items.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => openSheetIdPromptForItemActions('importStockItems', 'stock')}
              disabled={isProcessingStockSheets}
            >
              {isProcessingStockSheets && currentSheetAction === 'importStockItems' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4 text-green-700" />
              )}
              Import Stock from Sheets
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => openSheetIdPromptForItemActions('exportStockItems', 'stock')}
              disabled={isProcessingStockSheets}
            >
              {isProcessingStockSheets && currentSheetAction === 'exportStockItems' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SheetIcon className="mr-2 h-4 w-4 text-green-700" />
              )}
              Export Stock to Sheets
            </Button>
          </CardContent>
        </Card>
      </div>
      */}

      {/* 
      <AlertDialog open={showSheetIdDialog} onOpenChange={setShowSheetIdDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentSheetAction?.toLowerCase().includes('import') ? 'Enter Google Sheet ID for Import' : 'Enter Google Sheet ID for Export (Optional)'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentSheetAction?.toLowerCase().includes('import')
                ? `Please provide the ID of the Google Sheet you want to import ${currentDataType} data from.`
                : `If you provide a Sheet ID, ${currentDataType} data will be exported to that sheet. Otherwise, a new sheet will be created.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="itemClientSheetIdInput" className="sr-only">
              Google Sheet ID
            </Label>
            <Input
              id="itemClientSheetIdInput"
              value={sheetIdInputValue}
              onChange={(e) => setSheetIdInputValue(e.target.value)}
              placeholder="Google Sheet ID (e.g., 123abCDefgHIJkLmNopQ...)"
              className="bg-input"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowSheetIdDialog(false);
              setSheetIdInputValue("");
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSheetIdDialogSubmit}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      */}
    </div>
  );
}


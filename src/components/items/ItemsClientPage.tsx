
"use client";

import { useState, useMemo, useEffect } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import type { StockItem } from "@/types";
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  QuerySnapshot, 
  DocumentData, 
  query, 
  orderBy,
  getDocs
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2, Download, SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getAuth } from 'firebase/auth';

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ItemsClientPage:", error);
  }
}
const db = getFirestore();
const auth = getAuth(getApp());


export default function ItemsClientPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  
  const [items, setItems] = useState<StockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [errorItems, setErrorItems] = useState<string | null>(null);

  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isProcessingSheetsImport, setIsProcessingSheetsImport] = useState(false);
  const [isProcessingSheetsExport, setIsProcessingSheetsExport] = useState(false);

  useEffect(() => {
    const itemsCollectionRef = collection(db, "stockItems");
    const q = query(itemsCollectionRef, orderBy("name"));
    
    const unsubscribe = onSnapshot(q, 
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

    return () => unsubscribe(); 
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

  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) {
      return "";
    }
    const stringData = String(cellData);
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const exportStockItemsToCsvLocal = async () => {
    setIsExportingCsv(true);
    try {
      const stockItemsCollectionRef = collection(db, "stockItems");
      // No need to re-query, use the 'items' state which should be up-to-date
      // If you need a full fresh export, then re-query as below:
      // const q = query(stockItemsCollectionRef, orderBy("name"));
      // const querySnapshot = await getDocs(q);
      // const allStockItems: StockItem[] = [];
      // querySnapshot.forEach((doc) => {
      //   allStockItems.push({ id: doc.id, ...doc.data() } as StockItem);
      // });
      const allStockItems = items; // Use current items state

      if (allStockItems.length === 0) {
        toast({ title: "No Stock Data", description: "There are no stock items to export.", variant: "default" });
        setIsExportingCsv(false);
        return;
      }

      const headers = [
        "ID", "Name", "Category", "Quantity", "Unit", 
        "Price (₹)", "Low Stock Threshold", "Image URL", "Last Updated", "Site ID", "Stall ID"
      ];
      
      const csvRows = [headers.join(",")];

      allStockItems.forEach(item => {
        const row = [
          escapeCsvCell(item.id),
          escapeCsvCell(item.name),
          escapeCsvCell(item.category),
          escapeCsvCell(item.quantity),
          escapeCsvCell(item.unit),
          escapeCsvCell(item.price.toFixed(2)),
          escapeCsvCell(item.lowStockThreshold),
          escapeCsvCell(item.imageUrl || ""),
          escapeCsvCell(item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('en-IN') : ""),
          escapeCsvCell(item.siteId || ""),
          escapeCsvCell(item.stallId || "")
        ];
        csvRows.push(row.join(","));
      });

      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `stallsync_stock_items_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
       toast({ title: "Export Successful", description: "Stock items CSV downloaded." });

    } catch (error: any) {
      console.error("Error exporting stock items:", error);
      toast({ title: "Export Failed", description: error.message || "Could not export stock items.", variant: "destructive" });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const callGoogleSheetsApiForItemActions = async (
    action: "importStockItems" | "exportStockItems", 
    setLoadingState: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    setLoadingState(true);
    const friendlyAction = action.replace(/([A-Z])/g, ' $1').toLowerCase();
    toast({
      title: "Processing Google Sheets Request...",
      description: `Attempting to ${friendlyAction}...`,
    });

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast({ title: "Authentication Error", description: "User not authenticated. Please re-login.", variant: "destructive" });
        setLoadingState(false);
        return;
      }

      let sheetId: string | null = null;
      if (action.toLowerCase().includes('import') || action.toLowerCase().includes('export')) {
         sheetId = prompt(`Enter Google Sheet ID for ${friendlyAction} (optional for export, a new sheet will be created if blank):`);
          if (action.toLowerCase().includes('import') && !sheetId) {
            toast({ title: "Sheet ID Required", description: "Please provide a Google Sheet ID to import from.", variant: "default" });
            setLoadingState(false);
            return;
         }
      }
      
      const response = await fetch('/api/google-sheets-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: action, 
          dataType: 'stock',
          sheetId: sheetId || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
         if (result.needsAuth && result.authUrl) {
          toast({ 
            title: "Authorization Required", 
            description: "Please authorize StallSync to access your Google Sheets. Redirecting...",
            duration: 5000 
          });
          window.location.href = result.authUrl;
        } else {
          throw new Error(result.error || `Failed to ${friendlyAction}.`);
        }
      } else {
         toast({ title: "Success", description: result.message || `${friendlyAction} completed.` });
      }

    } catch (error: any) {
      console.error(`Error during Google Sheets ${friendlyAction} for stock items:`, error);
      toast({ 
        title: "Error", 
        description: error.message || `Failed to ${friendlyAction}. Ensure backend and OAuth are correctly set up.`, 
        variant: "destructive" 
      });
    } finally {
      setLoadingState(false);
    }
  };


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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Download className="mr-2 h-5 w-5 text-primary" />
              CSV Export
            </CardTitle>
            <CardDescription>Download all stock items as a CSV file.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={exportStockItemsToCsvLocal}
              disabled={isExportingCsv || loadingItems || items.length === 0}
            >
              {isExportingCsv ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export All Stock Data (CSV)
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
              <CardTitle className="flex items-center text-lg">
                  <SheetIcon className="mr-2 h-5 w-5 text-green-600" />
                  Google Sheets Integration
              </CardTitle>
              <CardDescription>
                  Import or export stock items directly with Google Sheets.
              </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
              <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => callGoogleSheetsApiForItemActions("importStockItems", setIsProcessingSheetsImport)}
                  disabled={isProcessingSheetsImport || isProcessingSheetsExport || loadingItems}
              >
                  {isProcessingSheetsImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-green-700" />}
                  Import Stock from Sheets
              </Button>
              <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => callGoogleSheetsApiForItemActions("exportStockItems", setIsProcessingSheetsExport)}
                  disabled={isProcessingSheetsImport || isProcessingSheetsExport || loadingItems || items.length === 0}
              >
                  {isProcessingSheetsExport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SheetIcon className="mr-2 h-4 w-4 text-green-700" />}
                  Export Stock to Sheets
              </Button>
          </CardContent>
          <CardFooter>
              <p className="text-xs text-muted-foreground">
                Note: Requires backend API setup, Google Cloud OAuth config, and Redirect URI.
              </p>
          </CardFooter>
        </Card>
      </div>
      
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


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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"; // AlertDialogTrigger removed as it's not directly used here
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


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

  const [showSheetIdDialog, setShowSheetIdDialog] = useState(false);
  const [sheetIdInputValue, setSheetIdInputValue] = useState("");
  const [currentSheetAction, setCurrentSheetAction] = useState<"importStockItems" | "exportStockItems" | null>(null);


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
      const allStockItems = items; 

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

  const handleSheetIdDialogSubmit = () => {
    if (currentSheetAction) {
      if (currentSheetAction.toLowerCase().includes('import') && !sheetIdInputValue.trim()) {
        toast({ title: "Sheet ID Required", description: "Please provide a Google Sheet ID to import from.", variant: "default" });
        return;
      }
      callGoogleSheetsApiForItemActions(currentSheetAction, sheetIdInputValue.trim() || undefined);
    }
    setShowSheetIdDialog(false);
    setSheetIdInputValue("");
    setCurrentSheetAction(null);
  };
  
  const openSheetIdPrompt = (action: "importStockItems" | "exportStockItems") => {
    setCurrentSheetAction(action);
    setShowSheetIdDialog(true);
  };


  const callGoogleSheetsApiForItemActions = async (
    action: "importStockItems" | "exportStockItems", 
    sheetId?: string
  ) => {
    const setLoadingState = action === "importStockItems" ? setIsProcessingSheetsImport : setIsProcessingSheetsExport;
    setLoadingState(true);
    const friendlyAction = action.replace(/([A-Z])/g, ' $1').toLowerCase();
    toast({
      title: "Processing Google Sheets Request...",
      description: `Attempting to ${friendlyAction}...`,
    });

    try {
      if (!auth.currentUser) {
        toast({ title: "Authentication Error", description: "User not authenticated. Please re-login.", variant: "destructive" });
        setLoadingState(false);
        return;
      }
      const idToken = await auth.currentUser.getIdToken();
      
      const response = await fetch('/api/google-sheets-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: action, 
          dataType: 'stock',
          sheetId: sheetId, 
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        console.error(`Error parsing JSON response from /api/google-sheets-proxy. Status: ${response.status}`, await response.text());
        toast({
          title: "API Error",
          description: `Failed to process request. Server responded with status ${response.status}. Check console for details.`,
          variant: "destructive",
        });
        setLoadingState(false);
        return;
      }

      if (!response.ok) {
        console.error(`API Error (${response.status}) for ${friendlyAction}:`, result);
        if (result.needsAuth && result.authUrl) {
          toast({ 
            title: "Authorization Required", 
            description: "Please authorize StallSync to access your Google Sheets. Redirecting...",
            duration: 5000 
          });
          window.location.href = result.authUrl;
        } else {
          let errorMessage = result.error || `Failed to ${friendlyAction}. Status: ${response.status}.`;
          if (response.status === 401 && result.error?.toLowerCase().includes("invalid firebase id token")) {
            errorMessage = "Authentication with the backend failed (Invalid ID token). Please ensure your Firebase setup is correct or try re-logging in.";
          } else if (response.status === 403 && result.error?.toLowerCase().includes("google sheets authorization required")) {
            errorMessage = "Google Sheets authorization is required. Please try the action again to initiate authorization.";
          }
          toast({
            title: "Operation Failed",
            description: errorMessage,
            variant: "destructive",
          });
        }
      } else {
         toast({ title: "Success", description: result.message || `${friendlyAction} completed.` });
         if (result.errors && result.errors.length > 0) {
           toast({
             title: "Import Issues",
             description: `${result.errors.length} rows had issues. Check console for details.`,
             variant: "default",
             duration: 7000
           });
           console.warn("Import errors for stock items:", result.errors);
         }
      }

    } catch (error: any) {
      console.error(`Error during Google Sheets ${friendlyAction} for stock items:`, error);
      toast({ 
        title: "Client-side Error", 
        description: error.message || `Failed to ${friendlyAction}. Check console for details.`, 
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
                  onClick={() => openSheetIdPrompt("importStockItems")}
                  disabled={isProcessingSheetsImport || isProcessingSheetsExport || loadingItems}
              >
                  {isProcessingSheetsImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-green-700" />}
                  Import Stock from Sheets
              </Button>
              <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => openSheetIdPrompt("exportStockItems")}
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

      <AlertDialog open={showSheetIdDialog} onOpenChange={setShowSheetIdDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentSheetAction?.toLowerCase().includes('import') ? 'Enter Google Sheet ID for Import' : 'Enter Google Sheet ID for Export (Optional)'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentSheetAction?.toLowerCase().includes('import') 
                ? 'Please provide the ID of the Google Sheet you want to import stock items from.' 
                : 'If you provide a Sheet ID, data will be exported to that sheet. Otherwise, a new sheet will be created.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="sheetIdInput" className="sr-only">
              Google Sheet ID
            </Label>
            <Input
              id="sheetIdInput"
              value={sheetIdInputValue}
              onChange={(e) => setSheetIdInputValue(e.target.value)}
              placeholder="Google Sheet ID (e.g., 123abCDefgHIJkLmNopQRstUVWxYZ1234567890)"
              className="bg-input"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowSheetIdDialog(false);
              setSheetIdInputValue("");
              setCurrentSheetAction(null);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSheetIdDialogSubmit}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
    

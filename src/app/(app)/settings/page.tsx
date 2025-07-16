
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Upload, Download, Loader2, ShieldAlert, AlertTriangle, Utensils, MailQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { getFirestore, collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { StockItem, SaleTransaction, FoodItemExpense, Site, Stall } from "@/types";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth as useAppAuth } from "@/contexts/AuthContext";
import ManageVendorsDialog from "@/components/foodstall/ManageVendorsDialog";
import CsvImportDialog from "@/components/shared/CsvImportDialog"; // Import the new dialog

const LOG_PREFIX = "[SettingsPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

export default function SettingsPage() {
  const { user: appUser } = useAppAuth();
  const { toast } = useToast();
  const [isExportingStockCsv, setIsExportingStockCsv] = useState(false);
  const [isExportingSalesCsv, setIsExportingSalesCsv] = useState(false);
  const [isExportingFoodExpensesCsv, setIsExportingFoodExpensesCsv] = useState(false);

  const [showResetDataDialog, setShowResetDataDialog] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState("");
  const [isResettingData, setIsResettingData] = useState(false);
  const RESET_CONFIRMATION_PHRASE = "RESET DATA";

  const [showManageVendorsDialog, setShowManageVendorsDialog] = useState(false);
  const [showCsvImportDialog, setShowCsvImportDialog] = useState(false);
  const [csvImportType, setCsvImportType] = useState<'stock' | 'foodExpenses' | null>(null);
  
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    const fetchContextData = async () => {
      setLoadingContext(true);
      try {
        const sitesSnapshot = await getDocs(query(collection(db, "sites")));
        const newSitesMap: Record<string, string> = {};
        sitesSnapshot.forEach(doc => {
          const site = doc.data() as Site;
          newSitesMap[doc.id] = site.name;
        });
        setSitesMap(newSitesMap);

        const stallsSnapshot = await getDocs(query(collection(db, "stalls")));
        const newStallsMap: Record<string, string> = {};
        stallsSnapshot.forEach(doc => {
            const stall = doc.data() as Stall;
            newStallsMap[doc.id] = stall.name;
        });
        setStallsMap(newStallsMap);

      } catch (error) {
        console.error(`${LOG_PREFIX} Error fetching context data:`, error);
        toast({ title: "Error", description: "Could not load site/stall data for exports.", variant: "destructive" });
      } finally {
        setLoadingContext(false);
      }
    };
    fetchContextData();
  }, [toast]);

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
  
  const getFormattedTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
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
      URL.revokeObjectURL(url);
    }
  };

  const exportStockItemsToCsv = async () => {
    setIsExportingStockCsv(true);
    console.log(`${LOG_PREFIX} Starting stock items CSV export.`);
    try {
      const stockItemsCollectionRef = collection(db, "stockItems");
      const q = query(stockItemsCollectionRef, orderBy("name"));
      const querySnapshot = await getDocs(q);

      const items: StockItem[] = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
      if (items.length === 0) {
        toast({ title: "No Stock Data", description: "There are no stock items to export.", variant: "default" });
        return;
      }

      const headers = ["ID", "Name", "Category", "Description", "Quantity", "Unit", "Cost Price (₹)", "Selling Price (₹)", "Low Stock Threshold", "Image URL", "Site Name", "Stall Name", "Original Master Item ID"];
      const csvRows = [headers.join(",")];

      items.forEach(item => {
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

      downloadCsv(csvRows.join("\n"), `stallsync_stock_items_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: "Stock items CSV downloaded." });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error exporting stock items:`, error);
      toast({ title: "Export Failed", description: `Could not export stock items: ${error.message}`, variant: "destructive" });
    } finally {
      setIsExportingStockCsv(false);
    }
  };

  const exportSalesDataToCsv = async () => {
    setIsExportingSalesCsv(true);
    try {
      const salesCollectionRef = collection(db, "salesTransactions");
      const q = query(salesCollectionRef, where("isDeleted", "==", false), orderBy("transactionDate", "desc"));
      const querySnapshot = await getDocs(q);

      const transactions: SaleTransaction[] = querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data(), transactionDate: (doc.data().transactionDate as Timestamp).toDate().toISOString() } as SaleTransaction));
      if (transactions.length === 0) {
        toast({ title: "No Sales Data", description: "There are no sales transactions to export.", variant: "default" });
        return;
      }

      const headers = ["Transaction ID", "Date", "Staff Name", "Staff ID", "Total Amount (₹)", "Number of Item Types", "Total Quantity of Items", "Site Name", "Stall Name", "Items Sold (JSON)"];
      const csvRows = [headers.join(",")];

      transactions.forEach(sale => {
        const itemsJson = JSON.stringify(sale.items.map(item => ({ id: item.itemId, name: item.name, quantity: item.quantity, pricePerUnit: item.pricePerUnit, totalPrice: item.totalPrice })));
        const row = [
          escapeCsvCell(sale.id), escapeCsvCell(new Date(sale.transactionDate).toLocaleString('en-IN')), escapeCsvCell(sale.staffName || 'N/A'),
          escapeCsvCell(sale.staffId), escapeCsvCell(sale.totalAmount.toFixed(2)), escapeCsvCell(sale.items.length),
          escapeCsvCell(sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)),
          escapeCsvCell(sale.siteId ? sitesMap[sale.siteId] || sale.siteId : "N/A"),
          escapeCsvCell(sale.stallId ? stallsMap[sale.stallId] || sale.stallId : "N/A"),
          escapeCsvCell(itemsJson)
        ];
        csvRows.push(row.join(","));
      });
      
      downloadCsv(csvRows.join("\n"), `stallsync_sales_data_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: "Sales data CSV downloaded." });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error exporting sales data:`, error);
      toast({ title: "Export Failed", description: `Could not export sales data: ${error.message}`, variant: "destructive" });
    } finally {
      setIsExportingSalesCsv(false);
    }
  };
  
  const exportFoodExpensesToCsv = async () => {
    setIsExportingFoodExpensesCsv(true);
    try {
      const expensesCollectionRef = collection(db, "foodItemExpenses");
      const q = query(expensesCollectionRef, orderBy("purchaseDate", "desc"));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({ title: "No Food Expenses Data", description: "There are no food expenses to export.", variant: "default" });
        return;
      }
      
      const headers = ["Expense ID", "Category", "Total Cost", "Payment Method", "Other Payment Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site Name", "Stall Name", "Recorded By (Name)", "Recorded By (UID)"];
      const csvRows = [headers.join(",")];
      
      querySnapshot.forEach(doc => {
        const expense = doc.data();
        const row = [
          escapeCsvCell(doc.id), escapeCsvCell(expense.category), escapeCsvCell(expense.totalCost.toFixed(2)), escapeCsvCell(expense.paymentMethod),
          escapeCsvCell(expense.otherPaymentMethodDetails || ""), escapeCsvCell(new Date((expense.purchaseDate as Timestamp).toDate()).toLocaleDateString('en-CA')),
          escapeCsvCell(expense.vendor || ""), escapeCsvCell(expense.otherVendorDetails || ""), escapeCsvCell(expense.notes || ""), escapeCsvCell(expense.billImageUrl || ""),
          escapeCsvCell(expense.siteId ? sitesMap[expense.siteId] || expense.siteId : "N/A"),
          escapeCsvCell(expense.stallId ? stallsMap[expense.stallId] || expense.stallId : "N/A"),
          escapeCsvCell(expense.recordedByName || ""), escapeCsvCell(expense.recordedByUid),
        ];
        csvRows.push(row.join(','));
      });
      
      downloadCsv(csvRows.join("\n"), `stallsync_food_expenses_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: "Food expenses CSV downloaded." });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error exporting food expenses:`, error);
      toast({ title: "Export Failed", description: `Could not export food expenses: ${error.message}`, variant: "destructive" });
    } finally {
      setIsExportingFoodExpensesCsv(false);
    }
  };

  const handleResetDataConfirm = async () => {
    if (resetConfirmationInput !== RESET_CONFIRMATION_PHRASE) {
      toast({ title: "Confirmation Mismatch", description: `Please type "${RESET_CONFIRMATION_PHRASE}" to confirm.`, variant: "destructive" });
      return;
    }
    setIsResettingData(true);
    toast({ title: "Resetting Data...", description: "Please wait, this may take a few moments.", duration: 10000 });

    try {
      const auth = useAppAuth().getAuth();
      if (!auth.currentUser) throw new Error("User not authenticated.");
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ confirmation: RESET_CONFIRMATION_PHRASE }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Server responded with status ${response.status}`);
      toast({ title: "Data Reset Successful", description: result.message || "Application data has been reset.", duration: 7000 });
      setShowResetDataDialog(false);
      setResetConfirmationInput("");
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error calling data reset API:`, error);
      toast({ title: "Data Reset Error", description: `Failed to reset data: ${error.message}`, variant: "destructive", duration: 10000 });
    } finally {
      setIsResettingData(false);
    }
  };

  const handleOpenImportDialog = (type: 'stock' | 'foodExpenses') => {
    setCsvImportType(type);
    setShowCsvImportDialog(true);
  };


  return (
    <div className="space-y-6">
      <PageHeader title="Application Settings" description="Manage your application preferences and configurations. (Visible to Managers & Admins)"/>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center"><Palette className="mr-2 h-5 w-5 text-primary" />Appearance</CardTitle><CardDescription>Customize the look and feel of the application.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="flex items-center justify-between p-4 bg-muted/30 rounded-md"><Label htmlFor="dark-mode-switch" className="text-sm font-medium">Dark Mode</Label><Switch id="dark-mode-switch" disabled /></div><p className="text-xs text-center text-muted-foreground">(Theme switching coming soon)</p></CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center"><BellRing className="mr-2 h-5 w-5 text-primary" />Notifications</CardTitle><CardDescription>Manage how you receive alerts and notifications.</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="flex items-center justify-between p-4 bg-muted/30 rounded-md"><div className="flex items-center space-x-2"><MailQuestion className="h-4 w-4 text-muted-foreground" /><Label htmlFor="low-stock-alerts" className="text-sm font-medium">Low Stock Email Alerts</Label></div><Switch id="low-stock-alerts" disabled /></div><p className="text-xs text-center text-muted-foreground">(Email alert functionality requires backend setup)</p><div className="flex items-center justify-between p-4 bg-muted/30 rounded-md"><Label htmlFor="new-sale-notif" className="text-sm font-medium">In-App New Sale Notifications</Label><Switch id="new-sale-notif" checked disabled /></div><p className="text-xs text-center text-muted-foreground">(Other notification preferences coming soon)</p></CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="flex items-center"><Utensils className="mr-2 h-5 w-5 text-primary" />Food Stall Settings</CardTitle><CardDescription>Manage settings specific to the Food Stall module.</CardDescription></CardHeader>
          <CardContent><Button variant="outline" className="w-full" onClick={() => setShowManageVendorsDialog(true)}>Manage Food Vendors</Button></CardContent>
        </Card>
      </div>

       <Card className="shadow-lg">
        <CardHeader><CardTitle className="flex items-center"><DatabaseZap className="mr-2 h-5 w-5 text-primary" />Data Management (CSV)</CardTitle><CardDescription>Import or export your application data for use in WPS Office, Excel, or other spreadsheet software.</CardDescription></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Button variant="secondary" onClick={() => handleOpenImportDialog('stock')} disabled={loadingContext}><Upload className="mr-2 h-4 w-4" />Import Stock</Button>
          <Button variant="outline" onClick={exportStockItemsToCsv} disabled={isExportingStockCsv || loadingContext}>{isExportingStockCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export Stock</Button>
          <Button variant="secondary" onClick={() => handleOpenImportDialog('foodExpenses')} disabled={loadingContext}><Upload className="mr-2 h-4 w-4" />Import Food Expenses</Button>
          <Button variant="outline" onClick={exportFoodExpensesToCsv} disabled={isExportingFoodExpensesCsv || loadingContext}>{isExportingFoodExpensesCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export Food Expenses</Button>
          <Button variant="outline" onClick={exportSalesDataToCsv} disabled={isExportingSalesCsv || loadingContext}>{isExportingSalesCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Export Sales</Button>
          <div className="flex items-center justify-center p-2"><p className="text-xs text-muted-foreground">(Sales Import Not Supported)</p></div>
        </CardContent>
      </Card>
      
      {appUser?.role === 'admin' && (
        <Card className="shadow-lg border-destructive">
          <AlertDialog open={showResetDataDialog} onOpenChange={setShowResetDataDialog}>
            <CardHeader className="pt-6"><CardTitle className="flex items-center text-destructive"><AlertTriangle className="mr-2 h-5 w-5" />Danger Zone</CardTitle><CardDescription>These actions are irreversible and can lead to data loss. Proceed with extreme caution.</CardDescription></CardHeader>
            <CardContent><AlertDialogTrigger asChild><Button variant="destructive" className="w-full"><ShieldAlert className="mr-2 h-4 w-4" />Reset Application Data (Excluding Users)</Button></AlertDialogTrigger></CardContent>
            <CardFooter><p className="text-xs text-muted-foreground">This operation will permanently remove all specified data. It's recommended to back up your data (e.g., using CSV export) before proceeding if you might need it later.</p></CardFooter>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Data Reset</AlertDialogTitle>
                <AlertDialogDescription>This action will permanently delete the specified application data. This is irreversible.</AlertDialogDescription>
                <div className="text-sm text-muted-foreground space-y-2 pt-2"><div>You are about to delete all application data including:</div><ul className="list-disc list-inside text-sm text-destructive pl-4"><li>All Stock Items (Master & Stall)</li><li>All Sales Transactions</li><li>All Food Stall Expenses & Sales</li><li>All Stock Movement & Food Stall Logs</li><li>All Sites and Stalls</li><li>All Food Vendors</li></ul><div className="font-bold">The 'users' collection (user accounts, roles, and preferences) WILL NOT be deleted.</div><div>To proceed, please type "<strong className="text-foreground">{RESET_CONFIRMATION_PHRASE}</strong>" into the box below.</div></div>
              </AlertDialogHeader>
              <div className="py-2"><Label htmlFor="resetConfirmationInput" className="sr-only">Confirmation Phrase</Label><Input id="resetConfirmationInput" value={resetConfirmationInput} onChange={(e) => setResetConfirmationInput(e.target.value)} placeholder={`Type "${RESET_CONFIRMATION_PHRASE}" here`} className="border-destructive focus:ring-destructive bg-input" disabled={isResettingData}/></div>
              <AlertDialogFooter><AlertDialogCancel onClick={() => {setShowResetDataDialog(false); setResetConfirmationInput("");}} disabled={isResettingData}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleResetDataConfirm} disabled={isResettingData || resetConfirmationInput !== RESET_CONFIRMATION_PHRASE} className="bg-destructive hover:bg-destructive/90">{isResettingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}Reset Data Now</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      )}

      <ManageVendorsDialog isOpen={showManageVendorsDialog} onClose={() => setShowManageVendorsDialog(false)}/>
      
      {csvImportType && (
        <CsvImportDialog
          dataType={csvImportType}
          isOpen={showCsvImportDialog}
          onClose={() => {
            setShowCsvImportDialog(false);
            setCsvImportType(null);
          }}
        />
      )}

    </div>
  );
}

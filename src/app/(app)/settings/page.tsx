
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Download, Loader2, MailWarning, SheetIcon, ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { getFirestore, collection, getDocs, query, orderBy, where, Timestamp } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { StockItem, SaleTransaction } from "@/types";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useAuth as useAppAuth } from "@/contexts/AuthContext"; // Renamed useAuth to useAppAuth

const LOG_PREFIX = "[SettingsPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();
const firebaseAuth = getAuth(getApp()); // Used firebaseAuth instead of auth to avoid conflict with useAppAuth

type GoogleSheetAction = "importStockItems" | "exportStockItems" | "importSalesHistory" | "exportSalesHistory";
type DataTypeForSheets = 'stock' | 'sales';

export default function SettingsPage() {
  const { user: appUser } = useAppAuth(); // Use the hook from AuthContext
  const { toast } = useToast();
  const [isExportingStockCsv, setIsExportingStockCsv] = useState(false);
  const [isExportingSalesCsv, setIsExportingSalesCsv] = useState(false);

  const [isProcessingStockSheetsImport, setIsProcessingStockSheetsImport] = useState(false);
  const [isProcessingStockSheetsExport, setIsProcessingStockSheetsExport] = useState(false);
  const [isProcessingSalesSheetsImport, setIsProcessingSalesSheetsImport] = useState(false);
  const [isProcessingSalesSheetsExport, setIsProcessingSalesSheetsExport] = useState(false);

  const [showSheetIdDialog, setShowSheetIdDialog] = useState(false);
  const [sheetIdInputValue, setSheetIdInputValue] = useState("");
  const [currentSheetAction, setCurrentSheetAction] = useState<GoogleSheetAction | null>(null);
  const [currentDataType, setCurrentDataType] = useState<DataTypeForSheets | null>(null);

  const [showResetDataDialog, setShowResetDataDialog] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState("");
  const [isResettingData, setIsResettingData] = useState(false);
  const RESET_CONFIRMATION_PHRASE = "RESET DATA";


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

  const exportStockItemsToCsv = async () => {
    setIsExportingStockCsv(true);
    console.log(`${LOG_PREFIX} Starting stock items CSV export.`);
    try {
      const stockItemsCollectionRef = collection(db, "stockItems");
      const q = query(stockItemsCollectionRef, orderBy("name"));
      const querySnapshot = await getDocs(q);

      const items: StockItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as StockItem);
      });
      console.log(`${LOG_PREFIX} Fetched ${items.length} stock items for CSV export.`);

      if (items.length === 0) {
        toast({ title: "No Stock Data", description: "There are no stock items to export.", variant: "default" });
        setIsExportingStockCsv(false);
        return;
      }

      const headers = [
        "ID", "Name", "Category", "Quantity", "Unit",
        "Cost Price (₹)", "Selling Price (₹)", "Low Stock Threshold", "Image URL", "Last Updated", "Site ID", "Stall ID", "Original Master Item ID"
      ];

      const csvRows = [headers.join(",")];

      items.forEach(item => {
        const row = [
          escapeCsvCell(item.id),
          escapeCsvCell(item.name),
          escapeCsvCell(item.category),
          escapeCsvCell(item.quantity),
          escapeCsvCell(item.unit),
          escapeCsvCell((item.costPrice ?? 0).toFixed(2)),
          escapeCsvCell(item.price.toFixed(2)),
          escapeCsvCell(item.lowStockThreshold),
          escapeCsvCell(item.imageUrl || ""),
          escapeCsvCell(item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('en-IN') : ""),
          escapeCsvCell(item.siteId || ""),
          escapeCsvCell(item.stallId || ""),
          escapeCsvCell(item.originalMasterItemId || "")
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
       console.log(`${LOG_PREFIX} Stock items CSV export successful.`);

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error exporting stock items:`, error.message, error.stack);
      toast({ title: "Export Failed", description: `Could not export stock items: ${error.message}`, variant: "destructive" });
    } finally {
      setIsExportingStockCsv(false);
    }
  };

  const exportSalesDataToCsv = async () => {
    setIsExportingSalesCsv(true);
    console.log(`${LOG_PREFIX} Starting sales data CSV export.`);
    try {
      const salesCollectionRef = collection(db, "salesTransactions");
      const q = query(
        salesCollectionRef,
        where("isDeleted", "==", false),
        orderBy("transactionDate", "desc")
      );
      const querySnapshot = await getDocs(q);

      const transactions: SaleTransaction[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        transactions.push({
          id: doc.id,
          ...data,
          transactionDate: (data.transactionDate as Timestamp).toDate().toISOString(),
        } as SaleTransaction);
      });
      console.log(`${LOG_PREFIX} Fetched ${transactions.length} sales transactions for CSV export.`);

      if (transactions.length === 0) {
        toast({ title: "No Sales Data", description: "There are no sales transactions to export.", variant: "default" });
        setIsExportingSalesCsv(false);
        return;
      }

      const headers = [
        "Transaction ID", "Date", "Staff Name", "Staff ID", "Total Amount (₹)",
        "Number of Item Types", "Total Quantity of Items", "Site ID", "Stall ID", "Items Sold (JSON)"
      ];
      const csvRows = [headers.join(",")];

      transactions.forEach(sale => {
        const numberOfItemTypes = sale.items.length;
        const totalQuantityOfItems = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const itemsJson = JSON.stringify(sale.items.map(item => ({
          id: item.itemId,
          name: item.name,
          quantity: item.quantity,
          pricePerUnit: item.pricePerUnit,
          totalPrice: item.totalPrice
        })));

        const row = [
          escapeCsvCell(sale.id),
          escapeCsvCell(new Date(sale.transactionDate).toLocaleString('en-IN')),
          escapeCsvCell(sale.staffName || 'N/A'),
          escapeCsvCell(sale.staffId),
          escapeCsvCell(sale.totalAmount.toFixed(2)),
          escapeCsvCell(numberOfItemTypes),
          escapeCsvCell(totalQuantityOfItems),
          escapeCsvCell(sale.siteId || ""),
          escapeCsvCell(sale.stallId || ""),
          escapeCsvCell(itemsJson)
        ];
        csvRows.push(row.join(","));
      });

      const csvString = csvRows.join("\n");
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `stallsync_sales_data_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      toast({ title: "Export Successful", description: "Sales data CSV downloaded." });
      console.log(`${LOG_PREFIX} Sales data CSV export successful.`);

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error exporting sales data:`, error.message, error.stack);
      toast({ title: "Export Failed", description: `Could not export sales data: ${error.message}`, variant: "destructive" });
    } finally {
      setIsExportingSalesCsv(false);
    }
  };

  const getLoadingStateSetter = (action: GoogleSheetAction): React.Dispatch<React.SetStateAction<boolean>> => {
    switch (action) {
      case "importStockItems": return setIsProcessingStockSheetsImport;
      case "exportStockItems": return setIsProcessingStockSheetsExport;
      case "importSalesHistory": return setIsProcessingSalesSheetsImport;
      case "exportSalesHistory": return setIsProcessingSalesSheetsExport;
      default: 
        console.warn(`${LOG_PREFIX} Unknown GoogleSheetAction: ${action}`);
        return () => {}; 
    }
  };

  const handleSheetIdDialogSubmit = () => {
    console.log(`${LOG_PREFIX} handleSheetIdDialogSubmit. Action: ${currentSheetAction}, DataType: ${currentDataType}, SheetID: ${sheetIdInputValue}`);
    if (currentSheetAction && currentDataType) {
      if (currentSheetAction.toLowerCase().includes('import') && !sheetIdInputValue.trim()) {
        toast({ title: "Sheet ID Required", description: "Please provide a Google Sheet ID to import from.", variant: "default" });
        return;
      }
      callGoogleSheetsApi(currentSheetAction, currentDataType, sheetIdInputValue.trim() || undefined);
    }
    setShowSheetIdDialog(false);
    setSheetIdInputValue("");
    setCurrentSheetAction(null);
    setCurrentDataType(null);
  };

  const openSheetIdPrompt = (action: GoogleSheetAction, dataType: DataTypeForSheets) => {
    console.log(`${LOG_PREFIX} openSheetIdPrompt. Action: ${action}, DataType: ${dataType}`);
    setCurrentSheetAction(action);
    setCurrentDataType(dataType);
    setShowSheetIdDialog(true);
  };


  const callGoogleSheetsApi = async (
    action: GoogleSheetAction,
    dataType: DataTypeForSheets,
    sheetId?: string
  ) => {
    const setLoadingState = getLoadingStateSetter(action);
    setLoadingState(true);
    const friendlyAction = action.replace(/([A-Z])/g, ' $1').toLowerCase();
    console.log(`${LOG_PREFIX} Starting Google Sheets API call. Action: ${friendlyAction}, DataType: ${dataType}, SheetID: ${sheetId}`);
    toast({
      title: "Processing Google Sheets Request...",
      description: `Attempting to ${friendlyAction} for ${dataType} data...`,
    });

    try {
      if (!firebaseAuth.currentUser) {
        toast({ title: "Authentication Error", description: "User not authenticated. Please re-login.", variant: "destructive" });
        setLoadingState(false);
        return;
      }
      const idToken = await firebaseAuth.currentUser.getIdToken();

      const response = await fetch('/api/google-sheets-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action: action,
          dataType: dataType,
          sheetId: sheetId,
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e: any) {
        const responseText = await response.text();
        console.error(`${LOG_PREFIX} Error parsing JSON response from /api/google-sheets-proxy. Status: ${response.status}. Response Text:`, responseText, e.stack);
        toast({
          title: "API Error",
          description: `Failed to process request. Server responded with status ${response.status} and non-JSON content. Check console for details.`,
          variant: "destructive",
        });
        setLoadingState(false);
        return;
      }
      console.log(`${LOG_PREFIX} Google Sheets API call response. Status: ${response.status}, Result:`, result);

      if (!response.ok) {
        console.error(`${LOG_PREFIX} API Error (${response.status}) for ${friendlyAction}:`, result);
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
           console.warn(`${LOG_PREFIX} Import errors for ${dataType}:`, result.errors);
         }
      }

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error during Google Sheets ${friendlyAction}:`, error.message, error.stack);
      toast({
        title: "Client-side Error",
        description: `Failed to ${friendlyAction}. Error: ${error.message}. Check console for details.`,
        variant: "destructive"
      });
    } finally {
      setLoadingState(false);
    }
  };

  const handleResetDataConfirm = async () => {
    if (resetConfirmationInput !== RESET_CONFIRMATION_PHRASE) {
      toast({ title: "Confirmation Mismatch", description: `Please type "${RESET_CONFIRMATION_PHRASE}" to confirm.`, variant: "destructive" });
      return;
    }
    console.log(`${LOG_PREFIX} Starting data reset process.`);
    setIsResettingData(true);
    toast({ title: "Resetting Data...", description: "Please wait, this may take a few moments.", duration: 10000 });

    try {
      if (!firebaseAuth.currentUser) {
        toast({ title: "Authentication Error", description: "User not authenticated. Please re-login.", variant: "destructive" });
        setIsResettingData(false);
        return;
      }
      const idToken = await firebaseAuth.currentUser.getIdToken();
      const response = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ confirmation: RESET_CONFIRMATION_PHRASE }),
      });

      const result = await response.json();
      if (!response.ok) {
        console.error(`${LOG_PREFIX} Data reset API error (${response.status}):`, result);
        toast({ title: "Data Reset Failed", description: result.error || `Server error: ${response.status}. Check server logs.`, variant: "destructive", duration: 10000 });
      } else {
        console.log(`${LOG_PREFIX} Data reset successful:`, result.message);
        toast({ title: "Data Reset Successful", description: result.message || "Application data (excluding users) has been reset.", duration: 7000 });
        setShowResetDataDialog(false);
        setResetConfirmationInput("");
        // Optionally, trigger a page reload or redirect to refresh context
        // window.location.reload();
      }
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error calling data reset API:`, error.message, error.stack);
      toast({ title: "Client-side Reset Error", description: `Failed to initiate data reset. Error: ${error.message}`, variant: "destructive", duration: 10000 });
    } finally {
      setIsResettingData(false);
    }
  };


  return (
    <div className="space-y-6">
      <PageHeader
        title="Application Settings"
        description="Manage your application preferences and configurations. (Visible to Managers & Admins)"
      />
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Palette className="mr-2 h-5 w-5 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>
              Customize the look and feel of the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-md">
              <Label htmlFor="dark-mode-switch" className="text-sm font-medium">Dark Mode</Label>
              <Switch id="dark-mode-switch" disabled />
            </div>
             <p className="text-xs text-center text-muted-foreground">(Theme switching coming soon)</p>
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <BellRing className="mr-2 h-5 w-5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>
              Manage how you receive alerts and notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-md">
              <div className="flex items-center space-x-2">
                <MailWarning className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="low-stock-alerts" className="text-sm font-medium">Low Stock Email Alerts</Label>
              </div>
              <Switch id="low-stock-alerts" disabled />
            </div>
             <p className="text-xs text-center text-muted-foreground">(Email alert functionality requires backend setup)</p>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-md">
              <Label htmlFor="new-sale-notif" className="text-sm font-medium">In-App New Sale Notifications</Label>
              <Switch id="new-sale-notif" checked disabled />
            </div>
             <p className="text-xs text-center text-muted-foreground">(Other notification preferences coming soon)</p>
          </CardContent>
        </Card>
      </div>

       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <DatabaseZap className="mr-2 h-5 w-5 text-primary" />
            Data Export (CSV)
          </CardTitle>
          <CardDescription>
            Download your application data in CSV format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={exportStockItemsToCsv}
            disabled={isExportingStockCsv}
          >
            {isExportingStockCsv ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Stock Data (CSV)
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={exportSalesDataToCsv}
            disabled={isExportingSalesCsv}
          >
            {isExportingSalesCsv ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Sales Data (CSV)
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="flex items-center">
                <SheetIcon className="mr-2 h-5 w-5 text-green-600" />
                Google Sheets Integration
            </CardTitle>
            <CardDescription>
                Import or export data with Google Sheets. <strong>Note:</strong> This is an advanced feature requiring developer setup of Google Cloud Project credentials, OAuth 2.0 configuration (including Redirect URI setup in Google Cloud Console), and a properly configured backend API route (<code>/api/google-sheets-proxy</code>) to handle Google API calls securely.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                <h4 className="font-medium text-foreground">Stock Items</h4>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openSheetIdPrompt("importStockItems", 'stock')}
                    disabled={isProcessingStockSheetsImport || isProcessingStockSheetsExport}
                >
                    {isProcessingStockSheetsImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-green-700" />}
                    Import Stock from Sheets
                </Button>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openSheetIdPrompt("exportStockItems", 'stock')}
                    disabled={isProcessingStockSheetsImport || isProcessingStockSheetsExport}
                >
                    {isProcessingStockSheetsExport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SheetIcon className="mr-2 h-4 w-4 text-green-700" />}
                    Export Stock to Sheets
                </Button>
            </div>
            <div className="space-y-3 p-4 border rounded-md bg-muted/20">
                <h4 className="font-medium text-foreground">Sales History</h4>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openSheetIdPrompt("importSalesHistory", 'sales')}
                    disabled={isProcessingSalesSheetsImport || isProcessingSalesSheetsExport}
                >
                     {isProcessingSalesSheetsImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-green-700" />}
                    Import Sales from Sheets
                </Button>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => openSheetIdPrompt("exportSalesHistory", 'sales')}
                    disabled={isProcessingSalesSheetsImport || isProcessingSalesSheetsExport}
                >
                    {isProcessingSalesSheetsExport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SheetIcon className="mr-2 h-4 w-4 text-green-700" />}
                    Export Sales to Sheets
                </Button>
            </div>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
              Authorization with Google is required for this feature. If prompted, please allow access.
              Ensure the provided Google Sheet ID is correct and that the sheet format matches the expected structure for imports.
              For exports, if no Sheet ID is provided, a new sheet will be created in your Google Drive.
            </p>
        </CardFooter>
      </Card>

      {appUser?.role === 'admin' && (
        <Card className="shadow-lg border-destructive">
          <AlertDialog open={showResetDataDialog} onOpenChange={setShowResetDataDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Data Reset</AlertDialogTitle>
                <AlertDialogDescription>
                  This action will permanently delete the specified application data. This is irreversible.
                </AlertDialogDescription>
                 {/* Detailed explanation and list moved here */}
                <div className="text-sm text-muted-foreground space-y-2 pt-2">
                  <div>You are about to delete all application data including:</div>
                  <ul className="list-disc list-inside text-sm text-destructive pl-4">
                    <li>All Stock Items (Master & Stall)</li>
                    <li>All Sales Transactions</li>
                    <li>All Stock Movement Logs</li>
                    <li>All Sites and Stalls</li>
                    <li>All Google OAuth Tokens</li>
                  </ul>
                  <div className="font-bold">The 'users' collection (user accounts, roles, and preferences) WILL NOT be deleted.</div>
                  <div>To proceed, please type "<strong className="text-foreground">{RESET_CONFIRMATION_PHRASE}</strong>" into the box below.</div>
                </div>
              </AlertDialogHeader>
              {/* Input field for confirmation */}
              <div className="py-2">
                <Label htmlFor="resetConfirmationInput" className="sr-only">Confirmation Phrase</Label>
                <Input
                  id="resetConfirmationInput"
                  value={resetConfirmationInput}
                  onChange={(e) => setResetConfirmationInput(e.target.value)}
                  placeholder={`Type "${RESET_CONFIRMATION_PHRASE}" here`}
                  className="border-destructive focus:ring-destructive bg-input"
                  disabled={isResettingData}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => {setShowResetDataDialog(false); setResetConfirmationInput("");}} disabled={isResettingData}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetDataConfirm}
                  disabled={isResettingData || resetConfirmationInput !== RESET_CONFIRMATION_PHRASE}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isResettingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
                  Reset Data Now
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
            {/* Card Header and Content for "Danger Zone" */}
            <CardHeader>
              <CardTitle className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription> {/* Changed this from AlertDialogDescription to CardDescription */}
                These actions are irreversible and can lead to data loss. Proceed with extreme caution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  Reset Application Data (Excluding Users)
                </Button>
              </AlertDialogTrigger>
            </CardContent>
          </AlertDialog>
           <CardFooter>
             <p className="text-xs text-muted-foreground">
                This operation will permanently remove all specified data. It's recommended to back up your data (e.g., using CSV export) before proceeding if you might need it later.
            </p>
           </CardFooter>
        </Card>
      )}

      <AlertDialog open={showSheetIdDialog} onOpenChange={setShowSheetIdDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
                {currentSheetAction?.toLowerCase().includes('import') ? 'Enter Google Sheet ID for Import' : 'Enter Google Sheet ID for Export (Optional)'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentSheetAction?.toLowerCase().includes('import')
                ? `Please provide the ID of the Google Sheet you want to import ${currentDataType} data from. The sheet must have the correct headers.`
                : `If you provide a Sheet ID, ${currentDataType} data will be exported to that specific sheet (content will be overwritten). If left blank, a new Google Sheet will be created in your Drive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="settingsSheetIdInput" className="sr-only">
              Google Sheet ID
            </Label>
            <Input
              id="settingsSheetIdInput"
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
              setCurrentSheetAction(null);
              setCurrentDataType(null);
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


    
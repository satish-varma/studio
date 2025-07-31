
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Upload, Download, Loader2, ShieldAlert, AlertTriangle, Utensils, MailQuestion, Users, BookCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import ManageVendorsDialog from "@/components/foodstall/ManageVendorsDialog";
import { auth } from "@/lib/firebaseConfig"; 
import ManageExpensePresetsDialog from "@/components/foodstall/ManageExpensePresetsDialog";
import CsvImportDialog from "@/components/shared/CsvImportDialog";
import { getFirestore, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import type { SaleTransaction, StockItem, FoodItemExpense, Site, Stall, AppUser } from "@/types";
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

const LOG_PREFIX = "[SettingsPage]";
const db = getFirestore();

export default function SettingsPage() {
  const { user: appUser } = useAuth();
  const { toast } = useToast();
  
  const [showAppDataResetDialog, setShowAppDataResetDialog] = useState(false);
  const [appResetConfirmationInput, setAppResetConfirmationInput] = useState("");
  const [isResettingAppData, setIsResettingAppData] = useState(false);
  const APP_RESET_PHRASE = "RESET APP DATA";

  const [showStaffDataResetDialog, setShowStaffDataResetDialog] = useState(false);
  const [staffResetConfirmationInput, setStaffResetConfirmationInput] = useState("");
  const [isResettingStaffData, setIsResettingStaffData] = useState(false);
  const STAFF_RESET_PHRASE = "RESET STAFF DATA";

  const [showManageVendorsDialog, setShowManageVendorsDialog] = useState(false);
  const [showManagePresetsDialog, setShowManagePresetsDialog] = useState(false);
  
  const [isExporting, setIsExporting] = useState<null | 'stock' | 'sales' | 'foodExpenses'>(null);
  const [showImportDialog, setShowImportDialog] = useState<null | 'stock' | 'foodExpenses'>(null);

  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) return "";
    const stringData = String(cellData);
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const getFormattedTimestamp = () => new Date().toISOString().replace(/:/g, '-').slice(0, 19);

  const downloadCsv = (csvString: string, filename: string) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async (dataType: 'stock' | 'sales' | 'foodExpenses') => {
    if (!db) {
      toast({ title: "Export Error", description: "Database is not available.", variant: "destructive"});
      return;
    }
    setIsExporting(dataType);
    toast({ title: "Exporting...", description: `Fetching all ${dataType.replace(/([A-Z])/g, ' $1')} data for export. Please wait.`});
    
    try {
      let csvString: string;
      let filename = `stallsync_${dataType}_${getFormattedTimestamp()}.csv`;
      
      const sitesSnapshot = await getDocs(collection(db, "sites"));
      const sitesMap = new Map(sitesSnapshot.docs.map(doc => [doc.id, (doc.data() as Site).name]));
      const stallsSnapshot = await getDocs(collection(db, "stalls"));
      const stallsMap = new Map(stallsSnapshot.docs.map(doc => [doc.id, (doc.data() as Stall).name]));

      if (dataType === 'stock') {
        const stockSnapshot = await getDocs(query(collection(db, "stockItems"), orderBy("siteId"), orderBy("name")));
        const itemsToExport = stockSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
        const headers = ["ID", "Name", "Category", "Description", "Quantity", "Unit", "Cost Price (₹)", "Selling Price (₹)", "Low Stock Threshold", "Image URL", "Site Name", "Stall Name", "Original Master Item ID"];
        const rows = [headers.join(',')];
        itemsToExport.forEach(item => {
            rows.push([
            escapeCsvCell(item.id), escapeCsvCell(item.name), escapeCsvCell(item.category),
            escapeCsvCell(item.description), escapeCsvCell(item.quantity), escapeCsvCell(item.unit),
            escapeCsvCell((item.costPrice ?? 0).toFixed(2)), escapeCsvCell(item.price.toFixed(2)),
            escapeCsvCell(item.lowStockThreshold), escapeCsvCell(item.imageUrl || ""),
            escapeCsvCell(item.siteId ? sitesMap.get(item.siteId) || item.siteId : "N/A"),
            escapeCsvCell(item.stallId ? stallsMap.get(item.stallId) || item.stallId : "N/A"),
            escapeCsvCell(item.originalMasterItemId || "")
            ].join(','));
        });
        csvString = rows.join('\n');
      } else if (dataType === 'sales') {
        const salesSnapshot = await getDocs(query(collection(db, "salesTransactions"), orderBy("transactionDate", "desc")));
        const itemsToExport = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SaleTransaction));
        const headers = ["Transaction ID", "Date", "Staff Name", "Staff ID", "Total Amount (₹)", "Number of Item Types", "Total Quantity of Items", "Site Name", "Stall Name", "Is Deleted", "Items Sold (JSON)"];
        const rows = [headers.join(',')];
        itemsToExport.forEach(sale => {
            rows.push([
            escapeCsvCell(sale.id), escapeCsvCell(new Date(sale.transactionDate).toLocaleString('en-IN')), escapeCsvCell(sale.staffName || 'N/A'),
            escapeCsvCell(sale.staffId), escapeCsvCell(sale.totalAmount.toFixed(2)), escapeCsvCell(sale.items.length),
            escapeCsvCell(sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)),
            escapeCsvCell(sale.siteId ? sitesMap.get(sale.siteId) || sale.siteId : "N/A"),
            escapeCsvCell(sale.stallId ? stallsMap.get(sale.stallId) || sale.stallId : "N/A"),
            escapeCsvCell(sale.isDeleted ? "Yes" : "No"),
            escapeCsvCell(JSON.stringify(sale.items))
            ].join(','));
        });
        csvString = rows.join('\n');
      } else { // foodExpenses
         const usersSnapshot = await getDocs(collection(db, "users"));
         const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.id, (doc.data() as AppUser).displayName || (doc.data() as AppUser).email]));
         const expensesSnapshot = await getDocs(query(collection(db, "foodItemExpenses"), orderBy("purchaseDate", "desc")));
         const itemsToExport = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodItemExpense));
         const headers = ["Expense ID", "Category", "Total Cost", "Payment Method", "Other Payment Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site Name", "Stall Name", "Recorded By (Name)"];
         const rows = [headers.join(',')];
         itemsToExport.forEach(expense => {
            rows.push([
              escapeCsvCell(expense.id), escapeCsvCell(expense.category), escapeCsvCell(expense.totalCost.toFixed(2)),
              escapeCsvCell(expense.paymentMethod), escapeCsvCell(expense.otherPaymentMethodDetails || ""),
              escapeCsvCell(format((expense.purchaseDate as Timestamp).toDate(), "yyyy-MM-dd")),
              escapeCsvCell(expense.vendor || ""), escapeCsvCell(expense.otherVendorDetails || ""),
              escapeCsvCell(expense.notes || ""), escapeCsvCell(expense.billImageUrl || ""),
              escapeCsvCell(expense.siteId ? sitesMap.get(expense.siteId) || expense.siteId : "N/A"),
              escapeCsvCell(expense.stallId ? stallsMap.get(expense.stallId) || expense.stallId : "N/A"),
              escapeCsvCell(expense.recordedByName || usersMap.get(expense.recordedByUid) || expense.recordedByUid),
            ].join(','));
        });
        csvString = rows.join('\n');
      }

      downloadCsv(csvString, filename);
      toast({ title: "Export Successful", description: `Successfully exported ${dataType} data.` });
    } catch (error: any) {
      toast({ title: "Export Failed", description: `Could not export data. ${error.message}`, variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  };


  const handleDataReset = async (apiEndpoint: string, confirmationPhrase: string, confirmationInput: string, setIsResetting: React.Dispatch<React.SetStateAction<boolean>>) => {
    if (confirmationInput !== confirmationPhrase) {
      toast({ title: "Confirmation Mismatch", description: `Please type "${confirmationPhrase}" to confirm.`, variant: "destructive" });
      return;
    }
    setIsResetting(true);
    toast({ title: "Resetting Data...", description: "Please wait, this may take a few moments.", duration: 10000 });

    try {
      if (!auth || !auth.currentUser) throw new Error("User not authenticated.");
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ confirmation: confirmationPhrase }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Server responded with status ${response.status}`);
      
      toast({ title: "Data Reset Successful", description: result.message || "Data has been reset.", duration: 7000 });
      return true;
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error calling data reset API (${apiEndpoint}):`, error);
      toast({ title: "Data Reset Error", description: `Failed to reset data: ${error.message}`, variant: "destructive", duration: 10000 });
      return false;
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Application Settings" description="Manage your application preferences and configurations. (Visible to Managers & Admins)"/>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* --- Data Management Card --- */}
        <Card className="shadow-lg lg:col-span-2">
            <CardHeader><CardTitle className="flex items-center"><DatabaseZap className="mr-2 h-5 w-5 text-primary" />Data Management</CardTitle><CardDescription>Import or export application data using CSV files.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
                <div className="p-3 border rounded-md">
                    <h4 className="font-semibold text-sm mb-2">Stock Items</h4>
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setShowImportDialog('stock')}><Upload className="mr-2 h-4 w-4" />Import Stock</Button>
                        <Button variant="outline" className="flex-1" onClick={() => handleExport('stock')} disabled={isExporting === 'stock'}>{isExporting === 'stock' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export Stock</Button>
                    </div>
                </div>
                 <div className="p-3 border rounded-md">
                    <h4 className="font-semibold text-sm mb-2">Food Stall Expenses</h4>
                    <div className="flex gap-2">
                         <Button variant="outline" className="flex-1" onClick={() => setShowImportDialog('foodExpenses')}><Upload className="mr-2 h-4 w-4" />Import Expenses</Button>
                         <Button variant="outline" className="flex-1" onClick={() => handleExport('foodExpenses')} disabled={isExporting === 'foodExpenses'}>{isExporting === 'foodExpenses' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export Expenses</Button>
                    </div>
                </div>
                 <div className="p-3 border rounded-md">
                    <h4 className="font-semibold text-sm mb-2">Sales Transactions</h4>
                     <Button variant="outline" className="w-full" onClick={() => handleExport('sales')} disabled={isExporting === 'sales'}>{isExporting === 'sales' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export All Sales</Button>
                </div>
            </CardContent>
             <CardFooter>
                <p className="text-xs text-muted-foreground">Note: For updates via import, ensure the 'ID' column from an export is present.</p>
            </CardFooter>
        </Card>

        {/* --- Settings Column --- */}
        <div className="space-y-6 lg:col-span-1">
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
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button variant="outline" className="w-full" onClick={() => setShowManageVendorsDialog(true)}>Manage Food Vendors</Button>
                    <Button variant="outline" className="w-full" onClick={() => setShowManagePresetsDialog(true)}><BookCopy className="mr-2 h-4 w-4" />Manage Expense Presets</Button>
                </CardContent>
            </Card>
        </div>
      </div>
      
      {appUser?.role === 'admin' && (
        <Card className="shadow-lg border-destructive">
          <CardHeader className="pt-6">
            <CardTitle className="flex items-center text-destructive"><AlertTriangle className="mr-2 h-5 w-5" />Danger Zone</CardTitle>
            <CardDescription>These actions are irreversible and can lead to data loss. Proceed with extreme caution.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Reset App Data Dialog */}
            <AlertDialog open={showAppDataResetDialog} onOpenChange={setShowAppDataResetDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full"><ShieldAlert className="mr-2 h-4 w-4" />Reset App Data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Application Data Reset</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete all transactional data but leave user accounts and staff management data intact.</AlertDialogDescription>
                  <div className="text-sm text-muted-foreground space-y-2 pt-2">
                    <div>You are about to delete:</div>
                    <ul className="list-disc list-inside text-sm text-destructive pl-4">
                      <li>All Sites and Stalls</li>
                      <li>All Stock Items and Logs</li>
                      <li>All Sales Transactions</li>
                      <li>All Food Stall Data (Expenses, Sales, Vendors)</li>
                    </ul>
                    <div className="font-bold text-foreground">The following will NOT be deleted:</div>
                    <ul className="list-disc list-inside text-sm text-primary pl-4">
                      <li>User Accounts & Roles</li>
                      <li>Staff Details, Attendance & Payroll Data</li>
                    </ul>
                    <div>To proceed, type "<strong className="text-foreground">{APP_RESET_PHRASE}</strong>" below.</div>
                  </div>
                </AlertDialogHeader>
                <div className="py-2"><Input id="appResetConfirmation" value={appResetConfirmationInput} onChange={(e) => setAppResetConfirmationInput(e.target.value)} placeholder={`Type "${APP_RESET_PHRASE}" here`} className="border-destructive focus:ring-destructive" disabled={isResettingAppData}/></div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setAppResetConfirmationInput("")} disabled={isResettingAppData}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => { if (await handleDataReset('/api/admin/reset-data', APP_RESET_PHRASE, appResetConfirmationInput, setIsResettingAppData)) { setShowAppDataResetDialog(false); setAppResetConfirmationInput(""); } }} disabled={isResettingAppData || appResetConfirmationInput !== APP_RESET_PHRASE} className="bg-destructive hover:bg-destructive/90">{isResettingAppData ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldAlert className="mr-2 h-4 w-4"/>}Reset App Data</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {/* Reset Staff Data Dialog */}
            <AlertDialog open={showStaffDataResetDialog} onOpenChange={setShowStaffDataResetDialog}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full"><Users className="mr-2 h-4 w-4" />Reset Staff Data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Staff Data Reset</AlertDialogTitle>
                  <AlertDialogDescription>This will permanently delete all staff transactional data but leave main app data (inventory, sales, etc.) and core staff profiles intact.</AlertDialogDescription>
                   <div className="text-sm text-muted-foreground space-y-2 pt-2">
                    <div>You are about to delete:</div>
                    <ul className="list-disc list-inside text-sm text-destructive pl-4">
                      <li>All Staff Attendance Records</li>
                      <li>All Salary Advances & Payments</li>
                      <li>All Staff Activity Logs</li>
                    </ul>
                    <div className="font-bold text-foreground">The following will NOT be deleted:</div>
                     <ul className="list-disc list-inside text-sm text-primary pl-4">
                      <li>User Accounts & Roles</li>
                      <li>Core Staff Details (Phone, Address, Salary)</li>
                      <li>Main application data (stock, sales, sites, etc.)</li>
                    </ul>
                    <div>To proceed, type "<strong className="text-foreground">{STAFF_RESET_PHRASE}</strong>" below.</div>
                  </div>
                </AlertDialogHeader>
                <div className="py-2"><Input id="staffResetConfirmation" value={staffResetConfirmationInput} onChange={(e) => setStaffResetConfirmationInput(e.target.value)} placeholder={`Type "${STAFF_RESET_PHRASE}" here`} className="border-destructive focus:ring-destructive" disabled={isResettingStaffData}/></div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setStaffResetConfirmationInput("")} disabled={isResettingStaffData}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={async () => { if (await handleDataReset('/api/admin/reset-staff-data', STAFF_RESET_PHRASE, staffResetConfirmationInput, setIsResettingStaffData)) { setShowStaffDataResetDialog(false); setStaffResetConfirmationInput(""); } }} disabled={isResettingStaffData || staffResetConfirmationInput !== STAFF_RESET_PHRASE} className="bg-destructive hover:bg-destructive/90">{isResettingStaffData ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Users className="mr-2 h-4 w-4"/>}Reset Staff Data</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">It's recommended to back up your data before performing any reset operation.</p>
          </CardFooter>
        </Card>
      )}

      <ManageVendorsDialog isOpen={showManageVendorsDialog} onClose={() => setShowManageVendorsDialog(false)}/>
      <ManageExpensePresetsDialog isOpen={showManagePresetsDialog} onClose={() => setShowManagePresetsDialog(false)}/>
      <CsvImportDialog
        dataType={showImportDialog}
        isOpen={!!showImportDialog}
        onClose={() => setShowImportDialog(null)}
      />
    </div>
  );
}


"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Upload, Download, Loader2, ShieldAlert, AlertTriangle, Utensils, MailQuestion, Users } from "lucide-react";
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

const LOG_PREFIX = "[SettingsPage]";

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
            <p className="text-xs text-muted-foreground">It's recommended to back up your data (e.g., using CSV export) before performing any reset operation.</p>
          </CardFooter>
        </Card>
      )}

      <ManageVendorsDialog isOpen={showManageVendorsDialog} onClose={() => setShowManageVendorsDialog(false)}/>
    </div>
  );
}

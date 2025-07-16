
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Upload, Download, Loader2, ShieldAlert, AlertTriangle, Utensils, MailQuestion } from "lucide-react";
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

const LOG_PREFIX = "[SettingsPage]";

export default function SettingsPage() {
  const { user: appUser, getAuth } = useAuth();
  const { toast } = useToast();
  
  const [showResetDataDialog, setShowResetDataDialog] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState("");
  const [isResettingData, setIsResettingData] = useState(false);
  const RESET_CONFIRMATION_PHRASE = "RESET DATA";

  const [showManageVendorsDialog, setShowManageVendorsDialog] = useState(false);

  const handleResetDataConfirm = async () => {
    if (resetConfirmationInput !== RESET_CONFIRMATION_PHRASE) {
      toast({ title: "Confirmation Mismatch", description: `Please type "${RESET_CONFIRMATION_PHRASE}" to confirm.`, variant: "destructive" });
      return;
    }
    setIsResettingData(true);
    toast({ title: "Resetting Data...", description: "Please wait, this may take a few moments.", duration: 10000 });

    try {
      const auth = getAuth();
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
    </div>
  );
}

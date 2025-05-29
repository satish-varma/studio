
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Settings as SettingsIcon, Palette, BellRing, DatabaseZap, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { getFirestore, collection, getDocs, query, orderBy } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { StockItem } from "@/types";
import { useToast } from "@/hooks/use-toast";

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SettingsPage:", error);
  }
}
const db = getFirestore();

export default function SettingsPage() {
  const { toast } = useToast();
  const [isExportingStock, setIsExportingStock] = useState(false);
  const [isExportingSales, setIsExportingSales] = useState(false); // Placeholder for sales export

  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) {
      return "";
    }
    const stringData = String(cellData);
    // If the stringData contains a comma, a newline, or a double quote, enclose it in double quotes.
    // Also, escape any existing double quotes by replacing them with two double quotes.
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const exportStockItemsToCsv = async () => {
    setIsExportingStock(true);
    try {
      const stockItemsCollectionRef = collection(db, "stockItems");
      const q = query(stockItemsCollectionRef, orderBy("name")); // Order by name for consistency
      const querySnapshot = await getDocs(q);
      
      const items: StockItem[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as StockItem);
      });

      if (items.length === 0) {
        toast({ title: "No Stock Data", description: "There are no stock items to export.", variant: "default" });
        setIsExportingStock(false);
        return;
      }

      const headers = [
        "ID", "Name", "Category", "Quantity", "Unit", 
        "Price", "Low Stock Threshold", "Image URL", "Last Updated"
      ];
      
      const csvRows = [headers.join(",")]; // Header row

      items.forEach(item => {
        const row = [
          escapeCsvCell(item.id),
          escapeCsvCell(item.name),
          escapeCsvCell(item.category),
          escapeCsvCell(item.quantity),
          escapeCsvCell(item.unit),
          escapeCsvCell(item.price),
          escapeCsvCell(item.lowStockThreshold),
          escapeCsvCell(item.imageUrl || ""),
          escapeCsvCell(item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('en-IN') : "")
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
      setIsExportingStock(false);
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
              <Label htmlFor="low-stock-alerts" className="text-sm font-medium">Low Stock Email Alerts</Label>
              <Switch id="low-stock-alerts" disabled />
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-md">
              <Label htmlFor="new-sale-notif" className="text-sm font-medium">In-App New Sale Notifications</Label>
              <Switch id="new-sale-notif" checked disabled />
            </div>
             <p className="text-xs text-center text-muted-foreground">(Notification preferences coming soon)</p>
          </CardContent>
        </Card>
      </div>
       <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <DatabaseZap className="mr-2 h-5 w-5 text-primary" />
            Data Management
          </CardTitle>
          <CardDescription>
            Options for exporting your application data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={exportStockItemsToCsv}
            disabled={isExportingStock}
          >
            {isExportingStock ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Stock Data (CSV)
          </Button>
          <Button variant="outline" className="w-full" disabled>
            <Download className="mr-2 h-4 w-4" />
            Export Sales Data (CSV) (Soon)
          </Button>
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">More configuration options will be available here in future updates.</p>
        </CardFooter>
      </Card>
    </div>
  );
}

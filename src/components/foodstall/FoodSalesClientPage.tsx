
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { FoodSaleTransaction, Site, Stall, AppUser, FoodSaleType } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp,
  QueryConstraint,
  deleteDoc,
  doc,
  writeBatch,
  onSnapshot
} from "firebase/firestore";
import { firebaseConfig, auth } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, DollarSign, Upload, Download, Building, PlusCircle, Trash2, ListFilter, Store, WalletCards, FileUp } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FoodSalesTable } from "./FoodSalesTable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import CsvImportDialog from "@/components/shared/CsvImportDialog";
import PageHeader from "../shared/PageHeader";
import Link from "next/link";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { logFoodStallActivity } from "@/lib/foodStallLogger";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from 'date-fns';


const LOG_PREFIX = "[FoodSalesClientPage]";
const SALES_PER_PAGE = 30; 

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

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time';

export default function FoodSalesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite } = useAuth();
  const { toast } = useToast();

  const [sales, setSales] = useState<FoodSaleTransaction[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [errorSales, setErrorSales] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [saleTypeFilter, setSaleTypeFilter] = useState<FoodSaleType | 'all'>('all');
  const [stallFilter, setStallFilter] = useState<string>('all');
  
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);

  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [totalSalesAmount, setTotalSalesAmount] = useState(0);
  const [totalWithDeductions, setTotalWithDeductions] = useState(0);
  
  const [isExporting, setIsExporting] = useState(false);
  const [showHungerboxImportDialog, setShowHungerboxImportDialog] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;
  const effectiveStallId = user?.role === 'admin' ? (stallFilter === 'all' ? null : stallFilter) : activeStallId;


  const buildTransactionQuery = useCallback(() => {
    if (!user) return null;
    if (user.role !== 'admin' && !activeSiteId) return null;

    let constraints: QueryConstraint[] = [orderBy("saleDate", "desc"), limit(SALES_PER_PAGE)];
    if (effectiveSiteId) constraints.push(where("siteId", "==", effectiveSiteId));
    if (effectiveStallId) constraints.push(where("stallId", "==", effectiveStallId));
    if (saleTypeFilter !== 'all') constraints.push(where("saleType", "==", saleTypeFilter));

    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = endOfDay(now);

    switch (dateFilter) {
        case 'today': startDate = startOfDay(now); break;
        case 'last_7_days': startDate = startOfDay(subDays(now, 6)); break;
        case 'this_month': startDate = startOfMonth(now); break;
        case 'all_time': startDate = null; endDate = null; break;
    }
    if (startDate) constraints.push(where("saleDate", ">=", Timestamp.fromDate(startDate)));
    if (endDate) constraints.push(where("saleDate", "<=", Timestamp.fromDate(endDate)));

    return constraints;
  }, [user, activeSiteId, dateFilter, effectiveSiteId, effectiveStallId, saleTypeFilter]);

  useEffect(() => {
    if (authLoading || !db) return;
    const baseConstraints = buildTransactionQuery();
    if (!baseConstraints) {
      setSales([]);
      setLoadingSales(false);
      return;
    }

    setLoadingSales(true);
    const salesCollectionRef = collection(db, "foodSaleTransactions");
    const q = query(salesCollectionRef, ...baseConstraints);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedSales: FoodSaleTransaction[] = snapshot.docs.map(doc => ({
            id: doc.id, ...doc.data(), saleDate: (doc.data().saleDate as Timestamp).toDate(),
        } as FoodSaleTransaction));
        setSales(fetchedSales);
        setLoadingSales(false);
    }, (error) => {
        setErrorSales(error.message || "Failed to load sales.");
        setLoadingSales(false);
    });

    return () => unsubscribe();
  }, [authLoading, db, buildTransactionQuery]);
  

  useEffect(() => {
    const baseConstraints = buildTransactionQuery();
    if (!baseConstraints || !db) {
        setTotalSalesAmount(0);
        setTotalWithDeductions(0);
        return;
    }
    const totalQueryConstraints = baseConstraints.filter(c => c.type !== 'orderBy' && c.type !== 'limit');
    const totalQuery = query(collection(db, "foodSaleTransactions"), ...totalQueryConstraints);
    const unsubTotal = onSnapshot(totalQuery, (snapshot) => {
      let total = 0;
      let totalDeducted = 0;
      snapshot.forEach(doc => {
          const sale = doc.data() as FoodSaleTransaction;
          const saleTotal = sale.totalAmount || 0;
          total += saleTotal;

          const commissionRate = sale.saleType === 'MRP' ? 0.08 : 0.18;
          const deduction = (sale.hungerboxSales || 0) * commissionRate;
          totalDeducted += (saleTotal - deduction);
      });
      setTotalSalesAmount(total);
      setTotalWithDeductions(totalDeducted);
    }, (error) => {
        console.error("Error fetching total sales: ", error);
    });
     return () => unsubTotal();
  }, [dateFilter, siteFilter, stallFilter, saleTypeFilter, db, buildTransactionQuery]);


  useEffect(() => {
     if (!db) return;
     const sitesQuery = query(collection(db, "sites"), orderBy("name"));
     const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
         const newSitesMap: Record<string, string> = {};
         const fetchedSites = snapshot.docs.map(doc => {
            const site = {id: doc.id, ...doc.data()} as Site;
            newSitesMap[site.id] = site.name;
            return site;
         });
         setAllSites(fetchedSites);
         setSitesMap(newSitesMap);
     });

     const stallsQuery = query(collection(db, "stalls"), orderBy("name"));
     const unsubStalls = onSnapshot(stallsQuery, (snapshot) => {
       const allStallsData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Stall));
       const newStallsMap: Record<string, string> = {};
       allStallsData.forEach(stall => { newStallsMap[stall.id] = stall.name; });
       setStallsMap(newStallsMap);

       if (effectiveSiteId) {
         setStallsForSite(allStallsData.filter(s => s.siteId === effectiveSiteId));
       } else {
         setStallsForSite([]);
       }
     });

     return () => {
       unsubSites();
       unsubStalls();
     };
  }, [db, effectiveSiteId]);
  
  
  const handleDelete = async (sale: FoodSaleTransaction) => {
    if (!db || !user ) return;
    const docRef = doc(db, "foodSaleTransactions", sale.id);
    try {
      await deleteDoc(docRef);
      await logFoodStallActivity(user, {
        siteId: sale.siteId,
        stallId: sale.stallId,
        type: 'SALE_RECORDED_OR_UPDATED', // Using existing type for simplicity
        relatedDocumentId: sale.id,
        details: {
          notes: `Deleted ${sale.saleType} sales record for document ID ${sale.id}.`
        }
      });
      toast({ title: "Success", description: "Daily sales record deleted." });
    } catch (error: any) {
      toast({ title: "Error", description: `Failed to delete record: ${error.message}`, variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (!db || !user) {
        toast({ title: "Error", description: "You must be logged in to delete records.", variant: "destructive" });
        return;
    }
    setIsDeleting(true);
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
        const docRef = doc(db, "foodSaleTransactions", id);
        batch.delete(docRef);
    });

    try {
        await batch.commit();
        const deletedCount = selectedIds.length;
        await logFoodStallActivity(user, {
            siteId: activeSiteId || 'multiple',
            stallId: activeStallId || 'multiple',
            type: 'SALE_BULK_IMPORTED', // Re-using for generic bulk action
            relatedDocumentId: `bulk-delete-${Date.now()}`,
            details: { notes: `Bulk deleted ${deletedCount} sales records.` }
        });
        toast({ title: "Success", description: `${deletedCount} sales records have been deleted.` });
        setSelectedIds([]);
    } catch (error: any) {
        toast({ title: "Bulk Delete Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsDeleting(false);
    }
  };
  
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
  
  const handleExport = async () => {
    if (!db) {
        toast({ title: "Export Error", description: "Database is not available.", variant: "destructive"});
        return;
    }
    setIsExporting(true);
    toast({ title: "Exporting...", description: "Fetching all matching sales for export. Please wait."});
    
    const exportConstraints = buildTransactionQuery();
    if (!exportConstraints) {
        toast({ title: "Export Error", description: "Cannot export without a valid context (site, date range).", variant: "destructive"});
        setIsExporting(false);
        return;
    }

    try {
      const salesCollectionRef = collection(db, "foodSaleTransactions");
      const exportQuery = query(salesCollectionRef, ...exportConstraints.filter(c => c.type !== 'limit'));
      const querySnapshot = await getDocs(exportQuery);
      const itemsToExport: FoodSaleTransaction[] = querySnapshot.docs.map(doc => ({
          id: doc.id, ...doc.data(), saleDate: (doc.data().saleDate as Timestamp).toDate(),
      } as FoodSaleTransaction));

      if (itemsToExport.length === 0) {
        toast({ title: "No Data", description: "No sales to export with current filters.", variant: "default" });
        setIsExporting(false);
        return;
      }
      
      const headers = ["ID", "Sale Date", "Site Name", "Stall Name", "Sale Type", "Hungerbox Sales", "UPI Sales", "Total Amount", "Notes", "Recorded By (UID)", "Recorded By (Name)"];
      const csvRows = [headers.join(',')];
      
      const usersMapForExport: Record<string, string> = {};
      if (itemsToExport.some(item => !item.recordedByName)) {
        const userIds = [...new Set(itemsToExport.map(item => item.recordedByUid))];
        const usersSnapshot = await getDocs(query(collection(db, "users"), where("__name__", "in", userIds)));
        usersSnapshot.forEach(doc => {
            const u = doc.data() as AppUser;
            usersMapForExport[doc.id] = u.displayName || u.email || doc.id;
        });
      }

      itemsToExport.forEach(sale => {
        const row = [
          escapeCsvCell(sale.id),
          escapeCsvCell(format(sale.saleDate as Date, "yyyy-MM-dd")),
          escapeCsvCell(sitesMap[sale.siteId] || sale.siteId),
          escapeCsvCell(stallsMap[sale.stallId] || sale.stallId),
          escapeCsvCell(sale.saleType),
          escapeCsvCell(sale.hungerboxSales),
          escapeCsvCell(sale.upiSales),
          escapeCsvCell(sale.totalAmount),
          escapeCsvCell(sale.notes),
          escapeCsvCell(sale.recordedByUid),
          escapeCsvCell(sale.recordedByName || usersMapForExport[sale.recordedByUid]),
        ];
        csvRows.push(row.join(','));
      });

      const siteNameForFile = activeSite?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'export';
      downloadCsv(csvRows.join("\n"), `stallsync_food_sales_${siteNameForFile}_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: `${itemsToExport.length} sales records exported.` });
    } catch (error: any) {
      toast({ title: "Export Failed", description: `Could not export sales. ${error.message}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }

  if (user?.role !== 'admin' && !activeSiteId) {
    return (
      <>
        <PageHeader title="Food Stall Daily Sales Summaries" description="View and edit daily sales totals." />
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
          <AlertDescription>Please select an active site from the header to view food stall sales.</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Food Stall Daily Sales Summaries"
        description="View and edit daily sales totals for your food stall."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Manage Daily Sales
              </Button>
            </Link>
          </div>
        }
      />
      
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <CardTitle>Filter & Summary</CardTitle>
              <CardDescription className="mt-1">
                Total sales for the selected period.
                {!effectiveSiteId ? ' (Aggregated for all sites)' : !effectiveStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="flex gap-4 text-left sm:text-right">
                <div>
                    <p className="text-sm text-muted-foreground">Total Sales</p>
                    <div className="text-2xl font-bold">
                        {loadingSales ? <Skeleton className="h-8 w-32 mt-1" /> : `₹${totalSalesAmount.toFixed(2)}`}
                    </div>
                </div>
                 <div>
                    <p className="text-sm text-muted-foreground">Total (with Deductions)</p>
                    <div className="text-2xl font-bold text-primary">
                        {loadingSales ? <Skeleton className="h-8 w-32 mt-1" /> : `₹${totalWithDeductions.toFixed(2)}`}
                    </div>
                </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => setDateFilter('today')}>Today</Button>
              <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => setDateFilter('last_7_days')}>Last 7 Days</Button>
              <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => setDateFilter('this_month')}>This Month</Button>
              <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => setDateFilter('all_time')}>All Time</Button>
              <Link href="/foodstall/sales/import">
                 <Button variant="outline"><FileUp className="mr-2 h-4 w-4" />Import Sales</Button>
              </Link>
              <Button variant="outline" onClick={() => setShowHungerboxImportDialog(true)}><Upload className="mr-2 h-4 w-4" />Import Hungerbox Sales</Button>
              <Button variant="outline" onClick={handleExport} disabled={isExporting}>{isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {user?.role === 'admin' && (
                  <Select value={siteFilter} onValueChange={setSiteFilter}>
                      <SelectTrigger className="w-full bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by site"/></SelectTrigger>
                      <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                 {user?.role === 'admin' && effectiveSiteId && (
                    <Select value={stallFilter} onValueChange={setStallFilter}>
                        <SelectTrigger className="w-full bg-input"><Store className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Filter by stall"/></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Stalls</SelectItem>{stallsForSite.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
                 <Select value={saleTypeFilter} onValueChange={(v) => setSaleTypeFilter(v as any)}>
                    <SelectTrigger className="w-full bg-input"><ListFilter className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="Filter by type"/></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Sale Types</SelectItem><SelectItem value="Non-MRP">Non-MRP</SelectItem><SelectItem value="MRP">MRP</SelectItem></SelectContent>
                </Select>
            </div>
        </CardContent>
      </Card>
      
       {selectedIds.length > 0 && (
        <div className="flex justify-end">
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete {selectedIds.length} Selected Record(s)
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete {selectedIds.length} sales records. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting}>
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirm Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
      )}


      {loadingSales && sales.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading sales...</p></div>
      )}
      {errorSales && (<Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Sales</AlertTitle><AlertDescription>{errorSales}</AlertDescription></Alert>)}
      {!loadingSales && !errorSales && (
        <FoodSalesTable 
          sales={sales} 
          sitesMap={sitesMap}
          stallsMap={stallsMap}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}
      <CsvImportDialog
        dataType="foodSales"
        isOpen={showHungerboxImportDialog}
        onClose={() => setShowHungerboxImportDialog(false)}
        isHungerbox={true}
      />
    </div>
  );
}

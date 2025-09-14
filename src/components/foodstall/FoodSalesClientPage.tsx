
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { FoodSaleTransaction, Site, Stall, AppUser } from "@/types";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
  DocumentData,
  endBefore,
  limitToLast,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, DollarSign, Upload, Download, Building, PlusCircle, Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
const SALES_PER_PAGE = 30; // Show a month at a time

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
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [totalSalesAmount, setTotalSalesAmount] = useState(0);
  
  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isGmailImporting, setIsGmailImporting] = useState(false);
  
  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;


  const buildTransactionQuery = useCallback(() => {
    if (!user) return null;
    if (user.role !== 'admin' && !activeSiteId) return null;

    let constraints: QueryConstraint[] = [orderBy("saleDate", "desc")];
    if (effectiveSiteId) constraints.push(where("siteId", "==", effectiveSiteId));
    if (activeStallId) constraints.push(where("stallId", "==", activeStallId));

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
  }, [user, activeSiteId, activeStallId, dateFilter, effectiveSiteId]);

  const fetchSalesAndContext = useCallback(() => {
    if (authLoading || !db) return;

    const baseConstraints = buildTransactionQuery();
    if (!baseConstraints) {
      setSales([]);
      setTotalSalesAmount(0);
      setLoadingSales(false);
      return;
    }

    setLoadingSales(true);
    const salesCollectionRef = collection(db, "foodSaleTransactions");
    const q = query(salesCollectionRef, ...baseConstraints, limit(SALES_PER_PAGE));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedSales = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            saleDate: (doc.data().saleDate as Timestamp).toDate(),
        } as FoodSaleTransaction));

        const total = fetchedSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
        
        setSales(fetchedSales);
        setTotalSalesAmount(total);
        setFirstVisibleDoc(snapshot.docs[0] || null);
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        setIsLastPage(snapshot.docs.length < SALES_PER_PAGE);
        setIsFirstPageReached(true);
        setCurrentPage(1);
        setLoadingSales(false);
    }, (error) => {
        console.error("Error fetching sales data:", error);
        setErrorSales(error.message || "Failed to load sales.");
        setLoadingSales(false);
    });

    const sitesQuery = query(collection(db, "sites"), orderBy("name"));
    const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
        const fetchedSites = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Site));
        const newSitesMap: Record<string, string> = {};
        fetchedSites.forEach(site => newSitesMap[site.id] = site.name);
        setAllSites(fetchedSites);
        setSitesMap(newSitesMap);
    });

    const stallsQuery = query(collection(db, "stalls"));
    const unsubStalls = onSnapshot(stallsQuery, (snapshot) => {
      const newStallsMap: Record<string, string> = {};
      snapshot.forEach(doc => { newStallsMap[doc.id] = (doc.data() as Stall).name; });
      setStallsMap(newStallsMap);
    });

    return () => {
      unsubscribe();
      unsubSites();
      unsubStalls();
    };
  }, [authLoading, db, buildTransactionQuery]);

  useEffect(() => {
    const unsubscribe = fetchSalesAndContext();
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [fetchSalesAndContext]);
  
  const handleGmailImport = async () => {
    if (!user || !activeSiteId || !activeStallId) {
        toast({ title: "Context Required", description: "Please select a specific site and stall before importing from Gmail.", variant: "destructive"});
        return;
    }
    
    // Check for user tokens, if not present, initiate OAuth flow
    if (!db) {
        toast({ title: "Database Error", description: "Cannot verify Gmail connection.", variant: "destructive" });
        return;
    }
    const tokenSnap = await getDocs(query(collection(db, 'user_tokens'), where('uid', '==', user.uid)));

    if (tokenSnap.empty) {
        const authUrl = `/api/auth/google/initiate?uid=${user.uid}`;
        const authWindow = window.open(authUrl, '_blank', 'width=500,height=600');
        
        const messageListener = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data === 'auth_success') {
                toast({ title: "Gmail Connected!", description: "Your account is connected. You can now try importing again." });
                window.removeEventListener('message', messageListener);
                authWindow?.close();
            }
        };
        window.addEventListener('message', messageListener);
        return;
    }

    setIsGmailImporting(true);
    toast({ title: "Importing from Gmail...", description: "Checking for new Hungerbox sales emails. This may take a moment." });
    
    try {
        const idToken = await auth.currentUser?.getIdToken(true);
        const response = await fetch('/api/gmail-handler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ siteId: activeSiteId, stallId: activeStallId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || result.message);
        toast({ title: "Import Complete", description: result.message, duration: 7000 });
    } catch (error: any) {
        toast({ title: "Gmail Import Failed", description: error.message, variant: "destructive", duration: 7000 });
    } finally {
        setIsGmailImporting(false);
    }
  };


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
      const exportQuery = query(salesCollectionRef, ...exportConstraints);
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
                {!effectiveSiteId ? ' (Aggregated for all sites)' : !activeStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <div className="text-2xl font-bold">
                {loadingSales ? <Skeleton className="h-8 w-32 mt-1" /> : `₹${totalSalesAmount.toFixed(2)}`}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => setDateFilter('today')}>Today</Button>
          <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => setDateFilter('last_7_days')}>Last 7 Days</Button>
          <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => setDateFilter('this_month')}>This Month</Button>
          <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => setDateFilter('all_time')}>All Time</Button>
          {user?.role === 'admin' && (
            <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-[200px] bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by site"/></SelectTrigger>
                <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
           <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(true)}><Upload className="mr-2 h-4 w-4" />Import from CSV</Button>
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>{isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export to CSV</Button>
            <Button variant="outline" onClick={handleGmailImport} disabled={isGmailImporting}>{isGmailImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Mail className="mr-2 h-4 w-4" />}Import from Gmail</Button>
          </div>
        </CardContent>
      </Card>

      {loadingSales && sales.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading sales...</p></div>
      )}
      {errorSales && (<Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Sales</AlertTitle><AlertDescription>{errorSales}</AlertDescription></Alert>)}
      {!loadingSales && !errorSales && (
        <FoodSalesTable 
          sales={sales} 
          sitesMap={sitesMap}
          stallsMap={stallsMap}
          onNextPage={() => {}}
          onPrevPage={() => {}}
          isLastPage={isLastPage}
          isFirstPage={isFirstPageReached}
          currentPage={currentPage}
          isLoading={loadingSales}
          onDelete={handleDelete}
        />
      )}
      <CsvImportDialog
        dataType="foodSales"
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
      />
    </div>
  );
}

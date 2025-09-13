
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  onSnapshot
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, DollarSign, Upload, Download, Building } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodSalesTable } from "./FoodSalesTable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import CsvImportDialog from "@/components/shared/CsvImportDialog";
import PageHeader from "../shared/PageHeader";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../ui/select";
import { Skeleton } from "../ui/skeleton";

const LOG_PREFIX = "[FoodSalesClientPage]";
const SALES_PER_PAGE = 30; // Show a month at a time

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

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
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [totalSalesAmount, setTotalSalesAmount] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(true);
  
  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  
  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;


  useEffect(() => {
    if (!db || !user) return;
    if (user.role === 'admin') {
      const sitesQuery = query(collection(db, "sites"), orderBy("name"));
      const unsub = onSnapshot(sitesQuery, (snapshot) => {
        setAllSites(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Site)));
      });
      return () => unsub();
    }
  }, [db, user]);

  const buildTransactionQuery = useCallback(() => {
    if (!user) return null;
    
    // For managers/staff, an active site MUST be selected. For admins, it's optional.
    if (user.role !== 'admin' && !activeSiteId) return null;

    let constraints: QueryConstraint[] = [orderBy("saleDate", "desc")];
    
    // Apply site filter
    if (effectiveSiteId) {
        constraints.push(where("siteId", "==", effectiveSiteId));
    }
    
    // Apply stall filter if site is also selected
    if (effectiveSiteId && activeStallId) {
        constraints.push(where("stallId", "==", activeStallId));
    }

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


  const fetchSales = useCallback((direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db) return Promise.resolve(() => {});

    const baseConstraints = buildTransactionQuery();
    if (!baseConstraints) {
      setSales([]);
      setTotalSalesAmount(0); // Ensure total is cleared
      setLoadingSales(false);
      setLoadingTotal(false);
      return Promise.resolve(() => {});
    }
    
    setLoadingSales(true);
    setLoadingTotal(true);
    setErrorSales(null);

    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let qConstraints: QueryConstraint[] = [...baseConstraints];
    
    if (direction === 'next' && lastVisibleDoc) {
      qConstraints.push(startAfter(lastVisibleDoc));
    } else if (direction === 'prev' && firstVisibleDoc) {
      qConstraints.push(endBefore(firstVisibleDoc));
    }
    qConstraints.push(limit(SALES_PER_PAGE));


    const q = query(salesCollectionRef, ...qConstraints);
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const fetchedSales = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          saleDate: (doc.data().saleDate as Timestamp).toDate(),
        } as FoodSaleTransaction));

        setSales(fetchedSales);
        
        const totalQuery = query(salesCollectionRef, ...baseConstraints.filter(c => c.type !== 'orderBy'));
        getDocs(totalQuery).then(totalSnapshot => {
            const total = totalSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
            setTotalSalesAmount(total);
            setLoadingTotal(false);
        }).catch(() => setLoadingTotal(false));
        
        if (snapshot.docs.length > 0) {
            setFirstVisibleDoc(snapshot.docs[0]);
            setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setIsLastPage(snapshot.docs.length < SALES_PER_PAGE);
        setLoadingSales(false);
      },
      (error) => {
        console.error("Error fetching sales data:", error);
        setErrorSales(error.message || "Failed to load sales.");
        setLoadingSales(false);
        setLoadingTotal(false);
      }
    );
    return Promise.resolve(unsubscribe);
  }, [authLoading, db, buildTransactionQuery, lastVisibleDoc, firstVisibleDoc]);

  useEffect(() => {
    const unsubscribePromise = fetchSales('initial');
    return () => {
      unsubscribePromise.then(unsub => unsub && unsub());
    };
  }, [fetchSales]);
  
  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) return "";
    const stringData = String(cellData);
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const handleExport = async () => {
    if (!db) return;
    setIsExporting(true);
    toast({ title: "Exporting...", description: "Fetching all matching sales data." });

    const exportConstraints = buildTransactionQuery();
    if (!exportConstraints) {
      toast({ title: "Export Failed", description: "A valid site and date range must be selected to export.", variant: "destructive" });
      setIsExporting(false);
      return;
    }
    
    try {
        const salesCollectionRef = collection(db, "foodSaleTransactions");
        const exportQuery = query(salesCollectionRef, ...exportConstraints);
        const querySnapshot = await getDocs(exportQuery);
        const salesToExport: FoodSaleTransaction[] = querySnapshot.docs.map(d => ({
            id: d.id, ...d.data(), saleDate: (d.data().saleDate as Timestamp).toDate(),
        } as FoodSaleTransaction));

        if (salesToExport.length === 0) {
            toast({ title: "No Data", description: "No sales to export with current filters.", variant: "default" });
            setIsExporting(false);
            return;
        }
        
        const headers = ["ID", "Sale Date", "Site ID", "Stall ID", "Hungerbox Sales", "UPI Sales", "Total Amount", "Notes", "Recorded By", "Created At"];
        const csvRows = [headers.join(',')];

        for (const sale of salesToExport) {
            const row = [
                escapeCsvCell(sale.id),
                escapeCsvCell(format(sale.saleDate as Date, 'yyyy-MM-dd')),
                escapeCsvCell(sale.siteId),
                escapeCsvCell(sale.stallId),
                escapeCsvCell(sale.sales.hungerbox || 0),
                escapeCsvCell(sale.sales.upi || 0),
                escapeCsvCell(sale.totalAmount),
                escapeCsvCell(sale.notes),
                escapeCsvCell(sale.recordedByName || sale.recordedByUid),
                escapeCsvCell(sale.createdAt),
            ];
            csvRows.push(row.join(','));
        }
        
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `food_sales_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({ title: "Export Successful", description: `${salesToExport.length} records exported.` });
    } catch (error: any) {
        toast({ title: "Export Failed", description: `An error occurred: ${error.message}`, variant: "destructive" });
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
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4"/> Import Sales
            </Button>
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Manage Today's Sales
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
                {loadingTotal ? <Skeleton className="h-8 w-32 mt-1" /> : `₹${totalSalesAmount.toFixed(2)}`}
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
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}
            Export
          </Button>
        </CardContent>
      </Card>

      {loadingSales && sales.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading sales...</p></div>
      )}
      {errorSales && (<Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Sales</AlertTitle><AlertDescription>{errorSales}</AlertDescription></Alert>)}
      {!loadingSales && !errorSales && (
        <FoodSalesTable 
          sales={sales} 
          onNextPage={() => fetchSales('next')}
          onPrevPage={() => fetchSales('prev')}
          isLastPage={isLastPage}
          isFirstPage={isFirstPageReached}
          currentPage={currentPage}
          isLoading={loadingSales}
        />
      )}
      <CsvImportDialog
        dataType="foodExpenses" // This should probably be "foodSales" if we have a separate import logic
        isOpen={showImportDialog}
        onClose={() => {
          setShowImportDialog(false);
          fetchSales('initial');
        }}
      />
    </div>
  );
}

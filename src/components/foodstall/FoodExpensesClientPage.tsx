
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoodItemExpense, Site, Stall } from "@/types/food";
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  endBefore, 
  getDocs,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
  DocumentData,
  limitToLast,
  sum,
  getAggregateFromServer,
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ListFilter, DollarSign, Upload, Download } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodExpensesTable } from "./FoodExpensesTable";
import { foodExpenseCategories } from "@/types/food";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import CsvImportDialog from "@/components/shared/CsvImportDialog";

const LOG_PREFIX = "[FoodExpensesClientPage]";
const EXPENSES_PER_PAGE = 15;

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time';

export default function FoodExpensesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<FoodItemExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [errorExpenses, setErrorExpenses] = useState<string | null>(null);
  
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [totalExpensesAmount, setTotalExpensesAmount] = useState<number>(0);
  const [loadingTotal, setLoadingTotal] = useState(true);

  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const fetchContextMaps = useCallback(async () => {
    if (!db) return false;
    try {
      const sitesSnapshot = await getDocs(query(collection(db, "sites")));
      const newSitesMap: Record<string, string> = {};
      sitesSnapshot.forEach(doc => { newSitesMap[doc.id] = (doc.data() as Site).name; });
      setSitesMap(newSitesMap);

      const stallsSnapshot = await getDocs(query(collection(db, "stalls")));
      const newStallsMap: Record<string, string> = {};
      stallsSnapshot.forEach(doc => { newStallsMap[doc.id] = (doc.data() as Stall).name; });
      setStallsMap(newStallsMap);
      return true;
    } catch (error) {
      toast({ title: "Error", description: "Could not load site/stall data for export.", variant: "destructive" });
      return false;
    }
  }, [toast]);
  
  const buildExpenseQuery = useCallback((isForTotal: boolean = false) => {
    if (authLoading || !db || !user) return null;
    if (user.role !== 'admin' && !activeSiteId && !isForTotal) return null;

    let qConstraints: QueryConstraint[] = [];
    if (activeSiteId) {
      qConstraints.push(where("siteId", "==", activeSiteId));
      if (activeStallId) qConstraints.push(where("stallId", "==", activeStallId));
    }
    const now = new Date(); let startDate: Date | null = null; let endDate: Date | null = endOfDay(now);
    switch (dateFilter) {
        case 'today': startDate = startOfDay(now); break;
        case 'last_7_days': startDate = startOfDay(subDays(now, 6)); break;
        case 'this_month': startDate = startOfMonth(now); break;
        case 'all_time': startDate = null; endDate = null; break;
    }
    if(startDate) qConstraints.push(where("purchaseDate", ">=", Timestamp.fromDate(startDate)));
    if(endDate) qConstraints.push(where("purchaseDate", "<=", Timestamp.fromDate(endDate)));
    if (categoryFilter !== "all") qConstraints.push(where("category", "==", categoryFilter));

    return qConstraints;
  }, [authLoading, user, activeSiteId, activeStallId, dateFilter, categoryFilter]);


  const fetchExpenses = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    const baseConstraints = buildExpenseQuery();
    if (!baseConstraints) {
      if (!authLoading) setLoadingExpenses(false);
      setExpenses([]);
      return;
    }
    
    setLoadingExpenses(true);
    if (direction === 'initial') {
        fetchContextMaps();
    }
    setErrorExpenses(null);

    const expensesCollectionRef = collection(db!, "foodItemExpenses");
    let finalConstraints: QueryConstraint[] = [...baseConstraints];

    if (direction === 'prev' && firstVisibleDoc) {
        finalConstraints.push(orderBy("purchaseDate", "desc"), endBefore(firstVisibleDoc), limitToLast(EXPENSES_PER_PAGE));
    } else {
        finalConstraints.push(orderBy("purchaseDate", "desc"));
        if (direction === 'next' && lastVisibleDoc) finalConstraints.push(startAfter(lastVisibleDoc));
        finalConstraints.push(limit(EXPENSES_PER_PAGE + 1));
    }
    
    try {
      const q = query(expensesCollectionRef, ...finalConstraints);
      const querySnapshot = await getDocs(q);
      let fetchedExpenses: FoodItemExpense[] = querySnapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(), purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(),
      } as FoodItemExpense));
      
      const hasMore = direction !== 'prev' && fetchedExpenses.length > EXPENSES_PER_PAGE;
      if (hasMore) fetchedExpenses.pop();

      setExpenses(fetchedExpenses);
      
      if (querySnapshot.docs.length > 0) {
        setFirstVisibleDoc(querySnapshot.docs[0]);
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - (hasMore ? 2 : 1)]);
        if (direction === 'next') setCurrentPage(prev => prev + 1);
        if (direction === 'prev') setCurrentPage(prev => Math.max(1, prev - 1));
        setIsLastPage(!hasMore);
      } else {
        if (direction === 'next') setIsLastPage(true);
        if (direction === 'initial') setIsLastPage(true);
      }
    } catch (error: any) {
      setErrorExpenses(error.message || "Failed to load expenses.");
    } finally {
      setLoadingExpenses(false);
    }
  }, [buildExpenseQuery, authLoading, firstVisibleDoc, lastVisibleDoc, fetchContextMaps]);

  // Separate effect to calculate total sum, using efficient aggregation
  useEffect(() => {
    const fetchTotal = async () => {
        const totalQueryConstraints = buildExpenseQuery(true);
        if (!totalQueryConstraints || !db) {
            setTotalExpensesAmount(0);
            setLoadingTotal(false);
            return;
        }
        setLoadingTotal(true);
        try {
            const expensesCollectionRef = collection(db, "foodItemExpenses");
            const q = query(expensesCollectionRef, ...totalQueryConstraints);
            const snapshot = await getAggregateFromServer(q, {
                totalCost: sum('totalCost')
            });
            setTotalExpensesAmount(snapshot.data().totalCost || 0);
        } catch(error) {
            console.error("Error calculating total expenses:", error);
            setTotalExpensesAmount(0); // Set to 0 on error
        } finally {
            setLoadingTotal(false);
        }
    };
    fetchTotal();
  }, [buildExpenseQuery]);


  useEffect(() => {
    document.title = "Food Stall Expenses - StallSync";
    setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
    const initialFetch = async () => {
        await fetchExpenses('initial');
    };
    initialFetch();
    return () => { document.title = "StallSync - Stock Management"; }
  }, [dateFilter, categoryFilter, user, activeSiteId, activeStallId]);

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
    toast({ title: "Exporting...", description: "Fetching all matching expenses for export. Please wait."});
    
    const exportConstraints = buildExpenseQuery();
    if (!exportConstraints) {
        toast({ title: "Export Error", description: "Cannot export without a valid context.", variant: "destructive"});
        setIsExporting(false);
        return;
    }

    try {
      const expensesCollectionRef = collection(db, "foodItemExpenses");
      const exportQuery = query(expensesCollectionRef, ...exportConstraints, orderBy("purchaseDate", "desc"));
      const querySnapshot = await getDocs(exportQuery);
      const itemsToExport: FoodItemExpense[] = querySnapshot.docs.map(doc => ({
          id: doc.id, ...doc.data(), purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(),
      } as FoodItemExpense));

      if (itemsToExport.length === 0) {
        toast({ title: "No Expenses to Export", description: "There are no expenses matching the current filters.", variant: "default" });
        setIsExporting(false);
        return;
      }
      
      const headers = ["Expense ID", "Category", "Total Cost", "Payment Method", "Other Payment Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site Name", "Stall Name", "Recorded By (Name)", "Recorded By (UID)"];
      const csvRows = [headers.join(',')];
      itemsToExport.forEach(expense => {
        const row = [
          escapeCsvCell(expense.id), escapeCsvCell(expense.category), escapeCsvCell(expense.totalCost.toFixed(2)),
          escapeCsvCell(expense.paymentMethod), escapeCsvCell(expense.otherPaymentMethodDetails || ""),
          escapeCsvCell(format(new Date(expense.purchaseDate), "yyyy-MM-dd")),
          escapeCsvCell(expense.vendor || ""), escapeCsvCell(expense.otherVendorDetails || ""),
          escapeCsvCell(expense.notes || ""), escapeCsvCell(expense.billImageUrl || ""),
          escapeCsvCell(expense.siteId ? sitesMap[expense.siteId] || expense.siteId : "N/A"),
          escapeCsvCell(expense.stallId ? stallsMap[expense.stallId] || expense.stallId : "N/A"),
          escapeCsvCell(expense.recordedByName || ""), escapeCsvCell(expense.recordedByUid),
        ];
        csvRows.push(row.join(','));
      });
      downloadCsv(csvRows.join("\n"), `stallsync_food_expenses_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: `${itemsToExport.length} expenses exported.` });
    } catch (error: any) {
      toast({ title: "Export Failed", description: `Could not export expenses. ${error.message}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  
  if (user?.role !== 'admin' && !activeSiteId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Context Required</AlertTitle>
        <AlertDescription>
          Please select an active site from the header to view expenses.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <CardTitle>Filter & Summary</CardTitle>
              <CardDescription className="mt-1">
                Total expenses for the selected period and category.
                {!activeSiteId ? ' (Aggregated for all sites)' : !activeStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <div className="text-2xl font-bold">
                {loadingTotal ? (
                  <Loader2 className="h-6 w-6 animate-spin"/>
                ) : (
                  `₹${totalExpensesAmount.toFixed(2)}`
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-2 border-t pt-4">
          <div className="flex-1 flex flex-wrap gap-2">
            <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => setDateFilter('today')}>Today</Button>
            <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => setDateFilter('last_7_days')}>Last 7 Days</Button>
            <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => setDateFilter('this_month')}>This Month</Button>
            <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => setDateFilter('all_time')}>All Time</Button>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row gap-2 justify-end">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[220px] bg-input">
                <ListFilter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {foodExpenseCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setShowImportDialog(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>{isExporting ? <Download className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export</Button>
          </div>
        </CardContent>
      </Card>

      {loadingExpenses && expenses.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading expenses...</p></div>
      )}
      {errorExpenses && (
        <Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Expenses</AlertTitle><AlertDescription>{errorExpenses}</AlertDescription></Alert>
      )}
      {!loadingExpenses && !errorExpenses && (
        <FoodExpensesTable 
          expenses={expenses} onNextPage={() => fetchExpenses('next')} onPrevPage={() => fetchExpenses('prev')}
          isLastPage={isLastPage} isFirstPage={currentPage === 1} currentPage={currentPage} itemsPerPage={EXPENSES_PER_PAGE}
          isLoading={loadingExpenses}
        />
      )}
      <CsvImportDialog
        dataType="foodExpenses"
        isOpen={showImportDialog}
        onClose={() => {
          setShowImportDialog(false);
          fetchExpenses('initial'); // Refresh data after import attempt
        }}
      />
    </div>
  );
}

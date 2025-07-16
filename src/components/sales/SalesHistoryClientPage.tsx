
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { SalesHistoryControls } from "@/components/sales/SalesHistoryControls";
import { SalesTable } from "@/components/sales/SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import type { SaleTransaction, AppUser, Site, Stall } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay, parseISO, isValid } from "date-fns";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    Timestamp, 
    QuerySnapshot, 
    DocumentData,
    getDocs,
    doc,
    updateDoc,
    QueryConstraint,
    limit,
    startAfter,
    endBefore,
    DocumentSnapshot as FirestoreDocumentSnapshot
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const LOG_PREFIX = "[SalesHistoryClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();
const TRANSACTIONS_PER_PAGE = 20;

export default function SalesHistoryClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth();
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [staffFilter, setStaffFilter] = useState("all"); 
  
  const [currentPageTransactions, setCurrentPageTransactions] = useState<SaleTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [errorTransactions, setErrorTransactions] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});

  const [firstTransactionDoc, setFirstTransactionDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [lastTransactionDoc, setLastTransactionDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isLoadingPrevPage, setIsLoadingPrevPage] = useState(false);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);

  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';

  useEffect(() => {
    if (user && !authLoading) {
      const fromDate = user.defaultSalesDateRangeFrom && isValid(parseISO(user.defaultSalesDateRangeFrom)) 
                       ? parseISO(user.defaultSalesDateRangeFrom) 
                       : subDays(new Date(), 29);
      const toDate = user.defaultSalesDateRangeTo && isValid(parseISO(user.defaultSalesDateRangeTo))
                     ? parseISO(user.defaultSalesDateRangeTo) 
                     : new Date();
      setDateRange({ from: startOfDay(fromDate), to: endOfDay(toDate) });
      setStaffFilter(user.defaultSalesStaffFilter || "all");
    }
  }, [user, authLoading]);

  useEffect(() => {
    async function fetchContextData() {
      if (isManagerOrAdmin && db) {
        setLoadingStaff(true);
        try {
          const usersSnapshot = await getDocs(query(collection(db, "users"), where("role", "in", ["staff", "manager", "admin"])));
          const fetchedStaff: AppUser[] = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
          setStaffList(fetchedStaff.sort((a,b) => (a.displayName || "").localeCompare(b.displayName || "")));

          const sitesSnapshot = await getDocs(collection(db, "sites"));
          const newSitesMap: Record<string, string> = {};
          sitesSnapshot.forEach(doc => newSitesMap[doc.id] = (doc.data() as Site).name);
          setSitesMap(newSitesMap);

          const stallsSnapshot = await getDocs(collection(db, "stalls"));
          const newStallsMap: Record<string, string> = {};
          stallsSnapshot.forEach(doc => newStallsMap[doc.id] = (doc.data() as Stall).name);
          setStallsMap(newStallsMap);

        } catch (error: any) {
          toast({ title: "Error", description: "Could not load context data for filtering/exporting.", variant: "destructive" });
        } finally {
          setLoadingStaff(false);
        }
      }
    }
    if (user) fetchContextData();
  }, [user, isManagerOrAdmin, toast, db]);

  const fetchTransactions = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db) return;
    if (!user || (!activeSiteId && (user.role === 'staff' || user.role === 'manager')) || (user.role === 'admin' && !activeSiteId)) {
      setCurrentPageTransactions([]);
      setLoadingTransactions(false);
      return;
    }
    if (!dateRange?.from || !dateRange?.to) return;

    if (direction === 'initial') setLoadingTransactions(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorTransactions(null);

    const salesCollectionRef = collection(db, "salesTransactions");
    let salesQueryConstraints: QueryConstraint[] = [orderBy("transactionDate", "desc"), where("isDeleted", "==", false)];

    if (activeSiteId) salesQueryConstraints.push(where("siteId", "==", activeSiteId));
    if (activeStallId) salesQueryConstraints.push(where("stallId", "==", activeStallId));
    if (user.role === 'staff') salesQueryConstraints.push(where("staffId", "==", user.uid));
    else if (isManagerOrAdmin && staffFilter !== "all") salesQueryConstraints.push(where("staffId", "==", staffFilter));
    salesQueryConstraints.push(where("transactionDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))));
    salesQueryConstraints.push(where("transactionDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))));
    
    if (direction === 'next' && lastTransactionDoc) salesQueryConstraints.push(startAfter(lastTransactionDoc));
    else if (direction === 'prev' && firstTransactionDoc) salesQueryConstraints.push(endBefore(firstTransactionDoc), limit(TRANSACTIONS_PER_PAGE));
    
    const q = query(salesCollectionRef, ...salesQueryConstraints, limit(TRANSACTIONS_PER_PAGE + 1));
    const unsubscribe = onSnapshot(q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        let fetchedTransactions: SaleTransaction[] = snapshot.docs.map(d => ({
          id: d.id, ...d.data(), transactionDate: (d.data().transactionDate as Timestamp).toDate().toISOString()
        } as SaleTransaction));
        const hasMore = fetchedTransactions.length > TRANSACTIONS_PER_PAGE;
        if (hasMore) fetchedTransactions.pop();
        
        setCurrentPageTransactions(fetchedTransactions);
        setIsLastPage(!hasMore);
        
        if (fetchedTransactions.length > 0) {
          if (direction === 'initial') setIsFirstPageReached(true);
          else if (direction === 'next') setIsFirstPageReached(false);
          setFirstTransactionDoc(snapshot.docs[0]);
          setLastTransactionDoc(snapshot.docs[fetchedTransactions.length -1]);
        } else {
          if (direction === 'initial') setIsFirstPageReached(true);
          if (direction === 'next') setIsLastPage(true);
        }
        setLoadingTransactions(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
      },
      (error: any) => {
        setErrorTransactions(error.message.includes("requires an index")
          ? `Query requires Firestore index. Details: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load sales history.");
        setLoadingTransactions(false);
      }
    );
    return unsubscribe;
  }, [user, activeSiteId, activeStallId, dateRange, staffFilter, isManagerOrAdmin, authLoading, db, lastTransactionDoc, firstTransactionDoc]);

  useEffect(() => {
    const unsubscribePromise = fetchTransactions('initial');
    return () => {
      unsubscribePromise.then(unsub => unsub && unsub());
    };
  }, [fetchTransactions]);

  const handleDeleteSaleWithJustification = async (saleId: string, justification: string) => {
    if (!user || user.role !== 'admin' || !db) {
      toast({ title: "Permission Denied", variant: "destructive" });
      return;
    }
    const saleDocRef = doc(db, "salesTransactions", saleId);
    try {
      await updateDoc(saleDocRef, {
        isDeleted: true, deletedAt: new Date().toISOString(),
        deletedBy: user.uid, deletionJustification: justification.trim(),
      });
      toast({ title: "Sale Deleted", description: "The sale transaction has been marked as deleted." });
    } catch (error: any) {
      toast({ title: "Deletion Failed", description: error.message, variant: "destructive" });
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
  
  const getFormattedTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${minutes}`;
  };

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
    setIsExporting(true);
    const salesToExport = currentPageTransactions;
    if (salesToExport.length === 0) {
        toast({ title: "No Data", description: "No sales to export with current filters.", variant: "default" });
        setIsExporting(false);
        return;
    }
    try {
        const headers = ["Transaction ID", "Date", "Staff Name", "Staff ID", "Total Amount (₹)", "Number of Item Types", "Total Quantity of Items", "Site Name", "Stall Name", "Items Sold (JSON)"];
        const csvRows = [headers.join(",")];
        salesToExport.forEach(sale => {
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
        toast({ title: "Export Successful", description: `${salesToExport.length} sales transactions exported.` });
    } catch (error) {
        toast({ title: "Export Failed", description: "Could not export sales.", variant: "destructive" });
    } finally {
        setIsExporting(false);
    }
  };

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "View and filter all past sales transactions.";
    if (!activeSite) return user.role === 'staff' ? "Default site needed." : "Select a site to view sales.";
    let desc = `Viewing for Site: "${activeSite.name}"`;
    desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Stalls in Site)";
    return desc + ".";
  }, [user, activeSite, activeStall]);

  if (user?.role === 'admin' && !activeSiteId && !authLoading && !loadingTransactions) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sales History" description="Sales records across your business." />
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Select a Site</AlertTitle>
          <AlertDescription>
            Please select an active Site from the header dropdown to view sales history.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sales History" description={pageHeaderDescription} />
      <SalesHistoryControls
        dateRange={dateRange} onDateRangeChange={setDateRange}
        staffFilter={staffFilter} onStaffFilterChange={setStaffFilter}
        staffMembers={staffList} isLoadingStaff={loadingStaff}
        showStaffFilter={isManagerOrAdmin}
        onExportClick={handleExport} isExporting={isExporting}
      />
      {loadingTransactions && !isLoadingNextPage && !isLoadingPrevPage && (
         <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading sales history...</p>
        </div>
      )}
      {errorTransactions && (
        <Alert variant="destructive" className="my-4">
          <Info className="h-4 w-4" /><AlertTitle>Error Loading Sales</AlertTitle><AlertDescription>{errorTransactions}</AlertDescription>
        </Alert>
      )}
      {!loadingTransactions && !errorTransactions && 
        <SalesTable 
            transactions={currentPageTransactions} 
            currentUserRole={user?.role}
            onDeleteSale={handleDeleteSaleWithJustification}
            isLoadingNextPage={isLoadingNextPage}
            isLoadingPrevPage={isLoadingPrevPage}
            isLastPage={isLastPage}
            isFirstPage={isFirstPageReached}
            onNextPage={() => fetchTransactions('next')}
            onPrevPage={() => fetchTransactions('prev')}
        />
      }
    </div>
  );
}

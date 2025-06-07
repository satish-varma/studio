
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { SalesHistoryControls } from "@/components/sales/SalesHistoryControls";
import { SalesTable } from "@/components/sales/SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import type { SaleTransaction, AppUser } from "@/types";
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

  const [firstTransactionDoc, setFirstTransactionDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [lastTransactionDoc, setLastTransactionDoc] = useState<FirestoreDocumentSnapshot<DocumentData> | null>(null);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isLoadingPrevPage, setIsLoadingPrevPage] = useState(false);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);


  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';

  useEffect(() => {
    if (user && !authLoading) {
      console.log(`${LOG_PREFIX} Setting initial filters from user preferences:`, user);
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
    async function fetchStaffMembers() {
      if (isManagerOrAdmin && db) {
        console.log(`${LOG_PREFIX} Fetching staff members for filter.`);
        setLoadingStaff(true);
        try {
          const usersCollectionRef = collection(db, "users");
          const qUsers = query(usersCollectionRef, where("role", "in", ["staff", "manager", "admin"]));
          const querySnapshot = await getDocs(qUsers);
          const fetchedStaff: AppUser[] = [];
          querySnapshot.forEach((doc) => {
            fetchedStaff.push({ uid: doc.id, ...doc.data() } as AppUser);
          });
          setStaffList(fetchedStaff.sort((a,b) => (a.displayName || "").localeCompare(b.displayName || "")));
          console.log(`${LOG_PREFIX} Fetched ${fetchedStaff.length} staff members.`);
        } catch (error: any) {
          console.error(`${LOG_PREFIX} Error fetching staff members:`, error.message, error.stack);
          toast({ title: "Error", description: "Could not load staff list for filtering. " + error.message, variant: "destructive" });
        } finally {
          setLoadingStaff(false);
        }
      }
    }
    if (user) { 
        fetchStaffMembers();
    }
  }, [user, isManagerOrAdmin, toast, db]);

  const fetchTransactions = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    console.log(`${LOG_PREFIX} fetchTransactions called. Direction: ${direction}. AuthLoading: ${authLoading}, DB: ${!!db}`);
    if (authLoading || !db) return;
    if (!user) {
      setErrorTransactions("User not authenticated. Please log in.");
      setLoadingTransactions(false);
      setCurrentPageTransactions([]);
      return;
    }
    if (user.role === 'admin' && !activeSiteId) {
      console.log(`${LOG_PREFIX} Admin user, no active site. Clearing transactions.`);
      setErrorTransactions(null);
      setCurrentPageTransactions([]);
      setLoadingTransactions(false);
      setFirstTransactionDoc(null);
      setLastTransactionDoc(null);
      setIsLastPage(true);
      setIsFirstPageReached(true);
      return;
    }
    if (!activeSiteId && (user.role === 'staff' || user.role === 'manager')) {
      console.warn(`${LOG_PREFIX} No active site context for ${user.role}. Clearing transactions.`);
      setErrorTransactions("No active site context. Please select a site.");
      setCurrentPageTransactions([]);
      setLoadingTransactions(false);
      setFirstTransactionDoc(null);
      setLastTransactionDoc(null);
      setIsLastPage(true);
      setIsFirstPageReached(true);
      return;
    }
     if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      console.warn(`${LOG_PREFIX} Invalid date range selected. Clearing transactions.`);
      setErrorTransactions("Please select a valid date range.");
      setCurrentPageTransactions([]);
      setLoadingTransactions(false);
      setFirstTransactionDoc(null);
      setLastTransactionDoc(null);
      setIsLastPage(true);
      setIsFirstPageReached(true);
      return;
    }

    if (direction === 'initial') setLoadingTransactions(true);
    if (direction === 'next') setIsLoadingNextPage(true);
    if (direction === 'prev') setIsLoadingPrevPage(true);
    setErrorTransactions(null);
    console.log(`${LOG_PREFIX} Fetching transactions. Site: ${activeSiteId}, Stall: ${activeStallId}, Staff: ${staffFilter}, Date: ${dateRange.from?.toISOString()} to ${dateRange.to?.toISOString()}`);

    const salesCollectionRef = collection(db, "salesTransactions");
    let salesQueryConstraints: QueryConstraint[] = [
      orderBy("transactionDate", "desc"),
      where("isDeleted", "==", false),
    ];

    if (activeSiteId) {
      salesQueryConstraints.push(where("siteId", "==", activeSiteId));
      if (activeStallId) {
        salesQueryConstraints.push(where("stallId", "==", activeStallId));
      }
    }

    if (user.role === 'staff') {
      salesQueryConstraints.push(where("staffId", "==", user.uid));
    } else if (isManagerOrAdmin && staffFilter && staffFilter !== "all") {
      salesQueryConstraints.push(where("staffId", "==", staffFilter));
    }
    
    salesQueryConstraints.push(where("transactionDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))));
    salesQueryConstraints.push(where("transactionDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))));
    
    if (direction === 'next' && lastTransactionDoc) {
      salesQueryConstraints.push(startAfter(lastTransactionDoc));
    } else if (direction === 'prev' && firstTransactionDoc) {
       salesQueryConstraints = salesQueryConstraints.filter(c => c.type !== 'orderBy'); 
       salesQueryConstraints.push(orderBy("transactionDate", "asc")); 
       salesQueryConstraints.push(startAfter(firstTransactionDoc)); // Note: This isFirestore's `endBefore` logic with reversed order. For true prev, need to get docs then reverse.
       // This logic for 'prev' is simplified. For perfect prev page, more complex cursor management or offset might be needed if not using onSnapshot.
       // Since we use onSnapshot for initial/next, this 'prev' will be a one-time fetch.
    }
    
    // Base query without pagination limits for general use, onSnapshot will use its own limiting.
    let q = query(salesCollectionRef, ...salesQueryConstraints);

    // For 'prev', it's simpler to use getDocs and manage state manually.
    if (direction === 'prev') {
        q = query(q, limit(TRANSACTIONS_PER_PAGE)); // Apply limit for getDocs
        try {
            const querySnapshot = await getDocs(q);
            const fetched: SaleTransaction[] = querySnapshot.docs.map(d => ({
                id: d.id, ...d.data(), transactionDate: (d.data().transactionDate as Timestamp).toDate().toISOString()
            } as SaleTransaction)).reverse(); // Reverse to maintain desc display order for prev page

            setCurrentPageTransactions(fetched);
            if (querySnapshot.docs.length > 0) {
                setFirstTransactionDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
                setLastTransactionDoc(querySnapshot.docs[0]);
                 setIsFirstPageReached(fetched.length < TRANSACTIONS_PER_PAGE); // Approx.
            } else {
                setIsFirstPageReached(true);
            }
            setIsLastPage(false);
            console.log(`${LOG_PREFIX} Fetched PREV page. ${fetched.length} transactions.`);
        } catch (e: any) {
            console.error(`${LOG_PREFIX} Error fetching previous page:`, e.message, e.stack);
            setErrorTransactions("Failed to load previous page. " + e.message);
        } finally {
            setIsLoadingPrevPage(false);
            setLoadingTransactions(false); // Ensure main loading is off
        }
        return; // Important: return here to avoid setting up onSnapshot for 'prev'
    }

    // For 'initial' and 'next', use onSnapshot with a limit to check for more pages
    q = query(q, limit(TRANSACTIONS_PER_PAGE + 1));
    console.log(`${LOG_PREFIX} Subscribing to sales query. Constraints count: ${salesQueryConstraints.length}`);
    const unsubscribe = onSnapshot(q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        console.log(`${LOG_PREFIX} Sales snapshot received. Docs: ${snapshot.docs.length}, Empty: ${snapshot.empty}`);
        let fetchedTransactions: SaleTransaction[] = snapshot.docs.map(d => ({
          id: d.id, ...d.data(), transactionDate: (d.data().transactionDate as Timestamp).toDate().toISOString()
        } as SaleTransaction));

        const hasMore = fetchedTransactions.length > TRANSACTIONS_PER_PAGE;
        setIsLastPage(!hasMore);
        if (hasMore) {
          fetchedTransactions.pop(); // Remove the extra item used for "hasMore" check
        }
        console.log(`${LOG_PREFIX} Processed transactions for display: ${fetchedTransactions.length}. HasMore: ${hasMore}`);

        setCurrentPageTransactions(fetchedTransactions);
        
        if (fetchedTransactions.length > 0) {
          if (direction === 'initial') {
             setIsFirstPageReached(true);
          } else if (direction === 'next') {
             setIsFirstPageReached(false);
          }
          setFirstTransactionDoc(snapshot.docs[0]);
          setLastTransactionDoc(snapshot.docs[fetchedTransactions.length -1]); // Use the last doc of the *actual page*
        } else { // No transactions found for this page
          if (direction === 'initial') setIsFirstPageReached(true);
          if (direction === 'next') setIsLastPage(true); 
          setFirstTransactionDoc(null);
          setLastTransactionDoc(null);
        }
        setLoadingTransactions(false);
        setIsLoadingNextPage(false);
        // setIsLoadingPrevPage(false); // Prev page uses getDocs, this isn't strictly needed here for onSnapshot
      },
      (error: any) => {
        console.error(`${LOG_PREFIX} Error fetching sales transactions (onSnapshot):`, error.message, error.stack);
        setErrorTransactions(error.message.includes("requires an index")
          ? `Query requires Firestore index. Details: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load sales history. " + error.message);
        setLoadingTransactions(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
      }
    );
    return unsubscribe; // Return the unsubscribe function for cleanup
  }, [user, activeSiteId, activeStallId, dateRange, staffFilter, isManagerOrAdmin, authLoading, db, lastTransactionDoc, firstTransactionDoc]);

  useEffect(() => {
    const unsubscribePromise = fetchTransactions('initial');
    return () => {
      unsubscribePromise.then(unsub => {
        if (unsub && typeof unsub === 'function') {
          console.log(`${LOG_PREFIX} Unsubscribing from sales listener.`);
          unsub();
        }
      }).catch(err => console.error(`${LOG_PREFIX} Error unsubscribing from sales listener:`, err));
    };
  }, [fetchTransactions]); // Rerun when fetchTransactions (and its dependencies) change


  const handleDeleteSaleWithJustification = async (saleId: string, justification: string) => {
    console.log(`${LOG_PREFIX} Attempting to delete sale: ${saleId} with justification: "${justification}" by user: ${user?.uid}`);
    if (!user || user.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can delete sales.", variant: "destructive" });
      return;
    }
    if (!justification || justification.trim() === "") {
        toast({ title: "Justification Required", description: "Please provide a reason for deleting the sale.", variant: "destructive" });
        return;
    }
    if (!db) {
        console.error(`${LOG_PREFIX} Firestore DB instance not available for delete operation.`);
        toast({ title: "Database Error", description: "Firestore not initialized.", variant: "destructive"});
        return;
    }

    const saleDocRef = doc(db, "salesTransactions", saleId);
    try {
      await updateDoc(saleDocRef, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user.uid,
        deletionJustification: justification.trim(),
      });
      console.log(`${LOG_PREFIX} Sale ${saleId} marked as deleted successfully.`);
      toast({ title: "Sale Deleted", description: "The sale transaction has been marked as deleted." });
      // Data will refresh via onSnapshot because of the `isDeleted` filter in the query.
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error deleting sale ${saleId}:`, error.message, error.stack);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete the sale transaction.", variant: "destructive" });
    }
  };
  
  const pageHeaderDescription = useMemo(() => {
    if (!user) return "View and filter all past sales transactions.";
    if (!activeSite) {
      return user.role === 'staff' ? "Default site needed for context." : "Select a site to view sales history.";
    }
    let desc = `Viewing for Site: "${activeSite.name}"`;
    desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Stalls in Site)";
    desc += ".";
    return desc;
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
      <PageHeader
        title="Sales History"
        description={pageHeaderDescription}
      />
      <SalesHistoryControls
        dateRange={dateRange}
        onDateRangeChange={(newRange) => { setDateRange(newRange); /* fetchTransactions('initial') will be triggered by useCallback dependency change */ }}
        staffFilter={staffFilter}
        onStaffFilterChange={(newFilter) => { setStaffFilter(newFilter); /* fetchTransactions('initial') will be triggered */ }}
        staffMembers={staffList} 
        isLoadingStaff={loadingStaff}
        showStaffFilter={isManagerOrAdmin}
      />
      {loadingTransactions && !isLoadingNextPage && !isLoadingPrevPage && (
         <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading sales history...</p>
        </div>
      )}
      {errorTransactions && (
        <Alert variant="destructive" className="my-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Error Loading Sales</AlertTitle>
          <AlertDescription>{errorTransactions}</AlertDescription>
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
    

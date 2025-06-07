
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
    DocumentSnapshot as FirestoreDocumentSnapshot // Explicit import
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SalesHistoryClientPage:", error);
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
      const fromDate = user.defaultSalesDateRangeFrom && isValid(parseISO(user.defaultSalesDateRangeFrom)) 
                       ? parseISO(user.defaultSalesDateRangeFrom) 
                       : subDays(new Date(), 29);
      const toDate = user.defaultSalesDateRangeTo && isValid(parseISO(user.defaultSalesDateRangeTo))
                     ? parseISO(user.defaultSalesDateRangeTo) 
                     : new Date();
      setDateRange({ from: startOfDay(fromDate), to: endOfDay(toDate) }); // Ensure full day range
      setStaffFilter(user.defaultSalesStaffFilter || "all");
    }
  }, [user, authLoading]);

  useEffect(() => {
    async function fetchStaffMembers() {
      if (isManagerOrAdmin && db) {
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
        } catch (error) {
          console.error("Error fetching staff members:", error);
          toast({ title: "Error", description: "Could not load staff list for filtering.", variant: "destructive" });
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
    if (authLoading || !db) return;
    if (!user) {
      setErrorTransactions("User not authenticated.");
      setLoadingTransactions(false);
      setCurrentPageTransactions([]);
      return;
    }
    if (user.role === 'admin' && !activeSiteId) {
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
      setErrorTransactions("No active site context.");
      setCurrentPageTransactions([]);
      setLoadingTransactions(false);
      setFirstTransactionDoc(null);
      setLastTransactionDoc(null);
      setIsLastPage(true);
      setIsFirstPageReached(true);
      return;
    }
     if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
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
      // For previous, we need to reverse order, limit, then reverse results
      // This part is tricky with onSnapshot. Let's do a getDocs for prev for simplicity.
      // Or, manage an array of firstDocs for each page. For now, getDocs for 'prev'.
       salesQueryConstraints = salesQueryConstraints.filter(c => c.type !== 'orderBy'); // remove existing orderBy
       salesQueryConstraints.push(orderBy("transactionDate", "asc")); // reverse order for prev
       salesQueryConstraints.push(startAfter(firstTransactionDoc)); // this is actually endBefore in reversed logic
       salesQueryConstraints.push(limit(TRANSACTIONS_PER_PAGE));
    } else { // initial or reset
      salesQueryConstraints.push(limit(TRANSACTIONS_PER_PAGE + 1)); // +1 to check if last page
    }

    let q: any; // query type from firebase
    if (direction === 'prev') {
      q = query(salesCollectionRef, ...salesQueryConstraints);
    } else {
      q = query(salesCollectionRef, ...salesQueryConstraints.filter(c => !(c.type === 'limit' && direction !== 'initial')), limit(TRANSACTIONS_PER_PAGE + (direction === 'initial' || direction === 'next' ? 1 : 0) ));
    }
    
    // For 'prev', use getDocs. For 'initial'/'next', use onSnapshot.
    if (direction === 'prev') {
        try {
            const querySnapshot = await getDocs(q);
            const fetched: SaleTransaction[] = querySnapshot.docs.map(d => ({
                id: d.id, ...d.data(), transactionDate: (d.data().transactionDate as Timestamp).toDate().toISOString()
            } as SaleTransaction)).reverse(); // Reverse back to desc order for display

            setCurrentPageTransactions(fetched);
            if (querySnapshot.docs.length > 0) {
                setFirstTransactionDoc(querySnapshot.docs[querySnapshot.docs.length - 1]); // Last doc of reversed is first in original order
                setLastTransactionDoc(querySnapshot.docs[0]); // First doc of reversed is last in original order
            }
            setIsFirstPageReached(querySnapshot.empty); // Or check against a known "very first" doc if we go further
            setIsLastPage(false); // If we went prev, we are not on the last page
        } catch (e: any) {
            console.error("Error fetching previous page:", e);
            setErrorTransactions("Failed to load previous page.");
        } finally {
            setIsLoadingPrevPage(false);
            setLoadingTransactions(false);
        }
        return; // Exit for 'prev' as onSnapshot is not used
    }


    // For 'initial' and 'next', use onSnapshot
    const unsubscribe = onSnapshot(q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        let fetchedTransactions: SaleTransaction[] = snapshot.docs.map(d => ({
          id: d.id, ...d.data(), transactionDate: (d.data().transactionDate as Timestamp).toDate().toISOString()
        } as SaleTransaction));

        const hasMore = fetchedTransactions.length > TRANSACTIONS_PER_PAGE;
        setIsLastPage(!hasMore);
        if (hasMore) {
          fetchedTransactions.pop(); // Remove the extra item
        }

        setCurrentPageTransactions(fetchedTransactions);
        
        if (snapshot.docs.length > 0) {
          if (direction === 'initial') {
             setIsFirstPageReached(true); // Initial load is always the "first" page of current view
          } else if (direction === 'next') {
             setIsFirstPageReached(false);
          }
          setFirstTransactionDoc(snapshot.docs[0]);
          setLastTransactionDoc(snapshot.docs[snapshot.docs.length - (hasMore ? 2 : 1)]);
        } else {
          if (direction === 'initial') setIsFirstPageReached(true);
          if (direction === 'next') setIsLastPage(true); // No more items when fetching next
          setFirstTransactionDoc(null);
          setLastTransactionDoc(null);
        }
        setLoadingTransactions(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
      },
      (error: any) => {
        console.error("Error fetching sales transactions:", error);
        setErrorTransactions(error.message.includes("requires an index")
          ? `Query requires Firestore index. Details: ${error.message.substring(error.message.indexOf('https://'))}`
          : "Failed to load sales history.");
        setLoadingTransactions(false);
        setIsLoadingNextPage(false);
        setIsLoadingPrevPage(false);
      }
    );
    return unsubscribe;
  }, [user, activeSiteId, activeStallId, dateRange, staffFilter, isManagerOrAdmin, authLoading, db, lastTransactionDoc, firstTransactionDoc]);

  useEffect(() => {
    const unsubscribePromise = fetchTransactions('initial');
    return () => {
      unsubscribePromise.then(unsub => {
        if (unsub && typeof unsub === 'function') {
          unsub();
        }
      });
    };
  }, [fetchTransactions]);


  const handleDeleteSaleWithJustification = async (saleId: string, justification: string) => {
    if (!user || user.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can delete sales.", variant: "destructive" });
      return;
    }
    if (!justification || justification.trim() === "") {
        toast({ title: "Justification Required", description: "Please provide a reason for deleting the sale.", variant: "destructive" });
        return;
    }
    if (!db) {
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
      toast({ title: "Sale Deleted", description: "The sale transaction has been marked as deleted." });
      // Data will refresh via onSnapshot if the item was on the current page and isDeleted filter is applied
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete the sale transaction.", variant: "destructive" });
    }
  };
  
  const pageHeaderDescription = useMemo(() => {
    if (!user) return "View and filter all past sales transactions.";
    if (!activeSite) {
      return user.role === 'staff' ? "Default site needed." : "Select site.";
    }
    let desc = `Viewing for Site: "${activeSite.name}"`;
    desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Stalls)";
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
        onDateRangeChange={(newRange) => { setDateRange(newRange); fetchTransactions('initial'); }}
        staffFilter={staffFilter}
        onStaffFilterChange={(newFilter) => { setStaffFilter(newFilter); fetchTransactions('initial'); }}
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
    

    
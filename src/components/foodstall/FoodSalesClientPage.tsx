
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FoodSaleTransaction } from "@/types/food";
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
  endBefore
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, CalendarIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodSalesTable } from "./FoodSalesTable";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

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

export default function FoodSalesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [sales, setSales] = useState<FoodSaleTransaction[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [errorSales, setErrorSales] = useState<string | null>(null);
  
  const pageCursors = useRef<{
    first: DocumentSnapshot<DocumentData> | null;
    last: DocumentSnapshot<DocumentData> | null;
  }>({ first: null, last: null });

  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSales = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db || !user || !activeSiteId) {
      if (!authLoading) setLoadingSales(false);
      return;
    }
     if (!activeStallId && user.role !== 'admin') {
        if (!authLoading) setLoadingSales(false);
        return;
    }
    
    setLoadingSales(true);
    setErrorSales(null);
    console.log(`${LOG_PREFIX} Fetching sales. Direction: ${direction}, Site: ${activeSiteId}, Stall: ${activeStallId}`);

    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let qConstraints: QueryConstraint[] = [
      where("siteId", "==", activeSiteId),
    ];
    if (activeStallId) {
      qConstraints.push(where("stallId", "==", activeStallId));
    }
    
    if (direction === 'next' && pageCursors.current.last) {
        qConstraints.push(orderBy("saleDate", "desc"));
        qConstraints.push(startAfter(pageCursors.current.last));
        qConstraints.push(limit(SALES_PER_PAGE + 1));
    } else if (direction === 'prev' && pageCursors.current.first) {
        qConstraints.push(orderBy("saleDate", "desc"));
        qConstraints.push(endBefore(pageCursors.current.first));
        qConstraints.push(limit(SALES_PER_PAGE));
    } else { // Initial fetch
        qConstraints.push(orderBy("saleDate", "desc"));
        qConstraints.push(limit(SALES_PER_PAGE + 1));
    }


    try {
      const q = query(salesCollectionRef, ...qConstraints);
      const querySnapshot = await getDocs(q);
      let fetchedSales: FoodSaleTransaction[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        saleDate: (doc.data().saleDate as Timestamp).toDate(),
      } as FoodSaleTransaction));

      const hasMore = fetchedSales.length > SALES_PER_PAGE;
      if (hasMore) {
        fetchedSales.pop();
      }
      
      setSales(fetchedSales);
      
      if (querySnapshot.docs.length > 0) {
        pageCursors.current.first = querySnapshot.docs[0];
        pageCursors.current.last = querySnapshot.docs[fetchedSales.length - 1];

        if (direction === 'initial') {
            setIsLastPage(!hasMore);
            setCurrentPage(1);
        } else if (direction === 'next') {
            setIsLastPage(!hasMore);
            if(fetchedSales.length > 0) setCurrentPage(prev => prev + 1);
        } else if (direction === 'prev') {
            setIsLastPage(false);
            setCurrentPage(prev => Math.max(1, prev - 1));
        }
      } else {
        if (direction === 'next') setIsLastPage(true);
        if (direction === 'prev') setCurrentPage(1); 
        if (direction === 'initial') {
            setIsLastPage(true);
            setCurrentPage(1);
        }
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedSales.length} sales. HasMore: ${hasMore}`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching sales:`, error.message, error.stack);
      setErrorSales(error.message || "Failed to load sales.");
    } finally {
      setLoadingSales(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, db]);

  useEffect(() => {
    document.title = "Food Stall Sales - StallSync";
    pageCursors.current = { first: null, last: null }; // Reset cursors on context change
    fetchSales('initial');
    return () => { document.title = "StallSync - Stock Management"; }
  }, [user, activeSiteId, activeStallId, fetchSales]);

  const handleNextPage = () => {
    if (!isLastPage) {
      fetchSales('next');
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      fetchSales('prev');
    }
  };
  
  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  
  if (!user) {
    return (
      <Alert variant="destructive">
        <Info className="h-4 w-4" />
        <AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>
          Could not verify user. Please try logging in again.
        </AlertDescription>
      </Alert>
    )
  }

  if (!activeSiteId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>
          Please select an active site from the header to view food stall sales.
        </AlertDescription>
      </Alert>
    );
  }

  if (!activeStallId && user.role !== 'admin') {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Stall Selection Required</AlertTitle>
        <AlertDescription>
          Food stall data is specific to each stall. Please select a specific stall from the header menu to view its sales history. Admins may view all stalls by not selecting one.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {user.role === 'admin' && !activeStallId && (
          <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" />
            <AlertTitle>Viewing All Stalls</AlertTitle>
            <AlertDescription>
                You are currently viewing aggregated sales data for all stalls within this site.
            </AlertDescription>
        </Alert>
      )}
      {loadingSales && sales.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading sales...</p></div>
      )}
      {errorSales && (<Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Sales</AlertTitle><AlertDescription>{errorSales}</AlertDescription></Alert>)}
      {!loadingSales && !errorSales && (
        <FoodSalesTable 
          sales={sales} 
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
          isLastPage={isLastPage}
          isFirstPage={currentPage === 1}
          currentPage={currentPage}
          isLoading={loadingSales}
        />
      )}
    </div>
  );
}

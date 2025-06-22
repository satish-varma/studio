
"use client";

import { useState, useEffect, useCallback } from "react";
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
  DocumentData
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
const SALES_PER_PAGE = 15;

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
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subDays(new Date(), 29)),
    to: endOfDay(new Date()),
  });

  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSales = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db) return;

    if (!user || !activeSiteId || !activeStallId) {
      setErrorSales("Please select an active site and stall to view sales.");
      setLoadingSales(false);
      setSales([]);
      return;
    }
     if (!dateRange?.from || !dateRange?.to) {
      setErrorSales("Please select a valid date range.");
      setLoadingSales(false);
      setSales([]);
      return;
    }

    setLoadingSales(true);
    setErrorSales(null);
    console.log(`${LOG_PREFIX} Fetching sales. Direction: ${direction}, Site: ${activeSiteId}, Stall: ${activeStallId}`);

    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let qConstraints: QueryConstraint[] = [
      where("siteId", "==", activeSiteId),
      where("stallId", "==", activeStallId),
      where("saleDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))),
      where("saleDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))),
    ];
    
    qConstraints.push(orderBy("saleDate", "desc"));

    if (direction === 'next' && lastVisibleDoc) {
      qConstraints.push(startAfter(lastVisibleDoc));
    } else if (direction === 'prev' && firstVisibleDoc) {
      qConstraints.pop(); // remove orderBy desc
      qConstraints.push(orderBy("saleDate", "asc"));
      qConstraints.push(startAfter(firstVisibleDoc));
    }
    
    qConstraints.push(limit(SALES_PER_PAGE + (direction !== 'prev' ? 1 : 0) ));

    try {
      const q = query(salesCollectionRef, ...qConstraints);
      const querySnapshot = await getDocs(q);
      let fetchedSales: FoodSaleTransaction[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        saleDate: (doc.data().saleDate as Timestamp).toDate().toISOString(),
      } as FoodSaleTransaction));

      if (direction === 'prev') {
        fetchedSales.reverse();
      }
      
      const hasMore = fetchedSales.length > SALES_PER_PAGE && direction !== 'prev';
      if (hasMore) {
        fetchedSales.pop();
      }

      setSales(fetchedSales);
      
      if (querySnapshot.docs.length > 0) {
        setFirstVisibleDoc(querySnapshot.docs[0]);
        setLastVisibleDoc(querySnapshot.docs[fetchedSales.length - 1]);
        if(direction === 'initial') {
            setIsFirstPageReached(true);
            setIsLastPage(!hasMore);
            setCurrentPage(1);
        } else if (direction === 'next') {
            setIsFirstPageReached(false);
            setIsLastPage(!hasMore);
            if(fetchedSales.length > 0) setCurrentPage(prev => prev + 1);
        } else if (direction === 'prev') {
            setIsLastPage(false);
            setCurrentPage(prev => Math.max(1, prev - 1));
            setIsFirstPageReached(fetchedSales.length < SALES_PER_PAGE || currentPage === 1);
        }
      } else {
        if (direction === 'initial') {
             setIsFirstPageReached(true);
             setIsLastPage(true);
             setCurrentPage(1);
        } else if (direction === 'next') setIsLastPage(true);
        else if (direction === 'prev') setIsFirstPageReached(true);
        setFirstVisibleDoc(null);
        setLastVisibleDoc(null);
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedSales.length} sales. HasMore: ${hasMore}`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching sales:`, error.message, error.stack);
      setErrorSales(error.message || "Failed to load sales.");
    } finally {
      setLoadingSales(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, dateRange, lastVisibleDoc, firstVisibleDoc, db, currentPage]);

  const handleFilterChange = () => {
    setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
    fetchSales('initial');
  };

  useEffect(() => {
    document.title = "Food Stall Sales - StallSync";
    handleFilterChange(); // Initial fetch
  }, [dateRange]); // Refetch when dateRange changes

  
  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  if (!user || !activeSiteId || !activeStallId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Context Required</AlertTitle>
        <AlertDescription>
          Please select an active site and stall from the header to view or manage food stall sales.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-card shadow-sm">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={"outline"} className={cn("w-full sm:w-[260px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (dateRange.to ? (`${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} disabled={(date) => date > new Date() || date < new Date("2020-01-01")}/>
          </PopoverContent>
        </Popover>
      </div>

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
    </div>
  );
}


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
  endBefore,
  limitToLast
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, DollarSign } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodSalesTable } from "./FoodSalesTable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";

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
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [sales, setSales] = useState<FoodSaleTransaction[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [errorSales, setErrorSales] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilterOption>('this_month');
  const [totalSalesAmount, setTotalSalesAmount] = useState(0);
  
  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSales = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db || !user) {
      if (!authLoading) setLoadingSales(false);
      return;
    }
    if (user.role !== 'admin' && !activeSiteId) {
        if (!authLoading) setLoadingSales(false);
        return;
    }
    
    setLoadingSales(true);
    if(direction === 'initial') {
        setTotalSalesAmount(0);
    }
    setErrorSales(null);
    console.log(`${LOG_PREFIX} Fetching sales. Direction: ${direction}, Site: ${activeSiteId}, Stall: ${activeStallId}, DateFilter: ${dateFilter}`);

    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let qConstraints: QueryConstraint[] = [];
    
    if (activeSiteId) {
        qConstraints.push(where("siteId", "==", activeSiteId));
        if (activeStallId) {
          qConstraints.push(where("stallId", "==", activeStallId));
        }
    }
    
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = endOfDay(now);

    switch (dateFilter) {
        case 'today':
            startDate = startOfDay(now);
            break;
        case 'last_7_days':
            startDate = startOfDay(subDays(now, 6));
            break;
        case 'this_month':
            startDate = startOfMonth(now);
            break;
        case 'all_time':
            startDate = null; 
            endDate = null;   
            break;
    }

    if(startDate) qConstraints.push(where("saleDate", ">=", Timestamp.fromDate(startDate)));
    if(endDate) qConstraints.push(where("saleDate", "<=", Timestamp.fromDate(endDate)));
    
    if (direction === 'prev' && firstVisibleDoc) {
        qConstraints.push(orderBy("saleDate", "desc"));
        qConstraints.push(endBefore(firstVisibleDoc));
        qConstraints.push(limitToLast(SALES_PER_PAGE));
    } else { // initial or next
        qConstraints.push(orderBy("saleDate", "desc"));
        if (direction === 'next' && lastVisibleDoc) {
            qConstraints.push(startAfter(lastVisibleDoc));
        }
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

      const hasMore = direction !== 'prev' && fetchedSales.length > SALES_PER_PAGE;
      if (hasMore) {
        fetchedSales.pop();
      }
      
      setSales(fetchedSales);
      
      if(direction === 'initial') {
        const totalQueryConstraints = qConstraints.filter(c => c.type !== 'limit' && c.type !== 'startAfter' && c.type !== 'endBefore' && c.type !== 'limitToLast');
        const totalQuery = query(salesCollectionRef, ...totalQueryConstraints);
        const totalSnapshot = await getDocs(totalQuery);
        const total = totalSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalAmount || 0), 0);
        setTotalSalesAmount(total);
      }
      
      if (querySnapshot.docs.length > 0) {
        setFirstVisibleDoc(querySnapshot.docs[0]);
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - (hasMore ? 2 : 1)]);
        if (direction === 'next') setCurrentPage(prev => prev + 1);
        if (direction === 'prev') setCurrentPage(prev => Math.max(1, prev - 1));
        setIsLastPage(!hasMore);
      } else {
        if (direction === 'next') setIsLastPage(true);
        if (direction === 'initial') {
            setTotalSalesAmount(0);
            setIsLastPage(true);
        }
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedSales.length} sales. HasMore: ${hasMore}`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching sales:`, error.message, error.stack);
      setErrorSales(error.message || "Failed to load sales.");
    } finally {
      setLoadingSales(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, db, dateFilter, firstVisibleDoc, lastVisibleDoc]);

  // Effect for initial fetch and filter changes
  useEffect(() => {
    document.title = "Food Stall Sales - StallSync";
    setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
    fetchSales('initial');
    return () => { document.title = "StallSync - Stock Management"; }
  }, [dateFilter, user, activeSiteId, activeStallId, fetchSales]);


  const handleDateFilterChange = (filter: DateFilterOption) => {
    setDateFilter(filter);
  };

  const handleNextPage = () => {
    fetchSales('next');
  };

  const handlePrevPage = () => {
    fetchSales('prev');
  };
  
  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  
  if (!user) {
    return (
      <Alert variant="destructive">
        <Info className="h-4 w-4" /><AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>Could not verify user. Please try logging in again.</AlertDescription>
      </Alert>
    )
  }

  if (user.role !== 'admin' && !activeSiteId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle>
        <AlertDescription>Please select an active site from the header to view food stall sales.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {user.role === 'admin' && !activeSiteId && (
          <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Viewing All Sites</AlertTitle>
            <AlertDescription>You are currently viewing aggregated sales data for all stalls across all sites.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <CardTitle>Filter & Summary</CardTitle>
              <CardDescription className="mt-1">
                Total sales for the selected period.
                {!activeSiteId ? ' (Aggregated for all sites)' : !activeStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Total Sales</p>
              <p className="text-2xl font-bold">
                {loadingSales && totalSalesAmount === 0 ? <Loader2 className="h-6 w-6 animate-spin"/> : `₹${totalSalesAmount.toFixed(2)}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 border-t pt-4">
          <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('today')}>Today</Button>
          <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('last_7_days')}>Last 7 Days</Button>
          <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('this_month')}>This Month</Button>
          <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('all_time')}>All Time</Button>
        </CardContent>
      </Card>

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

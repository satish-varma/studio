
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoodItemExpense } from "@/types/food";
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
  limitToLast
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ListFilter, CalendarIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodExpensesTable } from "./FoodExpensesTable";
import { foodExpenseCategories } from "@/types/food";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

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

export default function FoodExpensesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<FoodItemExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [errorExpenses, setErrorExpenses] = useState<string | null>(null);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(subDays(new Date(), 29)), // Default to last 30 days
    to: endOfDay(new Date()),
  });
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchExpenses = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db) return;

    if (!user) {
      setErrorExpenses("User not authenticated. Please log in.");
      setLoadingExpenses(false);
      setExpenses([]);
      return;
    }
    if (!activeSiteId || !activeStallId) {
      setErrorExpenses("Please select an active site and stall to view expenses.");
      setLoadingExpenses(false);
      setExpenses([]);
      return;
    }
     if (!dateRange?.from || !dateRange?.to) {
      setErrorExpenses("Please select a valid date range.");
      setLoadingExpenses(false);
      setExpenses([]);
      return;
    }

    setLoadingExpenses(true);
    setErrorExpenses(null);
    console.log(`${LOG_PREFIX} Fetching expenses. Direction: ${direction}, Site: ${activeSiteId}, Stall: ${activeStallId}, Category: ${categoryFilter}`);

    const expensesCollectionRef = collection(db, "foodItemExpenses");
    let qConstraints: QueryConstraint[] = [
      where("siteId", "==", activeSiteId),
      where("stallId", "==", activeStallId),
      where("purchaseDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))),
      where("purchaseDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))),
    ];

    if (categoryFilter !== "all") {
      qConstraints.push(where("category", "==", categoryFilter));
    }
    
    if (direction === 'prev' && firstVisibleDoc) {
        qConstraints.push(orderBy("purchaseDate", "desc"));
        qConstraints.push(endBefore(firstVisibleDoc));
        qConstraints.push(limitToLast(EXPENSES_PER_PAGE));
    } else { // initial or next
        qConstraints.push(orderBy("purchaseDate", "desc"));
        if (direction === 'next' && lastVisibleDoc) {
            qConstraints.push(startAfter(lastVisibleDoc));
        }
        qConstraints.push(limit(EXPENSES_PER_PAGE + 1));
    }
    
    try {
      const q = query(expensesCollectionRef, ...qConstraints);
      const querySnapshot = await getDocs(q);
      let fetchedExpenses: FoodItemExpense[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(),
      } as FoodItemExpense));
      
      const hasMore = direction !== 'prev' && fetchedExpenses.length > EXPENSES_PER_PAGE;
      if (hasMore) {
        fetchedExpenses.pop();
      }

      setExpenses(fetchedExpenses);
      
      if (querySnapshot.docs.length > 0) {
        setFirstVisibleDoc(querySnapshot.docs[0]);
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - (hasMore ? 2 : 1)]);
        if (direction === 'next') setCurrentPage(prev => prev + 1);
        if (direction === 'prev') setCurrentPage(prev => Math.max(1, prev - 1));
        setIsLastPage(!hasMore);
      } else {
        if (direction === 'next') setIsLastPage(true);
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedExpenses.length} expenses. HasMore: ${hasMore}`);

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching expenses:`, error.message, error.stack);
      setErrorExpenses(error.message || "Failed to load expenses.");
    } finally {
      setLoadingExpenses(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, dateRange, categoryFilter, db, firstVisibleDoc, lastVisibleDoc]);

  // Effect for initial fetch and filter changes
  useEffect(() => {
    document.title = "Food Stall Expenses - StallSync";
    // Reset pagination state when filters change, then fetch
    setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
    fetchExpenses('initial');
    return () => { document.title = "StallSync - Stock Management"; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, categoryFilter, user, activeSiteId, activeStallId]);


  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategoryFilter(newCategory);
  };

  const handleNextPage = () => {
    fetchExpenses('next');
  };

  const handlePrevPage = () => {
    fetchExpenses('prev');
  };
  
  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  if (!user || !activeSiteId || !activeStallId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Context Required</AlertTitle>
        <AlertDescription>
          Please select an active site and stall from the header to view or manage food stall expenses.
        </AlertDescription>
      </Alert>
    );
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-card shadow-sm">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn("w-full sm:w-[260px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                  </>
                ) : (
                  format(dateRange.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleDateRangeChange}
              numberOfMonths={2}
              disabled={(date) => date > new Date() || date < new Date("2020-01-01")}
            />
          </PopoverContent>
        </Popover>

        <Select value={categoryFilter} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-full sm:w-[220px] bg-input">
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
      </div>

      {loadingExpenses && expenses.length === 0 && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading expenses...</p>
        </div>
      )}
      {errorExpenses && (
        <Alert variant="destructive">
          <Info className="h-4 w-4" />
          <AlertTitle>Error Loading Expenses</AlertTitle>
          <AlertDescription>{errorExpenses}</AlertDescription>
        </Alert>
      )}
      {!loadingExpenses && !errorExpenses && (
        <FoodExpensesTable 
          expenses={expenses} 
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
          isLastPage={isLastPage}
          isFirstPage={currentPage === 1}
          currentPage={currentPage}
          itemsPerPage={EXPENSES_PER_PAGE}
          isLoading={loadingExpenses}
        />
      )}
    </div>
  );
}

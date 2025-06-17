
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
  DocumentData
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
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [isFirstPageReached, setIsFirstPageReached] = useState(true);
  const [currentPage, setCurrentPage] = useState(1); // For display logic, not directly for query

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
    
    // Order by purchaseDate descending for all query types
    qConstraints.push(orderBy("purchaseDate", "desc"));

    if (direction === 'next' && lastVisibleDoc) {
      qConstraints.push(startAfter(lastVisibleDoc));
    } else if (direction === 'prev' && firstVisibleDoc) {
      qConstraints.reverse(); // Reverse all constraints to get to orderBy
      const orderByDescIndex = qConstraints.findIndex(c => c.type === 'orderBy' && (c as any)._field.segments.join('/') === 'purchaseDate' && (c as any)._direction === 'desc');
      if (orderByDescIndex !== -1) {
        qConstraints[orderByDescIndex] = orderBy("purchaseDate", "asc");
      }
      qConstraints.push(startAfter(firstVisibleDoc)); // Firestore's 'endBefore' logic with reversed order
    }
    
    qConstraints.push(limit(EXPENSES_PER_PAGE + (direction !== 'prev' ? 1 : 0) )); // +1 for hasMore check, except for prev

    try {
      const q = query(expensesCollectionRef, ...qConstraints);
      const querySnapshot = await getDocs(q);
      let fetchedExpenses: FoodItemExpense[] = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(), // Convert Firestore Timestamp to Date
      } as FoodItemExpense));

      if (direction === 'prev') {
        fetchedExpenses.reverse(); // Reverse back to desc for display
      }
      
      const hasMore = fetchedExpenses.length > EXPENSES_PER_PAGE && direction !== 'prev';
      if (hasMore) {
        fetchedExpenses.pop(); // Remove the extra item
      }

      setExpenses(fetchedExpenses);
      
      if (querySnapshot.docs.length > 0) {
        setFirstVisibleDoc(querySnapshot.docs[0]);
        setLastVisibleDoc(querySnapshot.docs[fetchedExpenses.length - 1]);
        if(direction === 'initial') {
            setIsFirstPageReached(true);
            setIsLastPage(!hasMore);
            setCurrentPage(1);
        } else if (direction === 'next') {
            setIsFirstPageReached(false);
            setIsLastPage(!hasMore);
            if(fetchedExpenses.length > 0) setCurrentPage(prev => prev + 1);
        } else if (direction === 'prev') {
            setIsLastPage(false);
            setCurrentPage(prev => Math.max(1, prev - 1));
            // A more accurate check for isFirstPageReached when going prev:
            // If this prev fetch brought less than EXPENSES_PER_PAGE, or if current page is 1
             setIsFirstPageReached(fetchedExpenses.length < EXPENSES_PER_PAGE || currentPage === 1);
        }
      } else { // No data for this page
        if (direction === 'initial') {
             setIsFirstPageReached(true);
             setIsLastPage(true);
             setCurrentPage(1);
        } else if (direction === 'next') {
            setIsLastPage(true); // No more items
        } else if (direction === 'prev') {
            setIsFirstPageReached(true);
        }
        setFirstVisibleDoc(null);
        setLastVisibleDoc(null);
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedExpenses.length} expenses. HasMore: ${hasMore}`);

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching expenses:`, error.message, error.stack);
      setErrorExpenses(error.message || "Failed to load expenses.");
    } finally {
      setLoadingExpenses(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, dateRange, categoryFilter, lastVisibleDoc, firstVisibleDoc, db, currentPage]);

  useEffect(() => {
    document.title = "Food Stall Expenses - StallSync";
    fetchExpenses('initial');
     return () => { document.title = "StallSync - Stock Management"; }
  }, [fetchExpenses]); // fetchExpenses is memoized with its deps

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
    // Reset pagination for new filter
    setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategoryFilter(newCategory);
     setFirstVisibleDoc(null);
    setLastVisibleDoc(null);
    setCurrentPage(1);
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
          onNextPage={() => fetchExpenses('next')}
          onPrevPage={() => fetchExpenses('prev')}
          isLastPage={isLastPage}
          isFirstPage={isFirstPageReached}
          currentPage={currentPage}
          itemsPerPage={EXPENSES_PER_PAGE}
          isLoading={loadingExpenses} // Pass overall loading state for table skeleton
        />
      )}
    </div>
  );
}



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
import { Loader2, Info, ListFilter, DollarSign, SheetIcon, Download } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay, startOfMonth, startOfWeek } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { getAuth } from "firebase/auth";


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
const firebaseAuth = getAuth(getApp());

type GoogleSheetAction = "importFoodExpenses" | "exportFoodExpenses";

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time';

export default function FoodExpensesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<FoodItemExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [errorExpenses, setErrorExpenses] = useState<string | null>(null);
  
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [totalExpensesAmount, setTotalExpensesAmount] = useState(0);

  const [firstVisibleDoc, setFirstVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [isLastPage, setIsLastPage] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [showSheetIdDialog, setShowSheetIdDialog] = useState(false);
  const [sheetIdInputValue, setSheetIdInputValue] = useState("");
  const [currentSheetAction, setCurrentSheetAction] = useState<GoogleSheetAction | null>(null);
  const [isProcessingSheets, setIsProcessingSheets] = useState(false);

  const fetchExpenses = useCallback(async (direction: 'initial' | 'next' | 'prev' = 'initial') => {
    if (authLoading || !db || !user || !activeSiteId) {
      if (!authLoading) setLoadingExpenses(false);
      return;
    }
    if (!activeStallId && user.role !== 'admin') {
        if (!authLoading) setLoadingExpenses(false);
        return;
    }
    
    setLoadingExpenses(true);
    if(direction === 'initial') {
        setTotalExpensesAmount(0); // Reset total on new filter fetch
    }
    setErrorExpenses(null);
    console.log(`${LOG_PREFIX} Fetching expenses. Direction: ${direction}, Site: ${activeSiteId}, Stall: ${activeStallId}, Category: ${categoryFilter}, DateFilter: ${dateFilter}`);

    const expensesCollectionRef = collection(db, "foodItemExpenses");
    let qConstraints: QueryConstraint[] = [
      where("siteId", "==", activeSiteId),
    ];
    if (activeStallId) {
        qConstraints.push(where("stallId", "==", activeStallId));
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
            startDate = null; // No start date filter
            endDate = null;   // No end date filter
            break;
    }

    if(startDate) qConstraints.push(where("purchaseDate", ">=", Timestamp.fromDate(startDate)));
    if(endDate) qConstraints.push(where("purchaseDate", "<=", Timestamp.fromDate(endDate)));


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

      // Recalculate total only on initial load for a filter set
      if(direction === 'initial') {
        const totalQueryConstraints = qConstraints.filter(c => c.type !== 'limit' && c.type !== 'startAfter' && c.type !== 'endBefore' && c.type !== 'limitToLast');
        const totalQuery = query(expensesCollectionRef, ...totalQueryConstraints);
        const totalSnapshot = await getDocs(totalQuery);
        const total = totalSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalCost || 0), 0);
        setTotalExpensesAmount(total);
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
            setTotalExpensesAmount(0);
            setIsLastPage(true);
        }
      }
      console.log(`${LOG_PREFIX} Fetched ${fetchedExpenses.length} expenses. HasMore: ${hasMore}`);

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching expenses:`, error.message, error.stack);
      setErrorExpenses(error.message || "Failed to load expenses.");
    } finally {
      setLoadingExpenses(false);
    }
  }, [authLoading, user, activeSiteId, activeStallId, dateFilter, categoryFilter, db, firstVisibleDoc, lastVisibleDoc]);

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
  }, [dateFilter, categoryFilter, user, activeSiteId, activeStallId]);


  const callGoogleSheetsApi = async (action: GoogleSheetAction, sheetId?: string) => {
    setIsProcessingSheets(true);
    // Logic from settings page, simplified
    try {
        if (!firebaseAuth.currentUser) throw new Error("User not authenticated.");
        const idToken = await firebaseAuth.currentUser.getIdToken();
        const response = await fetch('/api/google-sheets-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ action, dataType: 'foodExpenses', sheetId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Failed with status ${response.status}`);
        toast({ title: "Success", description: result.message });
        if (action === 'importFoodExpenses') fetchExpenses('initial'); // Refresh data on import
    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setIsProcessingSheets(false);
        setShowSheetIdDialog(false);
    }
  };

  const openSheetIdPrompt = (action: GoogleSheetAction) => {
      setCurrentSheetAction(action);
      setShowSheetIdDialog(true);
  };
  
  const handleSheetIdDialogSubmit = () => {
    if (currentSheetAction) {
      if (currentSheetAction.includes('import') && !sheetIdInputValue) {
        toast({ title: "Sheet ID Required", description: "Please enter a Sheet ID for import.", variant: "default" });
        return;
      }
      callGoogleSheetsApi(currentSheetAction, sheetIdInputValue.trim() || undefined);
    }
  };


  const handleDateFilterChange = (filter: DateFilterOption) => {
    setDateFilter(filter);
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
          Please select an active site from the header to view food stall expenses.
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
          Food stall data is specific to each stall. Please select a specific stall from the header menu to view its expenses. Admins may view all stalls by not selecting one.
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
                {user.role === 'admin' && !activeStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <p className="text-2xl font-bold">
                {loadingExpenses && totalExpensesAmount === 0 ? <Loader2 className="h-6 w-6 animate-spin"/> : `₹${totalExpensesAmount.toFixed(2)}`}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-2 border-t pt-4">
          <div className="flex-1 flex flex-wrap gap-2">
            <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('today')}>Today</Button>
            <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('last_7_days')}>Last 7 Days</Button>
            <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('this_month')}>This Month</Button>
            <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => handleDateFilterChange('all_time')}>All Time</Button>
          </div>
          <Select value={categoryFilter} onValueChange={handleCategoryChange}>
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
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => openSheetIdPrompt("importFoodExpenses")} disabled={isProcessingSheets}>
            {isProcessingSheets ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}
            Import from Sheets
          </Button>
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => openSheetIdPrompt("exportFoodExpenses")} disabled={isProcessingSheets}>
             {isProcessingSheets ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <SheetIcon className="mr-2 h-4 w-4"/>}
            Export to Sheets
          </Button>
        </CardFooter>
      </Card>

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
      
       <AlertDialog open={showSheetIdDialog} onOpenChange={setShowSheetIdDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
                {currentSheetAction?.toLowerCase().includes('import') ? 'Enter Google Sheet ID for Import' : 'Enter Google Sheet ID for Export (Optional)'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentSheetAction?.toLowerCase().includes('import')
                ? `Please provide the ID of the Google Sheet you want to import food expenses from. The sheet must have the correct headers.`
                : `If you provide a Sheet ID, food expenses will be exported to that specific sheet. If left blank, a new Google Sheet will be created.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Input
              value={sheetIdInputValue}
              onChange={(e) => setSheetIdInputValue(e.target.value)}
              placeholder="Google Sheet ID (e.g., 123abCDefg...)"
              className="bg-input"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowSheetIdDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSheetIdDialogSubmit}>
              Proceed
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

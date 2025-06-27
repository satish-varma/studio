
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ReportControls } from "@/components/reports/ReportControls";
import type { FoodSaleTransaction, FoodItemExpense, AppUser } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay, isValid, format } from "date-fns";
import {
    getFirestore,
    collection,
    query,
    where,
    Timestamp,
    getDocs,
    QueryConstraint
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info, IndianRupee, ShoppingBag, TrendingUp, AlertTriangle, ListOrdered, Percent } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";

const LOG_PREFIX = "[FoodStallReportClientPage]";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
} else {
  db = getFirestore(getApp());
}


interface ReportSummaryData {
  totalSalesAmount: number;
  totalExpensesAmount: number;
  netProfit: number;
  numberOfSales: number;
  numberOfExpenses: number;
  totalCommission: number;
  totalHungerboxSales: number;
}

interface TopExpenseCategory {
  category: string;
  totalCost: number;
  count: number;
}

const MAX_TOP_CATEGORIES = 10;

export default function FoodStallReportClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return { from: subDays(startOfDay(today), 29), to: endOfDay(today) };
  });

  const [summaryData, setSummaryData] = useState<ReportSummaryData | null>(null);
  const [topExpenseCategories, setTopExpenseCategories] = useState<TopExpenseCategory[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);

  const fetchReportData = useCallback(async () => {
    console.log(`${LOG_PREFIX} fetchReportData called. AuthLoading: ${authLoading}, User: ${!!user}`);
    if (authLoading || !db) return;

    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      setErrorReport("Access Denied: You do not have permission to view reports.");
      setLoadingReport(false);
      return;
    }

    if (!activeSiteId) {
      setErrorReport("Please select an active site to view the report.");
      setLoadingReport(false);
      setSummaryData(null);
      setTopExpenseCategories([]);
      return;
    }

    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      setErrorReport("Please select a valid date range.");
      setLoadingReport(false);
      setSummaryData(null);
      setTopExpenseCategories([]);
      return;
    }
    
    console.log(`${LOG_PREFIX} Starting report data fetch. Site: ${activeSiteId}, Stall: ${activeStallId || 'All'}, DateRange: ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`);
    setLoadingReport(true);
    setErrorReport(null);
    setSummaryData(null);
    setTopExpenseCategories([]);

    try {
      const fromDate = Timestamp.fromDate(startOfDay(dateRange.from));
      const toDate = Timestamp.fromDate(endOfDay(dateRange.to));

      // --- Fetch Sales ---
      const salesCollectionRef = collection(db, "foodSaleTransactions");
      let salesQueryConstraints: QueryConstraint[] = [
        where("siteId", "==", activeSiteId),
        where("saleDate", ">=", fromDate),
        where("saleDate", "<=", toDate),
      ];
      if (activeStallId) {
        salesQueryConstraints.push(where("stallId", "==", activeStallId));
      }
      const salesQuery = query(salesCollectionRef, ...salesQueryConstraints);
      const salesSnapshot = await getDocs(salesQuery);
      const salesTransactions = salesSnapshot.docs.map(doc => doc.data() as FoodSaleTransaction);
      
      let totalSalesAmount = 0;
      let totalHungerboxSales = 0;

      salesTransactions.forEach(sale => {
        totalSalesAmount += sale.totalAmount;
        if (sale.breakfast) totalHungerboxSales += sale.breakfast.hungerbox || 0;
        if (sale.lunch) totalHungerboxSales += sale.lunch.hungerbox || 0;
        if (sale.dinner) totalHungerboxSales += sale.dinner.hungerbox || 0;
        if (sale.snacks) totalHungerboxSales += sale.snacks.hungerbox || 0;
      });
      const totalCommission = totalHungerboxSales * 0.20;
      console.log(`${LOG_PREFIX} Fetched ${salesTransactions.length} sales transactions, total amount: ${totalSalesAmount}, commission: ${totalCommission}`);


      // --- Fetch Expenses ---
      const expensesCollectionRef = collection(db, "foodItemExpenses");
      let expensesQueryConstraints: QueryConstraint[] = [
        where("siteId", "==", activeSiteId),
        where("purchaseDate", ">=", fromDate),
        where("purchaseDate", "<=", toDate),
      ];
      if (activeStallId) {
        expensesQueryConstraints.push(where("stallId", "==", activeStallId));
      }
      const expensesQuery = query(expensesCollectionRef, ...expensesQueryConstraints);
      const expensesSnapshot = await getDocs(expensesQuery);
      const expenseTransactions = expensesSnapshot.docs.map(doc => doc.data() as FoodItemExpense);
      
      const expenseCategoryAggregation = new Map<string, { totalCost: number; count: number }>();
      let totalExpensesAmount = 0;

      expenseTransactions.forEach(expense => {
        totalExpensesAmount += expense.totalCost;
        const existing = expenseCategoryAggregation.get(expense.category);
        if (existing) {
          existing.totalCost += expense.totalCost;
          existing.count += 1;
        } else {
          expenseCategoryAggregation.set(expense.category, { totalCost: expense.totalCost, count: 1 });
        }
      });
      console.log(`${LOG_PREFIX} Fetched ${expenseTransactions.length} expense items, total amount: ${totalExpensesAmount}`);

      const aggregatedCategories: TopExpenseCategory[] = Array.from(expenseCategoryAggregation.entries())
        .map(([category, data]) => ({ category, ...data }));
      const sortedTopCategories = aggregatedCategories
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, MAX_TOP_CATEGORIES);
        
      setTopExpenseCategories(sortedTopCategories);
      console.log(`${LOG_PREFIX} Aggregated top expense categories. Count: ${sortedTopCategories.length}`);
      
      setSummaryData({
        totalSalesAmount,
        totalExpensesAmount,
        netProfit: totalSalesAmount - totalCommission - totalExpensesAmount,
        numberOfSales: salesTransactions.length,
        numberOfExpenses: expenseTransactions.length,
        totalCommission,
        totalHungerboxSales,
      });

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching report data:`, error.message, error.stack);
      setErrorReport("Failed to load report data. " + error.message);
    } finally {
      setLoadingReport(false);
    }
  }, [user, activeSiteId, activeStallId, dateRange, authLoading, db]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Analyze your food stall's financial performance.";
    if (!activeSite) {
        return user.role === 'admin' ? "Admin: Select a site to view its report." : "Manager: Select one of your managed sites to view its report.";
    }
    let desc = `Financial performance report for Site: "${activeSite.name}"`;
    desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Food Stalls in Site)";
    desc += ".";
    return desc;
  }, [user, activeSite, activeStall]);
  
  const summaryCards = summaryData ? [
    { title: "Gross Sales", value: `₹${summaryData.totalSalesAmount.toFixed(2)}`, icon: IndianRupee, color: "text-green-600", description: `Across ${summaryData.numberOfSales} sale days` },
    { title: "Aggregator Commission", value: `- ₹${summaryData.totalCommission.toFixed(2)}`, icon: Percent, color: "text-orange-500", description: `20% on ₹${summaryData.totalHungerboxSales.toFixed(2)} (HungerBox)` },
    { title: "Total Expenses", value: `- ₹${summaryData.totalExpensesAmount.toFixed(2)}`, icon: ShoppingBag, color: "text-red-500", description: `From ${summaryData.numberOfExpenses} expense records` },
    { title: "Net Profit", value: `₹${summaryData.netProfit.toFixed(2)}`, icon: TrendingUp, color: summaryData.netProfit >= 0 ? "text-accent" : "text-destructive", description: "Gross Sales - Commission - Expenses" },
  ] : [];


  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }

  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Food Stall Reports" description="Access to reports is restricted." />
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Access Denied</AlertTitle><AlertDescription>You do not have permission to view reports.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Food Stall Financial Report" description={pageHeaderDescription} />
      <ReportControls dateRange={dateRange} onDateRangeChange={setDateRange} />

      {loadingReport ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading report data...</p></div>
      ) : errorReport ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Report</AlertTitle><AlertDescription>{errorReport}</AlertDescription></Alert>
      ) : !activeSiteId ? (
        <Alert variant="default" className="border-primary/50"><Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle><AlertDescription>{pageHeaderDescription}</AlertDescription></Alert>
      ) : summaryData && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {summaryCards.map((stat) => (
                <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                    </CardHeader>
                    <CardContent className="pt-3">
                    <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                    {stat.description && <CardDescription className="text-xs text-muted-foreground pt-1">{stat.description}</CardDescription>}
                    </CardContent>
                </Card>
              ))}
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center"><ListOrdered className="mr-2 h-5 w-5 text-primary" />Top Expense Categories</CardTitle>
              <CardDescription>Highest spending categories for the selected period.</CardDescription>
            </CardHeader>
            <CardContent>
              {topExpenseCategories.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Category</TableHead><TableHead># of Expenses</TableHead><TableHead className="text-right">Total Cost</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {topExpenseCategories.map((cat) => (
                        <TableRow key={cat.category}>
                          <TableCell className="font-medium">{cat.category}</TableCell>
                          <TableCell>{cat.count}</TableCell>
                          <TableCell className="text-right">₹{cat.totalCost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No expense data found for this period.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

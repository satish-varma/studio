

"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { FoodSaleTransaction, FoodItemExpense, AppUser, StaffDetails, Holiday, StaffAttendance, SalaryPayment, Site, Stall } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay, isValid, format, startOfMonth, getDaysInMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from "date-fns";
import {
    getFirestore,
    collection,
    query,
    where,
    Timestamp,
    getDocs,
    QueryConstraint,
    onSnapshot,
    orderBy
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info, IndianRupee, ShoppingBag, TrendingUp, AlertTriangle, ListOrdered, Percent, Users, Calendar as CalendarIcon, Building, Table as TableIcon } from "lucide-react";
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
import { useUserManagement } from "@/hooks/use-user-management";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { foodSaleTypes, type FoodSaleType } from "@/types/food";
import FoodStallPivotReportClientPage from "@/components/foodstall/FoodStallPivotReportClientPage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


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
  totalSalaryExpense: number;
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
  const { user, activeSiteId, loading: authLoading } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({ from: startOfMonth(new Date()), to: endOfDay(new Date()) }));
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [stallFilter, setStallFilter] = useState<string>('all');
  const [saleTypeFilter, setSaleTypeFilter] = useState<FoodSaleType | 'all'>('all');

  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);
  const [summaryData, setSummaryData] = useState<ReportSummaryData | null>(null);
  const [topExpenseCategories, setTopExpenseCategories] = useState<TopExpenseCategory[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  
  const {
    users: allStaff,
    sites: allSites,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
  } = useUserManagement();

  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;

  useEffect(() => {
    if (effectiveSiteId && db) {
        const q = query(collection(db, "stalls"), where("siteId", "==", effectiveSiteId), orderBy("name"));
        const unsub = onSnapshot(q, (snapshot) => {
            setStallsForSite(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall)));
        });
        return () => unsub();
    } else {
        setStallsForSite([]);
    }
  }, [effectiveSiteId]);

  const isHoliday = useCallback((date: Date, holidays: Holiday[], staffSiteId?: string | null) => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    const dateStr = date.toISOString().split('T')[0];
    const isGlobalHoliday = holidays.some(h => h.date === dateStr && h.siteId === null);
    if (isGlobalHoliday) return true;
    if (staffSiteId) {
      const isSiteHoliday = holidays.some(h => h.date === dateStr && h.siteId === staffSiteId);
      if (isSiteHoliday) return true;
    }
    return false;
  }, []);

  const calculateWorkingDays = useCallback((start: Date, end: Date, holidays: Holiday[], staff?: AppUser) => {
      let workingDays = 0;
      let currentDate = new Date(start);
      while(currentDate <= end) {
          if (!isHoliday(currentDate, holidays, staff?.defaultSiteId)) {
              workingDays++;
          }
          currentDate.setDate(currentDate.getDate() + 1);
      }
      return workingDays;
  }, [isHoliday]);


  const fetchReportData = useCallback(async () => {
    if (authLoading || userManagementLoading || !db) return;
    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      setErrorReport("Access Denied: You do not have permission to view reports.");
      setLoadingReport(false);
      return;
    }
    
    setLoadingReport(true);
    setErrorReport(null);

    try {
      const fromTimestamp = dateRange?.from ? Timestamp.fromDate(startOfDay(dateRange.from)) : null;
      const toTimestamp = dateRange?.to ? Timestamp.fromDate(endOfDay(dateRange.to)) : null;

      let baseQuery: QueryConstraint[] = [];
      if (effectiveSiteId) baseQuery.push(where("siteId", "==", effectiveSiteId));
      if (stallFilter !== 'all') baseQuery.push(where("stallId", "==", stallFilter));

      // --- Fetch Sales ---
      let salesQueryConstraints: QueryConstraint[] = [...baseQuery];
      if (saleTypeFilter !== 'all') salesQueryConstraints.push(where("saleType", "==", saleTypeFilter));
      if (fromTimestamp) salesQueryConstraints.push(where("saleDate", ">=", fromTimestamp));
      if (toTimestamp) salesQueryConstraints.push(where("saleDate", "<=", toTimestamp));
      
      const salesQuery = query(collection(db, "foodSaleTransactions"), ...salesQueryConstraints);
      const salesSnapshot = await getDocs(salesQuery);
      const salesTransactions = salesSnapshot.docs.map(doc => doc.data() as FoodSaleTransaction);
      
      let totalSalesAmount = 0; let totalCommission = 0; let totalHungerboxSales = 0;
      salesTransactions.forEach(sale => {
        totalSalesAmount += sale.totalAmount;
        const hungerboxAmount = sale.hungerboxSales || 0;
        totalHungerboxSales += hungerboxAmount;
        const commissionRate = sale.saleType === 'MRP' ? 0.08 : 0.18;
        totalCommission += hungerboxAmount * commissionRate;
      });

      // --- Fetch Expenses ---
      let expensesQueryConstraints: QueryConstraint[] = [...baseQuery];
      if (fromTimestamp) expensesQueryConstraints.push(where("purchaseDate", ">=", fromTimestamp));
      if (toTimestamp) expensesQueryConstraints.push(where("purchaseDate", "<=", toTimestamp));
      const expensesQuery = query(collection(db, "foodItemExpenses"), ...expensesQueryConstraints);
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
      const sortedTopCategories = Array.from(expenseCategoryAggregation.entries())
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, MAX_TOP_CATEGORIES);
      setTopExpenseCategories(sortedTopCategories);
      
      setSummaryData({
        totalSalesAmount, totalExpensesAmount, totalSalaryExpense: 0, // Salary is complex, handle separately or remove from here
        netProfit: totalSalesAmount - totalCommission - totalExpensesAmount, // Temp profit
        numberOfSales: salesTransactions.length, numberOfExpenses: expenseTransactions.length,
        totalCommission, totalHungerboxSales,
      });

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching report data:`, error);
      setErrorReport("Failed to load report data. " + error.message);
    } finally {
      setLoadingReport(false);
    }
  }, [user, dateRange, authLoading, userManagementLoading, db, effectiveSiteId, stallFilter, saleTypeFilter]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);
  
  useEffect(() => {
    if (siteFilter === 'all') {
      setStallFilter('all');
    }
  }, [siteFilter]);

  const datePresets = [
    { label: "This Month", value: 'this_month' },
    { label: "Last 7 Days", value: 'last_7_days' },
    { label: "Last Month", value: 'last_month' },
    { label: "Last 3 Months", value: 'last_3_months' },
    { label: "All Time", value: 'all_time' },
  ];
  
  const handleSetDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date | undefined, to: Date | undefined = endOfDay(now);

    switch (preset) {
        case 'this_month': from = startOfMonth(now); break;
        case 'last_7_days': from = startOfDay(subDays(now, 6)); break;
        case 'last_month': from = startOfMonth(subMonths(now, 1)); to = endOfMonth(subMonths(now, 1)); break;
        case 'last_3_months': from = startOfMonth(subMonths(now, 2)); break;
        case 'all_time': from = undefined; to = undefined; break;
        default: from = undefined; to = undefined;
    }
    setDateRange({ from, to });
    setTempDateRange({ from, to });
    setIsDatePickerOpen(false);
  };
  
  const applyDateFilter = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };
  
  const summaryCards = summaryData ? [
    { title: "Gross Sales", value: `₹${summaryData.totalSalesAmount.toFixed(2)}`, icon: IndianRupee, color: "text-green-600", description: `Across ${summaryData.numberOfSales} sale records` },
    { title: "Aggregator Commission", value: `- ₹${summaryData.totalCommission.toFixed(2)}`, icon: Percent, color: "text-orange-500", description: `On ₹${summaryData.totalHungerboxSales.toFixed(2)} (HungerBox)` },
    { title: "Food & Material Expenses", value: `- ₹${summaryData.totalExpensesAmount.toFixed(2)}`, icon: ShoppingBag, color: "text-red-500", description: `From ${summaryData.numberOfExpenses} expense records` },
    // Salary card removed for simplicity and performance
    { title: "Net Profit", value: `₹${summaryData.netProfit.toFixed(2)}`, icon: TrendingUp, color: summaryData.netProfit >= 0 ? "text-accent" : "text-destructive", description: "Net Sales - Expenses" },
  ] : [];


  if (authLoading || userManagementLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }

  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Food Stall Financial Report" description="Access to reports is restricted." />
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Access Denied</AlertTitle><AlertDescription>You do not have permission to view reports.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <PageHeader 
        title="Food Stall Financial Report" 
        description="Analyze your food stall's performance with detailed sales, expense, and profit reports."
        actions={
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline"><TableIcon className="mr-2 h-4 w-4"/> View Pivot Report</Button>
            </DialogTrigger>
            <DialogContent className="max-w-7xl h-[90vh]">
              <DialogHeader>
                <DialogTitle>Sales Pivot Report</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto">
                <FoodStallPivotReportClientPage />
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <Card>
          <CardHeader><CardTitle>Report Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {datePresets.map(({label, value}) => (
                    <Button key={value} variant="outline" onClick={() => handleSetDatePreset(value)}>
                        {label}
                    </Button>
                ))}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                    <PopoverTrigger asChild>
                    <Button
                        id="reportDateRange" variant={"outline"}
                        className={cn("w-full sm:w-[280px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? ( dateRange.to ? (
                            <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </>
                        ) : ( format(dateRange.from, "LLL dd, y") )
                        ) : ( <span>Pick a date range</span> )}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 flex" align="start">
                        <div className="p-2 border-r">
                            <div className="flex flex-col items-stretch gap-1">
                                {datePresets.map(({label, value}) => (
                                    <Button key={value} variant="ghost" className="justify-start" onClick={() => handleSetDatePreset(value)}>{label}</Button>
                                ))}
                            </div>
                        </div>
                        <div className="p-2">
                            <div className="flex justify-between items-center mb-2 px-2">
                                <p className="text-sm font-medium">Start: <span className="font-normal text-muted-foreground">{tempDateRange?.from ? format(tempDateRange.from, 'PPP') : '...'}</span></p>
                                <p className="text-sm font-medium">End: <span className="font-normal text-muted-foreground">{tempDateRange?.to ? format(tempDateRange.to, 'PPP') : '...'}</span></p>
                            </div>
                            <Calendar
                                initialFocus mode="range" defaultMonth={tempDateRange?.from}
                                selected={tempDateRange} onSelect={setTempDateRange} numberOfMonths={2}
                                disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                                <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button>
                                <Button onClick={applyDateFilter}>Apply</Button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {user.role === 'admin' && (
                    <Select value={siteFilter} onValueChange={setSiteFilter}>
                        <SelectTrigger className="bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="All Sites" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
                {effectiveSiteId && (
                     <Select value={stallFilter} onValueChange={setStallFilter}>
                        <SelectTrigger className="bg-input" disabled={stallsForSite.length === 0}><Building className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="All Stalls" /></SelectTrigger>
                        <SelectContent><SelectItem value="all">All Stalls</SelectItem>{stallsForSite.map(stall => <SelectItem key={stall.id} value={stall.id}>{stall.name}</SelectItem>)}</SelectContent>
                    </Select>
                )}
                <Select value={saleTypeFilter} onValueChange={(v) => setSaleTypeFilter(v as any)}>
                    <SelectTrigger className="bg-input"><ListOrdered className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="All Sale Types" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Sale Types</SelectItem>{foodSaleTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
            </div>
          </CardContent>
      </Card>


      {loadingReport ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading report data...</p></div>
      ) : errorReport ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Report</AlertTitle><AlertDescription>{errorReport}</AlertDescription></Alert>
      ) : !activeSiteId && user.role !== 'admin' ? (
        <Alert variant="default" className="border-primary/50"><Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle><AlertDescription>Please select a site to view the report.</AlertDescription></Alert>
      ) : summaryData && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
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

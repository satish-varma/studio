
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { FoodSaleTransaction, FoodItemExpense, AppUser, StaffDetails, Holiday, StaffAttendance, SalaryPayment } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay, isValid, format, startOfMonth, getDaysInMonth, endOfMonth, subMonths } from "date-fns";
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
import { Loader2, Info, IndianRupee, ShoppingBag, TrendingUp, AlertTriangle, ListOrdered, Percent, Users, Calendar as CalendarIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";


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
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth();
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return { from: startOfDay(subDays(today, 6)), to: endOfDay(today) };
  });
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [summaryData, setSummaryData] = useState<ReportSummaryData | null>(null);
  const [topExpenseCategories, setTopExpenseCategories] = useState<TopExpenseCategory[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  
  const {
    users: staffList,
    staffDetails: staffDetailsMap,
    loading: userManagementLoading,
  } = useUserManagement();

  const isHoliday = useCallback((date: Date, holidays: Holiday[], staffSiteId?: string | null) => {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { return true; }
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
    
    const isAdminViewAll = user.role === 'admin' && !activeSiteId;
    if (!activeSiteId && !isAdminViewAll) {
      setErrorReport("Please select an active site to view the report.");
      setLoadingReport(false);
      return;
    }
    
    setLoadingReport(true);
    setErrorReport(null);

    try {
      const fromDate = dateRange?.from ? Timestamp.fromDate(startOfDay(dateRange.from)) : null;
      const toDate = dateRange?.to ? Timestamp.fromDate(endOfDay(dateRange.to)) : null;

      const baseSiteQuery: QueryConstraint[] = [];
      if (activeSiteId) {
        baseSiteQuery.push(where("siteId", "==", activeSiteId));
        if (activeStallId) {
            baseSiteQuery.push(where("stallId", "==", activeStallId));
        }
      }

      // --- Fetch Sales ---
      let salesQueryConstraints: QueryConstraint[] = [...baseSiteQuery];
      // THE FIX: Only add date constraints if fromDate and toDate are not null.
      if (fromDate) salesQueryConstraints.push(where("saleDate", ">=", fromDate));
      if (toDate) salesQueryConstraints.push(where("saleDate", "<=", toDate));
      
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
      let expensesQueryConstraints: QueryConstraint[] = [...baseSiteQuery];
      if (fromDate) expensesQueryConstraints.push(where("purchaseDate", ">=", fromDate));
      if (toDate) expensesQueryConstraints.push(where("purchaseDate", "<=", toDate));
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
      
      // --- Fetch and Calculate Salary Expense ---
      let totalSalaryExpense = 0;
      if (dateRange?.from && dateRange.to) { // Only calculate salary for specific date ranges
        const relevantStaff = activeSiteId ? staffList.filter(s => s.defaultSiteId === activeSiteId) : staffList;
        if (relevantStaff.length > 0) {
          const uidsBatches: string[][] = [];
          for (let i = 0; i < relevantStaff.length; i += 30) {
              uidsBatches.push(relevantStaff.map(s => s.uid).slice(i, i + 30));
          }

          const monthOfStartDate = startOfMonth(dateRange.from);
          const holidaysQuery = query(collection(db, "holidays"), where("date", ">=", format(monthOfStartDate, 'yyyy-MM-dd')), where("date", "<=", format(endOfMonth(dateRange.to), 'yyyy-MM-dd')));
          
          const attendancePromises = uidsBatches.map(batch => getDocs(query(collection(db, "staffAttendance"), 
              where("staffUid", "in", batch), 
              where("date", ">=", format(dateRange.from!, 'yyyy-MM-dd')), 
              where("date", "<=", format(dateRange.to!, 'yyyy-MM-dd'))
          )));

          const [holidaysSnapshot, ...attendanceSnapshots] = await Promise.all([getDocs(holidaysQuery), ...attendancePromises]);
          const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
          const attendanceByStaff = new Map<string, { present: number, halfDay: number }>();
          attendanceSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
              const att = doc.data() as StaffAttendance;
              const current = attendanceByStaff.get(att.staffUid) || { present: 0, halfDay: 0 };
              if (att.status === 'Present') current.present++;
              if (att.status === 'Half-day') current.halfDay++;
              attendanceByStaff.set(att.staffUid, current);
          }));

          relevantStaff.forEach(staff => {
              const details = staffDetailsMap.get(staff.uid);
              if (details?.salary) {
                  const monthWorkingDays = calculateWorkingDays(startOfMonth(dateRange.from!), endOfMonth(dateRange.from!), holidays, staff);
                  if (monthWorkingDays > 0) {
                      const perDaySalary = details.salary / monthWorkingDays;
                      const attendance = attendanceByStaff.get(staff.uid) || { present: 0, halfDay: 0 };
                      const earnedDays = attendance.present + (attendance.halfDay * 0.5);
                      totalSalaryExpense += earnedDays * perDaySalary;
                  }
              }
          });
        }
      } else { // All Time
          const allPayments = await getDocs(query(collection(db, "salaryPayments")));
          totalSalaryExpense = allPayments.docs.reduce((sum, doc) => sum + (doc.data() as SalaryPayment).amountPaid, 0);
      }
      
      // --- Final Calculation ---
      setSummaryData({
        totalSalesAmount, totalExpensesAmount, totalSalaryExpense,
        netProfit: totalSalesAmount - totalCommission - totalExpensesAmount - totalSalaryExpense,
        numberOfSales: salesTransactions.length, numberOfExpenses: expenseTransactions.length,
        totalCommission, totalHungerboxSales,
      });

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching report data:`, error.message, error.stack);
      setErrorReport("Failed to load report data. " + error.message);
    } finally {
      setLoadingReport(false);
    }
  }, [user, activeSiteId, activeStallId, dateRange, authLoading, userManagementLoading, db, staffList, staffDetailsMap, calculateWorkingDays]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Analyze your food stall's financial performance.";
    let desc = `Financial performance report for `;
    if (activeSite) {
        desc += `Site: "${activeSite.name}"`;
        desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Food Stalls in Site)";
    } else if (user.role === 'admin') {
        desc += "All Sites";
    } else { // Manager with no site selected
        desc = "Manager: Select one of your managed sites to view its report.";
    }
    return desc + ".";
  }, [user, activeSite, activeStall]);

  const datePresets = [
    { label: "Last 7 Days", value: 'last_7_days' },
    { label: "This Month", value: 'this_month' },
    { label: "Last Month", value: 'last_month' },
    { label: "Last 2 Months", value: 'last_2_months' },
    { label: "Last 3 Months", value: 'last_3_months' },
    { label: "All Time", value: 'all_time' },
  ];
  
  const handleSetDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date | undefined, to: Date | undefined = endOfDay(now);

    switch (preset) {
        case 'last_7_days': from = startOfDay(subDays(now, 6)); break;
        case 'this_month': from = startOfMonth(now); break;
        case 'last_month': from = startOfMonth(subMonths(now, 1)); to = endOfMonth(subMonths(now, 1)); break;
        case 'last_2_months': from = startOfMonth(subMonths(now, 1)); break;
        case 'last_3_months': from = startOfMonth(subMonths(now, 2)); break;
        case 'all_time': from = undefined; to = undefined; break;
        default: from = undefined; to = undefined;
    }
    setDateRange({ from, to });
  };
  
  const applyDateFilter = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };
  
  const summaryCards = summaryData ? [
    { title: "Gross Sales", value: `₹${summaryData.totalSalesAmount.toFixed(2)}`, icon: IndianRupee, color: "text-green-600", description: `Across ${summaryData.numberOfSales} sale days` },
    { title: "Aggregator Commission", value: `- ₹${summaryData.totalCommission.toFixed(2)}`, icon: Percent, color: "text-orange-500", description: `On ₹${summaryData.totalHungerboxSales.toFixed(2)} (HungerBox)` },
    { title: "Food & Material Expenses", value: `- ₹${summaryData.totalExpensesAmount.toFixed(2)}`, icon: ShoppingBag, color: "text-red-500", description: `From ${summaryData.numberOfExpenses} expense records` },
    { title: "Staff Salary Expense", value: `- ₹${summaryData.totalSalaryExpense.toFixed(2)}`, icon: Users, color: "text-red-600", description: `Earned salary for this period` },
    { title: "Net Profit", value: `₹${summaryData.netProfit.toFixed(2)}`, icon: TrendingUp, color: summaryData.netProfit >= 0 ? "text-accent" : "text-destructive", description: "Net Sales - Expenses - Salary" },
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
       <PageHeader title="Food Stall Financial Report" description="Analyze your food stall's performance with detailed sales, expense, and profit reports." />
      <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-start gap-4 p-4 border rounded-lg bg-card shadow">
        <div className="flex flex-wrap items-center gap-2">
            {datePresets.map(({label, value}) => (
                <Button key={value} variant="outline" onClick={() => handleSetDatePreset(value)}>{label}</Button>
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
      </div>

      {loadingReport ? (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading report data...</p></div>
      ) : errorReport ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error Loading Report</AlertTitle><AlertDescription>{errorReport}</AlertDescription></Alert>
      ) : !activeSiteId && user.role !== 'admin' ? (
        <Alert variant="default" className="border-primary/50"><Info className="h-4 w-4" /><AlertTitle>Site Selection Required</AlertTitle><AlertDescription>{pageHeaderDescription}</AlertDescription></Alert>
      ) : summaryData && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

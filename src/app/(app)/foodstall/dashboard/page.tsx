"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingBag, Utensils, ArrowRight, LineChart, ClipboardList, Loader2, Info, Percent, BarChart, Soup, Truck, WalletCards, Users as UsersIcon, IndianRupee, Building, Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, QueryConstraint, getDocs } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { startOfDay, endOfDay, subDays, startOfMonth, getDaysInMonth, endOfMonth, startOfWeek, endOfWeek, isValid, subMonths } from "date-fns";
import type { FoodItemExpense, FoodSaleTransaction, StaffAttendance, Holiday, StaffDetails, AppUser, SalaryPayment, Site } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUserManagement } from "@/hooks/use-user-management";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { Label } from "@/components/ui/label";


let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in FoodStallDashboardPage:", error);
  }
} else {
  db = getFirestore(getApp());
}

type SummaryViewOption = 'by_expense_category' | 'by_payment_method' | 'by_vendor' | 'by_expense_payment_method';

interface ExpenseCategorySummary {
  category: string;
  totalCost: number;
}

interface PaymentMethodSummary {
  method: string;
  totalAmount: number;
}

interface VendorSummary {
  vendor: string;
  totalCost: number;
}

interface ExpensePaymentMethodSummary {
  method: string;
  totalCost: number;
}

interface SalesData {
  grossMrp: number;
  grossNonMrp: number;
  netMrp: number;
  netNonMrp: number;
}


export default function FoodStallDashboardPage() {
  const { user, activeSiteId, loading: authLoading } = useAuth();
  const { users: allStaff, sites: allSites, staffDetails: staffDetailsMap, loading: userManagementLoading } = useUserManagement();
  
  const [salesData, setSalesData] = useState<SalesData>({ grossMrp: 0, grossNonMrp: 0, netMrp: 0, netNonMrp: 0 });
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalSalaryExpense, setTotalSalaryExpense] = useState(0);
  
  const [expenseSummary, setExpenseSummary] = useState<ExpenseCategorySummary[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentMethodSummary[]>([]);
  const [vendorSummary, setVendorSummary] = useState<VendorSummary[]>([]);
  const [expensePaymentSummary, setExpensePaymentSummary] = useState<ExpensePaymentMethodSummary[]>([]);


  const [loading, setLoading] = useState(true);
  const [summaryView, setSummaryView] = useState<SummaryViewOption>('by_expense_category');

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date())
  }));
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  const [siteFilter, setSiteFilter] = useState<string>('all');
  
  const effectiveSiteId = user?.role === 'admin' ? (siteFilter === 'all' ? null : siteFilter) : activeSiteId;

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
  
  const datePresets = [
    { label: "Today", value: 'today' },
    { label: "This Week", value: 'this_week' },
    { label: "This Month", value: 'this_month' },
    { label: "Last Month", value: 'last_month' },
    { label: "All Time", value: 'all_time' },
  ];
  
  const handleSetDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date | undefined, to: Date | undefined = endOfDay(now);

    switch (preset) {
        case 'today': from = startOfDay(now); break;
        case 'this_week': from = startOfWeek(now); break;
        case 'this_month': from = startOfMonth(now); break;
        case 'last_month': from = startOfMonth(subMonths(now, 1)); to = endOfMonth(subMonths(now, 1)); break;
        case 'all_time': from = undefined; to = undefined; break;
        default: from = undefined; to = undefined;
    }
    setTempDateRange({ from, to });
  };
  
  const applyDateFilter = () => {
    setDateRange(tempDateRange);
    setIsDatePickerOpen(false);
  };


 useEffect(() => {
    if (authLoading || userManagementLoading || !db || !user) {
        if (!authLoading && !userManagementLoading) setLoading(false);
        return;
    }
    
    if (user.role === 'manager' && !activeSiteId) {
        setLoading(false);
        setSalesData({ grossMrp: 0, grossNonMrp: 0, netMrp: 0, netNonMrp: 0 }); 
        setTotalExpenses(0); 
        setTotalSalaryExpense(0);
        return;
    }
    
    setLoading(true);

    const fromTimestamp = dateRange?.from ? Timestamp.fromDate(startOfDay(dateRange.from)) : null;
    const toTimestamp = dateRange?.to ? Timestamp.fromDate(endOfDay(dateRange.to)) : null;
    
    const unsubs: (()=>void)[] = [];

    // --- Sales Fetching ---
    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let salesQueryConstraints: QueryConstraint[] = [];
    if (effectiveSiteId) salesQueryConstraints.push(where("siteId", "==", effectiveSiteId));
    if (fromTimestamp) salesQueryConstraints.push(where("saleDate", ">=", fromTimestamp));
    if (toTimestamp) salesQueryConstraints.push(where("saleDate", "<=", toTimestamp));
    const salesQuery = query(salesCollectionRef, ...salesQueryConstraints);
    unsubs.push(onSnapshot(salesQuery, (snapshot) => {
        let newSalesData: SalesData = { grossMrp: 0, grossNonMrp: 0, netMrp: 0, netNonMrp: 0 };
        const paymentMethodTotals: Record<string, number> = { HungerBox: 0, UPI: 0 };
        snapshot.forEach(doc => {
            const sale = doc.data() as FoodSaleTransaction;
            const saleHungerbox = sale.hungerboxSales || 0;
            const saleUpi = sale.upiSales || 0;
            paymentMethodTotals.HungerBox += saleHungerbox;
            paymentMethodTotals.UPI += saleUpi;
            if (sale.saleType === 'MRP') {
              newSalesData.grossMrp += sale.totalAmount;
              newSalesData.netMrp += (sale.totalAmount - (saleHungerbox * 0.08));
            } else {
              newSalesData.grossNonMrp += sale.totalAmount;
              newSalesData.netNonMrp += (sale.totalAmount - (saleHungerbox * 0.18));
            }
        });
        setSalesData(newSalesData);
        setPaymentSummary(Object.entries(paymentMethodTotals).map(([method, totalAmount]) => ({ method, totalAmount })));
    }));

    // --- Expenses Fetching ---
    const expensesCollectionRef = collection(db, "foodItemExpenses");
    let expensesQueryConstraints: QueryConstraint[] = [];
    if (effectiveSiteId) expensesQueryConstraints.push(where("siteId", "==", effectiveSiteId));
    if (fromTimestamp) expensesQueryConstraints.push(where("purchaseDate", ">=", fromTimestamp)); 
    if (toTimestamp) expensesQueryConstraints.push(where("purchaseDate", "<=", toTimestamp));     
    const expensesQuery = query(expensesCollectionRef, ...expensesQueryConstraints);
    unsubs.push(onSnapshot(expensesQuery, (snapshot) => {
        let total = 0;
        const categoryTotals: Record<string, number> = {}, vendorTotals: Record<string, number> = {}, expensePaymentMethodTotals: Record<string, number> = {};
        snapshot.forEach(doc => {
            const expense = doc.data() as FoodItemExpense;
            const vendorName = expense.vendor === 'Other' ? (expense.otherVendorDetails || 'Other') : (expense.vendor || 'Unknown');
            total += expense.totalCost;
            categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + expense.totalCost;
            vendorTotals[vendorName] = (vendorTotals[vendorName] || 0) + expense.totalCost;
            const paymentMethodKey = expense.paymentMethod === 'Other' ? (expense.otherPaymentMethodDetails || 'Other') : expense.paymentMethod;
            expensePaymentMethodTotals[paymentMethodKey] = (expensePaymentMethodTotals[paymentMethodKey] || 0) + expense.totalCost;
        });
        setTotalExpenses(total);
        setExpenseSummary(Object.entries(categoryTotals).map(([category, totalCost]) => ({ category, totalCost })));
        setVendorSummary(Object.entries(vendorTotals).map(([vendor, totalCost]) => ({ vendor, totalCost })));
        setExpensePaymentSummary(Object.entries(expensePaymentMethodTotals).map(([method, totalCost]) => ({ method, totalCost })));
    }));

    // --- Salary Fetching (Refactored for correctness) ---
    const fetchSalaryData = async () => {
        // Filter staff based on the effectiveSiteId for accurate cost attribution
        const relevantStaff = effectiveSiteId 
            ? allStaff.filter(s => s.defaultSiteId === effectiveSiteId || (s.role === 'manager' && s.managedSiteIds?.includes(effectiveSiteId)))
            : allStaff;

        if (relevantStaff.length === 0) {
            setTotalSalaryExpense(0);
            return;
        }

        const staffUids = relevantStaff.map(s => s.uid);
        const uidsBatches: string[][] = [];
        for (let i = 0; i < staffUids.length; i += 30) {
            uidsBatches.push(staffUids.slice(i, i + 30));
        }

        if (!dateRange?.from || !dateRange.to) { // All Time
            const paymentPromises = uidsBatches.map(batch => 
                getDocs(query(collection(db, "salaryPayments"), where("staffUid", "in", batch)))
            );
            const paymentsSnapshots = await Promise.all(paymentPromises);
            const allPayments = paymentsSnapshots.flatMap(s => s.docs);
            const totalPaid = allPayments.reduce((sum, doc) => sum + (doc.data() as SalaryPayment).amountPaid, 0);
            setTotalSalaryExpense(totalPaid);
        } else { // Specific Date Range
            const startDate = dateRange.from;
            const endDate = dateRange.to;
            const monthOfStartDate = startOfMonth(startDate);

            const holidaysQuery = query(collection(db, "holidays"), where("date", ">=", format(monthOfStartDate, 'yyyy-MM-dd')), where("date", "<=", format(endOfMonth(monthOfStartDate), 'yyyy-MM-dd')));
            
            const attendancePromises = uidsBatches.map(batch => {
                const attendanceQuery = query(collection(db, "staffAttendance"), 
                    where("staffUid", "in", batch), 
                    where("date", ">=", format(startDate, 'yyyy-MM-dd')), 
                    where("date", "<=", format(endDate, 'yyyy-MM-dd'))
                );
                return getDocs(attendanceQuery);
            });

            const [holidaysSnapshot, ...attendanceSnapshots] = await Promise.all([
                getDocs(holidaysQuery),
                ...attendancePromises
            ]);

            const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
            const attendanceByStaff = new Map<string, { present: number, halfDay: number }>();
            
            attendanceSnapshots.flat().forEach(snapshot => snapshot.forEach(doc => {
                const att = doc.data() as StaffAttendance;
                const current = attendanceByStaff.get(att.staffUid) || { present: 0, halfDay: 0 };
                if (att.status === 'Present') current.present++;
                if (att.status === 'Half-day') current.halfDay++;
                attendanceByStaff.set(att.staffUid, current);
            }));

            let totalSalary = 0;
            relevantStaff.forEach(staff => {
                const details = staffDetailsMap.get(staff.uid);
                if (details?.salary) {
                    const monthWorkingDays = calculateWorkingDays(monthOfStartDate, endOfMonth(monthOfStartDate), holidays, staff);
                    if (monthWorkingDays > 0) {
                        const perDaySalary = details.salary / monthWorkingDays;
                        const attendance = attendanceByStaff.get(staff.uid) || { present: 0, halfDay: 0 };
                        const earnedDays = attendance.present + (attendance.halfDay * 0.5);
                        totalSalary += earnedDays * perDaySalary;
                    }
                }
            });
            setTotalSalaryExpense(totalSalary);
        }
    };

    fetchSalaryData().finally(() => setLoading(false));

    return () => { unsubs.forEach(unsub => unsub()); };
  }, [effectiveSiteId, authLoading, user, dateRange, allStaff, staffDetailsMap, userManagementLoading, calculateWorkingDays]);

  const totalSalesWithDeductions = salesData.netMrp + salesData.netNonMrp;
  const netProfit = totalSalesWithDeductions - totalExpenses - totalSalaryExpense;

  const quickNavItems = [
    { title: "Manage Expenses", description: "Track all your purchases and operational costs.", href: "/foodstall/expenses", icon: ShoppingBag, cta: "View Expenses", disabled: false },
    { title: "Manage Sales", description: "Record and view all sales transactions.", href: "/foodstall/sales", icon: DollarSign, cta: "View Sales", disabled: false },
    { title: "View Financial Reports", description: "Analyze financial performance with detailed reports.", href: "/foodstall/reports", icon: LineChart, cta: "View Reports", disabled: false },
  ];

  if (authLoading || userManagementLoading) {
    return (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading...</p>
        </div>
    );
  }

  if (user?.role === 'manager' && !activeSiteId) {
    return (
        <div className="space-y-6">
            <PageHeader title="Food Stall Dashboard" description="Overview of your food stall's financial health and operations." />
            <Alert variant="default" className="border-primary/50">
                <Info className="h-4 w-4" /><AlertTitle>Site Context Required</AlertTitle>
                <AlertDescription>Please select an active site from the header to view the Food Stall Dashboard.</AlertDescription>
            </Alert>
        </div>
    );
  }

  const renderPivotTable = () => {
    switch(summaryView) {
        case 'by_expense_category':
            return (
                <Table>
                    <TableHeader><TableRow><TableHead>Expense Category</TableHead><TableHead className="text-right">Total Cost</TableHead></TableRow></TableHeader>
                    <TableBody>
                        {expenseSummary.length > 0 ? expenseSummary.sort((a,b) => b.totalCost - a.totalCost).map(item => (
                            <TableRow key={item.category}><TableCell>{item.category}</TableCell><TableCell className="text-right font-medium">₹{item.totalCost.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No expense data for this period.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            );
        case 'by_payment_method':
             return (
                 <Table>
                    <TableHeader><TableRow><TableHead>Sales Payment Method</TableHead><TableHead className="text-right">Total Received</TableHead></TableRow></TableHeader>
                    <TableBody>
                       {paymentSummary.length > 0 ? paymentSummary.sort((a,b) => b.totalAmount - a.totalAmount).map(item => (
                            <TableRow key={item.method}><TableCell>{item.method}</TableCell><TableCell className="text-right font-medium">₹{item.totalAmount.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No sales data for this period.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            );
        case 'by_vendor':
             return (
                 <Table>
                    <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead className="text-right">Total Spending</TableHead></TableRow></TableHeader>
                    <TableBody>
                       {vendorSummary.length > 0 ? vendorSummary.sort((a,b) => b.totalCost - a.totalCost).map(item => (
                            <TableRow key={item.vendor}><TableCell>{item.vendor}</TableCell><TableCell className="text-right font-medium">₹{item.totalCost.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No expense data for this period.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            );
        case 'by_expense_payment_method':
             return (
                 <Table>
                    <TableHeader><TableRow><TableHead>Expense Payment Method</TableHead><TableHead className="text-right">Total Spent</TableHead></TableRow></TableHeader>
                    <TableBody>
                       {expensePaymentSummary.length > 0 ? expensePaymentSummary.sort((a,b) => b.totalCost - a.totalCost).map(item => (
                            <TableRow key={item.method}><TableCell>{item.method}</TableCell><TableCell className="text-right font-medium">₹{item.totalCost.toFixed(2)}</TableCell></TableRow>
                        )) : <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No expense data for this period.</TableCell></TableRow>}
                    </TableBody>
                </Table>
            );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Food Stall Dashboard" description="Overview of your food stall's financial health and operations." />
      
       <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Select a site and date range to analyze profits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                <Button
                    id="dateRangePicker" variant={'outline'}
                    className={cn("w-full lg:w-[300px] justify-start text-left font-normal bg-input", !dateRange && "text-muted-foreground")}
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

            {user?.role === 'admin' && (
                <div className="max-w-xs">
                    <Label htmlFor="site-filter">Site</Label>
                    <Select value={siteFilter} onValueChange={setSiteFilter}>
                        <SelectTrigger id="site-filter" className="w-full bg-input">
                            <Building className="mr-2 h-4 w-4 text-muted-foreground"/>
                            <SelectValue placeholder="Filter by site" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Sites</SelectItem>
                            {allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </CardContent>
      </Card>


      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
                <Card key={i}><CardHeader><Skeleton className="h-5 w-32"/></CardHeader><CardContent><Skeleton className="h-8 w-24 mt-2"/><Skeleton className="h-4 w-40 mt-1"/></CardContent></Card>
            ))}
        </div>
      ) : (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-md col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Non-MRP Sales</CardTitle></CardHeader>
              <CardContent className="flex justify-between items-baseline">
                <div><p className="text-xs text-muted-foreground">Gross Sales</p><div className="text-2xl font-bold">₹{salesData.grossNonMrp.toFixed(2)}</div></div>
                <div><p className="text-xs text-muted-foreground">Net (after 18%)</p><div className="text-2xl font-bold text-green-600">₹{salesData.netNonMrp.toFixed(2)}</div></div>
              </CardContent>
            </Card>
            <Card className="shadow-md col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">MRP Sales</CardTitle></CardHeader>
              <CardContent className="flex justify-between items-baseline">
                <div><p className="text-xs text-muted-foreground">Gross Sales</p><div className="text-2xl font-bold">₹{salesData.grossMrp.toFixed(2)}</div></div>
                <div><p className="text-xs text-muted-foreground">Net (after 8%)</p><div className="text-2xl font-bold text-green-600">₹{salesData.netMrp.toFixed(2)}</div></div>
              </CardContent>
            </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Expenses</CardTitle><ShoppingBag className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className="text-2xl font-bold text-red-600">- ₹{totalExpenses.toFixed(2)}</div><p className="text-xs text-muted-foreground">Total cost of all purchases.</p></CardContent>
          </Card>
          
          <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Staff Salary</CardTitle><UsersIcon className="h-4 w-4 text-muted-foreground" /></CardHeader>
              <CardContent><div className="text-2xl font-bold text-red-600">- ₹{totalSalaryExpense.toFixed(2)}</div><p className="text-xs text-muted-foreground">{dateRange?.from && dateRange.to ? 'Earned salary for period' : 'Total salary paid all time'}</p></CardContent>
          </Card>
          
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Net Profit</CardTitle><Utensils className="h-4 w-4 text-muted-foreground" /></CardHeader>
            <CardContent><div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>₹{netProfit.toFixed(2)}</div><p className="text-xs text-muted-foreground">Net Sales - Expenses - Salary</p></CardContent>
          </Card>
        </div>
      </div>
      )}


       <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center"><BarChart className="mr-2 h-5 w-5 text-primary"/>Dynamic Summary</CardTitle>
                         <Select value={summaryView} onValueChange={(v) => setSummaryView(v as SummaryViewOption)}>
                            <SelectTrigger className="w-[240px] bg-input"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="by_expense_category"><ShoppingBag className="mr-2 h-4 w-4" />Summary by Expense Category</SelectItem>
                                <SelectItem value="by_payment_method"><DollarSign className="mr-2 h-4 w-4" />Summary by Sales Payment</SelectItem>
                                <SelectItem value="by_expense_payment_method"><WalletCards className="mr-2 h-4 w-4" />Summary by Expense Payment</SelectItem>
                                <SelectItem value="by_vendor"><Truck className="mr-2 h-4 w-4" />Summary by Vendor</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <CardDescription>
                        A dynamic breakdown of your sales or expenses for the selected period.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-72">
                        {loading ? <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin"/></div> : renderPivotTable()}
                    </ScrollArea>
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader><CardTitle className="flex items-center"><ClipboardList className="mr-2 h-5 w-5 text-primary" />Quick Navigation</CardTitle><CardDescription>Easily access key areas of your food stall management.</CardDescription></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-1">
                    {quickNavItems.map((item) => (
                    <Card key={item.title} className="flex flex-col hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center"><item.icon className="h-5 w-5 mr-2 text-primary/80" />{item.title}</CardTitle></CardHeader>
                        <CardContent className="flex-grow"><p className="text-sm text-muted-foreground">{item.description}</p></CardContent>
                        <CardFooter><Button asChild className="w-full" disabled={item.disabled || (!effectiveSiteId && user?.role !== 'admin')}><Link href={item.href}>{item.cta} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardFooter>
                    </Card>
                    ))}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}


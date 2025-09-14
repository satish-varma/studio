
"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingBag, Utensils, ArrowRight, LineChart, ClipboardList, Loader2, Info, Percent, BarChart, Soup, Truck, WalletCards, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, QueryConstraint, getDocs } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { startOfDay, endOfDay, subDays, startOfMonth, getDaysInMonth } from "date-fns";
import type { FoodItemExpense, FoodSaleTransaction, StaffAttendance, Holiday, StaffDetails, AppUser } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUserManagement } from "@/hooks/use-user-management";

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

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time';
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


export default function FoodStallDashboardPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { users: staffList, staffDetails: staffDetailsMap, loading: userManagementLoading } = useUserManagement();
  
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalSalaryExpense, setTotalSalaryExpense] = useState(0);
  const [commission, setCommission] = useState(0);
  const [hungerboxSales, setHungerboxSales] = useState(0);
  
  const [expenseSummary, setExpenseSummary] = useState<ExpenseCategorySummary[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentMethodSummary[]>([]);
  const [vendorSummary, setVendorSummary] = useState<VendorSummary[]>([]);
  const [expensePaymentSummary, setExpensePaymentSummary] = useState<ExpensePaymentMethodSummary[]>([]);


  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [summaryView, setSummaryView] = useState<SummaryViewOption>('by_expense_category');

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


  useEffect(() => {
    if (authLoading || userManagementLoading || !db || !user) {
        if (!authLoading && !userManagementLoading) setLoading(false);
        return;
    }
    
    if (user.role !== 'admin' && !activeSiteId) {
        setLoading(false);
        setTotalSales(0); setTotalExpenses(0); setCommission(0); setHungerboxSales(0); setTotalSalaryExpense(0);
        return;
    }
    
    setLoading(true);

    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = endOfDay(now);

    switch (dateFilter) {
        case 'today': startDate = startOfDay(now); break;
        case 'last_7_days': startDate = startOfDay(subDays(now, 6)); break;
        case 'this_month': startDate = startOfMonth(now); break;
        case 'all_time': startDate = null; endDate = null; break;
    }

    const fromTimestamp = startDate ? Timestamp.fromDate(startDate) : null;
    const toTimestamp = endDate ? Timestamp.fromDate(endDate) : null;
    
    const unsubs: (()=>void)[] = [];

    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let salesQueryConstraints: QueryConstraint[] = [];
    if (activeSiteId) salesQueryConstraints.push(where("siteId", "==", activeSiteId));
    if (activeStallId) salesQueryConstraints.push(where("stallId", "==", activeStallId));
    if (fromTimestamp) salesQueryConstraints.push(where("saleDate", ">=", fromTimestamp));
    if (toTimestamp) salesQueryConstraints.push(where("saleDate", "<=", toTimestamp));
    const salesQuery = query(salesCollectionRef, ...salesQueryConstraints);
    unsubs.push(onSnapshot(salesQuery, (snapshot) => {
        let salesTotal = 0, hbSalesTotal = 0;
        const paymentMethodTotals: Record<string, number> = { HungerBox: 0, UPI: 0 };
        snapshot.forEach(doc => {
            const sale = doc.data() as FoodSaleTransaction;
            salesTotal += sale.totalAmount;
            const saleHungerbox = sale.hungerboxSales || 0;
            const saleUpi = sale.upiSales || 0;
            hbSalesTotal += saleHungerbox;
            paymentMethodTotals.HungerBox += saleHungerbox;
            paymentMethodTotals.UPI += saleUpi;
        });
        setTotalSales(salesTotal);
        setHungerboxSales(hbSalesTotal);
        setCommission(hbSalesTotal * 0.20);
        setPaymentSummary(Object.entries(paymentMethodTotals).map(([method, totalAmount]) => ({ method, totalAmount })));
    }));

    const expensesCollectionRef = collection(db, "foodItemExpenses");
    let expensesQueryConstraints: QueryConstraint[] = [];
    if (activeSiteId) expensesQueryConstraints.push(where("siteId", "==", activeSiteId));
    if (activeStallId) expensesQueryConstraints.push(where("stallId", "==", activeStallId));
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
    
    // Fetch Attendance and Holidays for salary calculation
    const fetchSalaryData = async () => {
        if (!startDate || !endDate || staffList.length === 0) {
            setTotalSalaryExpense(0);
            return;
        }

        const staffUids = staffList.map(s => s.uid);
        const uidsBatches: string[][] = [];
        for (let i = 0; i < staffUids.length; i += 30) {
            uidsBatches.push(staffUids.slice(i, i + 30));
        }

        const holidaysQuery = query(collection(db, "holidays"), where("date", ">=", startDate.toISOString().split('T')[0]), where("date", "<=", endDate.toISOString().split('T')[0]));
        
        const attendancePromises = uidsBatches.map(batch => {
            const attendanceQuery = query(collection(db, "staffAttendance"), 
                where("staffUid", "in", batch), 
                where("date", ">=", startDate.toISOString().split('T')[0]), 
                where("date", "<=", endDate.toISOString().split('T')[0])
            );
            return getDocs(attendanceQuery);
        });

        const [holidaysSnapshot, ...attendanceSnapshots] = await Promise.all([
            getDocs(holidaysQuery),
            ...attendancePromises
        ]);

        const holidays = holidaysSnapshot.docs.map(d => d.data() as Holiday);
        
        const attendanceByStaff = new Map<string, { present: number, halfDay: number }>();
        
        attendanceSnapshots.flat().forEach(snapshot => snapshot.docs.forEach(doc => {
            const att = doc.data() as StaffAttendance;
            const current = attendanceByStaff.get(att.staffUid) || { present: 0, halfDay: 0 };
            if (att.status === 'Present') current.present++;
            if (att.status === 'Half-day') current.halfDay++;
            attendanceByStaff.set(att.staffUid, current);
        }));

        let totalSalary = 0;
        staffList.forEach(staff => {
            const details = staffDetailsMap.get(staff.uid);
            if (details?.salary) {
                const monthWorkingDays = calculateWorkingDays(startOfMonth(startDate), endOfMonth(startDate), holidays, staff);
                if (monthWorkingDays > 0) {
                    const perDaySalary = details.salary / monthWorkingDays;
                    const attendance = attendanceByStaff.get(staff.uid) || { present: 0, halfDay: 0 };
                    totalSalary += (attendance.present + attendance.halfDay * 0.5) * perDaySalary;
                }
            }
        });
        setTotalSalaryExpense(totalSalary);
    };

    fetchSalaryData().finally(() => setLoading(false));

    return () => { unsubs.forEach(unsub => unsub()); };
  }, [activeSiteId, activeStallId, authLoading, user, dateFilter, staffList, staffDetailsMap, userManagementLoading, calculateWorkingDays]);

  const netProfit = totalSales - commission - totalExpenses - totalSalaryExpense;

  const dateFilterLabels: Record<DateFilterOption, string> = {
    today: 'Today', last_7_days: 'Last 7 Days', this_month: 'This Month', all_time: 'All Time'
  };

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

  if (user?.role !== 'admin' && !activeSiteId) {
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
      <div className="flex flex-wrap gap-2">
        {(['today', 'last_7_days', 'this_month', 'all_time'] as DateFilterOption[]).map((filter) => (
          <Button key={filter} variant={dateFilter === filter ? 'default' : 'outline'} onClick={() => setDateFilter(filter)}>
            {dateFilterLabels[filter]}
          </Button>
        ))}
      </div>

      {!activeSiteId && user?.role === 'admin' && (
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Viewing All Sites</AlertTitle>
            <AlertDescription>You are currently viewing aggregated sales and expense data for all stalls across all sites.</AlertDescription>
        </Alert>
      )}
      
      {activeSiteId && !activeStallId && user?.role !== 'admin' && (
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" /><AlertTitle>Select a Stall</AlertTitle>
            <AlertDescription>Please select a specific stall from the header to see its live data.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Gross Sales ({dateFilterLabels[dateFilter]})</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold">₹{totalSales.toFixed(2)}</div>}<p className="text-xs text-muted-foreground">Revenue from all sales channels.</p></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Aggregator Commission</CardTitle><Percent className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold text-orange-600">- ₹{commission.toFixed(2)}</div>}<p className="text-xs text-muted-foreground">Est. 20% on ₹{hungerboxSales.toFixed(2)}</p></CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Expenses</CardTitle><ShoppingBag className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold text-red-600">- ₹{totalExpenses.toFixed(2)}</div>}<p className="text-xs text-muted-foreground">Total cost of all purchases.</p></CardContent>
        </Card>
         <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Staff Salary</CardTitle><UsersIcon className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold text-red-600">- ₹{totalSalaryExpense.toFixed(2)}</div>}<p className="text-xs text-muted-foreground">Earned salary for this period.</p></CardContent>
        </Card>
        <Card className="shadow-md lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Net Profit</CardTitle><Utensils className="h-4 w-4 text-muted-foreground" /></CardHeader>
          <CardContent>{loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>₹{netProfit.toFixed(2)}</div>}<p className="text-xs text-muted-foreground">Sales - All Expenses.</p></CardContent>
        </Card>
      </div>

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
                        <CardFooter><Button asChild className="w-full" disabled={item.disabled || (!activeStallId && user?.role !== 'admin')}><Link href={item.href}>{item.cta} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardFooter>
                    </Card>
                    ))}
                </CardContent>
            </Card>
        </div>
    </div>
  );
}


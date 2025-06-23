
"use client";

import { useState, useEffect } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingBag, Utensils, ArrowRight, LineChart, ClipboardList, Loader2, Info } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, QueryConstraint } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { startOfDay, endOfDay, subDays, startOfMonth } from "date-fns";
import type { FoodItemExpense, FoodSaleTransaction } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function FoodStallDashboardPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const [totalSales, setTotalSales] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');

  useEffect(() => {
    // If auth is loading or we don't have a site, we can't fetch data.
    if (authLoading || !db || !activeSiteId) {
        if (!authLoading) setLoading(false);
        setTotalSales(0);
        setTotalExpenses(0);
        return;
    }
    
    if (!activeStallId && user?.role !== 'admin') {
        setTotalSales(0);
        setTotalExpenses(0);
        setLoading(false);
        return;
    }
    
    setLoading(true);

    // Date range calculation based on filter
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

    const fromTimestamp = startDate ? Timestamp.fromDate(startDate) : null;
    const toTimestamp = endDate ? Timestamp.fromDate(endDate) : null;
    
    // --- Sales Fetch ---
    const salesCollectionRef = collection(db, "foodSaleTransactions");
    let salesQueryConstraints: QueryConstraint[] = [ where("siteId", "==", activeSiteId) ];
    if (activeStallId) {
      salesQueryConstraints.push(where("stallId", "==", activeStallId));
    }
    if (fromTimestamp) salesQueryConstraints.push(where("saleDate", ">=", fromTimestamp));
    if (toTimestamp) salesQueryConstraints.push(where("saleDate", "<=", toTimestamp));

    const salesQuery = query(salesCollectionRef, ...salesQueryConstraints);

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
        let total = 0;
        snapshot.forEach(doc => {
            const sale = doc.data() as FoodSaleTransaction;
            total += sale.totalAmount;
        });
        setTotalSales(total);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching food sales:", error);
        setLoading(false);
    });

    // --- Expenses Fetch ---
    const expensesCollectionRef = collection(db, "foodItemExpenses");
    let expensesQueryConstraints: QueryConstraint[] = [ where("siteId", "==", activeSiteId) ];
    if (activeStallId) {
      expensesQueryConstraints.push(where("stallId", "==", activeStallId));
    }
    if (fromTimestamp) expensesQueryConstraints.push(where("purchaseDate", ">=", fromTimestamp));
    if (toTimestamp) expensesQueryConstraints.push(where("purchaseDate", "<=", toTimestamp));

    const expensesQuery = query(expensesCollectionRef, ...expensesQueryConstraints);

    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
        let total = 0;
        snapshot.forEach(doc => {
            const expense = doc.data() as FoodItemExpense;
            total += expense.totalCost;
        });
        setTotalExpenses(total);
        setLoading(false);
    }, (error) => {
        console.error("Error fetching food expenses:", error);
        setLoading(false);
    });

    return () => {
        unsubscribeSales();
        unsubscribeExpenses();
    };
  }, [activeSiteId, activeStallId, authLoading, user?.role, dateFilter]);

  const netProfit = totalSales - totalExpenses;

  const dateFilterLabels: Record<DateFilterOption, string> = {
    today: 'Today',
    last_7_days: 'Last 7 Days',
    this_month: 'This Month',
    all_time: 'All Time'
  };

  const quickNavItems = [
    {
      title: "Manage Expenses",
      description: "Track all your purchases and operational costs for the food stall.",
      href: "/foodstall/expenses",
      icon: ShoppingBag,
      cta: "View Expenses",
      disabled: false,
    },
    {
      title: "Manage Sales",
      description: "Record and view all sales transactions for your food stall.",
      href: "/foodstall/sales",
      icon: DollarSign,
      cta: "View Sales",
      disabled: false,
    },
    {
      title: "View Financial Reports",
      description: "Analyze financial performance with sales and expense reports.",
      href: "/foodstall/reports",
      icon: LineChart,
      cta: "View Reports",
      disabled: false, // Enabled this
    },
  ];

  if (authLoading) {
    return (
        <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Loading user context...</p>
        </div>
    );
  }

  if (!activeSiteId) {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Food Stall Dashboard"
                description="Overview of your food stall's financial health and operations."
            />
            <Alert variant="default" className="border-primary/50">
                <Info className="h-4 w-4" />
                <AlertTitle>Site Context Required</AlertTitle>
                <AlertDescription>
                    Please select an active site from the header to view the Food Stall Dashboard.
                </AlertDescription>
            </Alert>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Dashboard"
        description="Overview of your food stall's financial health and operations."
      />

      <div className="flex flex-wrap gap-2">
        {(['today', 'last_7_days', 'this_month', 'all_time'] as DateFilterOption[]).map((filter) => (
          <Button key={filter} variant={dateFilter === filter ? 'default' : 'outline'} onClick={() => setDateFilter(filter)}>
            {dateFilterLabels[filter]}
          </Button>
        ))}
      </div>

      {!activeStallId && user?.role !== 'admin' && (
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" />
            <AlertTitle>Select a Stall</AlertTitle>
            <AlertDescription>
                Please select a specific stall from the header to see its live sales and expense data. Admins can view aggregated data for all stalls by not selecting a specific stall.
            </AlertDescription>
        </Alert>
      )}
       {!activeStallId && user?.role === 'admin' && (
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" />
            <AlertTitle>Viewing All Stalls</AlertTitle>
            <AlertDescription>
                You are currently viewing aggregated sales and expense data for all stalls within this site.
            </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales ({dateFilterLabels[dateFilter]})</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold">₹{totalSales.toFixed(2)}</div>}
            <p className="text-xs text-muted-foreground">
              Total revenue from sales.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses ({dateFilterLabels[dateFilter]})</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-32 mt-1" /> : <div className="text-2xl font-bold">₹{totalExpenses.toFixed(2)}</div>}
            <p className="text-xs text-muted-foreground">
             Total cost of purchases.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit ({dateFilterLabels[dateFilter]})</CardTitle>
            <Utensils className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {loading ? <Skeleton className="h-8 w-32 mt-1" /> : 
                <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    ₹{netProfit.toFixed(2)}
                </div>
            }
            <p className="text-xs text-muted-foreground">
              Sales minus expenses.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="flex items-center">
                <ClipboardList className="mr-2 h-5 w-5 text-primary" />
                Quick Navigation
            </CardTitle>
            <CardDescription>
                Easily access key areas of your food stall management.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
            {quickNavItems.map((item) => (
            <Card key={item.title} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center">
                        <item.icon className="h-5 w-5 mr-2 text-primary/80" />
                        {item.title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full" disabled={item.disabled || (!activeStallId && user?.role !== 'admin')}>
                        <Link href={item.href}>
                            {item.cta} <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
            ))}
        </CardContent>
      </Card>
      
    </div>
  );
}

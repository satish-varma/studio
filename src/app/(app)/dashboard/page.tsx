
"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, IndianRupee, TrendingUp, AlertTriangle, Loader2, Info } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, Timestamp, QueryConstraint, orderBy } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig'; 
import { getApps, initializeApp } from 'firebase/app';
import type { StockItem, SaleTransaction } from '@/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval } from 'date-fns';

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in DashboardPage:", error);
  }
}
const db = getFirestore();

interface DashboardStats {
  totalItems: number;
  totalSalesMonth: number;
  itemsSoldToday: number;
  lowStockAlerts: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, activeSiteId, activeStallId } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalItems: 0,
    totalSalesMonth: 0,
    itemsSoldToday: 0,
    lowStockAlerts: 0,
  });
  const [recentSales, setRecentSales] = useState<SaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Dashboard - StallSync";
    return () => { document.title = "StallSync - Stock Management"; } 
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return; 
    }

    if (user.role === 'admin' && !activeSiteId) {
      setLoading(false);
      setStats({ totalItems: 0, totalSalesMonth: 0, itemsSoldToday: 0, lowStockAlerts: 0 });
      setRecentSales([]);
      setError(null); 
      return;
    }
    
    if (user.role !== 'admin' && !activeSiteId) {
        setLoading(false);
        setError("No active site context. Please check your profile or contact an administrator.");
        setStats({ totalItems: 0, totalSalesMonth: 0, itemsSoldToday: 0, lowStockAlerts: 0 });
        setRecentSales([]);
        return;
    }

    setLoading(true);
    setError(null);

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // --- Stock Items Listener ---
    let stockItemsQueryConstraints: QueryConstraint[] = [];
    if (activeSiteId) {
      stockItemsQueryConstraints.push(where("siteId", "==", activeSiteId));
      if (activeStallId) {
        stockItemsQueryConstraints.push(where("stallId", "==", activeStallId));
      }
    } else { // Should not happen for staff/manager due to earlier check, but good for safety
        setLoading(false);
        setError("Site context is missing for fetching stock items.");
        return;
    }
    
    const stockItemsRef = collection(db, "stockItems");
    const stockQuery = query(stockItemsRef, ...stockItemsQueryConstraints);
    
    const unsubscribeStock = onSnapshot(stockQuery, (snapshot) => {
      const items: StockItem[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
      const total = items.length;
      const lowStock = items.filter(item => item.quantity <= item.lowStockThreshold).length;
      setStats(prevStats => ({ ...prevStats, totalItems: total, lowStockAlerts: lowStock }));
      // Consider loading false only after both subscriptions have fired once
    }, (err) => {
      console.error("Error fetching stock items for dashboard:", err);
      setError("Failed to load stock item data.");
      setLoading(false);
    });

    // --- Sales Transactions Listener ---
    let salesQueryConstraints: QueryConstraint[] = [where("isDeleted", "!=", true)];
     if (activeSiteId) {
      salesQueryConstraints.push(where("siteId", "==", activeSiteId));
      if (activeStallId) {
        salesQueryConstraints.push(where("stallId", "==", activeStallId));
      }
    } else { // Should not happen for staff/manager due to earlier check
        setLoading(false);
        setError("Site context is missing for fetching sales transactions.");
        return;
    }
    
    const salesTransactionsRef = collection(db, "salesTransactions");
    // Fetch sales for the current month or newer to optimize slightly, then filter client-side for "today" and "this month"
    const salesQuery = query(salesTransactionsRef, ...salesQueryConstraints, where("transactionDate", ">=", Timestamp.fromDate(monthStart)), orderBy("transactionDate", "desc"));

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const transactions: SaleTransaction[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          transactionDate: (data.transactionDate as Timestamp).toDate().toISOString() 
        } as SaleTransaction;
      });

      let salesThisMonth = 0;
      let itemsToday = 0;

      transactions.forEach(sale => {
        const saleDate = new Date(sale.transactionDate);
        if (isWithinInterval(saleDate, { start: monthStart, end: monthEnd })) {
          salesThisMonth += sale.totalAmount;
        }
        if (isWithinInterval(saleDate, { start: todayStart, end: todayEnd })) {
          sale.items.forEach(item => {
            itemsToday += Number(item.quantity) || 0;
          });
        }
      });
      
      setStats(prevStats => ({
        ...prevStats,
        totalSalesMonth: salesThisMonth,
        itemsSoldToday: itemsToday,
      }));
      setRecentSales(transactions.slice(0, 3)); 
      setLoading(false); 
    }, (err) => {
      console.error("Error fetching sales transactions for dashboard:", err);
      setError("Failed to load sales transaction data.");
      setLoading(false);
    });

    return () => {
      unsubscribeStock();
      unsubscribeSales();
    };

  }, [user, activeSiteId, activeStallId]);


  if (loading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading dashboard data...</p>
      </div>
    );
  }
  
  if (user?.role === 'admin' && !activeSiteId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of your activity and stock levels." />
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Select a Site</AlertTitle>
          <AlertDescription>
            Please select an active Site from the dropdown in the header bar to view dashboard statistics.
            You can then select "All Stalls" within that site or a specific stall.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description="Overview of your activity and stock levels." />
        <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Dashboard</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  const dashboardStatCards = [
    { title: "Total Items", value: stats.totalItems.toString(), icon: Package, change: "In current context", color: "text-primary" },
    { title: "Total Sales (This Month)", value: `₹${stats.totalSalesMonth.toFixed(2)}`, icon: IndianRupee, change: "In current context", color: "text-accent" },
    { title: "Items Sold (Today)", value: stats.itemsSoldToday.toString(), icon: TrendingUp, change: "In current context", color: "text-blue-500" },
    { title: "Low Stock Alerts", value: stats.lowStockAlerts.toString(), icon: AlertTriangle, change: "Needs attention", color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your activity and stock levels for the selected site/stall." />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStatCards.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground pt-1">
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>A quick look at your most recent transactions in this context.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSales.length > 0 ? (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                    <div>
                      <p className="font-medium text-foreground hover:underline cursor-pointer" onClick={() => router.push(`/sales/history/${sale.id}`)}>
                        Sale ID #{sale.id.substring(0,8)}...
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} items - ₹{sale.totalAmount.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">{new Date(sale.transactionDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit'})}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent sales in the current context.</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks at your fingertips.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3">
            <Button 
              className="flex-1"
              onClick={() => router.push('/sales/record')}
              disabled={!activeSiteId || !activeStallId} 
            >
              Record New Sale
            </Button>
            <Button 
              variant="secondary"
              className="flex-1"
              onClick={() => router.push('/items/new')}
              disabled={!activeSiteId || !activeStallId} 
            >
              Add New Item
            </Button>
          </CardContent>
          {(!activeSiteId || !activeStallId) && (
            <CardFooter className="pt-3 pb-4 justify-center">
                <p className="text-xs text-muted-foreground text-center"> 
                    Select a specific site and stall to enable quick actions.
                </p>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}

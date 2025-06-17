
"use client";

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, IndianRupee, TrendingUp, AlertTriangle, Loader2, Info, BarChart2, PackageSearch } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, query, where, onSnapshot, Timestamp, QueryConstraint, orderBy } from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp } from 'firebase/app';
import type { StockItem, SaleTransaction } from '@/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { subDays, startOfDay, endOfDay, isWithinInterval, format, eachDayOfInterval } from 'date-fns';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from '@/components/ui/skeleton'; // Added Skeleton
import dynamic from 'next/dynamic'; // Added dynamic

const LOG_PREFIX = "[DashboardPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface DashboardStats {
  totalItems: number;
  totalSalesLast7Days: number;
  itemsSoldToday: number;
  lowStockAlerts: number;
}

interface SalesChartDataPoint {
  date: string;
  totalSales: number;
}

// Dynamically import the chart component
const DashboardSalesChart = dynamic(
  () => import('@/components/dashboard/DashboardSalesChart').then(mod => mod.DashboardSalesChart),
  { 
    ssr: false, // Charts are often client-side only
    loading: () => (
      <div className="min-h-[250px] w-full flex items-center justify-center">
        <Skeleton className="h-[230px] w-[95%]" />
      </div>
    )
  }
);

export default function DashboardPage() {
  const router = useRouter();
  const { user, activeSiteId, activeStallId, activeSite, activeStall } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    totalItems: 0,
    totalSalesLast7Days: 0,
    itemsSoldToday: 0,
    lowStockAlerts: 0,
  });
  const [recentSales, setRecentSales] = useState<SaleTransaction[]>([]);
  const [salesChartData, setSalesChartData] = useState<SalesChartDataPoint[]>([]);
  const [lowStockItemsData, setLowStockItemsData] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loadingStock, setLoadingStock] = useState(true);
  const [loadingSales, setLoadingSales] = useState(true);

  useEffect(() => {
    document.title = "Dashboard - StallSync";
    return () => { document.title = "StallSync - Stock Management"; }
  }, []);
  
  useEffect(() => {
    if (!loadingStock && !loadingSales) {
      console.log(`${LOG_PREFIX} Both stock and sales data loaded/failed. Main loading set to false.`);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [loadingStock, loadingSales]);


  // Effect for Stock Items
  useEffect(() => {
    console.log(`${LOG_PREFIX} Stock items useEffect triggered. User: ${user?.uid}, ActiveSite: ${activeSiteId}, ActiveStall: ${activeStallId}`);
    if (!user) {
      console.log(`${LOG_PREFIX} No user for stock items. Setting loadingStock to false.`);
      setLoadingStock(false);
      return;
    }
    if (user.role === 'admin' && !activeSiteId) {
      console.log(`${LOG_PREFIX} Admin user, no active site. Clearing stock stats and setting loadingStock to false.`);
      setLoadingStock(false);
      setStats(prev => ({ ...prev, totalItems: 0, lowStockAlerts: 0 }));
      setLowStockItemsData([]);
      return;
    }
    if (!activeSiteId) {
      console.warn(`${LOG_PREFIX} No active site for stock items. User role: ${user.role}.`);
      setLoadingStock(false);
      setError(prevError => (prevError ? prevError + " " : "") + "No active site context for stock items.");
      return;
    }

    console.log(`${LOG_PREFIX} Fetching stock items for site: ${activeSiteId}, stall: ${activeStallId || 'All'}`);
    setLoadingStock(true);
    setError(null); // Reset error before fetching
    let stockItemsQueryConstraints: QueryConstraint[] = [where("siteId", "==", activeSiteId)];
    if (activeStallId) {
      stockItemsQueryConstraints.push(where("stallId", "==", activeStallId));
    } else {
      if (user.role === 'staff') { // Staff with no activeStallId sees master stock for their site
        stockItemsQueryConstraints.push(where("stallId", "==", null));
      }
      // Admin/Manager with no activeStallId sees all items for the site (no additional stallId constraint)
    }

    const stockItemsRef = collection(db, "stockItems");
    const stockQuery = query(stockItemsRef, ...stockItemsQueryConstraints);

    const unsubscribeStock = onSnapshot(stockQuery, (snapshot) => {
      const items: StockItem[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
      const total = items.length;
      const lowStockAlertItems = items.filter(item => item.quantity <= item.lowStockThreshold);
      console.log(`${LOG_PREFIX} Stock items snapshot received. Total: ${total}, Low stock: ${lowStockAlertItems.length}`);
      setStats(prevStats => ({ ...prevStats, totalItems: total, lowStockAlerts: lowStockAlertItems.length }));
      setLowStockItemsData(lowStockAlertItems.sort((a, b) => a.quantity - b.quantity).slice(0, 5));
      setLoadingStock(false);
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching stock items for dashboard:`, err.message, err.stack);
      setError(prevError => (prevError ? prevError + " " : "") + "Failed to load stock item data.");
      setLowStockItemsData([]);
      setLoadingStock(false);
    });

    return () => {
      console.log(`${LOG_PREFIX} Unsubscribing from stock items listener.`);
      unsubscribeStock();
    };
  }, [user, activeSiteId, activeStallId]);

  // Effect for Sales Transactions
  useEffect(() => {
    console.log(`${LOG_PREFIX} Sales transactions useEffect triggered. User: ${user?.uid}, ActiveSite: ${activeSiteId}, ActiveStall: ${activeStallId}`);
    if (!user) {
      console.log(`${LOG_PREFIX} No user for sales data. Setting loadingSales to false.`);
      setLoadingSales(false);
      return;
    }
     if (user.role === 'admin' && !activeSiteId) {
      console.log(`${LOG_PREFIX} Admin user, no active site. Clearing sales stats and setting loadingSales to false.`);
      setLoadingSales(false);
      setStats(prev => ({ ...prev, totalSalesLast7Days: 0, itemsSoldToday: 0 }));
      setRecentSales([]);
      setSalesChartData([]);
      return;
    }
    if (!activeSiteId) {
      console.warn(`${LOG_PREFIX} No active site for sales data. User role: ${user.role}.`);
      setLoadingSales(false);
      setError(prevError => (prevError ? prevError + " " : "") + "No active site context for sales data.");
      return;
    }

    console.log(`${LOG_PREFIX} Fetching sales transactions for site: ${activeSiteId}, stall: ${activeStallId || 'All'}`);
    setLoadingSales(true);
    setError(null); // Reset error before fetching
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const sevenDaysAgo = startOfDay(subDays(now, 6));

    let salesQueryConstraints: QueryConstraint[] = [
      where("siteId", "==", activeSiteId),
      where("isDeleted", "==", false),
      where("transactionDate", ">=", Timestamp.fromDate(sevenDaysAgo)),
      orderBy("transactionDate", "desc")
    ];
    if (activeStallId) {
      salesQueryConstraints.push(where("stallId", "==", activeStallId));
    }
    if (user.role === 'staff') {
      salesQueryConstraints.push(where("staffId", "==", user.uid));
    }

    const salesTransactionsRef = collection(db, "salesTransactions");
    const salesQuery = query(salesTransactionsRef, ...salesQueryConstraints);

    const unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
      const transactions: SaleTransaction[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          transactionDate: (data.transactionDate as Timestamp).toDate().toISOString()
        } as SaleTransaction;
      });
      console.log(`${LOG_PREFIX} Sales transactions snapshot received. Count: ${transactions.length}`);

      let salesLast7Days = 0;
      let itemsToday = 0;
      const dailySalesMap = new Map<string, number>();
      const dateRangeForChart = eachDayOfInterval({ start: sevenDaysAgo, end: now });
      dateRangeForChart.forEach(day => {
        dailySalesMap.set(format(day, 'yyyy-MM-dd'), 0);
      });

      transactions.forEach(sale => {
        const saleDate = new Date(sale.transactionDate);
        if (isWithinInterval(saleDate, { start: sevenDaysAgo, end: endOfDay(now) })) {
            salesLast7Days += sale.totalAmount;
            const formattedSaleDate = format(saleDate, 'yyyy-MM-dd');
            if (dailySalesMap.has(formattedSaleDate)) {
                dailySalesMap.set(formattedSaleDate, (dailySalesMap.get(formattedSaleDate) || 0) + sale.totalAmount);
            }
        }
        if (isWithinInterval(saleDate, { start: todayStart, end: todayEnd })) {
          sale.items.forEach(item => {
            itemsToday += Number(item.quantity) || 0;
          });
        }
      });

      setStats(prevStats => ({
        ...prevStats,
        totalSalesLast7Days: salesLast7Days,
        itemsSoldToday: itemsToday,
      }));
      setRecentSales(transactions.slice(0, 3)); 
      const chartDataPoints: SalesChartDataPoint[] = Array.from(dailySalesMap.entries())
        .map(([date, totalSales]) => ({ date, totalSales }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
      setSalesChartData(chartDataPoints);
      setLoadingSales(false);
    }, (err) => {
      console.error(`${LOG_PREFIX} Error fetching sales transactions for dashboard:`, err.message, err.stack);
      setError(prevError => (prevError ? prevError + " " : "") + "Failed to load sales transaction data.");
      setLoadingSales(false);
    });

    return () => {
      console.log(`${LOG_PREFIX} Unsubscribing from sales transactions listener.`);
      unsubscribeSales();
    };
  }, [user, activeSiteId, activeStallId]);


  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Overview of your activity and stock levels.";
    if (user.role === 'admin' && !activeSite) {
        return "Admin: Select a site from the header to view its dashboard.";
    }
    if (!activeSite) {
        return user.role === 'staff' ? "Your account needs a default site assigned for dashboard data." : "Select a site to view dashboard statistics.";
    }
    let desc = `Overview for Site: "${activeSite.name}"`;

    if (activeStall) {
        desc += ` (Stall: "${activeStall.name}")`;
    } else if (user.role !== 'staff') { // Admins/Managers without a specific stall selected see all stalls
        desc += " (All Stalls)";
    } else { // Staff with no activeStall means they are viewing master stock for their activeSite
        desc += " (Master Stock)";
    }
    desc += ".";
    return desc;
  }, [user, activeSite, activeStall]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-10" data-testid="dashboard-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading dashboard data...</p>
      </div>
    );
  }

  if (user?.role === 'admin' && !activeSiteId && !loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description={pageHeaderDescription} />
        <Alert variant="default" className="border-primary/50" data-testid="admin-no-site-alert">
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
  
  if (error && !loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description={pageHeaderDescription} />
        <Alert variant="destructive" data-testid="dashboard-error-alert">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error Loading Dashboard</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }


  const dashboardStatCards = [
    { title: "Total Items", value: stats.totalItems.toString(), icon: Package, change: "In current context", color: "text-primary", testid: "stat-total-items" },
    { title: "Total Sales (Last 7 Days)", value: `₹${stats.totalSalesLast7Days.toFixed(2)}`, icon: IndianRupee, change: "In current context", color: "text-accent", testid: "stat-total-sales" },
    { title: "Items Sold (Today)", value: stats.itemsSoldToday.toString(), icon: TrendingUp, change: "In current context", color: "text-blue-500", testid: "stat-items-sold-today" },
    { title: "Low Stock Alerts", value: stats.lowStockAlerts.toString(), icon: AlertTriangle, change: "Needs attention", color: "text-destructive", testid: "stat-low-stock-alerts" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={pageHeaderDescription} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStatCards.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b mb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-6 w-6 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground" data-testid={stat.testid}>{stat.value}</div>
              <CardDescription className="text-xs text-muted-foreground pt-1">
                {stat.change}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-lg" data-testid="sales-chart-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart2 className="h-5 w-5 mr-2 text-primary"/>
            Sales Over Last 7 Days
          </CardTitle>
          <CardDescription>Total sales amount per day for the current site/stall context.</CardDescription>
        </CardHeader>
        <CardContent>
          {salesChartData.length > 0 ? (
             <DashboardSalesChart salesChartData={salesChartData} />
          ) : (
            <p className="text-sm text-center text-muted-foreground py-10" data-testid="no-sales-chart-data">No sales data available for the last 7 days in this context.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg" data-testid="low-stock-items-card">
        <CardHeader>
          <CardTitle className="flex items-center">
            <PackageSearch className="h-5 w-5 mr-2 text-destructive"/>
            Items Low on Stock
          </CardTitle>
          <CardDescription>Top items that have reached or fallen below their low stock threshold.</CardDescription>
        </CardHeader>
        <CardContent>
          {lowStockItemsData.length > 0 ? (
            <ScrollArea className="h-[200px] pr-3"> 
              <div className="space-y-3">
                {lowStockItemsData.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover:bg-muted/75 transition-colors" data-testid={`low-stock-item-${item.id}`}>
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Qty: <span className="font-semibold text-destructive">{item.quantity}</span> {item.unit} (Threshold: {item.lowStockThreshold})
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => router.push(`/items/${item.id}/edit`)}>
                      View/Edit
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-center text-muted-foreground py-10" data-testid="no-low-stock-data">No items are currently low on stock in this context.</p>
          )}
        </CardContent>
      </Card>


      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg" data-testid="recent-sales-card">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>A quick look at your most recent transactions in this context (last 7 days).</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSales.length > 0 ? (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md" data-testid={`recent-sale-${sale.id}`}>
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
              <p className="text-sm text-muted-foreground" data-testid="no-recent-sales-data">No recent sales in the current context (last 7 days).</p>
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
              data-testid="record-sale-button"
              className="flex-1"
              onClick={() => router.push('/sales/record')}
              disabled={!activeSiteId || !activeStallId}
            >
              Record New Sale
            </Button>
            <Button
              data-testid="add-new-item-button"
              variant="secondary"
              className="flex-1"
              onClick={() => router.push('/items/new')}
              disabled={!activeSiteId}
            >
              Add New Item
            </Button>
          </CardContent>
          {(!activeSiteId) && (
            <CardFooter className="pt-3 pb-4 justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    Select an active site to enable quick actions. Sales require a specific stall.
                </p>
            </CardFooter>
          )}
          {(activeSiteId && !activeStallId && user?.role !== 'staff') && (
             <CardFooter className="pt-3 pb-4 justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    "Add New Item" is enabled for site master stock. Select a specific stall to record sales.
                </p>
            </CardFooter>
          )}
           {(activeSiteId && !activeStallId && user?.role === 'staff') && (
             <CardFooter className="pt-3 pb-4 justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    "Add New Item" is available for Master Stock. "Record New Sale" is disabled as no specific stall is assigned/selected for sales.
                </p>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
    

    

    
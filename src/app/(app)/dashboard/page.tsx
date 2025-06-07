
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

import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";


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
  totalSalesLast7Days: number;
  itemsSoldToday: number;
  lowStockAlerts: number;
}

interface SalesChartDataPoint {
  date: string;
  totalSales: number;
}

const chartConfig = {
  totalSales: {
    label: "Sales (₹)",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

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
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [loadingStock, loadingSales]);


  // Effect for Stock Items
  useEffect(() => {
    if (!user) {
      setLoadingStock(false);
      return;
    }
    if (user.role === 'admin' && !activeSiteId) {
      setLoadingStock(false);
      setStats(prev => ({ ...prev, totalItems: 0, lowStockAlerts: 0 }));
      setLowStockItemsData([]);
      return;
    }
    if (!activeSiteId) {
      setLoadingStock(false);
      setError(prevError => prevError || "No active site context for stock items.");
      return;
    }

    setLoadingStock(true);
    let stockItemsQueryConstraints: QueryConstraint[] = [where("siteId", "==", activeSiteId)];
    if (activeStallId) {
      stockItemsQueryConstraints.push(where("stallId", "==", activeStallId));
    }

    const stockItemsRef = collection(db, "stockItems");
    const stockQuery = query(stockItemsRef, ...stockItemsQueryConstraints);

    const unsubscribeStock = onSnapshot(stockQuery, (snapshot) => {
      const items: StockItem[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem));
      const total = items.length;
      const lowStockAlertItems = items.filter(item => item.quantity <= item.lowStockThreshold);
      setStats(prevStats => ({ ...prevStats, totalItems: total, lowStockAlerts: lowStockAlertItems.length }));
      setLowStockItemsData(lowStockAlertItems.sort((a, b) => a.quantity - b.quantity).slice(0, 5));
      setLoadingStock(false);
      setError(null); // Clear error if stock data loads
    }, (err) => {
      console.error("Error fetching stock items for dashboard:", err);
      setError(prevError => prevError || "Failed to load stock item data.");
      setLowStockItemsData([]);
      setLoadingStock(false);
    });

    return () => unsubscribeStock();
  }, [user, activeSiteId, activeStallId]);

  // Effect for Sales Transactions
  useEffect(() => {
    if (!user) {
      setLoadingSales(false);
      return;
    }
     if (user.role === 'admin' && !activeSiteId) {
      setLoadingSales(false);
      setStats(prev => ({ ...prev, totalSalesLast7Days: 0, itemsSoldToday: 0 }));
      setRecentSales([]);
      setSalesChartData([]);
      return;
    }
    if (!activeSiteId) {
      setLoadingSales(false);
      setError(prevError => prevError || "No active site context for sales data.");
      return;
    }

    setLoadingSales(true);
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

      let salesLast7Days = 0;
      let itemsToday = 0;
      const dailySalesMap = new Map<string, number>();
      const dateRangeForChart = eachDayOfInterval({ start: sevenDaysAgo, end: now });
      dateRangeForChart.forEach(day => {
        dailySalesMap.set(format(day, 'yyyy-MM-dd'), 0);
      });

      transactions.forEach(sale => {
        const saleDate = new Date(sale.transactionDate);
        salesLast7Days += sale.totalAmount;
        const formattedSaleDate = format(saleDate, 'yyyy-MM-dd');
        if (dailySalesMap.has(formattedSaleDate)) {
          dailySalesMap.set(formattedSaleDate, (dailySalesMap.get(formattedSaleDate) || 0) + sale.totalAmount);
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
      setError(null); // Clear error if sales data loads
    }, (err) => {
      console.error("Error fetching sales transactions for dashboard:", err);
      setError(prevError => prevError || "Failed to load sales transaction data.");
      setLoadingSales(false);
    });

    return () => unsubscribeSales();
  }, [user, activeSiteId, activeStallId]);


  const pageHeaderDescription = useMemo(() => {
    if (user?.role === 'admin' && !activeSite) {
        return "Admin: Select a site to view its dashboard.";
    }
    if (!activeSite) {
        return "Overview of your activity and stock levels. Select a site to view details.";
    }
    let desc = "Overview of your activity and stock levels for ";
    desc += `Site: "${activeSite.name}"`;

    if (activeStall) {
        desc += ` (Stall: "${activeStall.name}")`;
    } else {
        desc += " (All Stalls)";
    }
    desc += ".";
    return desc;
  }, [user, activeSite, activeStall]);

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
        <PageHeader title="Dashboard" description={pageHeaderDescription} />
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
  
  // This error check should come after the admin/no-siteId check
  // to allow admins to see the "Select a Site" message first.
  if (error && !loading) { // Only show main error if not loading and admin no-site is not applicable
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" description={pageHeaderDescription} />
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
    { title: "Total Sales (Last 7 Days)", value: `₹${stats.totalSalesLast7Days.toFixed(2)}`, icon: IndianRupee, change: "In current context", color: "text-accent" },
    { title: "Items Sold (Today)", value: stats.itemsSoldToday.toString(), icon: TrendingUp, change: "In current context", color: "text-blue-500" },
    { title: "Low Stock Alerts", value: stats.lowStockAlerts.toString(), icon: AlertTriangle, change: "Needs attention", color: "text-destructive" },
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
              <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              <CardDescription className="text-xs text-muted-foreground pt-1">
                {stat.change}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart2 className="h-5 w-5 mr-2 text-primary"/>
            Sales Over Last 7 Days
          </CardTitle>
          <CardDescription>Total sales amount per day for the current site/stall context.</CardDescription>
        </CardHeader>
        <CardContent>
          {salesChartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
              <BarChart accessibilityLayer data={salesChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => format(new Date(value), "MMM d")}
                />
                <YAxis
                  tickFormatter={(value) => `₹${value >= 1000 ? `${(value/1000).toFixed(0)}k` : value.toFixed(0)}`}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  width={80}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent
                    indicator="dot"
                    formatter={(value, name, props) => (
                        <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{format(new Date(props.payload.date), "MMM d, yyyy")}</span>
                            <span className="text-muted-foreground">Sales: <span className="font-semibold text-foreground">₹{Number(value).toFixed(2)}</span></span>
                        </div>
                    )}
                    hideLabel
                  />}
                />
                <Bar dataKey="totalSales" fill="var(--color-totalSales)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-center text-muted-foreground py-10">No sales data available for the last 7 days in this context.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
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
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover:bg-muted/75 transition-colors">
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
            <p className="text-sm text-center text-muted-foreground py-10">No items are currently low on stock in this context.</p>
          )}
        </CardContent>
      </Card>


      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>A quick look at your most recent transactions in this context (last 7 days).</CardDescription>
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
              <p className="text-sm text-muted-foreground">No recent sales in the current context (last 7 days).</p>
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
          {(activeSiteId && !activeStallId) && (
             <CardFooter className="pt-3 pb-4 justify-center">
                <p className="text-xs text-muted-foreground text-center">
                    "Add New Item" is enabled for site master stock. Select a specific stall to record sales.
                </p>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
    
    

    

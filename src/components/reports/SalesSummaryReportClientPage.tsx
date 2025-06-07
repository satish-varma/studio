
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { ReportControls } from "@/components/reports/ReportControls";
import type { SaleTransaction, StockItem, AppUser, SoldItem } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay, parseISO, isValid, format } from "date-fns";
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    Timestamp,
    QuerySnapshot,
    DocumentData,
    getDocs,
    QueryConstraint
} from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info, IndianRupee, Package, TrendingUp, AlertTriangle, Percent, ShoppingCart, ListOrdered, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/shared/PageHeader";
import { summarizeSalesTrends } from "@/ai/flows/summarize-sales-trends-flow";
import { Skeleton } from "@/components/ui/skeleton";

const LOG_PREFIX = "[SalesSummaryReportClientPage]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

interface ReportSummaryData {
  totalSalesAmount: number;
  totalItemsSold: number;
  totalCostOfGoodsSold: number;
  totalProfit: number;
  averageSaleValue: number;
  profitMargin: number;
  numberOfSales: number;
}

interface TopSellingItemData {
  itemId: string;
  name: string;
  category?: string;
  totalQuantitySold: number;
  totalRevenueGenerated: number;
}

const MAX_TOP_ITEMS = 10;

export default function SalesSummaryReportClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading, activeSite, activeStall } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const today = new Date();
    return { from: subDays(startOfDay(today), 29), to: endOfDay(today) };
  });

  const [summaryData, setSummaryData] = useState<ReportSummaryData | null>(null);
  const [topSellingItems, setTopSellingItems] = useState<TopSellingItemData[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAiSummary, setLoadingAiSummary] = useState(false);

  const fetchReportData = useCallback(async () => {
    console.log(`${LOG_PREFIX} fetchReportData called. AuthLoading: ${authLoading}, User: ${!!user}`);
    if (authLoading) return;

    if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
      console.warn(`${LOG_PREFIX} User not authorized to view reports. Role: ${user?.role}`);
      setErrorReport("Access Denied: You do not have permission to view reports.");
      setLoadingReport(false);
      return;
    }

    if (!activeSiteId) {
      const msg = user.role === 'admin' ? "Admin: Please select a site to view its report." : "Manager: Please select one of your managed sites to view its report.";
      console.warn(`${LOG_PREFIX} No active site selected for report. Message: ${msg}`);
      setErrorReport(msg);
      setLoadingReport(false);
      setSummaryData(null);
      setTopSellingItems([]);
      setAiSummary(null);
      return;
    }

    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
        console.warn(`${LOG_PREFIX} Invalid date range for report.`);
        setErrorReport("Please select a valid date range.");
        setLoadingReport(false);
        setSummaryData(null);
        setTopSellingItems([]);
        setAiSummary(null);
        return;
    }
    console.log(`${LOG_PREFIX} Starting report data fetch. Site: ${activeSiteId}, Stall: ${activeStallId || 'All'}, DateRange: ${dateRange.from.toISOString()} to ${dateRange.to.toISOString()}`);
    setLoadingReport(true);
    setLoadingAiSummary(true);
    setErrorReport(null);
    setSummaryData(null);
    setTopSellingItems([]);
    setAiSummary(null);

    try {
      const salesCollectionRef = collection(db, "salesTransactions");
      let salesQueryConstraints: QueryConstraint[] = [
        where("siteId", "==", activeSiteId),
        where("isDeleted", "==", false),
        where("transactionDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))),
        where("transactionDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))),
      ];

      if (activeStallId) {
        salesQueryConstraints.push(where("stallId", "==", activeStallId));
      }

      const salesQuery = query(salesCollectionRef, ...salesQueryConstraints);
      const salesSnapshot = await getDocs(salesQuery);
      const transactions: SaleTransaction[] = salesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          transactionDate: (data.transactionDate as Timestamp).toDate().toISOString(),
        } as SaleTransaction;
      });
      console.log(`${LOG_PREFIX} Fetched ${transactions.length} transactions for report.`);

      if (transactions.length === 0) {
        console.log(`${LOG_PREFIX} No sales data found for the selected criteria.`);
        setSummaryData({
          totalSalesAmount: 0, totalItemsSold: 0, totalCostOfGoodsSold: 0,
          totalProfit: 0, averageSaleValue: 0, profitMargin: 0, numberOfSales: 0,
        });
        setTopSellingItems([]);
        setAiSummary("No sales data available for the selected period to generate a summary.");
        setLoadingReport(false);
        setLoadingAiSummary(false);
        return;
      }

      const stockItemsMap = new Map<string, StockItem>();
      // Fetch all stock items for the site to get costPrice and category. This could be optimized if performance becomes an issue.
      const stockItemsQuery = query(collection(db, "stockItems"), where("siteId", "==", activeSiteId));
      const stockItemsSnapshot = await getDocs(stockItemsQuery);
      stockItemsSnapshot.forEach(doc => {
        stockItemsMap.set(doc.id, { id: doc.id, ...doc.data() } as StockItem);
      });
      console.log(`${LOG_PREFIX} Fetched ${stockItemsMap.size} stock items for cost/category lookup.`);

      let totalSales = 0;
      let totalItems = 0;
      let totalCOGS = 0;
      const itemSalesAggregation = new Map<string, Omit<TopSellingItemData, 'itemId'>>();

      transactions.forEach(sale => {
        totalSales += sale.totalAmount;
        sale.items.forEach(soldItem => {
          const quantity = Number(soldItem.quantity) || 0;
          totalItems += quantity;

          const stockItemDetails = stockItemsMap.get(soldItem.itemId);
          const costPrice = stockItemDetails?.costPrice ?? 0; // Default to 0 if not found or no cost price
          totalCOGS += quantity * costPrice;

          const existingAggregatedItem = itemSalesAggregation.get(soldItem.itemId);
          if (existingAggregatedItem) {
            existingAggregatedItem.totalQuantitySold += quantity;
            existingAggregatedItem.totalRevenueGenerated += soldItem.totalPrice;
          } else {
            itemSalesAggregation.set(soldItem.itemId, {
              name: soldItem.name,
              category: stockItemDetails?.category || "N/A",
              totalQuantitySold: quantity,
              totalRevenueGenerated: soldItem.totalPrice,
            });
          }
        });
      });

      const aggregatedItemsArray: TopSellingItemData[] = Array.from(itemSalesAggregation.entries())
        .map(([itemId, data]) => ({ itemId, ...data }));

      const sortedTopItems = aggregatedItemsArray
        .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
        .slice(0, MAX_TOP_ITEMS);

      setTopSellingItems(sortedTopItems);
      console.log(`${LOG_PREFIX} Aggregated top selling items. Count: ${sortedTopItems.length}`);

      const totalProfitCalc = totalSales - totalCOGS;
      const averageSaleCalc = transactions.length > 0 ? totalSales / transactions.length : 0;
      const marginCalc = totalSales > 0 ? (totalProfitCalc / totalSales) * 100 : 0;

      const currentSummaryData: ReportSummaryData = {
        totalSalesAmount: totalSales,
        totalItemsSold: totalItems,
        totalCostOfGoodsSold: totalCOGS,
        totalProfit: totalProfitCalc,
        averageSaleValue: averageSaleCalc,
        profitMargin: marginCalc,
        numberOfSales: transactions.length,
      };
      setSummaryData(currentSummaryData);
      console.log(`${LOG_PREFIX} Sales summary data calculated:`, currentSummaryData);
      setLoadingReport(false);

      // Call AI summary flow
      try {
        console.log(`${LOG_PREFIX} Calling AI for sales trend summary.`);
        const aiInput = {
          summaryStats: currentSummaryData,
          topSellingItems: sortedTopItems,
          dateRangeFrom: format(dateRange.from, "yyyy-MM-dd"),
          dateRangeTo: format(dateRange.to, "yyyy-MM-dd"),
          siteName: activeSite?.name,
          stallName: activeStall?.name,
        };
        const aiResult = await summarizeSalesTrends(aiInput);
        setAiSummary(aiResult.summary);
        console.log(`${LOG_PREFIX} AI summary generated successfully.`);
      } catch (aiError: any) {
        console.error(`${LOG_PREFIX} Error generating AI sales summary:`, aiError.message, aiError.stack);
        setAiSummary("Could not generate AI summary for this period. " + aiError.message);
      } finally {
        setLoadingAiSummary(false);
      }

    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error fetching report data:`, error.message, error.stack);
      setErrorReport("Failed to load report data. " + error.message);
      setLoadingReport(false);
      setLoadingAiSummary(false);
    }
  }, [user, activeSiteId, activeStallId, dateRange, authLoading, activeSite, activeStall]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const pageHeaderDescription = useMemo(() => {
    if (!user) return "Analyze your sales data, profit margins, and inventory performance.";
    if (!activeSite) return "Select a site to view its reports.";
    let desc = "Analyze sales data, profit margins, and inventory performance for ";
    desc += `Site: "${activeSite.name}"`;
    desc += activeStall ? ` (Stall: "${activeStall.name}")` : " (All Stalls/Items for this site)";
    desc += ".";
    return desc;
  }, [user, activeSite, activeStall]);


  const summaryCards = summaryData ? [
    { title: "Total Sales", value: `₹${summaryData.totalSalesAmount.toFixed(2)}`, icon: IndianRupee, color: "text-primary" },
    { title: "Total Items Sold", value: summaryData.totalItemsSold.toString(), icon: Package, color: "text-blue-500" },
    { title: "Total COGS", value: `₹${summaryData.totalCostOfGoodsSold.toFixed(2)}`, icon: TrendingUp, color: "text-orange-500", description: "Cost of Goods Sold" },
    { title: "Total Profit", value: `₹${summaryData.totalProfit.toFixed(2)}`, icon: Percent, color: "text-accent" },
    { title: "Number of Sales", value: summaryData.numberOfSales.toString(), icon: ShoppingCart, color: "text-purple-500" },
    { title: "Average Sale Value", value: `₹${summaryData.averageSaleValue.toFixed(2)}`, icon: IndianRupee, color: "text-teal-500" },
    { title: "Profit Margin", value: `${summaryData.profitMargin.toFixed(2)}%`, icon: Percent, color: "text-green-600" },
  ] : [];


  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading user context...</p>
      </div>
    );
  }

   if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return (
      <div className="space-y-6">
        <PageHeader
            title="Sales & Inventory Reports"
            description="Access to reports is restricted."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission to view reports.</AlertDescription>
        </Alert>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales & Inventory Reports"
        description={pageHeaderDescription}
      />
      <ReportControls dateRange={dateRange} onDateRangeChange={setDateRange} />

      {loadingReport && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading report data...</p>
        </div>
      )}

      {!activeSiteId && !loadingReport && (
        <Alert variant="default" className="border-primary/50">
            <Info className="h-4 w-4" />
            <AlertTitle>Site Selection Required</AlertTitle>
            <AlertDescription>
            {user.role === 'admin' ? "Admin: Please select a site from the header to view its report." : "Manager: Please select one of your managed sites from the header to view its report."}
            {activeStallId && " Sales will be shown for the specific stall selected."}
            </AlertDescription>
        </Alert>
      )}


      {errorReport && !loadingReport && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Report</AlertTitle>
          <AlertDescription>{errorReport}</AlertDescription>
        </Alert>
      )}

      {!loadingReport && !errorReport && activeSiteId && summaryData && (
        <>
          <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center">
                    <Sparkles className="mr-2 h-5 w-5 text-accent" />
                    AI-Powered Sales Summary
                </CardTitle>
                <CardDescription>
                    An automated analysis of sales trends for the selected period and context.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loadingAiSummary ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-[80%]" />
                        <Skeleton className="h-4 w-[70%]" />
                        <Skeleton className="h-4 w-[75%]" />
                    </div>
                ) : aiSummary ? (
                    <p className="text-sm text-foreground leading-relaxed">{aiSummary}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">AI summary could not be generated for this period.</p>
                )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
              <CardHeader>
                  <CardTitle>Sales Performance Metrics</CardTitle>
                  <CardDescription>
                      Overview of sales performance for the selected period
                      {activeSiteId ? ` at site: ${activeSite?.name || activeSiteId.substring(0,6)}...` : '.'}
                      {activeStallId ? ` (Stall: ${activeStall?.name || activeStallId.substring(0,6)}...)` : activeSiteId ? ' (All Stalls).' : ''}
                  </CardDescription>
              </CardHeader>
              <CardContent>
                  {summaryData.numberOfSales === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No sales data found for the selected criteria.</p>
                  ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {summaryCards.map((stat) => (
                          <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                              <CardTitle className="text-sm font-medium text-muted-foreground">
                                  {stat.title}
                              </CardTitle>
                              <stat.icon className={`h-5 w-5 ${stat.color}`} />
                              </CardHeader>
                              <CardContent className="pt-3">
                              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                              {stat.description && <CardDescription className="text-xs text-muted-foreground pt-1">{stat.description}</CardDescription>}
                              </CardContent>
                          </Card>
                          ))}
                      </div>
                  )}
              </CardContent>
          </Card>

          {summaryData.numberOfSales > 0 && topSellingItems.length > 0 && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ListOrdered className="mr-2 h-5 w-5 text-primary" />
                  Top Selling Items (by Quantity)
                </CardTitle>
                <CardDescription>
                  Most frequently sold items in the selected period and context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Quantity Sold</TableHead>
                        <TableHead className="text-right">Revenue Generated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topSellingItems.map((item) => (
                        <TableRow key={item.itemId}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-muted-foreground">{item.category}</TableCell>
                          <TableCell className="text-right">{item.totalQuantitySold}</TableCell>
                          <TableCell className="text-right">₹{item.totalRevenueGenerated.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
           {summaryData.numberOfSales > 0 && topSellingItems.length === 0 && !loadingReport && (
             <Card className="shadow-lg">
              <CardHeader><CardTitle>Top Selling Items</CardTitle></CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-4">No specific top-selling items data to display for this period.</p>
              </CardContent>
            </Card>
           )}
        </>
      )}
       {!loadingReport && !errorReport && activeSiteId && !summaryData && (
         <Card className="shadow-lg">
             <CardHeader><CardTitle>Sales Summary</CardTitle></CardHeader>
             <CardContent>
                <p className="text-muted-foreground text-center py-6">Report data is being processed or no data available for the current filters.</p>
             </CardContent>
         </Card>
       )}
    </div>
  );
}

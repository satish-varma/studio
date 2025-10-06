
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  startOfMonth,
  endOfDay,
  subMonths,
  eachDayOfInterval,
  format,
  isEqual,
  parse,
} from 'date-fns';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  QueryConstraint,
  orderBy,
} from 'firebase/firestore';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2,
  Info,
  Building,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import type { FoodSaleTransaction, Site, Stall } from '@/types';
import { useUserManagement } from '@/hooks/use-user-management';
import { DatePicker } from '../ui/date-picker';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error('Firebase initialization error in Pivot Report:', error);
  }
} else {
  db = getFirestore(getApp());
}

interface PivotData {
  rows: {
    date: string;
    [stallId: string]: number | string; // Date string or sales amount
    grandTotal: number;
  }[];
  columns: { id: string; name: string }[];
  columnTotals: {
    [stallId: string]: number;
    grandTotal: number;
  };
}

export default function FoodStallPivotReportClientPage() {
  const { user, loading: authLoading } = useAuth();
  const { sites, stalls, loading: userManagementLoading } = useUserManagement();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [loadingReport, setLoadingReport] = useState(true);
  const [pivotData, setPivotData] = useState<PivotData | null>(null);

  const fetchAndProcessData = useCallback(async () => {
    if (!db || !dateRange?.from || !user) return;
    if (user.role !== 'admin' && user.role !== 'manager') return;

    setLoadingReport(true);
    let salesQueryConstraints: QueryConstraint[] = [
      where('saleDate', '>=', Timestamp.fromDate(dateRange.from)),
      where('saleDate', '<=', Timestamp.fromDate(endOfDay(dateRange.to || dateRange.from))),
    ];

    if (siteFilter !== 'all') {
      salesQueryConstraints.push(where('siteId', '==', siteFilter));
    } else if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 0) {
      if (user.managedSiteIds.length <= 30) {
         salesQueryConstraints.push(where('siteId', 'in', user.managedSiteIds));
      }
    }

    try {
      const salesQuery = query(collection(db, 'foodSaleTransactions'), ...salesQueryConstraints);
      const salesSnapshot = await getDocs(salesQuery);
      let sales = salesSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...(doc.data() as Omit<FoodSaleTransaction, 'id'>) })
      );

      // Manual filter for managers with many sites
      if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 30) {
        sales = sales.filter(sale => user.managedSiteIds!.includes(sale.siteId));
      }
      
      const datesInRange = eachDayOfInterval({
        start: dateRange.from,
        end: dateRange.to || dateRange.from,
      }).map(d => format(d, 'yyyy-MM-dd'));

      const salesByDateAndStall: { [date: string]: { [stallId: string]: number } } = {};
      const relevantStallIds = new Set<string>();

      sales.forEach((sale) => {
        const dateStr = format((sale.saleDate as Timestamp).toDate(), 'yyyy-MM-dd');
        if (!salesByDateAndStall[dateStr]) {
          salesByDateAndStall[dateStr] = {};
        }
        salesByDateAndStall[dateStr][sale.stallId] = (salesByDateAndStall[dateStr][sale.stallId] || 0) + sale.totalAmount;
        relevantStallIds.add(sale.stallId);
      });
      
      let columns = stalls
        .filter((stall) => relevantStallIds.has(stall.id))
        .map((stall) => ({
            id: stall.id,
            name: `${sites.find(s => s.id === stall.siteId)?.name || 'Unknown Site'} | ${stall.name}`
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const rows = datesInRange.map((dateStr) => {
        let rowTotal = 0;
        const row: PivotData['rows'][0] = { date: dateStr, grandTotal: 0 };
        columns.forEach((col) => {
          const salesAmount = salesByDateAndStall[dateStr]?.[col.id] || 0;
          row[col.id] = salesAmount;
          rowTotal += salesAmount;
        });
        row.grandTotal = rowTotal;
        return row;
      }).filter(row => row.grandTotal > 0); // Only show rows with sales

      const columnTotals: PivotData['columnTotals'] = { grandTotal: 0 };
      columns.forEach(col => {
          const total = rows.reduce((sum, row) => sum + (Number(row[col.id]) || 0), 0);
          columnTotals[col.id] = total;
          columnTotals.grandTotal += total;
      });

      setPivotData({ rows, columns, columnTotals });

    } catch (error) {
      console.error('Error fetching pivot data:', error);
    } finally {
      setLoadingReport(false);
    }
  }, [dateRange, siteFilter, user, sites, stalls]);

  useEffect(() => {
    fetchAndProcessData();
  }, [fetchAndProcessData]);

  if (authLoading || userManagementLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <DatePicker
            date={dateRange?.from}
            onDateChange={(d) => setDateRange({ from: d, to: dateRange?.to })}
            className="w-full sm:w-auto"
          />
           <DatePicker
            date={dateRange?.to}
            onDateChange={(d) => setDateRange({ from: dateRange?.from, to: d })}
            className="w-full sm:w-auto"
          />
          {user?.role === 'admin' && (
             <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-[220px] bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground"/><SelectValue placeholder="All Sites" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Sites</SelectItem>{sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {loadingReport ? (
        <div className="flex justify-center items-center py-10"> <Loader2 className="h-8 w-8 animate-spin" /> </div>
      ) : !pivotData || pivotData.rows.length === 0 ? (
        <Alert> <Info className="h-4 w-4" /> <AlertTitle>No Data</AlertTitle> <AlertDescription>No sales data found for the selected filters.</AlertDescription> </Alert>
      ) : (
        <Card>
            <CardHeader><CardTitle>Sales Pivot Table</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
                <Table className="min-w-full">
                <TableHeader>
                    <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10 font-semibold">Date</TableHead>
                    {pivotData.columns.map((col) => (
                        <TableHead key={col.id} className="text-right whitespace-nowrap">{col.name}</TableHead>
                    ))}
                    <TableHead className="text-right sticky right-0 bg-card z-10 font-semibold">Grand Total</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {pivotData.rows.map((row) => (
                    <TableRow key={row.date}>
                        <TableCell className="sticky left-0 bg-card z-10">{row.date}</TableCell>
                        {pivotData.columns.map((col) => (
                        <TableCell key={col.id} className="text-right">
                            {Number(row[col.id]) > 0 ? (Number(row[col.id])).toFixed(2) : '-'}
                        </TableCell>
                        ))}
                        <TableCell className="text-right sticky right-0 bg-card z-10 font-semibold">
                        {row.grandTotal.toFixed(2)}
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                <TableRow className="font-bold bg-muted/50">
                    <TableHead className="sticky left-0 bg-muted/50 z-10">Grand Total</TableHead>
                    {pivotData.columns.map(col => (
                        <TableCell key={col.id} className="text-right">
                           {(pivotData.columnTotals[col.id] || 0).toFixed(2)}
                        </TableCell>
                    ))}
                    <TableCell className="text-right sticky right-0 bg-muted/50 z-10">
                        {pivotData.columnTotals.grandTotal.toFixed(2)}
                    </TableCell>
                </TableRow>
                </Table>
            </CardContent>
        </Card>
      )}
    </div>
  );
}

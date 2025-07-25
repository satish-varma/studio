
"use client";

import { useState, useEffect, useCallback } from "react";
import type { FoodItemExpense, Site, Stall, AppUser } from "@/types";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  getDocs,
  Timestamp,
  QueryConstraint,
  DocumentSnapshot,
  DocumentData,
  onSnapshot,
  sum,
  getAggregateFromServer,
} from "firebase/firestore";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info, ListFilter, DollarSign, Upload, Download, Building, ShoppingCart, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FoodExpensesTable } from "./FoodExpensesTable";
import { foodExpenseCategories } from "@/types/food";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, startOfDay, endOfDay, startOfMonth } from "date-fns";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import CsvImportDialog from "@/components/shared/CsvImportDialog";

const LOG_PREFIX = "[FoodExpensesClientPage]";
const EXPENSES_PER_PAGE = 50;

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore(getApp());

type DateFilterOption = 'today' | 'last_7_days' | 'this_month' | 'all_time';

export default function FoodExpensesClientPage() {
  const { user, activeSiteId, activeStallId, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [expenses, setExpenses] = useState<FoodItemExpense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [errorExpenses, setErrorExpenses] = useState<string | null>(null);
  
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('today');
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  
  const [totalExpensesAmount, setTotalExpensesAmount] = useState<number>(0);
  const [loadingTotal, setLoadingTotal] = useState(true);

  const [allSites, setAllSites] = useState<Site[]>([]);
  const [allVendors, setAllVendors] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sitesMap, setSitesMap] = useState<Record<string, string>>({});
  const [stallsMap, setStallsMap] = useState<Record<string, string>>({});
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});


  const buildExpenseQuery = useCallback(() => {
    if (authLoading || !db || !user) return null;
    if (user.role !== 'admin' && !activeSiteId) return null;

    let qConstraints: QueryConstraint[] = [orderBy("purchaseDate", "desc")];
    
    // Site filter logic
    if (user.role === 'admin' && siteFilter !== 'all') {
      qConstraints.push(where("siteId", "==", siteFilter));
    } else if (activeSiteId) { // For managers or admins with a selected site
      qConstraints.push(where("siteId", "==", activeSiteId));
    }
    
    if (activeStallId) qConstraints.push(where("stallId", "==", activeStallId));
    
    const now = new Date(); let startDate: Date | null = null; let endDate: Date | null = endOfDay(now);
    switch (dateFilter) {
        case 'today': startDate = startOfDay(now); break;
        case 'last_7_days': startDate = startOfDay(subDays(now, 6)); break;
        case 'this_month': startDate = startOfMonth(now); break;
        case 'all_time': startDate = null; endDate = null; break;
    }
    if(startDate) qConstraints.push(where("purchaseDate", ">=", Timestamp.fromDate(startDate)));
    if(endDate) qConstraints.push(where("purchaseDate", "<=", Timestamp.fromDate(endDate)));
    if (categoryFilter !== "all") qConstraints.push(where("category", "==", categoryFilter));
    if (vendorFilter !== "all") qConstraints.push(where("vendor", "==", vendorFilter));
    if (userFilter !== "all") qConstraints.push(where("recordedByUid", "==", userFilter));

    return qConstraints;
  }, [authLoading, user, activeSiteId, activeStallId, dateFilter, categoryFilter, siteFilter, vendorFilter, userFilter]);


  useEffect(() => {
    const fetchContextData = async () => {
      if (!db) return;
      try {
        const sitesSnapshot = await getDocs(query(collection(db, "sites"), orderBy("name")));
        const newSitesMap: Record<string, string> = {};
        const fetchedSites: Site[] = [];
        sitesSnapshot.forEach(doc => { 
            const siteData = { id: doc.id, ...doc.data() } as Site;
            newSitesMap[doc.id] = siteData.name;
            fetchedSites.push(siteData);
        });
        setSitesMap(newSitesMap);
        setAllSites(fetchedSites);

        const stallsSnapshot = await getDocs(collection(db, "stalls"));
        const newStallsMap: Record<string, string> = {};
        stallsSnapshot.forEach(doc => { newStallsMap[doc.id] = (doc.data() as Stall).name; });
        setStallsMap(newStallsMap);
        
        const vendorsSnapshot = await getDocs(query(collection(db, "foodVendors"), orderBy("name")));
        setAllVendors(vendorsSnapshot.docs.map(doc => doc.data().name as string));
        
        const usersSnapshot = await getDocs(query(collection(db, "users"), orderBy("displayName")));
        const newUsersMap: Record<string, string> = {};
        const fetchedUsers: AppUser[] = [];
        usersSnapshot.forEach(doc => {
            const userData = { uid: doc.id, ...doc.data() } as AppUser;
            newUsersMap[doc.id] = userData.displayName || userData.email || 'Unknown User';
            fetchedUsers.push(userData);
        });
        setUsersMap(newUsersMap);
        setAllUsers(fetchedUsers);
        
      } catch (error) {
        toast({ title: "Error", description: "Could not load context data.", variant: "destructive" });
      }
    };
    fetchContextData();
  }, [toast]);
  

  useEffect(() => {
    const baseConstraints = buildExpenseQuery();
    if (!baseConstraints || !db) {
        setExpenses([]);
        setLoadingExpenses(false);
        return;
    }
    setLoadingExpenses(true);
    setErrorExpenses(null);

    const expensesCollectionRef = collection(db, "foodItemExpenses");
    const q = query(expensesCollectionRef, ...baseConstraints, limit(EXPENSES_PER_PAGE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedExpenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(),
      } as FoodItemExpense));
      setExpenses(fetchedExpenses);
      setLoadingExpenses(false);
    }, (error) => {
      console.error(`${LOG_PREFIX} Real-time expenses fetch error:`, error);
      setErrorExpenses(error.message || "Failed to load expenses in real-time.");
      setLoadingExpenses(false);
    });
    
    const fetchTotal = async () => {
        setLoadingTotal(true);
        try {
            const totalQuery = query(expensesCollectionRef, ...baseConstraints);
            const snapshot = await getAggregateFromServer(totalQuery, {
                totalCost: sum('totalCost')
            });
            setTotalExpensesAmount(snapshot.data().totalCost || 0);
        } catch(error) {
            console.error("Error calculating total expenses:", error);
            setTotalExpensesAmount(0);
        } finally {
            setLoadingTotal(false);
        }
    };
    fetchTotal();

    return () => unsubscribe();
  }, [buildExpenseQuery, db]);


  const escapeCsvCell = (cellData: any): string => {
    if (cellData === null || cellData === undefined) return "";
    const stringData = String(cellData);
    if (stringData.includes(",") || stringData.includes("\n") || stringData.includes('"')) {
      return `"${stringData.replace(/"/g, '""')}"`;
    }
    return stringData;
  };

  const getFormattedTimestamp = () => new Date().toISOString().replace(/:/g, '-').slice(0, 19);

  const downloadCsv = (csvString: string, filename: string) => {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleExport = async () => {
    if (!db) {
        toast({ title: "Export Error", description: "Database is not available.", variant: "destructive"});
        return;
    }
    setIsExporting(true);
    toast({ title: "Exporting...", description: "Fetching all matching expenses for export. Please wait."});
    
    const exportConstraints = buildExpenseQuery();
    if (!exportConstraints) {
        toast({ title: "Export Error", description: "Cannot export without a valid context.", variant: "destructive"});
        setIsExporting(false);
        return;
    }

    try {
      const expensesCollectionRef = collection(db, "foodItemExpenses");
      const exportQuery = query(expensesCollectionRef, ...exportConstraints);
      const querySnapshot = await getDocs(exportQuery);
      const itemsToExport: FoodItemExpense[] = querySnapshot.docs.map(doc => ({
          id: doc.id, ...doc.data(), purchaseDate: (doc.data().purchaseDate as Timestamp).toDate(),
      } as FoodItemExpense));

      if (itemsToExport.length === 0) {
        toast({ title: "No Expenses to Export", description: "There are no expenses matching the current filters.", variant: "default" });
        setIsExporting(false);
        return;
      }
      
      const headers = ["Expense ID", "Category", "Total Cost", "Payment Method", "Other Payment Details", "Purchase Date", "Vendor", "Other Vendor Details", "Notes", "Bill Image URL", "Site Name", "Stall Name", "Recorded By (Name)", "Recorded By (UID)"];
      const csvRows = [headers.join(',')];
      
      const toDateSafe = (date: Date | Timestamp) => {
        return (date as Timestamp)?.toDate ? (date as Timestamp).toDate() : new Date(date as string | Date);
      }

      itemsToExport.forEach(expense => {
        const row = [
          escapeCsvCell(expense.id), escapeCsvCell(expense.category), escapeCsvCell(expense.totalCost.toFixed(2)),
          escapeCsvCell(expense.paymentMethod), escapeCsvCell(expense.otherPaymentMethodDetails || ""),
          escapeCsvCell(format(toDateSafe(expense.purchaseDate), "yyyy-MM-dd")),
          escapeCsvCell(expense.vendor || ""), escapeCsvCell(expense.otherVendorDetails || ""),
          escapeCsvCell(expense.notes || ""), escapeCsvCell(expense.billImageUrl || ""),
          escapeCsvCell(expense.siteId ? sitesMap[expense.siteId] || expense.siteId : "N/A"),
          escapeCsvCell(expense.stallId ? stallsMap[expense.stallId] || expense.stallId : "N/A"),
          escapeCsvCell(expense.recordedByName || ""), escapeCsvCell(expense.recordedByUid),
        ];
        csvRows.push(row.join(','));
      });
      downloadCsv(csvRows.join("\n"), `stallsync_food_expenses_${getFormattedTimestamp()}.csv`);
      toast({ title: "Export Successful", description: `${itemsToExport.length} expenses exported.` });
    } catch (error: any) {
      toast({ title: "Export Failed", description: `Could not export expenses. ${error.message}`, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  if (authLoading) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading user context...</p></div>;
  }
  
  if (user?.role !== 'admin' && !activeSiteId) {
    return (
      <Alert variant="default" className="border-primary/50">
        <Info className="h-4 w-4" />
        <AlertTitle>Context Required</AlertTitle>
        <AlertDescription>
          Please select an active site from the header to view expenses.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <CardTitle>Filter & Summary</CardTitle>
              <CardDescription className="mt-1">
                Total expenses for the selected period and category.
                {!activeSiteId ? ' (Aggregated for all sites)' : !activeStallId ? ' (Aggregated for all stalls in site)' : ''}
              </CardDescription>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Total Expenses</p>
              <div className="text-2xl font-bold">
                {loadingTotal ? (
                  <Loader2 className="h-6 w-6 animate-spin"/>
                ) : (
                  `₹${totalExpensesAmount.toFixed(2)}`
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-2 border-t pt-4">
          <div className="flex-1 flex flex-wrap gap-2">
            <Button variant={dateFilter === 'today' ? 'default' : 'outline'} onClick={() => setDateFilter('today')}>Today</Button>
            <Button variant={dateFilter === 'last_7_days' ? 'default' : 'outline'} onClick={() => setDateFilter('last_7_days')}>Last 7 Days</Button>
            <Button variant={dateFilter === 'this_month' ? 'default' : 'outline'} onClick={() => setDateFilter('this_month')}>This Month</Button>
            <Button variant={dateFilter === 'all_time' ? 'default' : 'outline'} onClick={() => setDateFilter('all_time')}>All Time</Button>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row gap-2 justify-end">
            {user?.role === 'admin' && (
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                    <SelectTrigger className="w-full md:w-[180px] bg-input"><Building className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by site" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All Sites</SelectItem>{allSites.map(site => (<SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>))}</SelectContent>
                </Select>
            )}
             <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-input"><ShoppingCart className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by vendor" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Vendors</SelectItem>{allVendors.map(v => (<SelectItem key={v} value={v}>{v}</SelectItem>))}<SelectItem value="Other">Other</SelectItem></SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-input"><ListFilter className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by category" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Categories</SelectItem>{foodExpenseCategories.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-input"><Users className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Filter by user" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Users</SelectItem>{allUsers.map(u => (<SelectItem key={u.uid} value={u.uid}>{u.displayName}</SelectItem>))}</SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setShowImportDialog(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>{isExporting ? <Download className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4" />}Export</Button>
          </div>
        </CardContent>
      </Card>

      {loadingExpenses && expenses.length === 0 && (
        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading expenses...</p></div>
      )}
      {errorExpenses && (
        <Alert variant="destructive"><Info className="h-4 w-4" /><AlertTitle>Error Loading Expenses</AlertTitle><AlertDescription>{errorExpenses}</AlertDescription></Alert>
      )}
      {!loadingExpenses && !errorExpenses && (
        <FoodExpensesTable 
          expenses={expenses}
          isLoading={loadingExpenses}
          sitesMap={sitesMap}
          usersMap={usersMap}
        />
      )}
      <CsvImportDialog
        dataType="foodExpenses"
        isOpen={showImportDialog}
        onClose={() => {
          setShowImportDialog(false);
        }}
      />
    </div>
  );
}

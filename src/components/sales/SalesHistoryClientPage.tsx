
"use client";

import { useState, useMemo, useEffect } from "react";
import { SalesHistoryControls } from "@/components/sales/SalesHistoryControls";
import { SalesTable } from "@/components/sales/SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import type { SaleTransaction } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { getFirestore, collection, onSnapshot, query, where, orderBy, Timestamp, QuerySnapshot, DocumentData } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SalesHistoryClientPage:", error);
  }
}
const db = getFirestore();

export default function SalesHistoryClientPage() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [staffFilter, setStaffFilter] = useState("all"); // 'all' or a staff UID
  
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [errorTransactions, setErrorTransactions] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      // Don't fetch if user is not loaded or not authenticated
      setLoadingTransactions(false);
      return;
    }

    // TODO: Secure this data fetching with Firebase Security Rules.
    // Staff should only see their own sales. Managers/Admins can see all sales or filter by staff.
    let salesQuery = query(collection(db, "salesTransactions"), orderBy("transactionDate", "desc"));

    if (user.role === 'staff') {
      salesQuery = query(salesQuery, where("staffId", "==", user.uid));
    } else if (staffFilter !== "all") {
      salesQuery = query(salesQuery, where("staffId", "==", staffFilter));
    }
    
    // Apply date range filter if dates are set
    // Firestore timestamps need to be handled carefully
    if (dateRange?.from) {
      salesQuery = query(salesQuery, where("transactionDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))));
    }
    if (dateRange?.to) {
      salesQuery = query(salesQuery, where("transactionDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))));
    }


    const unsubscribe = onSnapshot(salesQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedTransactions: SaleTransaction[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Ensure transactionDate is a string (ISO format) as expected by the type
            transactionDate: (data.transactionDate as Timestamp).toDate().toISOString(),
          } as SaleTransaction;
        });
        setTransactions(fetchedTransactions);
        setLoadingTransactions(false);
        setErrorTransactions(null);
      },
      (error) => {
        console.error("Error fetching sales transactions:", error);
        setErrorTransactions("Failed to load sales history. Please try again later.");
        setLoadingTransactions(false);
      }
    );

    return () => unsubscribe();
  }, [user, dateRange, staffFilter]);
  
  // Filtering client-side after fetching based on role / selection
  // This is mainly for date range now as Firestore query handles staff filtering
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDateObj = new Date(transaction.transactionDate);
      
      const matchesDateRange = dateRange?.from && dateRange?.to 
        ? isWithinInterval(transactionDateObj, { start: startOfDay(dateRange.from), end: endOfDay(dateRange.to) })
        : dateRange?.from // if only 'from' is set, filter from that date onwards
        ? transactionDateObj >= startOfDay(dateRange.from)
        : true; 
      
      // Staff filter is now primarily handled by the Firestore query
      // This client-side filter can be a fallback or for additional logic if needed
      let matchesStaff = true;
      if (user?.role === 'staff') {
        matchesStaff = transaction.staffId === user.uid;
      } else if (staffFilter !== "all") {
        matchesStaff = transaction.staffId === staffFilter;
      }
      
      return matchesDateRange && matchesStaff;
    });
  }, [transactions, dateRange, staffFilter, user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales History"
        description="View and filter all past sales transactions."
      />
      <SalesHistoryControls
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        staffFilter={staffFilter}
        onStaffFilterChange={setStaffFilter}
        // staffMembers prop is removed for now, TODO: fetch from 'users' collection for managers/admins
      />
      {loadingTransactions && (
         <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading sales history...</p>
        </div>
      )}
      {errorTransactions && (
        <div className="text-center py-10 text-destructive">
          <p>{errorTransactions}</p>
        </div>
      )}
      {!loadingTransactions && !errorTransactions && <SalesTable transactions={filteredTransactions} />}
    </div>
  );
}

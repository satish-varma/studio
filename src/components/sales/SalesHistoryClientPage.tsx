
"use client";

import { useState, useMemo, useEffect } from "react";
import { SalesHistoryControls } from "@/components/sales/SalesHistoryControls";
import { SalesTable } from "@/components/sales/SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import type { SaleTransaction, AppUser } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    query, 
    where, 
    orderBy, 
    Timestamp, 
    QuerySnapshot, 
    DocumentData,
    getDocs,
    doc,
    updateDoc
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [staffFilter, setStaffFilter] = useState("all"); // 'all' or a staff UID
  
  const [transactions, setTransactions] = useState<SaleTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [errorTransactions, setErrorTransactions] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';

  useEffect(() => {
    async function fetchStaffMembers() {
      if (isManagerOrAdmin) {
        setLoadingStaff(true);
        try {
          const usersCollectionRef = collection(db, "users");
          const qUsers = query(usersCollectionRef, where("role", "in", ["staff", "manager", "admin"]));
          const querySnapshot = await getDocs(qUsers);
          const fetchedStaff: AppUser[] = [];
          querySnapshot.forEach((doc) => {
            fetchedStaff.push({ uid: doc.id, ...doc.data() } as AppUser);
          });
          setStaffList(fetchedStaff);
        } catch (error) {
          console.error("Error fetching staff members:", error);
        } finally {
          setLoadingStaff(false);
        }
      }
    }
    if (user) { 
        fetchStaffMembers();
    }
  }, [user, isManagerOrAdmin]);


  useEffect(() => {
    if (!user) {
      setLoadingTransactions(false);
      return;
    }

    setLoadingTransactions(true);
    let salesQueryConstraints = [
        orderBy("transactionDate", "desc"),
        where("isDeleted", "!=", true) // Filter out soft-deleted sales
    ];

    if (user.role === 'staff') {
      salesQueryConstraints.push(where("staffId", "==", user.uid));
    } else if (isManagerOrAdmin && staffFilter !== "all") {
      salesQueryConstraints.push(where("staffId", "==", staffFilter));
    }
    
    if (dateRange?.from) {
      salesQueryConstraints.push(where("transactionDate", ">=", Timestamp.fromDate(startOfDay(dateRange.from))));
    }
    if (dateRange?.to) {
      salesQueryConstraints.push(where("transactionDate", "<=", Timestamp.fromDate(endOfDay(dateRange.to))));
    }
    
    const salesQuery = query(collection(db, "salesTransactions"), ...salesQueryConstraints);

    const unsubscribe = onSnapshot(salesQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const fetchedTransactions: SaleTransaction[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
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
  }, [user, dateRange, staffFilter, isManagerOrAdmin]);

  const handleDeleteSaleWithJustification = async (saleId: string, justification: string) => {
    if (!user || user.role !== 'admin') {
      toast({ title: "Permission Denied", description: "Only admins can delete sales.", variant: "destructive" });
      return;
    }
    if (!justification || justification.trim() === "") {
        toast({ title: "Justification Required", description: "Please provide a reason for deleting the sale.", variant: "destructive" });
        return;
    }

    const saleDocRef = doc(db, "salesTransactions", saleId);
    try {
      await updateDoc(saleDocRef, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: user.uid,
        deletionJustification: justification.trim(),
      });
      toast({ title: "Sale Deleted", description: "The sale transaction has been marked as deleted." });
      // Note: Stock levels are not automatically reverted with a soft delete.
      // This would require a more complex process or manual adjustment if needed.
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete the sale transaction.", variant: "destructive" });
    }
  };
  
  const filteredTransactions = useMemo(() => {
    return transactions; 
  }, [transactions]);

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
        staffMembers={staffList} 
        isLoadingStaff={loadingStaff}
        showStaffFilter={isManagerOrAdmin}
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
      {!loadingTransactions && !errorTransactions && 
        <SalesTable 
            transactions={filteredTransactions} 
            currentUserRole={user?.role}
            onDeleteSale={handleDeleteSaleWithJustification}
        />
      }
    </div>
  );
}

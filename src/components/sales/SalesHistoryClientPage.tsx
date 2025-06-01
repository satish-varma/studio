
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
    updateDoc,
    QueryConstraint 
} from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SalesHistoryClientPage:", error);
  }
}
const db = getFirestore();

export default function SalesHistoryClientPage() {
  const { user, activeSiteId, activeStallId } = useAuth();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [staffFilter, setStaffFilter] = useState("all"); 
  
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
          toast({ title: "Error", description: "Could not load staff list for filtering.", variant: "destructive" });
        } finally {
          setLoadingStaff(false);
        }
      }
    }
    if (user) { 
        fetchStaffMembers();
    }
  }, [user, isManagerOrAdmin, toast]);


  useEffect(() => {
    if (!user) {
      setLoadingTransactions(false);
      setErrorTransactions("User not authenticated.");
      return;
    }

    if (user.role === 'admin' && !activeSiteId) {
      setLoadingTransactions(false);
      setErrorTransactions(null); 
      setTransactions([]); 
      return;
    }
    if (!activeSiteId && (user.role === 'staff' || user.role === 'manager')) {
        setLoadingTransactions(false);
        setErrorTransactions("No active site context. Please check your profile settings or contact an admin.");
        setTransactions([]);
        return;
    }

    setLoadingTransactions(true);
    setErrorTransactions(null);
    
    const salesCollectionRef = collection(db, "salesTransactions");
    let salesQueryConstraints: QueryConstraint[] = [
        orderBy("transactionDate", "desc"),
        where("isDeleted", "==", false) // Changed from "!=" to "==" for better indexing
    ];

    if (activeSiteId) {
        salesQueryConstraints.push(where("siteId", "==", activeSiteId));
        if (activeStallId) {
            salesQueryConstraints.push(where("stallId", "==", activeStallId));
        }
    } else if (user.role !== 'admin') { 
        setLoadingTransactions(false);
        setErrorTransactions("Site context is missing for your role.");
        setTransactions([]);
        return;
    }

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
    
    const finalSalesQuery = query(salesCollectionRef, ...salesQueryConstraints);

    const unsubscribe = onSnapshot(finalSalesQuery,
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
      },
      (error: any) => {
        console.error("Error fetching sales transactions:", error);
        if (error.code === 'failed-precondition' && error.message.includes("requires an index")) {
          setErrorTransactions(`Query requires a Firestore index. Please create it using the link in the Firebase error details, or directly in the Firebase console. Full error: ${error.message}`);
        } else {
          setErrorTransactions("Failed to load sales history. Please try again later.");
        }
        setLoadingTransactions(false);
      }
    );

    return () => unsubscribe();
  }, [user, activeSiteId, activeStallId, dateRange, staffFilter, isManagerOrAdmin]);

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
    } catch (error: any) {
      console.error("Error deleting sale:", error);
      toast({ title: "Deletion Failed", description: error.message || "Could not delete the sale transaction.", variant: "destructive" });
    }
  };
  
  const filteredTransactions = useMemo(() => {
    return transactions; 
  }, [transactions]);

  if (user?.role === 'admin' && !activeSiteId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sales History"
          description="View and filter all past sales transactions."
        />
        <Alert variant="default" className="border-primary/50">
          <Info className="h-4 w-4" />
          <AlertTitle>Select a Site</AlertTitle>
          <AlertDescription>
            Please select an active Site from the dropdown in the header bar to view sales history.
            You can select "All Stalls" within a site or a specific stall.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales History"
        description="View and filter all past sales transactions for the selected site/stall."
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
        <Alert variant="destructive" className="my-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Error Loading Sales</AlertTitle>
          <AlertDescription>{errorTransactions}</AlertDescription>
        </Alert>
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


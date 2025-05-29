"use client";

import { useState, useMemo } from "react";
import { SalesHistoryControls } from "@/components/sales/SalesHistoryControls";
import { SalesTable } from "@/components/sales/SalesTable";
import PageHeader from "@/components/shared/PageHeader";
import { mockSalesTransactions } from "@/data/mockData"; // Using mock data
import type { SaleTransaction } from "@/types";
import type { DateRange } from "react-day-picker";
import { subDays, isWithinInterval } from "date-fns";

// Mock staff list (in a real app, this would come from user data)
const mockStaffMembers = [
  { id: "staff-id", name: "Staff User" },
  { id: "manager-id", name: "Manager User" },
  { id: "admin-id", name: "Admin User" },
];

export default function SalesHistoryClientPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29), // Default to last 30 days
    to: new Date(),
  });
  const [staffFilter, setStaffFilter] = useState("all");

  // In a real app, transactions would be fetched from an API/backend
  const transactions: SaleTransaction[] = mockSalesTransactions;

  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const transactionDate = new Date(transaction.transactionDate);
      const matchesDateRange = dateRange?.from && dateRange?.to 
        ? isWithinInterval(transactionDate, { start: dateRange.from, end: dateRange.to })
        : true; // if no range, or only one date, show all (or handle differently)
      
      const matchesStaff = staffFilter === "all" || transaction.staffId === staffFilter;
      
      return matchesDateRange && matchesStaff;
    });
  }, [transactions, dateRange, staffFilter]);

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
        staffMembers={mockStaffMembers}
      />
      <SalesTable transactions={filteredTransactions} />
    </div>
  );
}

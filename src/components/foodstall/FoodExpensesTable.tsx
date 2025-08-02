
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { FoodItemExpense } from "@/types/food";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ListChecks,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Edit,
  Building,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import type { Timestamp } from "firebase/firestore";

interface FoodExpensesTableProps {
  expenses: FoodItemExpense[];
  isLoading: boolean;
  sitesMap: Record<string, string>;
  usersMap: Record<string, string>;
  expensesPerPage: number;
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-20" />
    </TableCell>
    <TableCell className="hidden md:table-cell">
      <Skeleton className="h-4 w-32" />
    </TableCell>
    <TableCell className="text-right">
      <Skeleton className="h-4 w-20 inline-block" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell className="hidden md:table-cell">
      <Skeleton className="h-4 w-20" />
    </TableCell>
     <TableCell className="hidden lg:table-cell">
      <Skeleton className="h-4 w-28" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-8 w-8" />
    </TableCell>
  </TableRow>
);

export function FoodExpensesTable({
  expenses,
  isLoading,
  sitesMap,
  usersMap,
  expensesPerPage,
}: FoodExpensesTableProps) {
  const router = useRouter();

  const handleEdit = (expenseId: string) => {
    router.push(`/foodstall/expenses/${expenseId}/edit`);
  };

  const formatDateForDisplay = (date: Date | string | Timestamp) => {
    if (!date) return "N/A";
    try {
      const dateObj = (date as Timestamp)?.toDate ? (date as Timestamp).toDate() : new Date(date as string | Date);
      return format(dateObj, "MMM dd, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const formatDateTimeForDisplay = (dateString?: string) => {
      if (!dateString) return "N/A";
      try {
        return format(new Date(dateString), "MMM dd, yyyy h:mm a");
      } catch (e) {
        return "Invalid Date";
      }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };

  const getVendorName = (expense: FoodItemExpense) => {
    if (expense.vendor === 'Other') {
        return expense.otherVendorDetails || 'Other';
    }
    return expense.vendor || 'N/A';
  }

  if (isLoading && expenses.length === 0) {
    return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Purchase Date</TableHead>
              <TableHead className="hidden md:table-cell">Site</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead className="hidden md:table-cell">Vendor</TableHead>
              <TableHead className="hidden lg:table-cell">Recorded By</TableHead>
              <TableHead className="hidden lg:table-cell">Last Updated</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRowSkeleton key={`skeleton-${i}`} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (expenses.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">
          No Expenses Found
        </p>
        <p className="text-muted-foreground">
          There are no food expenses recorded for the selected criteria.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Category</TableHead>
              <TableHead className="w-[120px]">Purchase Date</TableHead>
              <TableHead className="w-[150px] hidden md:table-cell">Site</TableHead>
              <TableHead className="w-[120px] text-right">Total Cost</TableHead>
              <TableHead className="w-[130px]">Payment Method</TableHead>
              <TableHead className="w-[130px] hidden md:table-cell">Vendor</TableHead>
              <TableHead className="w-[150px] hidden lg:table-cell">Recorded By</TableHead>
              <TableHead className="w-[180px] hidden lg:table-cell">Last Updated</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {expense.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateForDisplay(expense.purchaseDate)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                   <div className="flex items-center">
                    <Building size={12} className="mr-1.5 text-primary/70 flex-shrink-0" />
                    <span>{sitesMap[expense.siteId] || expense.siteId.substring(0,10)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-accent">
                  {formatCurrency(expense.totalCost)}
                </TableCell>
                <TableCell className="text-foreground">
                  {expense.paymentMethod}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {getVendorName(expense)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                    {usersMap[expense.recordedByUid] || 'N/A'}
                </TableCell>
                 <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                    {formatDateTimeForDisplay(expense.updatedAt)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {expense.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help inline-flex items-center gap-1">
                           <Info size={12} />
                           {expense.notes}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>{expense.notes}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    "N/A"
                  )}
                </TableCell>
                <TableCell>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleEdit(expense.id)}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit Expense</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-center text-xs text-muted-foreground pt-2">
        Showing up to {expensesPerPage} latest results matching filters.
      </div>
    </TooltipProvider>
  );
}

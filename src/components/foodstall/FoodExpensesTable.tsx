
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Link as LinkIcon,
  Edit,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import type { Timestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

interface FoodExpensesTableProps {
  expenses: FoodItemExpense[];
  isLoading: boolean;
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell>
      <Skeleton className="h-4 w-24" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-20" />
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
    <TableCell className="hidden md:table-cell">
      <Skeleton className="h-4 w-32" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-4 w-8" />
    </TableCell>
    <TableCell>
      <Skeleton className="h-8 w-8" />
    </TableCell>
  </TableRow>
);

export function FoodExpensesTable({
  expenses,
  isLoading,
}: FoodExpensesTableProps) {
  const router = useRouter();

  const handleEdit = (expenseId: string) => {
    router.push(`/foodstall/expenses/${expenseId}/edit`);
  };

  const formatDateForDisplay = (date: Date | string | Timestamp) => {
    if (!date) return "N/A";
    try {
      // Check if it's a Firestore Timestamp and convert it, otherwise create a new Date
      const dateObj = (date as Timestamp)?.toDate ? (date as Timestamp).toDate() : new Date(date as string | Date);
      return format(dateObj, "MMM dd, yyyy");
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
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total Cost</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead className="hidden md:table-cell">Vendor</TableHead>
              <TableHead className="hidden md:table-cell">Recorded By</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Bill</TableHead>
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
      <ScrollArea className="rounded-lg border shadow-sm bg-card h-[60vh]">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[150px]">Category</TableHead>
              <TableHead className="w-[120px]">Purchase Date</TableHead>
              <TableHead className="w-[120px] text-right">Total Cost</TableHead>
              <TableHead className="w-[130px]">Payment Method</TableHead>
              <TableHead className="w-[130px] hidden md:table-cell">Vendor</TableHead>
              <TableHead className="w-[130px] hidden md:table-cell">Recorded By</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
              <TableHead className="w-[60px]">Bill</TableHead>
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
                <TableCell className="text-right font-semibold text-accent">
                  {formatCurrency(expense.totalCost)}
                </TableCell>
                <TableCell className="text-foreground">
                  {expense.paymentMethod}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {getVendorName(expense)}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs hidden md:table-cell">
                  {expense.recordedByName || expense.recordedByUid.substring(0, 8)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {expense.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">
                          {expense.notes.substring(0, 25)}
                          {expense.notes.length > 25 ? "..." : ""}
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
                  {expense.billImageUrl ? (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link href={expense.billImageUrl} target="_blank" rel="noopener noreferrer">
                            <LinkIcon className="h-4 w-4 text-primary" />
                            <span className="sr-only">View Bill</span>
                        </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
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
      </ScrollArea>
      <div className="text-center text-xs text-muted-foreground pt-2">
        Showing up to 50 latest results matching filters.
      </div>
    </TooltipProvider>
  );
}

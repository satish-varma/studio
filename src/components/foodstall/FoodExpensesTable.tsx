
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ListChecks, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface FoodExpensesTableProps {
  expenses: FoodItemExpense[];
  onNextPage: () => void;
  onPrevPage: () => void;
  isLastPage: boolean;
  isFirstPage: boolean;
  currentPage: number;
  itemsPerPage: number;
  isLoading: boolean; // For showing skeletons
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-12 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
  </TableRow>
);


export function FoodExpensesTable({
  expenses,
  onNextPage,
  onPrevPage,
  isLastPage,
  isFirstPage,
  currentPage,
  itemsPerPage,
  isLoading
}: FoodExpensesTableProps) {

  const formatDateForDisplay = (date: Date | string) => {
    if (!date) return "N/A";
    try {
      return format(new Date(date), "MMM dd, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toFixed(2)}`;
  };
  
  if (isLoading && expenses.length === 0) {
     return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
             <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
          </TableHeader>
           <TableBody>
            {[...Array(5)].map((_, i) => <TableRowSkeleton key={`skeleton-${i}`} />)}
          </TableBody>
        </Table>
      </div>
    );
  }


  if (expenses.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Expenses Found</p>
        <p className="text-muted-foreground">
          There are no food expenses recorded for the selected criteria.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="rounded-lg border shadow-sm bg-card">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[150px]">Item Name</TableHead>
              <TableHead className="w-[130px]">Category</TableHead>
              <TableHead className="w-[120px]">Purchase Date</TableHead>
              <TableHead className="w-[80px] text-right">Quantity</TableHead>
              <TableHead className="w-[80px]">Unit</TableHead>
              <TableHead className="w-[120px] text-right">Total Cost</TableHead>
              <TableHead className="w-[130px]">Vendor</TableHead>
              <TableHead className="w-[130px]">Recorded By</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell className="font-medium text-foreground">{expense.itemName}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{expense.category}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{formatDateForDisplay(expense.purchaseDate)}</TableCell>
                <TableCell className="text-right text-foreground">{expense.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{expense.unit}</TableCell>
                <TableCell className="text-right font-semibold text-accent">{formatCurrency(expense.totalCost)}</TableCell>
                <TableCell className="text-muted-foreground">{expense.vendor || "N/A"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{expense.recordedByName || expense.recordedByUid.substring(0,8)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {expense.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">{expense.notes.substring(0, 25)}{expense.notes.length > 25 ? "..." : ""}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p>{expense.notes}</p></TooltipContent>
                    </Tooltip>
                  ) : (
                    "N/A"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {(expenses.length > 0 || !isFirstPage || !isLastPage) && (
        <div className="flex items-center justify-end space-x-2 py-4 px-2 border-t">
          <span className="text-sm text-muted-foreground">
            Page {currentPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={isFirstPage || isLoading}
          >
            {isLoading && currentPage > 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={isLastPage || isLoading}
          >
             <span className="mr-1 hidden sm:inline">Next</span>
            {isLoading && !isLastPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </TooltipProvider>
  );
}

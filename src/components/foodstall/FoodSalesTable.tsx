
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
import type { FoodSaleTransaction } from "@/types/food";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Loader2, ShoppingCart, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from 'next/navigation';

interface FoodSalesTableProps {
  sales: FoodSaleTransaction[];
  onNextPage: () => void;
  onPrevPage: () => void;
  isLastPage: boolean;
  isFirstPage: boolean;
  currentPage: number;
  isLoading: boolean;
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
  </TableRow>
);

export function FoodSalesTable({
  sales,
  onNextPage,
  onPrevPage,
  isLastPage,
  isFirstPage,
  currentPage,
  isLoading
}: FoodSalesTableProps) {
  const router = useRouter();

  const formatDateForDisplay = (date: Date | string) => {
    if (!date) return "N/A";
    try {
      return format(new Date(date), "PPP"); // e.g., Jun 20, 2024
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const handleEdit = (date: Date) => {
    const dateString = format(date, 'yyyy-MM-dd');
    router.push(`/foodstall/sales/record?date=${dateString}`);
  };

  const formatCurrency = (amount: number | null | undefined) => `₹${(amount || 0).toFixed(2)}`;

  if (isLoading && sales.length === 0) {
     return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Breakfast</TableHead><TableHead className="text-right">Lunch</TableHead><TableHead className="text-right">Dinner</TableHead><TableHead className="text-right">Snacks</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Recorded By</TableHead><TableHead>Notes</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
           <TableBody>{[...Array(10)].map((_, i) => <TableRowSkeleton key={`skeleton-${i}`} />)}</TableBody>
        </Table>
      </div>
    );
  }

  if (sales.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Daily Sales Found</p>
        <p className="text-muted-foreground">There are no daily sales summaries recorded for this stall yet.</p>
        <Button className="mt-4" onClick={() => router.push('/foodstall/sales/record')}>
          Record Today's Sales
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="rounded-lg border shadow-sm bg-card">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="text-right">Breakfast</TableHead>
              <TableHead className="text-right">Lunch</TableHead>
              <TableHead className="text-right">Dinner</TableHead>
              <TableHead className="text-right">Snacks</TableHead>
              <TableHead className="w-[120px] text-right font-semibold">Total Amount</TableHead>
              <TableHead className="w-[150px]">Recorded By</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-medium text-foreground">{formatDateForDisplay(sale.saleDate)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.breakfastSales)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.lunchSales)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.dinnerSales)}</TableCell>
                <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.snacksSales)}</TableCell>
                <TableCell className="text-right font-semibold text-accent">{formatCurrency(sale.totalAmount)}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{sale.recordedByName || sale.recordedByUid.substring(0, 8)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {sale.notes ? (
                    <Tooltip><TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">{sale.notes.substring(0, 25)}{sale.notes.length > 25 ? "..." : ""}</span></TooltipTrigger><TooltipContent className="max-w-xs"><p>{sale.notes}</p></TooltipContent></Tooltip>
                  ) : "N/A"}
                </TableCell>
                <TableCell>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleEdit(sale.saleDate as Date)}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                    </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {(sales.length > 0 || !isFirstPage || !isLastPage) && (
        <div className="flex items-center justify-end space-x-2 py-4 px-2 border-t">
          <span className="text-sm text-muted-foreground">Page {currentPage}</span>
          <Button variant="outline" size="sm" onClick={onPrevPage} disabled={isFirstPage || isLoading}><ChevronLeft className="h-4 w-4" /><span className="ml-1 hidden sm:inline">Previous</span></Button>
          <Button variant="outline" size="sm" onClick={onNextPage} disabled={isLastPage || isLoading}><span className="mr-1 hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </TooltipProvider>
  );
}

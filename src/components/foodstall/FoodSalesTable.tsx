
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
import { ListChecks, ChevronLeft, ChevronRight, Loader2, Utensils, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-16 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
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

  const formatDateForDisplay = (date: Date | string) => {
    if (!date) return "N/A";
    try {
      return format(new Date(date), "MMM dd, yyyy h:mm a");
    } catch (e) {
      return "Invalid Date";
    }
  };

  const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

  if (isLoading && sales.length === 0) {
     return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table><TableHeader><TableRow><TableHead>Sale Date</TableHead><TableHead>Meal Type</TableHead><TableHead>Items Sold</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Payment</TableHead><TableHead>Recorded By</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
           <TableBody>{[...Array(5)].map((_, i) => <TableRowSkeleton key={`skeleton-${i}`} />)}</TableBody>
        </Table>
      </div>
    );
  }

  if (sales.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Sales Found</p>
        <p className="text-muted-foreground">There are no food sales recorded for the selected criteria.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="rounded-lg border shadow-sm bg-card">
        <Table className="min-w-full">
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[180px]">Sale Date</TableHead>
              <TableHead className="w-[150px]">Meal Type</TableHead>
              <TableHead>Items Sold</TableHead>
              <TableHead className="w-[120px] text-right">Total Amount</TableHead>
              <TableHead className="w-[120px]">Payment</TableHead>
              <TableHead className="w-[150px]">Recorded By</TableHead>
              <TableHead className="min-w-[180px]">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-medium text-foreground">{formatDateForDisplay(sale.saleDate)}</TableCell>
                <TableCell>
                  {sale.mealType ? <Badge variant="outline" className="text-xs"><Utensils className="h-3 w-3 mr-1.5"/>{sale.mealType}</Badge> : "N/A"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted">{sale.itemsSold.length} item(s)</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs p-2">
                        <ul className="list-disc list-inside space-y-1">
                          {sale.itemsSold.map((item, index) => (
                            <li key={index}>{item.quantity} x {item.itemName} @ {formatCurrency(item.pricePerUnit)}</li>
                          ))}
                        </ul>
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-right font-semibold text-accent">{formatCurrency(sale.totalAmount)}</TableCell>
                <TableCell className="text-muted-foreground">{sale.paymentMethod || "N/A"}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{sale.recordedByName || sale.recordedByUid.substring(0, 8)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {sale.notes ? (
                    <Tooltip><TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">{sale.notes.substring(0, 25)}{sale.notes.length > 25 ? "..." : ""}</span></TooltipTrigger><TooltipContent className="max-w-xs"><p>{sale.notes}</p></TooltipContent></Tooltip>
                  ) : "N/A"}
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

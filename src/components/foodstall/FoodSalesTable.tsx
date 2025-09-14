
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ShoppingCart, Edit, Trash2, Building, Store } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../ui/alert-dialog";
import type { Timestamp } from "firebase/firestore";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { useMemo } from "react";

interface FoodSalesTableProps {
  sales: FoodSaleTransaction[];
  sitesMap: Record<string, string>;
  stallsMap: Record<string, string>;
  onDelete: (sale: FoodSaleTransaction) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean; // Optional loading prop
}

const TableRowSkeleton = () => (
  <TableRow>
    <TableCell className="w-[50px]"><Skeleton className="h-5 w-5" /></TableCell>
    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-20 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-20 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-24 inline-block" /></TableCell>
    <TableCell className="text-right"><Skeleton className="h-4 w-24 inline-block" /></TableCell>
    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
  </TableRow>
);

const formatCurrency = (amount: number | null | undefined) => `₹${(amount || 0).toFixed(2)}`;

export function FoodSalesTable({
  sales,
  sitesMap,
  stallsMap,
  onDelete,
  selectedIds,
  onSelectionChange,
  isLoading = false,
}: FoodSalesTableProps) {
  const router = useRouter();

  const isAllSelected = useMemo(() => sales.length > 0 && selectedIds.length === sales.length, [sales, selectedIds]);
  const isIndeterminate = useMemo(() => selectedIds.length > 0 && selectedIds.length < sales.length, [sales, selectedIds]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    onSelectionChange(checked === true ? sales.map(s => s.id) : []);
  };
  
  const handleSelectOne = (saleId: string, checked: boolean | 'indeterminate') => {
    if (checked === true) {
      onSelectionChange([...selectedIds, saleId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== saleId));
    }
  };

  const formatDateForDisplay = (date: Date | string | Timestamp) => {
    if (!date) return "N/A";
    try {
      const dateObj = (date as Timestamp)?.toDate ? (date as Timestamp).toDate() : new Date(date as string | Date);
      return format(dateObj, "PPP"); // e.g., Jun 20, 2024
    } catch (e) {
      return "Invalid Date";
    }
  };
  
  const handleEdit = (sale: FoodSaleTransaction) => {
    const dateString = format(sale.saleDate as Date, 'yyyy-MM-dd');
    router.push(`/foodstall/sales/record?date=${dateString}&type=${sale.saleType}`);
  };

  if (isLoading && sales.length === 0) {
     return (
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
                <TableHead className="w-[50px]"><Checkbox disabled /></TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden md:table-cell">Site</TableHead>
                <TableHead className="hidden md:table-cell">Stall</TableHead>
                <TableHead>Sale Type</TableHead>
                <TableHead className="text-right">Hungerbox</TableHead>
                <TableHead className="text-right">UPI</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">With Deduction</TableHead>
                <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
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
        <p className="text-muted-foreground">There are no daily sales summaries recorded for the selected criteria.</p>
        <Button className="mt-4" onClick={() => router.push('/foodstall/sales/record')}>
          Record Today's Sales
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
               <TableHead className="w-[50px]">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all sales"
                  data-state={isIndeterminate ? 'indeterminate' : isAllSelected ? 'checked' : 'unchecked'}
                />
              </TableHead>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="hidden md:table-cell w-[150px]">Site</TableHead>
              <TableHead className="hidden md:table-cell w-[150px]">Stall</TableHead>
              <TableHead>Sale Type</TableHead>
              <TableHead className="w-[120px] text-right">Hungerbox</TableHead>
              <TableHead className="w-[120px] text-right">UPI</TableHead>
              <TableHead className="w-[150px] text-right font-semibold">Total Amount</TableHead>
              <TableHead className="w-[150px] text-right font-semibold">With Deduction</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => {
              const hungerboxSales = sale.hungerboxSales || 0;
              const upiSales = sale.upiSales || 0;
              const totalAmount = hungerboxSales + upiSales;
              const commissionRate = sale.saleType === 'MRP' ? 0.08 : 0.18;
              const deduction = hungerboxSales * commissionRate;
              const amountWithDeduction = totalAmount - deduction;
              const isSelected = selectedIds.includes(sale.id);

              return (
                <TableRow key={sale.id} data-state={isSelected ? "selected" : ""}>
                    <TableCell>
                        <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectOne(sale.id, checked)}
                        aria-label={`Select sale from ${formatDateForDisplay(sale.saleDate)}`}
                        />
                    </TableCell>
                  <TableCell className="font-medium text-foreground">{formatDateForDisplay(sale.saleDate)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div className="flex items-center">
                          <Building size={12} className="mr-1.5 text-primary/70 flex-shrink-0" />
                          <span>{sitesMap[sale.siteId] || sale.siteId.substring(0,10)}</span>
                      </div>
                  </TableCell>
                   <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div className="flex items-center">
                          <Store size={12} className="mr-1.5 text-accent/70 flex-shrink-0" />
                          <span>{stallsMap[sale.stallId] || sale.stallId.substring(0,10)}</span>
                      </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={sale.saleType === "MRP" ? "outline" : "secondary"}>{sale.saleType || "Non-MRP"}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.hungerboxSales)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(sale.upiSales)}</TableCell>
                  <TableCell className="text-right font-semibold text-accent">{formatCurrency(totalAmount)}</TableCell>
                  <TableCell className="text-right font-bold text-primary">{formatCurrency(amountWithDeduction)}</TableCell>
                  <TableCell className="flex gap-2">
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleEdit(sale)}>
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the {sale.saleType} sales record for {formatDateForDisplay(sale.saleDate)}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(sale)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

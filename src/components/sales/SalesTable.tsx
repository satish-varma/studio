
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
import type { SaleTransaction, UserRole } from "@/types";
import { MoreHorizontal, Eye, Printer, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SalesTableProps {
  transactions: SaleTransaction[];
  currentUserRole?: UserRole;
  onDeleteSale: (saleId: string, justification: string) => Promise<void>;
  isLoadingNextPage: boolean;
  isLoadingPrevPage: boolean;
  isLastPage: boolean;
  isFirstPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function SalesTable({ 
    transactions, 
    currentUserRole, 
    onDeleteSale,
    isLoadingNextPage,
    isLoadingPrevPage,
    isLastPage,
    isFirstPage,
    onNextPage,
    onPrevPage 
}: SalesTableProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [justification, setJustification] = useState("");
  const [saleToDelete, setSaleToDelete] = useState<SaleTransaction | null>(null);


  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-IN', { 
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return "Invalid Date";
    }
  };

  const handleViewDetails = (transactionId: string) => {
    router.push(`/sales/history/${transactionId}`);
  };

  const handlePrintReceipt = (transactionId: string) => {
    router.push(`/sales/history/${transactionId}?print=true`);
    toast({
      title: "Navigating to Details for Printing",
      description: "The print option is available on the sale details page.",
    });
  };

  const openDeleteDialog = (sale: SaleTransaction) => {
    setSaleToDelete(sale);
    setJustification(""); 
  };

  const closeDeleteDialog = () => {
    setSaleToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (!saleToDelete || !justification.trim()) {
        toast({title: "Error", description: "Justification cannot be empty.", variant: "destructive"});
        return;
    }
    setIsDeleting(true);
    await onDeleteSale(saleToDelete.id, justification.trim());
    setIsDeleting(false);
    closeDeleteDialog();
  };

  const showPagination = transactions.length > 0 || !isFirstPage || !isLastPage;

  if (transactions.length === 0 && isFirstPage && !isLoadingPrevPage && !isLoadingNextPage) {
    return <p className="text-center text-muted-foreground py-8">No sales transactions found for the selected criteria.</p>;
  }

  return (
    <>
      <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items Sold</TableHead>
              <TableHead className="text-right">Total Amount</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((sale) => {
              const totalItemsSold = sale.items.reduce((acc, item) => {
                const quantity = Number(item.quantity);
                return acc + (isNaN(quantity) ? 0 : quantity);
              }, 0);

              return (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium text-primary">
                    <Button variant="link" className="p-0 h-auto" onClick={() => handleViewDetails(sale.id)}>{sale.id.substring(0,8)}...</Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(sale.transactionDate)}</TableCell>
                  <TableCell className="text-muted-foreground">{totalItemsSold}</TableCell>
                  <TableCell className="text-right font-semibold text-accent">₹{sale.totalAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-muted-foreground">{sale.staffName || sale.staffId.substring(0,8)}</TableCell>
                  <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewDetails(sale.id)}>
                            <Eye className="mr-2 h-4 w-4" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrintReceipt(sale.id)}>
                            <Printer className="mr-2 h-4 w-4" /> Print Receipt
                          </DropdownMenuItem>
                          {currentUserRole === 'admin' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => openDeleteDialog(sale)}
                                className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete Sale
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {showPagination && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={isFirstPage || isLoadingPrevPage || isLoadingNextPage}
          >
            {isLoadingPrevPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={isLastPage || isLoadingNextPage || isLoadingPrevPage}
          >
            <span className="mr-2 hidden sm:inline">Next</span>
            {isLoadingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      )}


      {saleToDelete && (
        <AlertDialog open={!!saleToDelete} onOpenChange={(open) => !open && closeDeleteDialog()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Delete Sale Transaction: #{saleToDelete.id.substring(0,8)}...?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will mark the sale as deleted. It will no longer appear in the main sales history.
                    Please provide a justification for this action. This action cannot be directly undone through the UI.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                    <Label htmlFor="justification">Justification for Deletion <span className="text-destructive">*</span></Label>
                    <Textarea
                        id="justification"
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Enter reason for deleting this sale transaction..."
                        className="min-h-[80px] bg-input"
                        disabled={isDeleting}
                    />
                </div>
                <AlertDialogFooter>
                <AlertDialogCancel onClick={closeDeleteDialog} disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                    onClick={handleDeleteConfirm} 
                    disabled={isDeleting || !justification.trim()}
                    className="bg-destructive hover:bg-destructive/90"
                >
                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                    Confirm Delete
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}


    
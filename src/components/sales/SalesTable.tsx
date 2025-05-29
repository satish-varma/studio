import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SaleTransaction } from "@/types";
import { MoreHorizontal, Eye, Printer } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SalesTableProps {
  transactions: SaleTransaction[];
}

export function SalesTable({ transactions }: SalesTableProps) {

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewDetails = (transactionId: string) => {
    alert(`View details for sale ${transactionId} - To be implemented`);
  };

  const handlePrintReceipt = (transactionId: string) => {
    alert(`Print receipt for sale ${transactionId} - To be implemented`);
  };

  if (transactions.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No sales transactions found for the selected criteria.</p>;
  }

  return (
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
          {transactions.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="font-medium text-primary">
                <Button variant="link" className="p-0 h-auto" onClick={() => handleViewDetails(sale.id)}>{sale.id.substring(0,8)}...</Button>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(sale.transactionDate)}</TableCell>
              <TableCell className="text-muted-foreground">{sale.items.length}</TableCell>
              <TableCell className="text-right font-semibold text-accent">${sale.totalAmount.toFixed(2)}</TableCell>
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

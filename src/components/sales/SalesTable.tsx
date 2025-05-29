
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
import { useToast } from "@/hooks/use-toast";

interface SalesTableProps {
  transactions: SaleTransaction[];
}

export function SalesTable({ transactions }: SalesTableProps) {
  const { toast } = useToast();

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
    // TODO: Implement navigation to a detailed sale view page (e.g., /sales/history/[transactionId])
    // or open a modal displaying all items in the transaction, customer details (if any), etc.
    toast({
      title: "TODO: Implement View Sale Details",
      description: `Functionality to view details for sale ${transactionId} needs to be built.`,
    });
  };

  const handlePrintReceipt = (transactionId: string) => {
    // TODO: Implement receipt printing functionality. This might involve:
    // 1. Fetching full sale details.
    // 2. Formatting them into a printable HTML structure.
    // 3. Using window.print() or integrating with a printing service/library.
    toast({
      title: "TODO: Implement Print Receipt",
      description: `Functionality to print a receipt for sale ${transactionId} needs to be built.`,
    });
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
              <TableCell className="text-muted-foreground">{sale.items.reduce((acc, item) => acc + item.quantity, 0)}</TableCell>
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

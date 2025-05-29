import Image from "next/image";
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
import { StockItem } from "@/types";
import { MoreHorizontal, Edit, Trash2, PackageOpen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ItemTableProps {
  items: StockItem[];
}

export function ItemTable({ items }: ItemTableProps) {
  const handleEdit = (itemId: string) => {
    alert(`Edit item ${itemId} - To be implemented`);
  };

  const handleDelete = (itemId: string) => {
    alert(`Delete item ${itemId} - To be implemented`);
  };

  const handleUpdateStock = (itemId: string) => {
    alert(`Update stock for item ${itemId} - To be implemented`);
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (items.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No items found.</p>;
  }

  return (
    <div className="rounded-lg border shadow-sm overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Image</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Low Stock At</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isLowStock = item.quantity <= item.lowStockThreshold;
            const isOutOfStock = item.quantity === 0;
            let stockStatus: "in-stock" | "low-stock" | "out-of-stock" = "in-stock";
            if (isOutOfStock) stockStatus = "out-of-stock";
            else if (isLowStock) stockStatus = "low-stock";
            
            return (
              <TableRow key={item.id} className={cn(
                isLowStock && !isOutOfStock && "bg-orange-500/10 hover:bg-orange-500/20",
                isOutOfStock && "bg-destructive/10 hover:bg-destructive/20",
              )}>
                <TableCell>
                  <Image
                    src={item.imageUrl || `https://placehold.co/64x64.png?text=${item.name.substring(0,2)}`}
                    alt={item.name}
                    width={48}
                    height={48}
                    className="rounded-md object-cover"
                    data-ai-hint={`${item.category} ${item.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-right text-foreground">{item.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                <TableCell className="text-right text-muted-foreground">{item.lowStockThreshold}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      isOutOfStock ? "destructive" : isLowStock ? "outline" : "secondary"
                    }
                    className={cn(
                       isLowStock && !isOutOfStock && "border-orange-500 text-orange-600 dark:text-orange-400",
                       isOutOfStock && "bg-destructive text-destructive-foreground"
                    )}
                  >
                    {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(item.lastUpdated)}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleUpdateStock(item.id)}>
                        <PackageOpen className="mr-2 h-4 w-4" /> Update Stock
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(item.id)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit Item
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-destructive focus:text-destructive-foreground focus:bg-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Item
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

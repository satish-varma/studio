
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
import { useToast } from "@/hooks/use-toast";

interface ItemTableProps {
  items: StockItem[];
}

export function ItemTable({ items }: ItemTableProps) {
  const { toast } = useToast();

  const handleEdit = (itemId: string) => {
    // TODO: Implement item edit functionality. This typically involves:
    // 1. Navigating to an edit page (e.g., /items/[itemId]/edit) or
    // 2. Opening a modal pre-filled with the item's data.
    // 3. Saving changes back to Firestore.
    toast({
      title: "TODO: Implement Edit Item",
      description: `Functionality to edit item ${itemId} needs to be built.`,
    });
  };

  const handleDelete = (itemId: string) => {
    // TODO: Implement item delete functionality. This typically involves:
    // 1. Showing a confirmation dialog.
    // 2. If confirmed, deleting the item document from Firestore.
    // 3. Handling potential errors (e.g., if the item is part of an undeletable transaction).
    toast({
      title: "TODO: Implement Delete Item",
      description: `Functionality to delete item ${itemId} needs to be built with confirmation.`,
      variant: "destructive"
    });
  };

  const handleUpdateStock = (itemId: string) => {
    // TODO: Implement stock update functionality. This typically involves:
    // 1. Opening a modal allowing the user to input the new quantity or adjust the current quantity.
    // 2. Updating the 'quantity' and 'lastUpdated' fields in Firestore for the specific item.
    // 3. Potentially logging this stock adjustment separately if detailed inventory tracking is needed.
    toast({
      title: "TODO: Implement Update Stock",
      description: `Functionality to update stock for item ${itemId} needs to be built.`,
    });
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
            <TableHead className="text-right">Price</TableHead>
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
                    data-ai-hint={`${item.category} item`}
                  />
                </TableCell>
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-right text-foreground">{item.quantity}</TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                <TableCell className="text-right text-foreground">${item.price.toFixed(2)}</TableCell>
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

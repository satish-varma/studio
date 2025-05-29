"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Search, Filter } from "lucide-react";
import { useRouter } from "next/navigation";

interface ItemControlsProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  stockStatusFilter: string;
  onStockStatusFilterChange: (status: string) => void;
  categories: string[]; // Unique categories from items
}

export function ItemControls({
  searchTerm,
  onSearchTermChange,
  categoryFilter,
  onCategoryFilterChange,
  stockStatusFilter,
  onStockStatusFilterChange,
  categories,
}: ItemControlsProps) {
  const router = useRouter();

  const handleAddNewItem = () => {
    // router.push('/items/new'); // Or open a modal
    alert("Add new item functionality to be implemented.");
  };

  return (
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div className="relative flex-grow sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search items by name..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="pl-10 bg-input"
        />
      </div>
      
      <div className="flex flex-col sm:flex-row gap-2 items-stretch">
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px] bg-input">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={stockStatusFilter} onValueChange={onStockStatusFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px] bg-input">
             <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by stock status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock Statuses</SelectItem>
            <SelectItem value="in-stock">In Stock</SelectItem>
            <SelectItem value="low-stock">Low Stock</SelectItem>
            <SelectItem value="out-of-stock">Out of Stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleAddNewItem} className="w-full sm:w-auto">
        <PlusCircle className="mr-2 h-5 w-5" /> Add New Item
      </Button>
    </div>
  );
}

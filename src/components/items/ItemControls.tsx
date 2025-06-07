
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
import { PlusCircle, Search, Filter, Store, Building } from "lucide-react"; // Added Building
import { useRouter } from "next/navigation";
import type { Stall, UserRole } from "@/types";
import { Badge } from "@/components/ui/badge";

interface ItemControlsProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  stockStatusFilter: string;
  onStockStatusFilterChange: (status: string) => void;
  
  userRole?: UserRole; 
  stallFilterOption: string; 
  onStallFilterOptionChange: (option: string) => void;
  staffsEffectiveStallId?: string | null; 
  staffsAssignedStallName?: string; 

  categories: string[]; 
  availableStalls: Stall[]; 
  isSiteActive: boolean;
}

export function ItemControls({
  searchTerm,
  onSearchTermChange,
  categoryFilter,
  onCategoryFilterChange,
  stockStatusFilter,
  onStockStatusFilterChange,
  
  userRole,
  stallFilterOption,
  onStallFilterOptionChange,
  staffsEffectiveStallId,
  staffsAssignedStallName,

  categories,
  availableStalls,
  isSiteActive,
}: ItemControlsProps) {
  const router = useRouter();
  const isStaff = userRole === 'staff';

  const handleAddNewItem = () => {
    router.push('/items/new');
  };

  let staffStallContextDisplay = "";
  if (isStaff) {
    if (staffsEffectiveStallId) {
      staffStallContextDisplay = staffsAssignedStallName ? `Stall: ${staffsAssignedStallName}` : `Stall ID: ${staffsEffectiveStallId.substring(0,6)}...`;
    } else if (isSiteActive) { 
      staffStallContextDisplay = "Location: Site Master Stock";
    } else {
      staffStallContextDisplay = "No specific stall assigned";
    }
  }

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

        {isStaff && isSiteActive ? (
          <div className="flex items-center justify-center h-10 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground w-full sm:w-[220px]">
             {staffsEffectiveStallId ? <Store className="h-4 w-4 mr-2 text-muted-foreground" /> : <Building className="h-4 w-4 mr-2 text-muted-foreground" />}
             {staffStallContextDisplay}
          </div>
        ) : (
          <Select 
            value={stallFilterOption} 
            onValueChange={onStallFilterOptionChange}
            disabled={!isSiteActive} 
          >
            <SelectTrigger className="w-full sm:w-[220px] bg-input" disabled={!isSiteActive}>
              <Store className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder={!isSiteActive ? "Select site for stall filter" : "Filter by stall/location"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock (Site-wide)</SelectItem>
              <SelectItem value="master">Master Stock (Site Level)</SelectItem>
              {availableStalls.map((stall) => (
                <SelectItem key={stall.id} value={stall.id}>
                  {stall.name} ({stall.stallType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Button 
        onClick={handleAddNewItem} 
        className="w-full sm:w-auto" 
        disabled={!isSiteActive}
      >
        <PlusCircle className="mr-2 h-5 w-5" /> Add New Item
      </Button>
    </div>
  );
}


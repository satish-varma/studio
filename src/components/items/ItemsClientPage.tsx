"use client";

import { useState, useMemo } from "react";
import { ItemControls } from "@/components/items/ItemControls";
import { ItemTable } from "@/components/items/ItemTable";
import PageHeader from "@/components/shared/PageHeader";
import { mockStockItems } from "@/data/mockData"; // Using mock data
import type { StockItem } from "@/types";

export default function ItemsClientPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");

  // In a real app, items would be fetched from an API/backend
  const items: StockItem[] = mockStockItems; 

  const uniqueCategories = useMemo(() => {
    const categories = new Set(items.map(item => item.category));
    return Array.from(categories).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearchTerm = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      
      let matchesStockStatus = true;
      if (stockStatusFilter !== "all") {
        const isLowStock = item.quantity <= item.lowStockThreshold;
        const isOutOfStock = item.quantity === 0;
        if (stockStatusFilter === "in-stock") matchesStockStatus = !isLowStock && !isOutOfStock;
        else if (stockStatusFilter === "low-stock") matchesStockStatus = isLowStock && !isOutOfStock;
        else if (stockStatusFilter === "out-of-stock") matchesStockStatus = isOutOfStock;
      }
      
      return matchesSearchTerm && matchesCategory && matchesStockStatus;
    });
  }, [items, searchTerm, categoryFilter, stockStatusFilter]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Stock Items"
        description="Manage your inventory, update stock levels, and view item details."
      />
      <ItemControls
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        stockStatusFilter={stockStatusFilter}
        onStockStatusFilterChange={setStockStatusFilter}
        categories={uniqueCategories}
      />
      <ItemTable items={filteredItems} />
    </div>
  );
}

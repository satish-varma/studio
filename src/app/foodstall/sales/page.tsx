
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle, Bot } from "lucide-react";
import Link from "next/link";
import FoodSalesClientPage from "@/components/foodstall/FoodSalesClientPage";
import { useState } from "react";
import ScrapeHungerboxDialog from "@/components/foodstall/ScrapeHungerboxDialog";

export default function FoodStallSalesPage() {
  const [isScrapeDialogOpen, setIsScrapeDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Daily Sales Summaries"
        description="View and edit daily sales totals for your food stall, broken down by payment type."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button variant="outline" onClick={() => setIsScrapeDialogOpen(true)}>
                <Bot className="mr-2 h-4 w-4"/> Import from Hungerbox
            </Button>
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Manage Today's Sales
              </Button>
            </Link>
          </div>
        }
      />
      <FoodSalesClientPage />
      <ScrapeHungerboxDialog 
        isOpen={isScrapeDialogOpen}
        onClose={() => setIsScrapeDialogOpen(false)}
      />
    </div>
  );
}

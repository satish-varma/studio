
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import FoodSalesClientPage from "@/components/foodstall/FoodSalesClientPage";

export default function FoodStallSalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Daily Sales Summaries"
        description="View and edit daily sales totals for your food stall, broken down by payment type."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Manage Today's Sales
              </Button>
            </Link>
          </div>
        }
      />
      <FoodSalesClientPage />
    </div>
  );
}

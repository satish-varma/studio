
"use client"; 

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import FoodExpensesClientPage from "@/components/foodstall/FoodExpensesClientPage";

export default function FoodStallExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Expenses"
        description="Track and manage all your food stall purchases and operational costs."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Link href="/foodstall/expenses/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Record New Expense
              </Button>
            </Link>
          </div>
        }
      />
      <FoodExpensesClientPage />
    </div>
  );
}

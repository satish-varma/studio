
"use client"; // This page now primarily renders a client component for dynamic data

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle, ListFilter } from "lucide-react";
import Link from "next/link";
import FoodExpensesClientPage from "@/components/foodstall/FoodExpensesClientPage";

export default function FoodStallExpensesPage() {
  // Metadata would typically be defined using Next.js generateMetadata if this were a server component
  // For a client-rendered main content page like this, you might set document.title in FoodExpensesClientPage useEffect

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Expenses"
        description="Track and manage all your food stall purchases and operational costs."
        actions={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Filter button functionality will be handled within FoodExpensesClientPage or a dedicated filter component */}
            {/* <Button variant="outline">
              <ListFilter className="mr-2 h-4 w-4" /> Filter Expenses
            </Button> */}
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


"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import FoodSalesClientPage from "@/components/foodstall/FoodSalesClientPage";

export default function FoodStallSalesPage() {
  // Metadata would typically be defined using Next.js generateMetadata if this were a server component
  // For a client-rendered main content page like this, you might set document.title in the client component's useEffect

  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Sales"
        description="Track and manage all your food sales transactions."
        actions={
          <div className="flex gap-2">
            {/* The filter controls are now part of FoodSalesClientPage */}
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Record New Sale
              </Button>
            </Link>
          </div>
        }
      />
      <FoodSalesClientPage />
    </div>
  );
}

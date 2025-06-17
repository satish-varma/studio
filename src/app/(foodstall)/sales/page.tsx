
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, ListFilter } from "lucide-react";
import Link from "next/link";

export default function FoodStallSalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Sales"
        description="Track and manage all your food sales transactions."
        actions={
          <div className="flex gap-2">
            <Button variant="outline">
              <ListFilter className="mr-2 h-4 w-4" /> Filter Sales
            </Button>
            <Link href="/foodstall/sales/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Record New Sale
              </Button>
            </Link>
          </div>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Sales Transaction List</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Food sales records will be displayed here. (Coming Soon)</p>
          {/* Placeholder for table */}
        </CardContent>
      </Card>
    </div>
  );
}

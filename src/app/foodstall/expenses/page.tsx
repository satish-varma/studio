
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, ListFilter } from "lucide-react";
import Link from "next/link";

export default function FoodStallExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Expenses"
        description="Track and manage all your food stall purchases and operational costs."
        actions={
          <div className="flex gap-2">
            <Button variant="outline">
              <ListFilter className="mr-2 h-4 w-4" /> Filter Expenses
            </Button>
            <Link href="/foodstall/expenses/record">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Record New Expense
              </Button>
            </Link>
          </div>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Expense List</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <p className="text-muted-foreground">Expense records will be displayed here. (Coming Soon)</p>
          {/* Placeholder for table */}
        </CardContent>
      </Card>
    </div>
  );
}

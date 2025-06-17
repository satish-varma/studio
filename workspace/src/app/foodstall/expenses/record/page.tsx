
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { foodExpenseCategories } from "@/types/food";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function RecordFoodExpensePage() {
  const [purchaseDate, setPurchaseDate] = useState<Date | undefined>(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Record New Food Stall Expense"
        description="Enter the details of the purchase or operational cost."
         actions={
          <Link href="/foodstall/expenses">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Expenses
            </Button>
          </Link>
        }
      />
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
          <CardDescription>All fields marked with * are required.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="itemName">Item Name *</Label>
              <Input id="itemName" placeholder="e.g., Tomatoes, Milk, Rent" />
            </div>
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {foodExpenseCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" type="number" placeholder="0" />
            </div>
            <div>
              <Label htmlFor="unit">Unit *</Label>
              <Input id="unit" placeholder="e.g., kg, ltr, pcs, month" />
            </div>
             <div>
              <Label htmlFor="pricePerUnit">Price/Unit * (₹)</Label>
              <Input id="pricePerUnit" type="number" placeholder="0.00" />
            </div>
          </div>
           <div>
              <Label htmlFor="totalCost">Total Cost * (₹)</Label>
              <Input id="totalCost" type="number" placeholder="0.00" />
            </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="purchaseDate">Purchase Date *</Label>
              <DatePicker date={purchaseDate} onDateChange={setPurchaseDate} id="expensePurchaseDate"/>
            </div>
            <div>
              <Label htmlFor="vendor">Vendor (Optional)</Label>
              <Input id="vendor" placeholder="e.g., Local Market, Dairy Farm" />
            </div>
          </div>
           <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input id="notes" placeholder="e.g., Paid in cash, specific brand" />
            </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full">Save Expense (Coming Soon)</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

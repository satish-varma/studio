"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { foodMealTypes } from "@/types/food";
import { ArrowLeft, PlusCircle, Trash2 } from "lucide-react";
import Link from "next/link";

export default function RecordFoodSalePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record New Food Sale"
        description="Enter the details of the food items sold."
        actions={
          <Link href="/foodstall/sales">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sales
            </Button>
          </Link>
        }
      />
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Sale Details</CardTitle>
          <CardDescription>All fields marked with * are required.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="saleDate">Sale Date & Time *</Label>
              <Input id="saleDate" type="datetime-local" />
            </div>
            <div>
              <Label htmlFor="mealType">Meal Type *</Label>
              <Select>
                <SelectTrigger id="mealType">
                  <SelectValue placeholder="Select meal type" />
                </SelectTrigger>
                <SelectContent>
                  {foodMealTypes.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <Label>Items Sold *</Label>
            <div className="p-4 border rounded-md bg-muted/30 space-y-3">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="itemName-1" className="text-xs">Item Name</Label>
                  <Input id="itemName-1" placeholder="e.g., Dosa, Coffee" />
                </div>
                <div className="w-20">
                  <Label htmlFor="itemQty-1" className="text-xs">Qty</Label>
                  <Input id="itemQty-1" type="number" placeholder="1" />
                </div>
                <div className="w-28">
                  <Label htmlFor="itemPrice-1" className="text-xs">Price/Unit (₹)</Label>
                  <Input id="itemPrice-1" type="number" placeholder="0.00" />
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 self-end">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="w-full border-dashed">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </div>
          </div>
           <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select defaultValue="Cash">
                <SelectTrigger id="paymentMethod">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="UPI">UPI/Online</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input id="notes" placeholder="e.g., Customer preference, discount applied" />
            </div>

          <div className="pt-4 text-right">
            <p className="text-2xl font-bold">Total Sale: ₹0.00</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg">Record Sale (Coming Soon)</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

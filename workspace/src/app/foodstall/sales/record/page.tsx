
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
import { useState } from "react"; // For managing multiple items

interface SoldFoodItem {
  id: string; // unique ID for the row, e.g., timestamp or uuid
  itemName: string;
  quantity: number;
  pricePerUnit: number;
}

export default function RecordFoodSalePage() {
  const [itemsSold, setItemsSold] = useState<SoldFoodItem[]>([
    { id: Date.now().toString(), itemName: "", quantity: 1, pricePerUnit: 0 },
  ]);

  const handleAddItem = () => {
    setItemsSold([
      ...itemsSold,
      { id: Date.now().toString(), itemName: "", quantity: 1, pricePerUnit: 0 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (itemsSold.length > 1) {
      setItemsSold(itemsSold.filter(item => item.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof Omit<SoldFoodItem, 'id'>, value: string | number) => {
    setItemsSold(
      itemsSold.map(item =>
        item.id === id ? { ...item, [field]: field === 'itemName' ? value : Number(value) || 0 } : item
      )
    );
  };

  const calculateTotal = () => {
    return itemsSold.reduce((acc, item) => acc + item.quantity * item.pricePerUnit, 0);
  };


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
              <Input id="saleDate" type="datetime-local" defaultValue={new Date().toISOString().substring(0, 16)} />
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
              {itemsSold.map((item, index) => (
                <div key={item.id} className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label htmlFor={`itemName-${item.id}`} className="text-xs">Item Name</Label>
                    <Input 
                      id={`itemName-${item.id}`} 
                      placeholder="e.g., Dosa, Coffee" 
                      value={item.itemName}
                      onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                    />
                  </div>
                  <div className="w-20">
                    <Label htmlFor={`itemQty-${item.id}`} className="text-xs">Qty</Label>
                    <Input 
                      id={`itemQty-${item.id}`} 
                      type="number" 
                      placeholder="1" 
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                      min="1"
                    />
                  </div>
                  <div className="w-28">
                    <Label htmlFor={`itemPrice-${item.id}`} className="text-xs">Price/Unit (₹)</Label>
                    <Input 
                      id={`itemPrice-${item.id}`} 
                      type="number" 
                      placeholder="0.00" 
                      value={item.pricePerUnit}
                      onChange={(e) => handleItemChange(item.id, 'pricePerUnit', e.target.value)}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:bg-destructive/10 self-end"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={itemsSold.length <= 1}
                    aria-label={`Remove item ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full border-dashed" onClick={handleAddItem}>
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
            <p className="text-2xl font-bold">Total Sale: ₹{calculateTotal().toFixed(2)}</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" size="lg">Record Sale (Coming Soon)</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

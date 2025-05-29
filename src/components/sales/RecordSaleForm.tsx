"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { mockStockItems } from "@/data/mockData"; // For item selection
import type { StockItem } from "@/types";
import { PlusCircle, Trash2, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const saleItemSchema = z.object({
  itemId: z.string().min(1, "Please select an item."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  // Price could be fetched based on itemId or entered manually
  pricePerUnit: z.coerce.number().optional(), // For display or calculation
});

const recordSaleFormSchema = z.object({
  items: z.array(saleItemSchema).min(1, "Please add at least one item to the sale."),
  // customerId: z.string().optional(), // Optional: if tracking customers
});

type RecordSaleFormValues = z.infer<typeof recordSaleFormSchema>;

export default function RecordSaleForm() {
  const { toast } = useToast();
  const [availableItems] = useState<StockItem[]>(mockStockItems); // Mock data
  const [totalSaleAmount, setTotalSaleAmount] = useState(0);

  const form = useForm<RecordSaleFormValues>({
    resolver: zodResolver(recordSaleFormSchema),
    defaultValues: {
      items: [{ itemId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");

  useEffect(() => {
    // Calculate total sale amount
    let total = 0;
    watchedItems.forEach(item => {
      const stockItem = availableItems.find(si => si.id === item.itemId);
      // Assuming a fixed price for demo. In real app, price would come from item data or be input.
      const price = stockItem ? (stockItem.lowStockThreshold * 2.5) : 0; // Dummy price
      if (item.quantity > 0 && stockItem) {
        total += item.quantity * price;
      }
    });
    setTotalSaleAmount(total);
  }, [watchedItems, availableItems]);

  function onSubmit(values: RecordSaleFormValues) {
    // TODO: Replace console.log with actual API call to record sale and update inventory.
    // console.log("Sale recorded:", values); 
    // For production, this data should be sent to a backend service.
    // Example: await recordSaleOnServer(values);

    toast({
      title: "Sale Recorded! (Mock)",
      description: `Total: $${totalSaleAmount.toFixed(2)}. ${values.items.length} item(s) sold. This is a mock action.`,
    });
    form.reset({ items: [{ itemId: "", quantity: 1 }] }); // Reset form
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center">
          <DollarSign className="mr-2 h-6 w-6 text-accent" />
          Record New Sale
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-end gap-4 p-4 border rounded-md bg-muted/30">
                <FormField
                  control={form.control}
                  name={`items.${index}.itemId`}
                  render={({ field: formField }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Item</FormLabel>
                      <Select onValueChange={formField.onChange} defaultValue={formField.value}>
                        <FormControl>
                          <SelectTrigger className="bg-input">
                            <SelectValue placeholder="Select an item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableItems.map((item) => (
                            <SelectItem key={item.id} value={item.id} disabled={item.quantity === 0}>
                              {item.name} (Stock: {item.quantity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field: formField }) => (
                    <FormItem className="w-24">
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="Qty" {...formField} className="bg-input" min="1" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ itemId: "", quantity: 1 })}
              className="w-full border-dashed"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Add Another Item
            </Button>

            <div className="pt-4 text-right">
              <p className="text-2xl font-bold text-foreground">
                Total: ${totalSaleAmount.toFixed(2)}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" size="lg">
              Record Sale
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

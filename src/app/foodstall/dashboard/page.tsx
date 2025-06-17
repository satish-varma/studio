
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ShoppingBag, Utensils, ArrowRight, LineChart, ClipboardList } from "lucide-react";
import Link from "next/link";

export default function FoodStallDashboardPage() {
  const quickNavItems = [
    {
      title: "Manage Expenses",
      description: "Track all your purchases and operational costs for the food stall.",
      href: "/foodstall/expenses",
      icon: ShoppingBag,
      cta: "View Expenses"
    },
    {
      title: "Manage Sales",
      description: "Record and view all sales transactions for your food stall.",
      href: "/foodstall/sales",
      icon: DollarSign,
      cta: "View Sales"
    },
    {
      title: "View Reports (Coming Soon)",
      description: "Analyze financial performance, popular items, and trends.",
      href: "#", // Placeholder
      icon: LineChart,
      cta: "View Reports",
      disabled: true
    },
  ];


  return (
    <div className="space-y-6">
      <PageHeader
        title="Food Stall Dashboard"
        description="Overview of your food stall's financial health and operations."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales Today</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹0.00</div>
            <p className="text-xs text-muted-foreground">
              (Feature coming soon)
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses Today</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹0.00</div>
            <p className="text-xs text-muted-foreground">
             (Feature coming soon)
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit Today</CardTitle>
            <Utensils className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹0.00</div>
            <p className="text-xs text-muted-foreground">
              (Feature coming soon)
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="flex items-center">
                <ClipboardList className="mr-2 h-5 w-5 text-primary" />
                Quick Navigation
            </CardTitle>
            <CardDescription>
                Easily access key areas of your food stall management.
            </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
            {quickNavItems.map((item) => (
            <Card key={item.title} className="flex flex-col hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center">
                        <item.icon className="h-5 w-5 mr-2 text-primary/80" />
                        {item.title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-grow">
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
                <CardFooter>
                    <Button asChild className="w-full" disabled={item.disabled}>
                        <Link href={item.href}>
                            {item.cta} <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
            ))}
        </CardContent>
      </Card>
      
    </div>
  );
}


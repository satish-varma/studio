
"use client"; // Added "use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, IndianRupee, TrendingUp, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button"; // Added Button import
import { useRouter } from "next/navigation"; // Added useRouter import

// Dummy data for dashboard cards
const dashboardStats = [
  { title: "Total Items", value: "125", icon: Package, change: "+5 this week", color: "text-primary" },
  { title: "Total Sales (Month)", value: "₹1,50,000", icon: IndianRupee, change: "+12% from last month", color: "text-accent" },
  { title: "Items Sold (Today)", value: "32", icon: TrendingUp, change: "-3 from yesterday", color: "text-blue-500" },
  { title: "Low Stock Alerts", value: "8", icon: AlertTriangle, change: "Needs attention", color: "text-destructive" },
];

export default function DashboardPage() {
  const router = useRouter(); // Initialized router

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your stall's activity and stock levels." />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => (
          <Card key={stat.title} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground pt-1">
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>A quick look at your most recent transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div>
                    <p className="font-medium text-foreground">Sale ID #1234{i+5}</p>
                    <p className="text-sm text-muted-foreground">3 items - ₹2,50{i}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">2 hours ago</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks at your fingertips.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3">
            <Button 
              className="flex-1"
              onClick={() => router.push('/sales/record')}
            >
              Record New Sale
            </Button>
            <Button 
              variant="secondary"
              className="flex-1"
              onClick={() => router.push('/items/new')}
            >
              Add New Item
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

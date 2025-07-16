
"use client";

import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarCheck, HandCoins, AlertTriangle } from "lucide-react";

export default function StaffDashboardPage() {
    return (
        <div className="space-y-6">
            <PageHeader title="Staff Dashboard" description="Overview of staff attendance, advances, and key metrics." />

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Staff</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">(Coming Soon)</div>
                        <p className="text-xs text-muted-foreground">Number of active staff members</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Present Today</CardTitle>
                        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">(Coming Soon)</div>
                        <p className="text-xs text-muted-foreground">Staff marked as present today</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Advances this Month</CardTitle>
                        <HandCoins className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">(Coming Soon)</div>
                        <p className="text-xs text-muted-foreground">Total salary advance this month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground">e.g., Unmarked attendance</p>
                    </CardContent>
                </Card>
            </div>
            <div className="p-8 text-center text-muted-foreground bg-muted/30 rounded-md border border-dashed">
                <p className="text-xl font-semibold">More Widgets Coming Soon</p>
                <p className="mt-2 text-sm">
                  Detailed charts and summaries for staff management will be available here.
                </p>
            </div>
        </div>
    );
}

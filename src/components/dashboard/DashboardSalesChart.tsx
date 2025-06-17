
"use client";

import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { format } from 'date-fns';

interface SalesChartDataPoint {
  date: string;
  totalSales: number;
}

interface DashboardSalesChartProps {
  salesChartData: SalesChartDataPoint[];
}

const chartConfig = {
  totalSales: {
    label: "Sales (₹)",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

export function DashboardSalesChart({ salesChartData }: DashboardSalesChartProps) {
  if (!salesChartData || salesChartData.length === 0) {
    return <p className="text-sm text-center text-muted-foreground py-10">No sales data for chart.</p>;
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <BarChart accessibilityLayer data={salesChartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value) => format(new Date(value), "MMM d")}
        />
        <YAxis
          tickFormatter={(value) => `₹${value >= 1000 ? `${(value/1000).toFixed(0)}k` : value.toFixed(0)}`}
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          width={80}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent
            indicator="dot"
            formatter={(value, name, props) => (
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{format(new Date(props.payload.date), "MMM d, yyyy")}</span>
                    <span className="text-muted-foreground">Sales: <span className="font-semibold text-foreground">₹{Number(value).toFixed(2)}</span></span>
                </div>
            )}
            hideLabel
          />}
        />
        <Bar dataKey="totalSales" fill="var(--color-totalSales)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

    
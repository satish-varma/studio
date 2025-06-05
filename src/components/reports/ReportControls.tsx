
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

interface ReportControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  // Add other filters here as needed, e.g., site, stall, category
}

export function ReportControls({
  dateRange,
  onDateRangeChange,
}: ReportControlsProps) {

  return (
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-start gap-4 p-4 border rounded-lg bg-card shadow">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="reportDateRange"
            variant={"outline"}
            className={cn(
              "w-full sm:w-[280px] justify-start text-left font-normal bg-input",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "LLL dd, y")} -{" "}
                  {format(dateRange.to, "LLL dd, y")}
                </>
              ) : (
                format(dateRange.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={onDateRangeChange}
            numberOfMonths={2}
            disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
          />
        </PopoverContent>
      </Popover>
      {/* Placeholder for future filters */}
      {/* 
      <Select>
        <SelectTrigger className="w-full sm:w-[180px] bg-input">
          <SelectValue placeholder="Filter by category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
        </SelectContent>
      </Select>
      */}
    </div>
  );
}

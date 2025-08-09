
"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, startOfDay, startOfMonth, endOfMonth, subDays, startOfWeek, endOfWeek } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useState, useEffect } from "react";

interface ReportControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
}

export function ReportControls({
  dateRange,
  onDateRangeChange,
}: ReportControlsProps) {
    
  const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(dateRange);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  
  useEffect(() => {
    setTempDateRange(dateRange);
  }, [dateRange]);

  const datePresets = [
    { label: "Today", value: 'today' },
    { label: "Yesterday", value: 'yesterday' },
    { label: "This Week", value: 'this_week' },
    { label: "Last Week", value: 'last_week' },
    { label: "Last 7 Days", value: 'last_7_days' },
    { label: "This Month", value: 'this_month' },
    { label: "Last Month", value: 'last_month' },
    { label: "Last 30 Days", value: 'last_30_days' },
  ];

  const handleSetDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date | undefined, to: Date | undefined = endOfDay(now);

    switch (preset) {
        case 'today': from = startOfDay(now); break;
        case 'yesterday': from = startOfDay(subDays(now, 1)); to = endOfDay(subDays(now, 1)); break;
        case 'this_week': from = startOfWeek(now); break;
        case 'last_week': from = startOfWeek(subDays(now, 7)); to = endOfWeek(subDays(now, 7)); break;
        case 'last_7_days': from = startOfDay(subDays(now, 6)); break;
        case 'this_month': from = startOfMonth(now); break;
        case 'last_month': from = startOfMonth(subDays(startOfMonth(now), 1)); to = endOfMonth(subDays(startOfMonth(now), 1)); break;
        case 'last_30_days': from = startOfDay(subDays(now, 29)); break;
        default: from = undefined; to = undefined;
    }
    setTempDateRange({ from, to });
  };
  
  const applyDateFilter = () => {
    onDateRangeChange(tempDateRange);
    setIsDatePickerOpen(false);
  };

  return (
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-start gap-4 p-4 border rounded-lg bg-card shadow">
      <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
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
        <PopoverContent className="w-auto p-0 flex" align="start">
            <div className="p-2 border-r">
                <div className="flex flex-col items-stretch gap-1">
                    {datePresets.map(({label, value}) => (
                        <Button key={value} variant="ghost" className="justify-start" onClick={() => handleSetDatePreset(value)}>{label}</Button>
                    ))}
                </div>
            </div>
            <div className="p-2">
                <div className="flex justify-between items-center mb-2 px-2">
                    <p className="text-sm font-medium">Start: <span className="font-normal text-muted-foreground">{tempDateRange?.from ? format(tempDateRange.from, 'PPP') : '...'}</span></p>
                    <p className="text-sm font-medium">End: <span className="font-normal text-muted-foreground">{tempDateRange?.to ? format(tempDateRange.to, 'PPP') : '...'}</span></p>
                </div>
                <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={tempDateRange?.from}
                    selected={tempDateRange}
                    onSelect={setTempDateRange}
                    numberOfMonths={2}
                    disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                />
                <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                     <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button>
                     <Button onClick={applyDateFilter}>Apply</Button>
                </div>
            </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, Users, Download } from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { AppUser } from "@/types";
import { useState, useEffect } from "react";

interface SalesHistoryControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  staffFilter: string;
  onStaffFilterChange: (staffId: string) => void;
  staffMembers: AppUser[];
  isLoadingStaff: boolean;
  showStaffFilter: boolean;
  onExportClick: () => void;
  isExporting: boolean;
}

export function SalesHistoryControls({
  dateRange,
  onDateRangeChange,
  staffFilter,
  onStaffFilterChange,
  staffMembers,
  isLoadingStaff,
  showStaffFilter,
  onExportClick,
  isExporting
}: SalesHistoryControlsProps) {

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
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 border rounded-lg bg-card shadow">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch flex-grow">
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full sm:w-[260px] justify-start text-left font-normal bg-input",
                !dateRange && "text-muted-foreground"
              )}
              data-testid="date-range-picker-button"
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
                    initialFocus mode="range" defaultMonth={tempDateRange?.from}
                    selected={tempDateRange} onSelect={setTempDateRange} numberOfMonths={2}
                    disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
                    data-testid="sales-history-calendar"
                />
                 <div className="flex justify-end gap-2 pt-2 border-t mt-2">
                     <Button variant="ghost" onClick={() => setIsDatePickerOpen(false)}>Close</Button>
                     <Button onClick={applyDateFilter}>Apply</Button>
                </div>
              </div>
          </PopoverContent>
        </Popover>

        {showStaffFilter && (
          <Select 
              value={staffFilter} 
              onValueChange={onStaffFilterChange} 
              disabled={isLoadingStaff}
            >
              <SelectTrigger 
                className="w-full sm:w-[200px] bg-input" 
                data-testid="staff-filter-select-trigger"
              >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder={isLoadingStaff ? "Loading staff..." : "Filter by staff"} />
              </SelectTrigger>
              <SelectContent data-testid="staff-filter-select-content">
                  <SelectItem value="all">All Staff</SelectItem>
                  {staffMembers
                    .filter(staff => staff.uid && staff.uid.trim() !== "")
                    .map((staff) => (
                      <SelectItem key={staff.uid} value={staff.uid}>
                          {staff.displayName || staff.email} ({staff.role})
                      </SelectItem>
                  ))}
              </SelectContent>
          </Select>
        )}
      </div>
       <Button variant="outline" onClick={onExportClick} disabled={isExporting}>
            {isExporting ? <Download className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Export Sales
        </Button>
    </div>
  );
}

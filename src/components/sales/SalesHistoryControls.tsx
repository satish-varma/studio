
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
import { format } from "date-fns";
import { CalendarIcon, Users } from "lucide-react";
import type { DateRange } from "react-day-picker";
import type { AppUser } from "@/types";

interface SalesHistoryControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  staffFilter: string;
  onStaffFilterChange: (staffId: string) => void;
  staffMembers: AppUser[];
  isLoadingStaff: boolean;
  showStaffFilter: boolean;
}

export function SalesHistoryControls({
  dateRange,
  onDateRangeChange,
  staffFilter,
  onStaffFilterChange,
  staffMembers,
  isLoadingStaff,
  showStaffFilter,
}: SalesHistoryControlsProps) {

  return (
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 border rounded-lg bg-card shadow">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch flex-grow">
        <Popover>
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
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={onDateRangeChange}
              numberOfMonths={2}
              disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
              data-testid="sales-history-calendar"
            />
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
                    .filter(staff => staff.uid && staff.uid.trim() !== "") // Filter out staff with empty UIDs
                    .map((staff) => (
                      <SelectItem key={staff.uid} value={staff.uid}>
                          {staff.displayName || staff.email} ({staff.role})
                      </SelectItem>
                  ))}
              </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

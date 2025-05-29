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
import { CalendarIcon, Users, Filter } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/contexts/AuthContext";

interface SalesHistoryControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  staffFilter: string;
  onStaffFilterChange: (staffId: string) => void;
  // Mock staff list for now
  staffMembers: Array<{ id: string; name: string }>;
}

export function SalesHistoryControls({
  dateRange,
  onDateRangeChange,
  staffFilter,
  onStaffFilterChange,
  staffMembers,
}: SalesHistoryControlsProps) {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';

  return (
    <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full sm:w-[260px] justify-start text-left font-normal bg-input",
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
          />
        </PopoverContent>
      </Popover>

      {isManagerOrAdmin && (
         <Select value={staffFilter} onValueChange={onStaffFilterChange}>
            <SelectTrigger className="w-full sm:w-[200px] bg-input">
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter by staff" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffMembers.map((staff) => (
                <SelectItem key={staff.id} value={staff.id}>
                    {staff.name}
                </SelectItem>
                ))}
            </SelectContent>
         </Select>
      )}
      <Button variant="outline" className="w-full sm:w-auto">
        <Filter className="mr-2 h-4 w-4" /> Apply Filters
      </Button>
    </div>
  );
}


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
import { useEffect, useState } from "react";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";
import { getApps, initializeApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { AppUser } from "@/types";

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in SalesHistoryControls:", error);
  }
}
const db = getFirestore();


interface SalesHistoryControlsProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (dateRange: DateRange | undefined) => void;
  staffFilter: string;
  onStaffFilterChange: (staffId: string) => void;
  // staffMembers prop removed, will fetch internally if needed
}

export function SalesHistoryControls({
  dateRange,
  onDateRangeChange,
  staffFilter,
  onStaffFilterChange,
}: SalesHistoryControlsProps) {
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'manager' || user?.role === 'admin';
  const [staffList, setStaffList] = useState<AppUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  useEffect(() => {
    // TODO: For production, consider paginating or limiting staff list if it can grow very large.
    // Also, ensure Firebase Security Rules allow managers/admins to read the 'users' collection.
    async function fetchStaffMembers() {
      if (isManagerOrAdmin) {
        setLoadingStaff(true);
        try {
          // Fetch all users (or filter by roles like 'staff', 'manager' if needed)
          const usersCollectionRef = collection(db, "users");
          // Example: const q = query(usersCollectionRef, where("role", "in", ["staff", "manager"]));
          const q = query(usersCollectionRef); // Fetches all users for now
          const querySnapshot = await getDocs(q);
          const fetchedStaff: AppUser[] = [];
          querySnapshot.forEach((doc) => {
            fetchedStaff.push({ uid: doc.id, ...doc.data() } as AppUser);
          });
          setStaffList(fetchedStaff);
        } catch (error) {
          console.error("Error fetching staff members:", error);
          // Handle error (e.g., show a toast message)
        } finally {
          setLoadingStaff(false);
        }
      }
    }
    fetchStaffMembers();
  }, [isManagerOrAdmin]);

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
            disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
          />
        </PopoverContent>
      </Popover>

      {isManagerOrAdmin && (
         <Select value={staffFilter} onValueChange={onStaffFilterChange} disabled={loadingStaff}>
            <SelectTrigger className="w-full sm:w-[200px] bg-input">
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter by staff" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((staff) => (
                <SelectItem key={staff.uid} value={staff.uid}>
                    {staff.displayName || staff.email}
                </SelectItem>
                ))}
            </SelectContent>
         </Select>
      )}
      {/* The "Apply Filters" button might not be strictly necessary if filters apply on change.
          Could be kept for explicit action or removed if UI feels responsive enough. */}
      {/* <Button variant="outline" className="w-full sm:w-auto">
        <Filter className="mr-2 h-4 w-4" /> Apply Filters 
      </Button> */}
    </div>
  );
}

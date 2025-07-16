
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Calendar as CalendarIcon, IndianRupee } from "lucide-react";
import { DatePicker } from "../ui/date-picker";
import { Label } from '../ui/label';

interface BatchUpdateStaffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUserCount: number;
  onConfirm: (updates: { salary?: number, joiningDate?: Date | null }) => Promise<void>;
}

export default function BatchUpdateStaffDialog({ isOpen, onClose, selectedUserCount, onConfirm }: BatchUpdateStaffDialogProps) {
  const [newSalary, setNewSalary] = useState<string>("");
  const [newJoiningDate, setNewJoiningDate] = useState<Date | undefined>(undefined);
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const handleConfirmClick = async () => {
    const salaryValue = newSalary.trim() !== "" ? parseFloat(newSalary) : undefined;

    if (newSalary.trim() === "" && !newJoiningDate) {
      toast({ title: "No Changes", description: "Please provide a new salary and/or joining date to update.", variant: "default" });
      return;
    }
    if (salaryValue !== undefined && (isNaN(salaryValue) || salaryValue < 0)) {
        toast({ title: "Invalid Salary", description: "Salary must be a valid non-negative number.", variant: "destructive"});
        return;
    }

    setIsUpdating(true);
    await onConfirm({ salary: salaryValue, joiningDate: newJoiningDate });
    setIsUpdating(false);
    onClose();
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewSalary("");
      setNewJoiningDate(undefined);
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batch Update Staff Details</DialogTitle>
          <DialogDescription>
            Update salary and/or joining date for {selectedUserCount} selected staff member(s).
            Leave a field blank to keep its current value for each staff member.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch-salary">New Salary (Monthly, ₹)</Label>
            <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    id="batch-salary"
                    type="number"
                    value={newSalary}
                    onChange={(e) => setNewSalary(e.target.value)}
                    placeholder="e.g., 30000"
                    className="pl-9"
                    disabled={isUpdating}
                />
            </div>
          </div>
          <div className="space-y-2">
             <Label htmlFor="batch-joining-date">New Joining Date</Label>
             <DatePicker
                id="batch-joining-date"
                date={newJoiningDate}
                onDateChange={setNewJoiningDate}
                disabled={isUpdating}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isUpdating}>Cancel</Button>
          <Button 
            onClick={handleConfirmClick} 
            disabled={isUpdating || (newSalary === "" && !newJoiningDate)}
          >
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Updates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

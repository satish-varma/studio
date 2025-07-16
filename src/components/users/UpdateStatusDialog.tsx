
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
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Loader2 } from "lucide-react";
import type { AppUser, UserStatus } from "@/types";

interface UpdateStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AppUser;
  onConfirm: (userId: string, newStatus: UserStatus, exitDate?: Date | null) => Promise<void>;
}

export default function UpdateStatusDialog({ isOpen, onClose, user, onConfirm }: UpdateStatusDialogProps) {
  const [exitDate, setExitDate] = useState<Date | undefined>(undefined);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const currentStatus: UserStatus = user.status || 'active';
  const newStatus: UserStatus = currentStatus === 'active' ? 'inactive' : 'active';
  
  const handleConfirmClick = async () => {
    if (newStatus === 'inactive' && !exitDate) {
      // Potentially show a toast or validation message, though button disabled state should prevent this
      return;
    }
    setIsUpdating(true);
    await onConfirm(user.uid, newStatus, newStatus === 'inactive' ? exitDate : null);
    setIsUpdating(false);
    setExitDate(undefined); // Reset for next time
  };
  
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setExitDate(undefined);
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Status Change</DialogTitle>
          <DialogDescription>
            You are about to change the status for user: <strong>{user.displayName || user.email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <p>
            Current status: <span className="font-semibold capitalize">{currentStatus}</span>
            <br/>
            New status: <span className="font-semibold capitalize">{newStatus}</span>
          </p>
          
          {newStatus === 'inactive' && (
            <div className="space-y-2">
              <Label htmlFor="exit-date">Exit Date <span className="text-destructive">*</span></Label>
              <DatePicker
                id="exit-date"
                date={exitDate}
                onDateChange={setExitDate}
              />
              <p className="text-xs text-muted-foreground">Setting an exit date is required to make a user inactive.</p>
            </div>
          )}
          {newStatus === 'active' && (
             <p className="text-sm text-muted-foreground">
                Reactivating this user will allow them to log in again. You may want to clear their exit date via their profile if needed.
             </p>
          )}

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUpdating}>Cancel</Button>
          <Button 
            onClick={handleConfirmClick} 
            disabled={isUpdating || (newStatus === 'inactive' && !exitDate)}
            className={newStatus === 'inactive' ? "bg-destructive hover:bg-destructive/90" : ""}
          >
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

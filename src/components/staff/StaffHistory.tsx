"use client";

import { useMemo } from 'react';
import type { StaffActivityLog, SalaryAdvance, SalaryPayment, StaffAttendance, StaffDetails } from '@/types';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { HandCoins, IndianRupee, CalendarOff, LogIn, LogOut } from 'lucide-react';

interface StaffHistoryProps {
  initialDetails: StaffDetails | null;
  logs: StaffActivityLog[];
  advances: SalaryAdvance[];
  payments: SalaryPayment[];
  attendance: StaffAttendance[];
}

type HistoryEvent = {
  date: Date;
  type: 'Join' | 'Exit' | 'Advance' | 'Salary' | 'Leave';
  description: string;
  amount?: number;
};

export default function StaffHistory({ initialDetails, logs, advances, payments, attendance }: StaffHistoryProps) {
  
  const combinedHistory = useMemo(() => {
    let events: HistoryEvent[] = [];

    // Joining and Exiting Events from logs
    logs.forEach(log => {
      if (log.type === 'STAFF_DETAILS_UPDATED') {
        const notes = log.details.notes || '';
        if (notes.toLowerCase().includes('rejoin') || notes.toLowerCase().includes('activated')) {
          events.push({
            date: parseISO(log.timestamp),
            type: 'Join',
            description: `Rejoined / Activated on this date.`,
          });
        }
      }
      if (log.type === 'USER_STATUS_CHANGED' && log.details.status === 'inactive') {
          events.push({
            date: parseISO(log.timestamp),
            type: 'Exit',
            description: log.details.notes || 'User status set to inactive.',
          });
      }
    });

    if (initialDetails?.joiningDate) {
        events.push({
            date: new Date(initialDetails.joiningDate),
            type: 'Join',
            description: 'Initial joining date.'
        });
    }
     if (initialDetails?.exitDate) {
        events.push({
            date: new Date(initialDetails.exitDate),
            type: 'Exit',
            description: 'Marked as exited on this date.'
        });
    }


    advances.forEach(adv => {
      events.push({
        date: new Date(adv.date),
        type: 'Advance',
        description: adv.notes || 'Salary advance given.',
        amount: adv.amount,
      });
    });

    payments.forEach(pay => {
      events.push({
        date: new Date(pay.paymentDate),
        type: 'Salary',
        description: pay.notes || `Salary paid for ${format(new Date(pay.forYear, pay.forMonth - 1), 'MMM yyyy')}.`,
        amount: pay.amountPaid,
      });
    });
    
    attendance.forEach(att => {
        events.push({
            date: new Date(att.date),
            type: 'Leave',
            description: 'Marked as on leave.',
        });
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [logs, advances, payments, attendance, initialDetails]);

  const getIcon = (type: HistoryEvent['type']) => {
    switch (type) {
      case 'Join': return <LogIn className="h-4 w-4 text-green-500" />;
      case 'Exit': return <LogOut className="h-4 w-4 text-red-500" />;
      case 'Advance': return <HandCoins className="h-4 w-4 text-orange-500" />;
      case 'Salary': return <IndianRupee className="h-4 w-4 text-blue-500" />;
      case 'Leave': return <CalendarOff className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  };


  if (combinedHistory.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No history found for this staff member.</p>;
  }

  return (
    <ScrollArea className="h-96 w-full">
      <div className="space-y-4 pr-4">
        {combinedHistory.map((event, index) => (
          <div key={index} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    {getIcon(event.type)}
                </div>
                {index < combinedHistory.length - 1 && (
                    <div className="w-px flex-grow bg-border"></div>
                )}
            </div>
            <div className="pb-4 flex-1">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                       {format(event.date, 'MMMM dd, yyyy')}
                    </p>
                     <Badge variant={
                        event.type === 'Join' ? 'default' : 
                        event.type === 'Exit' ? 'destructive' : 
                        'secondary'
                    }>{event.type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                 {event.amount !== undefined && (
                    <p className="text-sm font-medium text-accent mt-1">Amount: ₹{event.amount.toFixed(2)}</p>
                 )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}


"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StaffActivityLog } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Building, ListChecks, Loader2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface StaffActivityLogTableProps {
  logs: StaffActivityLog[];
  sitesMap: Record<string, string>;
  usersMap: Record<string, string>;
  isLoadingNextPage: boolean;
  isLoadingPrevPage: boolean;
  isLastPage: boolean;
  isFirstPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function StaffActivityLogTable({
  logs,
  sitesMap,
  usersMap,
  isLoadingNextPage,
  isLoadingPrevPage,
  isLastPage,
  isFirstPage,
  onNextPage,
  onPrevPage
}: StaffActivityLogTableProps) {

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return "Invalid Date"; }
  };

  const formatActivityType = (type: StaffActivityLog['type']) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getActivityBadgeVariant = (type: StaffActivityLog['type']): "default" | "secondary" | "destructive" | "outline" => {
    if (type === 'SALARY_ADVANCE_GIVEN') return "destructive";
    if (type === 'ATTENDANCE_MARKED') return "secondary";
    if (type === 'SALARY_PAID') return "default";
    return "outline";
  };

  const formatDetails = (log: StaffActivityLog) => {
    // New: Prioritize the more descriptive `notes` field for all log types if it exists.
    // This allows bulk action logs to show their summary message.
    if (log.details.notes) {
        return log.details.notes;
    }
    // Fallback to original specific formatting if `notes` is empty.
    if (log.type === 'ATTENDANCE_MARKED') {
        return `Date: ${log.details.date}, Status: ${log.details.status}`;
    }
    if (log.type === 'SALARY_ADVANCE_GIVEN') {
        return `Amount: ₹${log.details.amount?.toFixed(2) || '0.00'}`;
    }
    if (log.type === 'SALARY_PAID') {
        return `Paid: ₹${log.details.amount?.toFixed(2) || '0.00'}`;
    }
    return 'No details.';
  };

  if (logs.length === 0 && isFirstPage) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Staff Activity Found</p>
        <p className="text-muted-foreground">No attendance, advance, or profile changes have been recorded yet.</p>
      </div>
    );
  }

  return (
      <ScrollArea className="h-[600px] rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>Performed By</TableHead>
              <TableHead>Related Staff</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Activity Type</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                <TableCell className="text-sm">{usersMap[log.userId] || log.userName || log.userId.substring(0, 8) + "..."}</TableCell>
                <TableCell className="text-sm font-medium">{usersMap[log.relatedStaffUid] || log.relatedStaffUid.substring(0,8)}</TableCell>
                <TableCell className="text-xs">
                    {log.siteId ? (
                        <div className="flex items-center">
                            <Building size={12} className="mr-1 text-primary/70 flex-shrink-0" />
                            <span>{sitesMap[log.siteId] || log.siteId.substring(0,8)}</span>
                        </div>
                    ): "N/A"}
                </TableCell>
                <TableCell>
                  <Badge variant={getActivityBadgeVariant(log.type)} className="text-xs whitespace-nowrap">
                    {formatActivityType(log.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDetails(log)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-end space-x-2 py-4 px-2 border-t">
            <Button variant="outline" size="sm" onClick={onPrevPage} disabled={isFirstPage || isLoadingPrevPage || isLoadingNextPage}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button variant="outline" size="sm" onClick={onNextPage} disabled={isLastPage || isLoadingNextPage || isLoadingPrevPage}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
        </div>
      </ScrollArea>
  );
}

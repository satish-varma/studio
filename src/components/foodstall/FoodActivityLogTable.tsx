
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FoodStallActivityLog } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Building, Store, ListChecks, Loader2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";

interface FoodActivityLogTableProps {
  logs: FoodStallActivityLog[];
  sitesMap: Record<string, string>;
  stallsMap: Record<string, string>;
  usersMap: Record<string, string>;
  isLoadingNextPage: boolean;
  isLoadingPrevPage: boolean;
  isLastPage: boolean;
  isFirstPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function FoodActivityLogTable({
  logs,
  sitesMap,
  stallsMap,
  usersMap,
  isLoadingNextPage,
  isLoadingPrevPage,
  isLastPage,
  isFirstPage,
  onNextPage,
  onPrevPage
}: FoodActivityLogTableProps) {

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) { return "Invalid Date"; }
  };

  const formatActivityType = (type: FoodStallActivityLog['type']) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getActivityBadgeVariant = (type: FoodStallActivityLog['type']): "default" | "secondary" | "destructive" | "outline" => {
    if (type === 'SALE_RECORDED_OR_UPDATED') return "default";
    if (type === 'EXPENSE_RECORDED') return "secondary";
    return "outline";
  };

  const formatDetails = (log: FoodStallActivityLog) => {
    if (log.type.startsWith('SALE')) {
        return `Sale Total: ₹${log.details.totalAmount?.toFixed(2) || '0.00'}`;
    }
    if (log.type.startsWith('EXPENSE')) {
        return `Expense: ₹${log.details.totalCost?.toFixed(2) || '0.00'} (${log.details.expenseCategory || 'N/A'})`;
    }
    return log.details.notes || 'No details.';
  };

  if (logs.length === 0 && isFirstPage) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Food Stall Activity Found</p>
        <p className="text-muted-foreground">No sales or expense activities have been recorded yet.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-[600px] rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[180px] p-2 sm:p-4">Timestamp</TableHead>
              <TableHead className="p-2 sm:p-4">User</TableHead>
              <TableHead className="p-2 sm:p-4">Location</TableHead>
              <TableHead className="p-2 sm:p-4">Activity Type</TableHead>
              <TableHead className="p-2 sm:p-4">Details</TableHead>
              <TableHead className="p-2 sm:p-4 hidden md:table-cell">Notes</TableHead>
              <TableHead className="p-2 sm:p-4 hidden sm:table-cell">Related Doc</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground p-2 sm:p-4">{formatDate(log.timestamp)}</TableCell>
                <TableCell className="text-sm p-2 sm:p-4">{usersMap[log.userId] || log.userName || log.userId.substring(0, 8) + "..."}</TableCell>
                <TableCell className="text-xs p-2 sm:p-4">
                  <div className="flex items-center">
                    <Building size={12} className="mr-1 text-primary/70 flex-shrink-0" />
                    <span>{sitesMap[log.siteId] || log.siteId.substring(0,8)}</span>
                  </div>
                  <div className="flex items-center text-muted-foreground/90 mt-0.5">
                    <Store size={12} className="mr-1 text-accent/70 flex-shrink-0" />
                    <span>{stallsMap[log.stallId] || log.stallId.substring(0,8)}</span>
                  </div>
                </TableCell>
                <TableCell className="p-2 sm:p-4">
                  <Badge variant={getActivityBadgeVariant(log.type)} className="text-xs">
                    {formatActivityType(log.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-medium p-2 sm:p-4">{formatDetails(log)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate p-2 sm:p-4 hidden md:table-cell">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help">{log.details.notes || "N/A"}</span>
                    </TooltipTrigger>
                    <TooltipContent><p>{log.details.notes}</p></TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="p-2 sm:p-4 hidden sm:table-cell">
                    <Link
                        href={log.type.startsWith('SALE') ? `/foodstall/sales/record?date=${log.relatedDocumentId.split('_')[0]}` : '#'}
                        passHref
                        title={log.relatedDocumentId}
                    >
                        <Button variant="link" className="p-0 h-auto text-xs" disabled={!log.type.startsWith('SALE')}>
                            <FileText size={12} className="mr-1"/>
                            View
                        </Button>
                    </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      <div className="flex items-center justify-end space-x-2 py-4 px-2 border-t">
        <Button variant="outline" size="sm" onClick={onPrevPage} disabled={isFirstPage || isLoadingPrevPage || isLoadingNextPage}>
          {isLoadingPrevPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Previous</span>
        </Button>
        <Button variant="outline" size="sm" onClick={onNextPage} disabled={isLastPage || isLoadingNextPage || isLoadingPrevPage}>
          <span className="mr-2 hidden sm:inline">Next</span>
          {isLoadingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </TooltipProvider>
  );
}

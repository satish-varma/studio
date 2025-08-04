
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Building, Store, ListChecks, Loader2, ChevronLeft, ChevronRight, FileText, Info, Truck } from "lucide-react";

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
    if (type === 'EXPENSE_RECORDED' || type === 'EXPENSE_BULK_IMPORTED') return "secondary";
    if (type === 'EXPENSE_UPDATED') return "outline";
    return "outline";
  };
  
  const formatDetails = (log: FoodStallActivityLog) => {
    if (log.type.startsWith('SALE')) {
        return `Sale Total: ₹${log.details.totalAmount?.toFixed(2) || '0.00'}`;
    }
    if (log.type.startsWith('EXPENSE')) {
      if(log.type === 'EXPENSE_BULK_IMPORTED') {
        return `Imported ${log.details.processedCount} records.`;
      }
      return `Expense: ₹${log.details.totalCost?.toFixed(2) || '0.00'} (${log.details.expenseCategory || 'N/A'})`;
    }
    return log.details.notes || 'No details.';
  };


  if (logs.length === 0 && isFirstPage) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Food Stall Activity Found</p>
        <p className="text-muted-foreground">No sales or expense activities match the current filters.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="p-2 sm:p-4 w-[140px] whitespace-nowrap">Timestamp</TableHead>
              <TableHead className="p-2 sm:p-4 whitespace-nowrap">User</TableHead>
              <TableHead className="p-2 sm:p-4 whitespace-nowrap">Location</TableHead>
              <TableHead className="p-2 sm:p-4 whitespace-nowrap">Activity Type</TableHead>
              <TableHead className="p-2 sm:p-4 hidden md:table-cell whitespace-nowrap">Vendor</TableHead>
              <TableHead className="p-2 sm:p-4 whitespace-nowrap">Details</TableHead>
              <TableHead className="p-2 sm:p-4 hidden lg:table-cell whitespace-nowrap">Notes</TableHead>
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
                  <Badge variant={getActivityBadgeVariant(log.type)} className="text-xs whitespace-nowrap">
                    {formatActivityType(log.type)}
                  </Badge>
                </TableCell>
                 <TableCell className="text-sm p-2 sm:p-4 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                        {log.details.vendor && <Truck className="h-4 w-4 text-muted-foreground shrink-0"/>}
                        <span className="truncate">{log.details.vendor || "N/A"}</span>
                    </div>
                </TableCell>
                <TableCell className="text-sm font-medium p-2 sm:p-4">{formatDetails(log)}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] p-2 sm:p-4 hidden lg:table-cell">
                  {log.details.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help inline-flex items-center gap-1 truncate">
                          <Info size={12} />
                          {log.details.notes}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p>{log.details.notes}</p></TooltipContent>
                    </Tooltip>
                  ) : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
      </div>
    </TooltipProvider>
  );
}

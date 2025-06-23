
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StockMovementLog } from "@/types/log";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, ArrowUpCircle, ArrowDownCircle, Building, Store, ListChecks, Loader2, ChevronLeft, ChevronRight } from "lucide-react"; // Added ListChecks
import { Button } from "@/components/ui/button"; // Added Button import

interface ActivityLogTableProps {
  logs: StockMovementLog[];
  sitesMap: Record<string, string>;
  stallsMap: Record<string, string>;
  itemsMap: Record<string, string>;
  usersMap: Record<string, string>;
  isLoadingNextPage: boolean;
  isLoadingPrevPage: boolean;
  isLastPage: boolean;
  isFirstPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
}

export function ActivityLogTable({
  logs,
  sitesMap,
  stallsMap,
  itemsMap,
  usersMap,
  isLoadingNextPage,
  isLoadingPrevPage,
  isLastPage,
  isFirstPage,
  onNextPage,
  onPrevPage
}: ActivityLogTableProps) {

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch (e) { return "Invalid Date"; }
  };

  const formatMovementType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getMovementTypeBadgeVariant = (type: StockMovementLog['type']): "default" | "secondary" | "destructive" | "outline" => {
    if (type.includes('SALE') || type.includes('DELETE') || type.includes('TRANSFER_OUT')) return "destructive";
    if (type.includes('CREATE') || type.includes('RECEIVE') || type.includes('ALLOCATE_TO_STALL') || type.includes('TRANSFER_IN')) return "default";
    if (type.includes('UPDATE') || type.includes('RETURN')) return "secondary";
    return "outline";
  };

  const getQuantityChangeClass = (change: number) => {
    if (change > 0) return "text-green-600 font-medium";
    if (change < 0) return "text-destructive font-medium";
    return "text-muted-foreground";
  };

  const getItemDisplay = (itemId: string | null | undefined, map: Record<string, string>, label: string) => {
    if (!itemId) return null;
    const name = map[itemId];
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block text-muted-foreground cursor-help">
            {label}: {name || itemId.substring(0, 8) + "..."}
          </span>
        </TooltipTrigger>
        <TooltipContent><p>{label}: {name || "Unknown Name"} (ID: {itemId})</p></TooltipContent>
      </Tooltip>
    );
  };

  const showPagination = logs.length > 0 || !isFirstPage || !isLastPage;

  if (logs.length === 0 && isFirstPage && !isLoadingPrevPage && !isLoadingNextPage) {
    return (
      <div className="text-center py-10 px-4 bg-card rounded-lg border shadow-sm">
        <ListChecks className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-xl font-semibold text-foreground mb-2">No Activity Logs Found</p>
        <p className="text-muted-foreground">
          There are no stock movement activities recorded yet for the current view.
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <ScrollArea className="h-[600px] rounded-lg border shadow-sm bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-[250px]">Item / Context</TableHead>
              <TableHead className="text-center">Qty Change</TableHead>
              <TableHead className="text-center">Before</TableHead>
              <TableHead className="text-center">After</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                <TableCell className="text-sm">
                    {log.userName || usersMap[log.userId] || log.userId.substring(0,8) + "..."}
                </TableCell>
                <TableCell>
                  <Badge variant={getMovementTypeBadgeVariant(log.type)} className="text-xs whitespace-nowrap">
                    {formatMovementType(log.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted font-medium text-foreground">
                                {itemsMap[log.stockItemId] || log.stockItemId.substring(0,12) + "..."}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent><p>Item: {itemsMap[log.stockItemId] || "Unknown Item"} (ID: {log.stockItemId})</p></TooltipContent>
                    </Tooltip>
                    {getItemDisplay(log.linkedStockItemId, itemsMap, "Linked Item")}
                    {getItemDisplay(log.masterStockItemIdForContext, itemsMap, "Master Ref")}
                </TableCell>
                <TableCell className={`text-center ${getQuantityChangeClass(log.quantityChange)}`}>
                  <div className="flex items-center justify-center">
                    {log.quantityChange > 0 ? <ArrowUpCircle className="h-3.5 w-3.5 mr-1 text-green-500" /> :
                     log.quantityChange < 0 ? <ArrowDownCircle className="h-3.5 w-3.5 mr-1 text-destructive" /> : null}
                    {log.quantityChange > 0 ? `+${log.quantityChange}` : log.quantityChange}
                  </div>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">{log.quantityBefore}</TableCell>
                <TableCell className="text-center font-medium">{log.quantityAfter}</TableCell>
                <TableCell className="text-xs hidden lg:table-cell">
                  <div className="flex items-center">
                    <Building size={12} className="mr-1 text-primary/70 flex-shrink-0" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="cursor-help truncate">{sitesMap[log.siteId] || log.siteId.substring(0,8) + "..."}</span>
                        </TooltipTrigger>
                        <TooltipContent><p>Site: {sitesMap[log.siteId] || "Unknown Site"}<br/>ID: {log.siteId}</p></TooltipContent>
                    </Tooltip>
                  </div>
                  {log.stallId && (
                    <div className="flex items-center text-muted-foreground/90 mt-0.5">
                        <Store size={12} className="mr-1 text-accent/70 flex-shrink-0" />
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="cursor-help truncate">{stallsMap[log.stallId] || log.stallId.substring(0,8) + "..."}</span>
                            </TooltipTrigger>
                            <TooltipContent><p>Stall: {stallsMap[log.stallId] || "Unknown Stall"}<br/>ID: {log.stallId}</p></TooltipContent>
                        </Tooltip>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate hidden lg:table-cell">
                  {log.notes ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">{log.notes.substring(0, 25)}{log.notes.length > 25 ? "..." : ""}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs"><p>{log.notes}</p></TooltipContent>
                    </Tooltip>
                  ) : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
      {showPagination && (
        <div className="flex items-center justify-end space-x-2 py-4 px-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrevPage}
            disabled={isFirstPage || isLoadingPrevPage || isLoadingNextPage}
          >
            {isLoadingPrevPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={isLastPage || isLoadingNextPage || isLoadingPrevPage}
          >
             <span className="mr-2 hidden sm:inline">Next</span>
            {isLoadingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </TooltipProvider>
  );
}

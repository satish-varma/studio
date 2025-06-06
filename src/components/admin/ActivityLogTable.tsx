
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
import { Info, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

interface ActivityLogTableProps {
  logs: StockMovementLog[];
}

export function ActivityLogTable({ logs }: ActivityLogTableProps) {

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
    if (type.includes('CREATE') || type.includes('RECEIVE') || type.includes('ALLOCATE_TO_STALL') || type.includes('TRANSFER_IN')) return "default"; // Using primary for positive changes
    if (type.includes('UPDATE') || type.includes('RETURN')) return "secondary";
    return "outline";
  };
  
  const getQuantityChangeClass = (change: number) => {
    if (change > 0) return "text-green-600 font-medium";
    if (change < 0) return "text-destructive font-medium";
    return "text-muted-foreground";
  };

  if (logs.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No stock movement activity found.</p>;
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
              <TableHead className="w-[200px]">Item ID / Link ID</TableHead>
              <TableHead className="text-center">Qty Change</TableHead>
              <TableHead className="text-center">Before</TableHead>
              <TableHead className="text-center">After</TableHead>
              <TableHead>Site / Stall</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                <TableCell className="text-sm">
                    {log.userName || log.userId.substring(0,8) + "..."}
                </TableCell>
                <TableCell>
                  <Badge variant={getMovementTypeBadgeVariant(log.type)} className="text-xs whitespace-nowrap">
                    {formatMovementType(log.type)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted">{log.stockItemId.substring(0,12)}...</span>
                        </TooltipTrigger>
                        <TooltipContent><p>Item ID: {log.stockItemId}</p></TooltipContent>
                    </Tooltip>
                    {log.linkedStockItemId && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="block text-muted-foreground cursor-help">Linked: {log.linkedStockItemId.substring(0,8)}...</span>
                            </TooltipTrigger>
                            <TooltipContent><p>Linked Item ID: {log.linkedStockItemId}</p></TooltipContent>
                        </Tooltip>
                    )}
                     {log.masterStockItemIdForContext && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="block text-muted-foreground/70 cursor-help">Master Ref: {log.masterStockItemIdForContext.substring(0,8)}...</span>
                            </TooltipTrigger>
                            <TooltipContent><p>Master Stock Item ID: {log.masterStockItemIdForContext}</p></TooltipContent>
                        </Tooltip>
                    )}
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
                <TableCell className="text-xs">
                  <p>Site: {log.siteId.substring(0,8)}...</p>
                  {log.stallId && <p className="text-muted-foreground">Stall: {log.stallId.substring(0,8)}...</p>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
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
    </TooltipProvider>
  );
}


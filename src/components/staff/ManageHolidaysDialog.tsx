
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2 } from "lucide-react";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query, deleteDoc, doc, where } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { Holiday, Site } from '@/types';
import { holidayFormSchema, type HolidayFormValues } from "@/types/holiday";
import { ScrollArea } from '../ui/scroll-area';
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from '../ui/badge';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("ManageHolidaysDialog: Firebase initialization error:", error);
  }
} else {
  db = getFirestore(getApp());
}

interface ManageHolidaysDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
}

export default function ManageHolidaysDialog({ isOpen, onClose, sites }: ManageHolidaysDialogProps) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  const sitesMap = new Map(sites.map(site => [site.id, site.name]));

  const form = useForm<HolidayFormValues>({
    resolver: zodResolver(holidayFormSchema),
    defaultValues: {
      name: "",
      date: new Date(),
      siteId: null,
    },
  });

  useEffect(() => {
    if (!db || !isOpen) return;

    setIsLoading(true);
    const holidaysCollectionRef = collection(db, "holidays");
    const q = query(holidaysCollectionRef, orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedHolidays = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Holiday));
      setHolidays(fetchedHolidays);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching holidays:", error);
      toast({ title: "Error", description: "Could not fetch holidays list.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, toast]);

  const handleAddHoliday = async (values: HolidayFormValues) => {
    if (!db) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "holidays"), {
        name: values.name,
        date: format(values.date, 'yyyy-MM-dd'),
        siteId: values.siteId || null,
        createdAt: new Date().toISOString(),
      });
      toast({ title: "Holiday Added", description: `"${values.name}" has been added.` });
      form.reset({ name: "", date: new Date(), siteId: null });
    } catch (error: any) {
      console.error("Error adding holiday:", error);
      toast({ title: "Error", description: "Could not add holiday. " + error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string, holidayName: string) => {
    if (!db) return;
    setIsDeleting(holidayId);
    try {
      await deleteDoc(doc(db, "holidays", holidayId));
      toast({ title: "Holiday Deleted", description: `"${holidayName}" has been removed.` });
    } catch (error: any) {
      console.error("Error deleting holiday:", error);
      toast({ title: "Error", description: "Could not delete holiday. " + error.message, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Holidays</DialogTitle>
          <DialogDescription>Add or remove holidays for specific sites or globally.</DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleAddHoliday)} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField name="name" control={form.control} render={({field}) => (<FormItem><FormLabel>Holiday Name</FormLabel><FormControl><Input {...field} placeholder="e.g., Diwali" disabled={isSubmitting}/></FormControl><FormMessage/></FormItem>)}/>
              <FormField name="date" control={form.control} render={({field}) => (<FormItem><FormLabel>Date</FormLabel><DatePicker date={field.value} onDateChange={field.onChange} disabled={isSubmitting} /></FormItem>)}/>
            </div>
            <FormField name="siteId" control={form.control} render={({field}) => (
                <FormItem>
                    <FormLabel>Applicable Site</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || "global"} disabled={isSubmitting}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a site"/></SelectTrigger></FormControl>
                        <SelectContent>
                            <SelectItem value="global">Global (All Sites)</SelectItem>
                            {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">Select "Global" to apply this holiday to all sites.</FormDescription>
                    <FormMessage/>
                </FormItem>
            )}/>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              <span className="ml-2">Add Holiday</span>
            </Button>
          </form>
        </Form>
        
        <div className="pt-4">
            <h4 className="font-medium mb-2">Existing Holidays</h4>
             <ScrollArea className="h-64 border rounded-md p-2">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : holidays.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">No custom holidays added yet.</p>
            ) : (
              <div className="space-y-2">
                {holidays.map(holiday => (
                  <div key={holiday.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                    <div>
                        <p className="text-sm font-medium">{holiday.name} <span className="text-xs text-muted-foreground">({holiday.date})</span></p>
                        <Badge variant="outline" className="text-xs mt-1">{holiday.siteId ? sitesMap.get(holiday.siteId) || "Specific Site" : "Global"}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteHoliday(holiday.id, holiday.name)}
                      disabled={isDeleting === holiday.id}
                      aria-label={`Delete holiday ${holiday.name}`}
                    >
                      {isDeleting === holiday.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

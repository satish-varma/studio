
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Trash2, IndianRupee } from "lucide-react";
import { getFirestore, collection, addDoc, onSnapshot, orderBy, query, deleteDoc, doc, where, getDocs } from "firebase/firestore";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';
import type { FoodExpensePreset, FoodExpensePresetFormValues } from '@/types/food';
import { foodExpensePresetFormSchema, foodExpenseCategories, paymentMethods } from "@/types/food";
import { ScrollArea } from '../ui/scroll-area';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("ManageExpensePresetsDialog: Firebase initialization error:", error);
  }
} else {
  db = getFirestore(getApp());
}

interface ManageExpensePresetsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageExpensePresetsDialog({ isOpen, onClose }: ManageExpensePresetsDialogProps) {
  const [presets, setPresets] = useState<FoodExpensePreset[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const form = useForm<FoodExpensePresetFormValues>({
    resolver: zodResolver(foodExpensePresetFormSchema),
    defaultValues: {
      category: undefined,
      defaultVendor: "",
      defaultPaymentMethod: undefined,
      defaultNotes: "",
      defaultTotalCost: undefined,
    },
  });

  useEffect(() => {
    if (!db || !isOpen) return;

    setIsLoading(true);
    const presetsCollectionRef = collection(db, "foodExpensePresets");
    const qPresets = query(presetsCollectionRef, orderBy("category", "asc"));
    const unsubscribePresets = onSnapshot(qPresets, (snapshot) => {
      setPresets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FoodExpensePreset)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching presets:", error);
      toast({ title: "Error", description: "Could not fetch presets.", variant: "destructive" });
      setIsLoading(false);
    });

    const vendorsCollectionRef = collection(db, "foodVendors");
    const qVendors = query(vendorsCollectionRef, orderBy("name", "asc"));
    const unsubscribeVendors = onSnapshot(qVendors, (snapshot) => {
      setVendors(snapshot.docs.map(doc => doc.data().name as string));
    });

    return () => {
      unsubscribePresets();
      unsubscribeVendors();
    };
  }, [isOpen, toast]);

  const handleAddPreset = async (values: FoodExpensePresetFormValues) => {
    if (!db) return;
    
    // Check if a preset for this category already exists
    const existingPreset = presets.find(p => p.category === values.category);
    if (existingPreset) {
      toast({
        title: "Preset Exists",
        description: `A preset for the "${values.category}" category already exists. Please delete it first if you wish to create a new one.`,
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // THE FIX: Create a clean object to send to Firestore, excluding undefined fields.
      const dataToSave: Partial<FoodExpensePresetFormValues> & { createdAt: string, category: string } = {
        category: values.category!, // We know it's defined from the Zod schema
        createdAt: new Date().toISOString(),
      };

      if (values.defaultVendor) dataToSave.defaultVendor = values.defaultVendor;
      if (values.defaultPaymentMethod) dataToSave.defaultPaymentMethod = values.defaultPaymentMethod;
      if (values.defaultNotes) dataToSave.defaultNotes = values.defaultNotes;
      // This is the key part: only add defaultTotalCost if it's a valid number.
      if (values.defaultTotalCost !== undefined && !isNaN(values.defaultTotalCost)) {
          dataToSave.defaultTotalCost = values.defaultTotalCost;
      }
      
      await addDoc(collection(db, "foodExpensePresets"), dataToSave);
      
      toast({ title: "Preset Added", description: `Default values for "${values.category}" have been saved.` });
      form.reset({
        category: undefined, defaultVendor: "", defaultPaymentMethod: undefined,
        defaultNotes: "", defaultTotalCost: undefined
      });
    } catch (error: any) {
      toast({ title: "Error", description: "Could not add preset. " + error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePreset = async (presetId: string, presetName: string) => {
    if (!db) return;
    setIsDeleting(presetId);
    try {
      await deleteDoc(doc(db, "foodExpensePresets", presetId));
      toast({ title: "Preset Deleted", description: `Preset for "${presetName}" has been removed.` });
    } catch (error: any) {
      toast({ title: "Error", description: "Could not delete preset. " + error.message, variant: "destructive" });
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Expense Presets</DialogTitle>
          <DialogDescription>Set default values for expense categories to speed up data entry.</DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleAddPreset)} className="space-y-4 pt-4 border-t">
             <FormField name="category" control={form.control} render={({ field }) => (
                <FormItem><FormLabel>Expense Category *</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select category to create preset" /></SelectTrigger></FormControl>
                    <SelectContent>{foodExpenseCategories.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
                </Select><FormMessage/></FormItem>
            )}/>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField name="defaultTotalCost" control={form.control} render={({ field }) => (<FormItem><FormLabel>Default Cost (₹)</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} onChange={e => field.onChange(parseFloat(e.target.value))} placeholder="e.g., 150.50"/></FormControl><FormMessage/></FormItem>)}/>
                <FormField name="defaultPaymentMethod" control={form.control} render={({ field }) => (<FormItem><FormLabel>Default Payment</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger></FormControl>
                    <SelectContent>{paymentMethods.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}</SelectContent>
                </Select><FormMessage/></FormItem>)}/>
             </div>
             <FormField name="defaultVendor" control={form.control} render={({ field }) => (<FormItem><FormLabel>Default Vendor</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger></FormControl>
                    <SelectContent>{vendors.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent>
                </Select><FormMessage/></FormItem>
            )}/>
            <FormField name="defaultNotes" control={form.control} render={({ field }) => (<FormItem><FormLabel>Default Notes</FormLabel><FormControl><Textarea {...field} placeholder="e.g., Weekly vegetable supply"/></FormControl><FormMessage/></FormItem>)}/>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
              <span className="ml-2">Save New Preset</span>
            </Button>
          </form>
        </Form>
        
        <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">Existing Presets</h4>
             <ScrollArea className="h-64 border rounded-md p-2">
            {isLoading ? (
              <div className="flex justify-center items-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : presets.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">No presets created yet.</p>
            ) : (
              <div className="space-y-2">
                {presets.map(preset => (
                  <div key={preset.id} className="flex items-start justify-between p-3 bg-muted/50 rounded-md">
                    <div className="space-y-1">
                        <p className="text-sm font-semibold">{preset.category}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {preset.defaultTotalCost !== undefined && <Badge variant="secondary">Cost: ₹{preset.defaultTotalCost}</Badge>}
                            {preset.defaultVendor && <Badge variant="secondary">Vendor: {preset.defaultVendor}</Badge>}
                            {preset.defaultPaymentMethod && <Badge variant="secondary">Payment: {preset.defaultPaymentMethod}</Badge>}
                            {preset.defaultNotes && <Badge variant="secondary">Notes: {preset.defaultNotes.substring(0,15)}...</Badge>}
                        </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => handleDeletePreset(preset.id, preset.category)}
                      disabled={isDeleting === preset.id} aria-label={`Delete preset for ${preset.category}`}
                    >
                      {isDeleting === preset.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4" />}
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

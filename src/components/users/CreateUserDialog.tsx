
"use client";

import { useState, useEffect } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus } from "lucide-react";
import type { AppUser, UserRole, Site, Stall } from "@/types";

const createUserSchema = z.object({
  uid: z.string().min(1, { message: "Firebase Auth UID is required." }),
  email: z.string().email({ message: "Invalid email address." }),
  displayName: z.string().min(2, { message: "Display name must be at least 2 characters." }),
  role: z.enum(['staff', 'manager', 'admin'], { required_error: "Role is required." }),
  defaultSiteId: z.string().nullable().optional(),
  defaultStallId: z.string().nullable().optional(),
  managedSiteIds: z.array(z.string()).nullable().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateUser: (userData: Omit<AppUser, 'createdAt'>) => Promise<boolean>;
  sites: Site[];
  stalls: Stall[];
}

export default function CreateUserDialog({ isOpen, onClose, onCreateUser, sites, stalls }: CreateUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stallsForSelectedSite, setStallsForSelectedSite] = useState<Stall[]>([]);

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      uid: "",
      email: "",
      displayName: "",
      role: "staff",
      defaultSiteId: null,
      defaultStallId: null,
      managedSiteIds: [],
    },
  });

  const selectedRole = form.watch("role");
  const selectedDefaultSiteId = form.watch("defaultSiteId");

  useEffect(() => {
    if (selectedRole === 'staff' && selectedDefaultSiteId) {
      setStallsForSelectedSite(stalls.filter(s => s.siteId === selectedDefaultSiteId));
    } else {
      setStallsForSelectedSite([]);
    }
    if (selectedRole !== 'staff') {
        form.setValue('defaultSiteId', null);
        form.setValue('defaultStallId', null);
    }
    if (selectedRole !== 'manager') {
        form.setValue('managedSiteIds', []);
    }
  }, [selectedRole, selectedDefaultSiteId, stalls, form]);

  const handleSubmit = async (values: CreateUserFormValues) => {
    setIsSubmitting(true);
    const userData: Omit<AppUser, 'createdAt'> = {
      uid: values.uid,
      email: values.email,
      displayName: values.displayName,
      role: values.role as UserRole,
      defaultSiteId: values.role === 'staff' ? values.defaultSiteId : null,
      defaultStallId: values.role === 'staff' && values.defaultSiteId ? values.defaultStallId : null,
      managedSiteIds: values.role === 'manager' ? values.managedSiteIds : null,
       // Preferences will be initialized to null by the parent handler
      defaultItemSearchTerm: null,
      defaultItemCategoryFilter: null,
      defaultItemStockStatusFilter: null,
      defaultItemStallFilterOption: null,
      defaultSalesDateRangeFrom: null,
      defaultSalesDateRangeTo: null,
      defaultSalesStaffFilter: null,
    };
    const success = await onCreateUser(userData);
    if (success) {
      form.reset();
      onClose();
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { form.reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New User Document</DialogTitle>
          <DialogDescription>
            Manually create a Firestore user document. Ensure the user (with the provided UID)
            has already been created in Firebase Authentication.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="uid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Firebase Auth UID <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="Enter UID from Firebase Console" {...field} disabled={isSubmitting} className="bg-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input type="email" placeholder="user@example.com" {...field} disabled={isSubmitting} className="bg-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="User's Full Name" {...field} disabled={isSubmitting} className="bg-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role <span className="text-destructive">*</span></FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                    <FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedRole === 'staff' && (
              <>
                <FormField
                  control={form.control}
                  name="defaultSiteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Site (for Staff)</FormLabel>
                      <Select onValueChange={(value) => { field.onChange(value === 'none' ? null : value); form.setValue('defaultStallId', null); }} value={field.value || "none"} disabled={isSubmitting || sites.length === 0}>
                        <FormControl><SelectTrigger className="bg-input"><SelectValue placeholder={sites.length === 0 ? "No sites available" : "Select default site"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">(None)</SelectItem>
                          {sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultStallId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Stall (for Staff)</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value === 'none' ? null : value)} value={field.value || "none"} disabled={isSubmitting || !selectedDefaultSiteId || stallsForSelectedSite.length === 0}>
                        <FormControl><SelectTrigger className="bg-input"><SelectValue placeholder={!selectedDefaultSiteId ? "Select site first" : (stallsForSelectedSite.length === 0 ? "No stalls in site" : "Select default stall")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="none">(None)</SelectItem>
                          {stallsForSelectedSite.map(stall => <SelectItem key={stall.id} value={stall.id}>{stall.name} ({stall.stallType})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {selectedRole === 'manager' && (
              <FormField
                control={form.control}
                name="managedSiteIds"
                render={() => (
                  <FormItem>
                    <FormLabel>Managed Sites (for Manager)</FormLabel>
                    <ScrollArea className="h-32 rounded-md border p-2 bg-input">
                      {sites.length === 0 && <p className="text-sm text-muted-foreground p-2">No sites available to assign.</p>}
                      {sites.map((site) => (
                        <FormField
                          key={site.id}
                          control={form.control}
                          name="managedSiteIds"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 py-1.5">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(site.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), site.id])
                                      : field.onChange(
                                          (field.value || []).filter(
                                            (value) => value !== site.id
                                          )
                                        )
                                  }}
                                  disabled={isSubmitting}
                                />
                              </FormControl>
                              <FormLabel className="text-sm font-normal">
                                {site.name}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                    </ScrollArea>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => { form.reset(); onClose(); }} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Create User Document
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


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
import { Loader2, UserPlus, Eye, EyeOff } from "lucide-react";
import type { AppUser, UserRole, Site, Stall } from "@/types";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getAuth, type User as FirebaseUser } from 'firebase/auth';
import { getApp } from 'firebase/app';

const LOG_PREFIX = "[CreateUserDialog]";

const createUserFormSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string().min(6, { message: "Please confirm the password." }),
  displayName: z.string().min(2, { message: "Display name must be at least 2 characters." }),
  role: z.enum(['staff', 'manager', 'admin'], { required_error: "Role is required." }),
  defaultSiteId: z.string().nullable().optional(),
  defaultStallId: z.string().nullable().optional(),
  managedSiteIds: z.array(z.string()).optional().default([]),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine(data => {
  if (data.role === 'manager' && (!data.managedSiteIds || data.managedSiteIds.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "Managers must be assigned to at least one site.",
  path: ["managedSiteIds"],
});

type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

interface CreateUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateUserFirestoreDoc: (uid: string, userData: Omit<AppUser, 'createdAt' | 'uid'>) => Promise<boolean>;
  sites: Site[];
  stalls: Stall[];
}

export default function CreateUserDialog({ isOpen, onClose, onCreateUserFirestoreDoc, sites, stalls }: CreateUserDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stallsForSelectedSite, setStallsForSelectedSite] = useState<Stall[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { toast } = useToast();
  const { user: adminAppUser, loading: adminAuthLoading } = useAuth();
  const auth = getAuth(getApp());

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
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
    console.log(`${LOG_PREFIX} Role or Site changed. Role: ${selectedRole}, SiteID: ${selectedDefaultSiteId}`);
    if (selectedRole === 'staff') {
      if (selectedDefaultSiteId) {
        const filteredStalls = stalls.filter(s => s.siteId === selectedDefaultSiteId);
        setStallsForSelectedSite(filteredStalls);
        console.log(`${LOG_PREFIX} Staff role, site ${selectedDefaultSiteId} selected. Stalls for site: ${filteredStalls.length}`);
        const currentDefaultStallId = form.getValues("defaultStallId");
        if (currentDefaultStallId && !filteredStalls.find(s => s.id === currentDefaultStallId)) {
          console.log(`${LOG_PREFIX} Current stall ${currentDefaultStallId} not valid for new site. Clearing stall.`);
          form.setValue('defaultStallId', null);
        }
      } else {
        setStallsForSelectedSite([]);
        form.setValue('defaultStallId', null);
        console.log(`${LOG_PREFIX} Staff role, no site selected. Clearing stall selection.`);
      }
      form.setValue('managedSiteIds', []);
    } else if (selectedRole === 'manager') {
      setStallsForSelectedSite([]);
      form.setValue('defaultSiteId', null);
      form.setValue('defaultStallId', null);
      console.log(`${LOG_PREFIX} Manager role. Clearing default site/stall.`);
    } else if (selectedRole === 'admin') {
      setStallsForSelectedSite([]);
      form.setValue('defaultSiteId', null);
      form.setValue('defaultStallId', null);
      form.setValue('managedSiteIds', []);
      console.log(`${LOG_PREFIX} Admin role. Clearing site/stall/managed sites assignments.`);
    }
  }, [selectedRole, selectedDefaultSiteId, stalls, form]);

  const handleSubmit = async (values: CreateUserFormValues) => {
    console.log(`${LOG_PREFIX} handleSubmit called. Values:`, { ...values, password: '***', confirmPassword: '***' });
    setIsSubmitting(true);

    const currentFirebaseUser: FirebaseUser | null = auth.currentUser;

    if (!adminAppUser || adminAuthLoading || !currentFirebaseUser) {
        console.warn(`${LOG_PREFIX} Admin user not loaded or Firebase user not available. AdminAppUser: ${!!adminAppUser}, AdminAuthLoading: ${adminAuthLoading}, CurrentFirebaseUser: ${!!currentFirebaseUser}`);
        toast({ title: "Authentication Error", description: "Admin user not properly authenticated. Please re-login and try again.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    let apiErrorMsg = "";
    try {
      console.log(`${LOG_PREFIX} Attempting to get ID token for admin user: ${currentFirebaseUser.uid}`);
      const idToken = await currentFirebaseUser.getIdToken(true);
      console.log(`${LOG_PREFIX} ID token obtained. Calling /api/admin/create-user...`);

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          displayName: values.displayName,
        }),
      });

      const result = await response.json();
      console.log(`${LOG_PREFIX} /api/admin/create-user response status: ${response.status}, body:`, result);

      if (!response.ok) {
        apiErrorMsg = `API Error: ${result.error || `Failed to create auth user (Status: ${response.status})`}.`;
        if (result.details) apiErrorMsg += ` Details: ${result.details}.`;
        if (result.code) apiErrorMsg += ` Code: ${result.code}.`;
        // Error will be caught by the outer catch block.
        throw new Error(apiErrorMsg);
      }

      const authData = result as { uid: string; email: string; displayName: string };
      if (!authData.uid) {
        console.error(`${LOG_PREFIX} API response OK, but UID missing from authData.`);
        throw new Error("API did not return a UID for the created auth user.");
      }
      console.log(`${LOG_PREFIX} Auth user created via API. UID: ${authData.uid}. Proceeding to create Firestore doc.`);

      const firestoreUserData: Omit<AppUser, 'createdAt' | 'uid'> = {
        email: authData.email,
        displayName: authData.displayName,
        role: values.role as UserRole,
        defaultSiteId: values.role === 'staff' ? (values.defaultSiteId || null) : null,
        defaultStallId: values.role === 'staff' && values.defaultSiteId ? (values.defaultStallId || null) : null,
        managedSiteIds: values.role === 'manager' ? (values.managedSiteIds || []) : [],
        defaultItemSearchTerm: null,
        defaultItemCategoryFilter: null,
        defaultItemStockStatusFilter: null,
        defaultItemStallFilterOption: null,
        defaultSalesDateRangeFrom: null,
        defaultSalesDateRangeTo: null,
        defaultSalesStaffFilter: null,
      };

      const firestoreSuccess = await onCreateUserFirestoreDoc(authData.uid, firestoreUserData);

      if (firestoreSuccess) {
        console.log(`${LOG_PREFIX} User ${authData.email} (UID: ${authData.uid}) created successfully (Auth + Firestore).`);
        toast({ title: "User Created Successfully", description: `User ${authData.email} created.`});
        form.reset();
        onClose();
      } else {
         console.error(`${LOG_PREFIX} Auth user ${authData.email} created, but Firestore doc creation FAILED.`);
         // The onCreateUserFirestoreDoc should ideally throw an error if it fails, which would be caught below.
         // If it returns false, we construct an error message.
         throw new Error(`Auth user ${authData.email} created, but Firestore doc creation FAILED.`);
      }

    } catch (error: any) {
      let toastDescription = error.message || "An unexpected error occurred. Please check the console for more details.";
      let isHandledApiError = false;
      
      if (typeof error.message === 'string') {
          if (error.message.includes("Firebase Admin SDK not initialized")) {
            toastDescription = "Server Error: Firebase Admin SDK failed to initialize. Please check server logs and environment configuration (e.g., GOOGLE_APPLICATION_CREDENTIALS_JSON).";
            console.error(`${LOG_PREFIX} Error during user creation process: ${error.message}`);
          } else if (error.message.includes("is already in use")) {
            toastDescription = error.message;
            form.setError("email", { type: "manual", message: toastDescription });
            console.warn(`${LOG_PREFIX} User creation failed (handled): ${error.message}`);
            isHandledApiError = true;
          } else {
            // For other errors, log them as console.error
            console.error(`${LOG_PREFIX} Error during user creation process: ${error.message}`);
          }
      } else {
        // If error.message is not a string or error is not typical
        console.error(`${LOG_PREFIX} Unexpected error during user creation process:`, error);
      }
      
      toast({
        title: "User Creation Failed",
        description: toastDescription,
        variant: "destructive",
        duration: isHandledApiError ? 7000 : 10000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { form.reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Creates a Firebase Authentication user and their Firestore document with specified role and assignments.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input placeholder="User's Full Name" {...field} disabled={isSubmitting || adminAuthLoading} className="bg-input" /></FormControl>
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
                  <FormControl><Input type="email" placeholder="user@example.com" {...field} disabled={isSubmitting || adminAuthLoading} className="bg-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Password <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <div className="relative">
                        <Input
                            data-testid="password-input"
                            type={showPassword ? "text" : "password"}
                            placeholder="Min. 6 characters"
                            {...field}
                            disabled={isSubmitting || adminAuthLoading}
                            className="bg-input pr-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        </div>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
            <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Confirm Password <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                        <div className="relative">
                        <Input
                            data-testid="confirm-password-input"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="Confirm password"
                            {...field}
                            disabled={isSubmitting || adminAuthLoading}
                            className="bg-input pr-10"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            tabIndex={-1}
                            aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                        >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        </div>
                    </FormControl>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting || adminAuthLoading}>
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
                      <Select onValueChange={(value) => { field.onChange(value === 'none' ? null : value); }} value={field.value || "none"} disabled={isSubmitting || adminAuthLoading || sites.length === 0}>
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
                      <Select onValueChange={(value) => field.onChange(value === 'none' ? null : value)} value={field.value || "none"} disabled={isSubmitting || adminAuthLoading || !selectedDefaultSiteId || stallsForSelectedSite.length === 0}>
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
                    <FormLabel>Managed Sites (for Manager) <span className="text-destructive">*</span></FormLabel>
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
                                  disabled={isSubmitting || adminAuthLoading}
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
              <Button type="button" variant="outline" onClick={() => { form.reset(); onClose(); }} disabled={isSubmitting || adminAuthLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || adminAuthLoading}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

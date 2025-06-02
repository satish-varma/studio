
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, UserCircle, FilterIcon, HistoryIcon, PackageIcon, Building } from "lucide-react"; // Added Building
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, updateDoc, collection, getDocs, query, where, getDoc } from "firebase/firestore";
import { updateProfile as updateFirebaseProfile, getAuth } from "firebase/auth";
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import type { Site, Stall, AppUser, StockItem } from '@/types';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Badge } from "@/components/ui/badge"; // Added Badge

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in ProfilePage:", error);
  }
}
const db = getFirestore();
const auth = getAuth(getApp());

const profileFormSchema = z.object({
  displayName: z.string().min(2, { message: "Display name must be at least 2 characters." }),
  email: z.string().email().optional(),
  // Site/Stall defaults are now role-dependent and handled differently for managers
  defaultSiteId: z.string().nullable().optional(), // Kept for staff/admin convenience
  defaultStallId: z.string().nullable().optional(), // Kept for staff/admin convenience
  // managedSiteIds is not part of this form, it's managed by Admin
  defaultItemSearchTerm: z.string().nullable().optional(),
  defaultItemCategoryFilter: z.string().nullable().optional(),
  defaultItemStockStatusFilter: z.string().nullable().optional(),
  defaultItemStallFilterOption: z.string().nullable().optional(),
  defaultSalesDateRangeFrom: z.string().nullable().optional(),
  defaultSalesDateRangeTo: z.string().nullable().optional(),
  defaultSalesStaffFilter: z.string().nullable().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading, setUser: setAuthUser, setActiveSite, setActiveStall } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allSites, setAllSites] = useState<Site[]>([]); // Renamed from sites to allSites for clarity
  const [stallsForSelectedSite, setStallsForSelectedSite] = useState<Stall[]>([]);
  const [allUsersForStaffFilter, setAllUsersForStaffFilter] = useState<AppUser[]>([]);
  const [itemCategories, setItemCategories] = useState<string[]>([]);
  
  const [loadingContextData, setLoadingContextData] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: "",
      email: "",
      defaultSiteId: null, // For staff/admin
      defaultStallId: null, // For staff/admin
      defaultItemSearchTerm: null,
      defaultItemCategoryFilter: null, 
      defaultItemStockStatusFilter: null, 
      defaultItemStallFilterOption: null, 
      defaultSalesDateRangeFrom: null,
      defaultSalesDateRangeTo: null,
      defaultSalesStaffFilter: null, 
    },
  });

  const selectedDefaultSiteId = form.watch("defaultSiteId"); // Used by staff/admin for their default stall dropdown
  const isStaffUser = user?.role === 'staff';
  const isManagerUser = user?.role === 'manager';
  const isAdminUser = user?.role === 'admin';

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!db || !user) return;
      setLoadingContextData(true);
      try {
        // Fetch all sites for dropdowns (Admins & Managers to set their *own* current view preference)
        const sitesSnapshot = await getDocs(collection(db, "sites"));
        const fetchedSites: Site[] = sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
        setAllSites(fetchedSites.sort((a, b) => a.name.localeCompare(b.name)));

        if (user.role === 'admin' || user.role === 'manager') {
          const usersSnapshot = await getDocs(query(collection(db, "users"), where("role", "in", ["staff", "manager", "admin"])));
          const fetchedUsers: AppUser[] = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
          setAllUsersForStaffFilter(fetchedUsers.sort((a,b) => (a.displayName || "").localeCompare(b.displayName || "")));
        }

        const itemsSnapshot = await getDocs(collection(db, "stockItems"));
        const categoriesSet = new Set<string>();
        itemsSnapshot.forEach(doc => {
            const item = doc.data() as StockItem;
            if (item.category && item.category.trim() !== "") categoriesSet.add(item.category.trim());
        });
        setItemCategories(Array.from(categoriesSet).sort());

      } catch (error: any) {
        console.error("Error fetching context data for profile:", error);
        toast({ title: "Error", description: "Could not load supporting data for profile settings. " + error.message, variant: "destructive" });
      } finally {
        setLoadingContextData(false);
      }
    };
    if (user) fetchInitialData();
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName || "",
        email: user.email || "",
        defaultSiteId: (isStaffUser || isAdminUser) ? (user.defaultSiteId ?? null) : null, // Site for staff/admin
        defaultStallId: (isStaffUser || isAdminUser) ? (user.defaultStallId ?? null) : null, // Stall for staff/admin
        defaultItemSearchTerm: user.defaultItemSearchTerm ?? null,
        defaultItemCategoryFilter: user.defaultItemCategoryFilter ?? null,
        defaultItemStockStatusFilter: user.defaultItemStockStatusFilter ?? null,
        defaultItemStallFilterOption: user.defaultItemStallFilterOption ?? null,
        defaultSalesDateRangeFrom: user.defaultSalesDateRangeFrom ?? null,
        defaultSalesDateRangeTo: user.defaultSalesDateRangeTo ?? null,
        defaultSalesStaffFilter: user.defaultSalesStaffFilter ?? null,
      });
       setDateRange({
          from: user.defaultSalesDateRangeFrom ? parseISO(user.defaultSalesDateRangeFrom) : undefined,
          to: user.defaultSalesDateRangeTo ? parseISO(user.defaultSalesDateRangeTo) : undefined,
      });
    }
  }, [user, form, allSites, isStaffUser, isAdminUser]);

  useEffect(() => {
    const fetchStalls = async () => {
      if (!db || !selectedDefaultSiteId) { // Only relevant if defaultSiteId is being selected (staff/admin)
        setStallsForSelectedSite([]);
        form.setValue("defaultStallId", null); 
        return;
      }
      setLoadingContextData(true); // Can reuse this loading state
      try {
        const q = query(collection(db, "stalls"), where("siteId", "==", selectedDefaultSiteId));
        const stallsSnapshot = await getDocs(q);
        const fetchedStalls: Stall[] = stallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForSelectedSite(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));
        
        const currentDefaultStall = form.getValues("defaultStallId");
        if (currentDefaultStall && !fetchedStalls.find(s => s.id === currentDefaultStall)) {
            form.setValue("defaultStallId", null);
        }
      } catch (error) {
        console.error("Error fetching stalls for profile:", error);
        toast({ title: "Error", description: "Could not load stalls for the selected site.", variant: "destructive" });
        setStallsForSelectedSite([]);
      } finally {
        setLoadingContextData(false);
      }
    };
    if (isStaffUser || isAdminUser) { // Only fetch stalls if user is staff or admin
        fetchStalls();
    } else {
        setStallsForSelectedSite([]); // Managers don't use defaultStallId field
    }
  }, [selectedDefaultSiteId, toast, form, isStaffUser, isAdminUser]);


  async function onSubmit(values: ProfileFormValues) {
    if (!user || !auth.currentUser) {
      toast({ title: "Error", description: "User not found. Please re-login.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const dataToUpdate: Partial<AppUser> = { 
        displayName: values.displayName,
        // Site/Stall defaults are handled based on role
        defaultItemSearchTerm: values.defaultItemSearchTerm && values.defaultItemSearchTerm.trim() !== "" ? values.defaultItemSearchTerm.trim() : null,
        defaultItemCategoryFilter: values.defaultItemCategoryFilter, 
        defaultItemStockStatusFilter: values.defaultItemStockStatusFilter, 
        defaultItemStallFilterOption: values.defaultItemStallFilterOption, 
        defaultSalesDateRangeFrom: dateRange?.from ? dateRange.from.toISOString() : null,
        defaultSalesDateRangeTo: dateRange?.to ? dateRange.to.toISOString() : null,
        defaultSalesStaffFilter: values.defaultSalesStaffFilter, 
      };

      if (isStaffUser || isAdminUser) { // Admins can set their own "viewing" default
        dataToUpdate.defaultSiteId = values.defaultSiteId ? values.defaultSiteId : null;
        dataToUpdate.defaultStallId = (values.defaultSiteId && values.defaultStallId) ? values.defaultStallId : null;
      }
      // For managers, managedSiteIds is set by admin, not here. Their defaultSiteId/StallId in DB should remain null or be ignored.

      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, dataToUpdate);

      if (auth.currentUser.displayName !== values.displayName) {
        await updateFirebaseProfile(auth.currentUser, { displayName: values.displayName });
      }
      
      if (setAuthUser) {
         setAuthUser(prevUser => prevUser ? {
            ...prevUser, 
            ...dataToUpdate,
        } : null);
      }
      
      if (isAdminUser || isStaffUser) { // For admins/staff, update active context from their *own* defaults
        setActiveSite(dataToUpdate.defaultSiteId || null);
        setActiveStall(dataToUpdate.defaultSiteId ? (dataToUpdate.defaultStallId || null) : null);
      }
      // For managers, setActiveSite/Stall is handled by SiteStallSelector or login logic based on managedSiteIds

      toast({
        title: "Profile Updated",
        description: "Your profile and default preferences have been successfully updated.",
      });
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast({
        title: "Update Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || loadingContextData) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading profile and settings...</p>
      </div>
    );
  }

  if (!user) {
     return (
      <div className="space-y-6">
        <PageHeader title="My Profile" />
        <div className="text-center py-10 text-destructive">
          <p>User not loaded. Please try logging in again.</p>
        </div>
      </div>
    );
  }

  const itemStallFilterOptions = [
    { value: "all", label: "All Stock (Site-wide)"}, 
    { value: "master", label: "Master Stock (Site Level)"},
    ...stallsForSelectedSite.map(s => ({ value: s.id, label: `${s.name} (${s.stallType})`}))
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="View and update your personal information and default operational context & filters."
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl flex items-center">
                  <UserCircle className="mr-2 h-6 w-6 text-primary" />
                  User Information
                </CardTitle>
                <CardDescription>
                  Your email is used for login and cannot be changed here.
                  {isStaffUser && " Default site/stall are assigned by an administrator."}
                  {isManagerUser && " Operational sites are assigned by an administrator. Set viewing preferences below."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField control={form.control} name="email" render={({ field }) => ( <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} disabled className="bg-muted/50" /></FormControl><FormMessage /></FormItem> )} />
                <FormField control={form.control} name="displayName" render={({ field }) => ( <FormItem><FormLabel>Display Name</FormLabel><FormControl><Input placeholder="Your Name" {...field} value={field.value || ""} disabled={isSubmitting} className="bg-input"/></FormControl><FormMessage /></FormItem> )} />
                <FormItem><FormLabel>Role</FormLabel><FormControl><Input value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} disabled className="bg-muted/50" /></FormControl></FormItem>
                
                {isManagerUser && (
                  <FormItem>
                    <FormLabel>Managed Sites</FormLabel>
                    {user.managedSiteIds && user.managedSiteIds.length > 0 ? (
                      <div className="space-y-1">
                        {user.managedSiteIds.map(siteId => (
                          <Badge key={siteId} variant="secondary" className="mr-1 mb-1 flex items-center w-fit">
                            <Building size={12} className="mr-1.5" />
                            {allSites.find(s => s.id === siteId)?.name || `Site ID: ${siteId.substring(0,6)}...`}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <Input value="Not assigned to any sites" disabled className="bg-muted/50" />
                    )}
                    <FormDescription>Managed sites are assigned by an administrator.</FormDescription>
                  </FormItem>
                )}

                {(isStaffUser || isAdminUser) && ( // Admin can set their own default view, Staff has assigned default
                  <>
                    <FormField
                      control={form.control}
                      name="defaultSiteId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Site Context</FormLabel>
                          <Select 
                              onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                              value={field.value || "none"}
                              disabled={isSubmitting || allSites.length === 0 || isStaffUser} // Staff cannot change, only view
                          >
                            <FormControl>
                              <SelectTrigger className="bg-input" disabled={isStaffUser}>
                                <SelectValue placeholder={
                                    isStaffUser && field.value ? (allSites.find(s => s.id === field.value)?.name || "Assigned Site") :
                                    isStaffUser && !field.value ? "Not Assigned by Admin" :
                                    isAdminUser && allSites.length === 0 ? "No sites available" :
                                    isAdminUser ? "Select your default viewing site" :
                                    "Select default site"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">(None)</SelectItem>
                              {allSites.map((site) => (
                                <SelectItem key={site.id} value={site.id}>
                                  {site.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isStaffUser && <FormDescription>Your default site is assigned by an administrator.</FormDescription>}
                          {isAdminUser && <FormDescription>This sets your default viewing context.</FormDescription>}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultStallId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Default Stall Context</FormLabel>
                          <Select 
                              onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                              value={field.value || "none"}
                              disabled={isSubmitting || !selectedDefaultSiteId || stallsForSelectedSite.length === 0 || isStaffUser} // Staff cannot change
                          >
                            <FormControl>
                              <SelectTrigger className="bg-input" disabled={isStaffUser}>
                                <SelectValue placeholder={
                                  isStaffUser && field.value ? (stallsForSelectedSite.find(s => s.id === field.value)?.name || "Assigned Stall") :
                                  isStaffUser && !field.value ? "Not Assigned by Admin" :
                                  !selectedDefaultSiteId ? "Select a site first" : 
                                  stallsForSelectedSite.length === 0 ? "No stalls for this site" : 
                                  "Select your default stall"
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">(None)</SelectItem>
                              {stallsForSelectedSite.map((stall) => (
                                <SelectItem key={stall.id} value={stall.id}>
                                  {stall.name} ({stall.stallType})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isStaffUser && <FormDescription>Your default stall is assigned by an administrator.</FormDescription>}
                           {isAdminUser && <FormDescription>This sets your default viewing context within the selected site.</FormDescription>}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-lg">
                <CardHeader><CardTitle className="text-xl flex items-center"><PackageIcon className="mr-2 h-5 w-5 text-primary"/> Default Stock Item Filters</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="defaultItemSearchTerm" render={({ field }) => ( <FormItem><FormLabel>Search Term</FormLabel><FormControl><Input placeholder="e.g., Apples" {...field} value={field.value || ""} disabled={isSubmitting} className="bg-input"/></FormControl></FormItem> )} />
                  <FormField control={form.control} name="defaultItemCategoryFilter" render={({ field }) => ( <FormItem><FormLabel>Category</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Categories" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Categories</SelectItem>{itemCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="defaultItemStockStatusFilter" render={({ field }) => ( <FormItem><FormLabel>Stock Status</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Statuses" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="in-stock">In Stock</SelectItem><SelectItem value="low-stock">Low Stock</SelectItem><SelectItem value="out-of-stock">Out of Stock</SelectItem></SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="defaultItemStallFilterOption" render={({ field }) => ( <FormItem><FormLabel>Stall/Location Filter</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting || !selectedDefaultSiteId && !(isManagerUser && user.managedSiteIds && user.managedSiteIds.length > 0) }><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder={!selectedDefaultSiteId && !(isManagerUser && user.managedSiteIds && user.managedSiteIds.length > 0) ? "Select site context first" : "All Stock (Site-wide)"} /></SelectTrigger></FormControl><SelectContent>{itemStallFilterOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormDescription>Applies to the currently active site view.</FormDescription></FormItem> )} />
                </CardContent>
              </Card>
              <Card className="shadow-lg">
                <CardHeader><CardTitle className="text-xl flex items-center"><HistoryIcon className="mr-2 h-5 w-5 text-primary"/> Default Sales History Filters</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                   <FormItem><FormLabel>Date Range</FormLabel><Popover><PopoverTrigger asChild><Button variant={"outline"} className={`w-full justify-start text-left font-normal bg-input ${!dateRange?.from && "text-muted-foreground"}`} disabled={isSubmitting}><CalendarIcon className="mr-2 h-4 w-4" />{dateRange?.from ? (dateRange.to ? ( <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </> ) : ( format(dateRange.from, "LLL dd, y") ) ) : ( <span>Pick a date range</span> )}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/></PopoverContent></Popover></FormItem>
                  {(user.role === 'admin' || user.role === 'manager') && (
                    <FormField control={form.control} name="defaultSalesStaffFilter" render={({ field }) => ( <FormItem><FormLabel>Staff Member</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Staff" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Staff</SelectItem>{allUsersForStaffFilter.filter(staff => staff.uid && staff.uid.trim() !== "").map(staff => <SelectItem key={staff.uid} value={staff.uid}>{staff.displayName || staff.email}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="mt-6">
            <Button type="submit" disabled={isSubmitting || loadingContextData} className="w-full md:w-auto">
              {isSubmitting ? ( <Loader2 className="animate-spin mr-2" /> ) : ( <Save className="mr-2" /> )}
              Save All Profile Settings
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

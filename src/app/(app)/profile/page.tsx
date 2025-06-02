
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
import { Loader2, Save, UserCircle, FilterIcon, HistoryIcon, PackageIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { updateProfile as updateFirebaseProfile } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { Site, Stall, StockItem, AppUser } from "@/types"; // Added AppUser import
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO, isValid } from "date-fns";
import type { DateRange } from "react-day-picker";

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
  defaultSiteId: z.string().optional().nullable(),
  defaultStallId: z.string().optional().nullable(),
  // New default filter fields
  defaultItemSearchTerm: z.string().optional().nullable(),
  defaultItemCategoryFilter: z.string().optional().nullable(),
  defaultItemStockStatusFilter: z.string().optional().nullable(),
  defaultItemStallFilterOption: z.string().optional().nullable(),
  defaultSalesDateRangeFrom: z.string().optional().nullable(), // Stored as ISO string
  defaultSalesDateRangeTo: z.string().optional().nullable(),   // Stored as ISO string
  defaultSalesStaffFilter: z.string().optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading, setUser: setAuthUser, setActiveSite, setActiveStall } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
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
      defaultSiteId: null,
      defaultStallId: null,
      defaultItemSearchTerm: null,
      defaultItemCategoryFilter: "all",
      defaultItemStockStatusFilter: "all",
      defaultItemStallFilterOption: "all",
      defaultSalesDateRangeFrom: null,
      defaultSalesDateRangeTo: null,
      defaultSalesStaffFilter: "all",
    },
  });

  const selectedSiteId = form.watch("defaultSiteId");

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!db || !user) return;
      setLoadingContextData(true);
      try {
        // Sites
        const sitesSnapshot = await getDocs(collection(db, "sites"));
        const fetchedSites: Site[] = sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
        setSites(fetchedSites.sort((a, b) => a.name.localeCompare(b.name)));

        // Users for staff filter (if admin/manager)
        if (user.role === 'admin' || user.role === 'manager') {
          const usersSnapshot = await getDocs(query(collection(db, "users"), where("role", "in", ["staff", "manager", "admin"])));
          const fetchedUsers: AppUser[] = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser));
          setAllUsersForStaffFilter(fetchedUsers.sort((a,b) => (a.displayName || "").localeCompare(b.displayName || "")));
        }

        // Item Categories (from all items - could be slow if many items, consider dedicated categories collection)
        const itemsSnapshot = await getDocs(collection(db, "stockItems"));
        const categoriesSet = new Set<string>();
        itemsSnapshot.forEach(doc => {
            const item = doc.data() as StockItem;
            if (item.category) categoriesSet.add(item.category);
        });
        setItemCategories(Array.from(categoriesSet).sort());

      } catch (error) {
        console.error("Error fetching context data for profile:", error);
        toast({ title: "Error", description: "Could not load supporting data for profile settings.", variant: "destructive" });
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
        defaultSiteId: user.defaultSiteId || null,
        defaultStallId: user.defaultStallId || null,
        defaultItemSearchTerm: user.defaultItemSearchTerm || "",
        defaultItemCategoryFilter: user.defaultItemCategoryFilter || "all",
        defaultItemStockStatusFilter: user.defaultItemStockStatusFilter || "all",
        defaultItemStallFilterOption: user.defaultItemStallFilterOption || "all",
        defaultSalesDateRangeFrom: user.defaultSalesDateRangeFrom || null,
        defaultSalesDateRangeTo: user.defaultSalesDateRangeTo || null,
        defaultSalesStaffFilter: user.defaultSalesStaffFilter || "all",
      });
       setDateRange({
          from: user.defaultSalesDateRangeFrom ? parseISO(user.defaultSalesDateRangeFrom) : undefined,
          to: user.defaultSalesDateRangeTo ? parseISO(user.defaultSalesDateRangeTo) : undefined,
      });
    }
  }, [user, form, sites]); // Added sites dependency to ensure reset happens after sites are loaded for select

  useEffect(() => {
    const fetchStalls = async () => {
      if (!db || !selectedSiteId) {
        setStallsForSelectedSite([]);
        form.setValue("defaultStallId", null); 
        if(form.getValues("defaultItemStallFilterOption") !== 'all' && form.getValues("defaultItemStallFilterOption") !== 'master') {
            form.setValue("defaultItemStallFilterOption", "all");
        }
        return;
      }
      setLoadingContextData(true); // Use a more general loading state
      try {
        const q = query(collection(db, "stalls"), where("siteId", "==", selectedSiteId));
        const stallsSnapshot = await getDocs(q);
        const fetchedStalls: Stall[] = stallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForSelectedSite(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));
        
        const currentDefaultStall = form.getValues("defaultStallId");
        if (currentDefaultStall && !fetchedStalls.find(s => s.id === currentDefaultStall)) {
            form.setValue("defaultStallId", null);
        }
        const currentItemStallFilter = form.getValues("defaultItemStallFilterOption");
        if (currentItemStallFilter && currentItemStallFilter !== 'all' && currentItemStallFilter !== 'master' && !fetchedStalls.find(s => s.id === currentItemStallFilter)) {
            form.setValue("defaultItemStallFilterOption", 'all');
        }
      } catch (error) {
        console.error("Error fetching stalls for profile:", error);
        toast({ title: "Error", description: "Could not load stalls for the selected site.", variant: "destructive" });
        setStallsForSelectedSite([]);
      } finally {
        setLoadingContextData(false);
      }
    };
    fetchStalls();
  }, [selectedSiteId, toast, form]);


  async function onSubmit(values: ProfileFormValues) {
    if (!user || !auth.currentUser) {
      toast({ title: "Error", description: "User not found. Please re-login.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const dataToUpdate: Partial<AppUser> = { 
        displayName: values.displayName,
        defaultSiteId: values.defaultSiteId || undefined,
        defaultStallId: values.defaultSiteId ? (values.defaultStallId || undefined) : undefined,
        defaultItemSearchTerm: values.defaultItemSearchTerm || undefined,
        defaultItemCategoryFilter: values.defaultItemCategoryFilter || undefined,
        defaultItemStockStatusFilter: values.defaultItemStockStatusFilter || undefined,
        defaultItemStallFilterOption: values.defaultItemStallFilterOption || undefined,
        defaultSalesDateRangeFrom: dateRange?.from ? dateRange.from.toISOString() : undefined,
        defaultSalesDateRangeTo: dateRange?.to ? dateRange.to.toISOString() : undefined,
        defaultSalesStaffFilter: values.defaultSalesStaffFilter || undefined,
      };

      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, dataToUpdate);

      if (auth.currentUser.displayName !== values.displayName) {
        await updateFirebaseProfile(auth.currentUser, { displayName: values.displayName });
      }
      
      if (setAuthUser) {
         setAuthUser(prevUser => prevUser ? {
            ...prevUser, 
            ...dataToUpdate, // Spread the updated fields
        } : null);
      }
      
      setActiveSite(dataToUpdate.defaultSiteId || null);
      setActiveStall(dataToUpdate.defaultSiteId ? (dataToUpdate.defaultStallId || null) : null);

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
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} disabled className="bg-muted/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Name" {...field} disabled={isSubmitting} className="bg-input"/>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                    <FormLabel>Role</FormLabel>
                    <FormControl>
                        <Input value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} disabled className="bg-muted/50" />
                    </FormControl>
                </FormItem>
                <FormField
                  control={form.control}
                  name="defaultSiteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Site Context</FormLabel>
                      <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                          value={field.value || "none"}
                          disabled={isSubmitting || sites.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-input">
                            <SelectValue placeholder={sites.length === 0 ? "No sites available" : "Select your default site"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">(None)</SelectItem>
                          {sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.name}
                            </SelectItem>
                          ))}
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
                      <FormLabel>Default Stall Context</FormLabel>
                      <Select 
                          onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                          value={field.value || "none"}
                          disabled={isSubmitting || !selectedSiteId || stallsForSelectedSite.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-input">
                            <SelectValue placeholder={
                              !selectedSiteId ? "Select a site first" : 
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center"><PackageIcon className="mr-2 h-5 w-5 text-primary"/> Default Stock Item Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="defaultItemSearchTerm" render={({ field }) => ( <FormItem><FormLabel>Search Term</FormLabel><FormControl><Input placeholder="e.g., Apples" {...field} value={field.value || ""} disabled={isSubmitting} className="bg-input"/></FormControl></FormItem> )} />
                  <FormField control={form.control} name="defaultItemCategoryFilter" render={({ field }) => ( <FormItem><FormLabel>Category</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Categories" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Categories</SelectItem>{itemCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="defaultItemStockStatusFilter" render={({ field }) => ( <FormItem><FormLabel>Stock Status</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Statuses" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Statuses</SelectItem><SelectItem value="in-stock">In Stock</SelectItem><SelectItem value="low-stock">Low Stock</SelectItem><SelectItem value="out-of-stock">Out of Stock</SelectItem></SelectContent></Select></FormItem> )} />
                  <FormField control={form.control} name="defaultItemStallFilterOption" render={({ field }) => ( <FormItem><FormLabel>Stall/Location Filter</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting || !selectedSiteId}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder={!selectedSiteId ? "Select a site first" : "All Stock (Site-wide)"} /></SelectTrigger></FormControl><SelectContent>{itemStallFilterOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></FormItem> )} />
                </CardContent>
              </Card>
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl flex items-center"><HistoryIcon className="mr-2 h-5 w-5 text-primary"/> Default Sales History Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                   <FormItem>
                        <FormLabel>Date Range</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={`w-full justify-start text-left font-normal bg-input ${!dateRange?.from && "text-muted-foreground"}`}
                                disabled={isSubmitting}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                dateRange.to ? ( <> {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")} </> ) 
                                : ( format(dateRange.from, "LLL dd, y") )
                                ) : ( <span>Pick a date range</span> )}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/>
                            </PopoverContent>
                        </Popover>
                    </FormItem>
                  {(user.role === 'admin' || user.role === 'manager') && (
                    <FormField control={form.control} name="defaultSalesStaffFilter" render={({ field }) => ( <FormItem><FormLabel>Staff Member</FormLabel><Select onValueChange={(v) => field.onChange(v === "all" ? null : v)} value={field.value || "all"} disabled={isSubmitting}><FormControl><SelectTrigger className="bg-input"><SelectValue placeholder="All Staff" /></SelectTrigger></FormControl><SelectContent><SelectItem value="all">All Staff</SelectItem>{allUsersForStaffFilter.map(staff => <SelectItem key={staff.uid} value={staff.uid}>{staff.displayName || staff.email}</SelectItem>)}</SelectContent></Select></FormItem> )} />
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


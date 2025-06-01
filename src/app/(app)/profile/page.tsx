
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
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
import { Loader2, Save, UserCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { updateProfile as updateFirebaseProfile } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { Site, Stall } from "@/types";

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
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading, setUser: setAuthUser, setActiveSite, setActiveStall } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [stallsForSelectedSite, setStallsForSelectedSite] = useState<Stall[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingStalls, setLoadingStalls] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: user?.displayName || "",
      email: user?.email || "",
      defaultSiteId: user?.defaultSiteId || null,
      defaultStallId: user?.defaultStallId || null,
    },
  });

  const selectedSiteId = form.watch("defaultSiteId");

  useEffect(() => {
    const fetchSites = async () => {
      if (!db) return;
      setLoadingSites(true);
      try {
        const sitesCollectionRef = collection(db, "sites");
        const sitesSnapshot = await getDocs(sitesCollectionRef);
        const fetchedSites: Site[] = sitesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
        setSites(fetchedSites);
      } catch (error) {
        console.error("Error fetching sites for profile:", error);
        toast({ title: "Error", description: "Could not load sites.", variant: "destructive" });
      } finally {
        setLoadingSites(false);
      }
    };
    fetchSites();
  }, [toast]);

  useEffect(() => {
    const fetchStalls = async () => {
      if (!db || !selectedSiteId) {
        setStallsForSelectedSite([]);
        form.setValue("defaultStallId", null); // Reset stall if site changes to none
        return;
      }
      setLoadingStalls(true);
      try {
        const stallsCollectionRef = collection(db, "stalls");
        const q = query(stallsCollectionRef, where("siteId", "==", selectedSiteId));
        const stallsSnapshot = await getDocs(q);
        const fetchedStalls: Stall[] = stallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
        setStallsForSelectedSite(fetchedStalls);
        
        // If current defaultStallId is not in the new list of stalls, reset it
        const currentDefaultStall = form.getValues("defaultStallId");
        if (currentDefaultStall && !fetchedStalls.find(s => s.id === currentDefaultStall)) {
            form.setValue("defaultStallId", null);
        }

      } catch (error) {
        console.error("Error fetching stalls for profile:", error);
        toast({ title: "Error", description: "Could not load stalls for the selected site.", variant: "destructive" });
        setStallsForSelectedSite([]);
      } finally {
        setLoadingStalls(false);
      }
    };
    fetchStalls();
  }, [selectedSiteId, toast, form]);

  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName || "",
        email: user.email || "",
        defaultSiteId: user.defaultSiteId || null,
        defaultStallId: user.defaultStallId || null,
      });
    }
  }, [user, form]);

  async function onSubmit(values: ProfileFormValues) {
    if (!user || !auth.currentUser) {
      toast({ title: "Error", description: "User not found. Please re-login.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { 
        displayName: values.displayName,
        defaultSiteId: values.defaultSiteId || null, // Store null if empty string or undefined
        defaultStallId: values.defaultSiteId ? (values.defaultStallId || null) : null, // Stall only if site is set
      });

      if (auth.currentUser.displayName !== values.displayName) {
        await updateFirebaseProfile(auth.currentUser, { displayName: values.displayName });
      }
      
      const newDefaultSiteId = values.defaultSiteId || null;
      const newDefaultStallId = newDefaultSiteId ? (values.defaultStallId || null) : null;

      if (setAuthUser) {
         setAuthUser(prevUser => prevUser ? {
            ...prevUser, 
            displayName: values.displayName,
            defaultSiteId: newDefaultSiteId || undefined, // Convert null to undefined for AppUser type
            defaultStallId: newDefaultStallId || undefined,
        } : null);
      }
      
      // Update active context if it's the current user changing their own defaults
      // For admins, this allows them to set a "starting preference"
      // For staff/managers, this updates their live context.
      setActiveSite(newDefaultSiteId);
      setActiveStall(newDefaultStallId);


      toast({
        title: "Profile Updated",
        description: "Your profile and default context have been successfully updated.",
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

  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-10">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading profile...</p>
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="View and update your personal information and default operational context."
      />
      <Card className="w-full max-w-lg mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <UserCircle className="mr-2 h-6 w-6 text-primary" />
            Edit Profile
          </CardTitle>
          <CardDescription>
            Your email is used for login and cannot be changed here.
            Set your default site and stall for quicker access on login.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
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
                    <FormLabel>Default Site</FormLabel>
                    <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                        value={field.value || "none"}
                        disabled={isSubmitting || loadingSites}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-input">
                          <SelectValue placeholder={loadingSites ? "Loading sites..." : "Select your default site"} />
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
                    <FormLabel>Default Stall</FormLabel>
                    <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)} 
                        value={field.value || "none"}
                        disabled={isSubmitting || loadingStalls || !selectedSiteId || stallsForSelectedSite.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-input">
                          <SelectValue placeholder={
                            loadingStalls ? "Loading stalls..." : 
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
            <CardFooter>
              <Button type="submit" disabled={isSubmitting || loadingSites || loadingStalls} className="w-full">
                {isSubmitting ? (
                  <Loader2 className="animate-spin mr-2" />
                ) : (
                  <Save className="mr-2" />
                )}
                Save Changes
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}

    

    

    
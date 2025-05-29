
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
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save, UserCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { updateProfile as updateFirebaseProfile } from "firebase/auth"; // Firebase Auth's updateProfile
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';


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
  email: z.string().email().optional(), // Email is usually not editable by user directly this way
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const { user, loading: authLoading, setUser: setAuthUser } = useAuth(); // Assuming useAuth provides setUser or a way to refresh user
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: user?.displayName || "",
      email: user?.email || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        displayName: user.displayName || "",
        email: user.email || "",
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
      // Update Firestore
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, { displayName: values.displayName });

      // Update Firebase Auth profile
      await updateFirebaseProfile(auth.currentUser, { displayName: values.displayName });
      
      // Update AuthContext state
      if (setAuthUser) {
         setAuthUser(prevUser => prevUser ? {...prevUser, displayName: values.displayName} : null);
      }


      toast({
        title: "Profile Updated",
        description: "Your display name has been successfully updated.",
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
        description="View and update your personal information."
      />
      <Card className="w-full max-w-lg mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl flex items-center">
            <UserCircle className="mr-2 h-6 w-6 text-primary" />
            Edit Profile
          </CardTitle>
          <CardDescription>
            Your email is used for login and cannot be changed here.
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
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full">
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

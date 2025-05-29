
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { stallFormSchema, type StallFormValues, STALL_TYPES, type Stall } from "@/types/stall";
import { Loader2, Save } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, addDoc, collection } from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp } from "firebase/app";
import { useState } from "react";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error in StallForm:", error);
  }
}
const db = getFirestore();

interface StallFormProps {
  initialData?: Stall | null;
  stallId?: string | null;
  // siteId is derived from URL params
}

export default function StallForm({ initialData, stallId }: StallFormProps) {
  const router = useRouter();
  const params = useParams();
  const siteId = params.siteId as string; // Get siteId from URL

  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData && !!stallId;

  const form = useForm<StallFormValues>({
    resolver: zodResolver(stallFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      siteId: initialData.siteId, // Should match the current siteId from params
      stallType: initialData.stallType,
    } : {
      name: "",
      siteId: siteId, // Pre-fill siteId for new stalls
      stallType: STALL_TYPES[0], // Default to the first type
    },
  });
  
  // Ensure siteId in form matches current siteId from params, especially for new stalls
  if (!isEditMode && form.getValues("siteId") !== siteId) {
      form.setValue("siteId", siteId);
  }


  async function onSubmit(values: StallFormValues) {
    if (!siteId) {
      toast({ title: "Error", description: "Site ID is missing.", variant: "destructive" });
      return;
    }
    
    // Ensure the siteId from the form submission matches the one from the URL
    if (values.siteId !== siteId) {
        toast({ title: "Error", description: "Site ID mismatch. Please try again.", variant: "destructive" });
        console.error("Form siteId:", values.siteId, "URL siteId:", siteId);
        return;
    }

    setIsSubmitting(true);
    try {
      const stallDataToSave = {
        ...values,
        updatedAt: new Date().toISOString(),
        ...(isEditMode ? {} : { createdAt: new Date().toISOString() }),
      };

      if (isEditMode && stallId) {
        const stallRef = doc(db, "stalls", stallId);
        await setDoc(stallRef, stallDataToSave, { merge: true });
        toast({
          title: "Stall Updated",
          description: `Stall "${values.name}" has been successfully updated.`,
        });
      } else {
        await addDoc(collection(db, "stalls"), stallDataToSave);
        toast({
          title: "Stall Added",
          description: `Stall "${values.name}" has been successfully added.`,
        });
      }
      router.push(`/admin/sites/${siteId}/stalls`); // Navigate back to the stalls list for the current site
      router.refresh();
    } catch (error: any) {
      console.error("Error saving stall:", error);
      toast({
        title: isEditMode ? "Update Failed" : "Add Failed",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-lg mx-auto shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl">
          {isEditMode ? "Edit Stall" : "Add New Stall"}
        </CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stall Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Front Counter 1" {...field} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="stallType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stall Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSubmitting}>
                    <FormControl>
                      <SelectTrigger className="bg-input">
                        <SelectValue placeholder="Select a stall type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STALL_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Hidden siteId field - its value is derived and validated */}
             <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormLabel>Site ID</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="animate-spin mr-2" />
              ) : (
                <Save className="mr-2" />
              )}
              {isEditMode ? "Save Changes" : "Add Stall"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

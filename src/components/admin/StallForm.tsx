
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

const LOG_PREFIX = "[StallForm]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
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
  const siteIdFromUrl = params.siteId as string; // Get siteId from URL

  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData && !!stallId;

  const form = useForm<StallFormValues>({
    resolver: zodResolver(stallFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      siteId: initialData.siteId, 
      stallType: initialData.stallType,
    } : {
      name: "",
      siteId: siteIdFromUrl, 
      stallType: STALL_TYPES[0], 
    },
  });
  
  if (!isEditMode && form.getValues("siteId") !== siteIdFromUrl) {
      console.log(`${LOG_PREFIX} Aligning form siteId (${form.getValues("siteId")}) with URL siteId (${siteIdFromUrl}) for new stall.`);
      form.setValue("siteId", siteIdFromUrl);
  }


  async function onSubmit(values: StallFormValues) {
    console.log(`${LOG_PREFIX} Form submission started. Mode: ${isEditMode ? 'Edit' : 'Add'}. Values:`, values);
    if (!siteIdFromUrl) {
      console.error(`${LOG_PREFIX} Site ID from URL is missing. Cannot submit.`);
      toast({ title: "Error", description: "Site ID is missing from the URL. Cannot save stall.", variant: "destructive" });
      return;
    }
    
    if (values.siteId !== siteIdFromUrl) {
        console.error(`${LOG_PREFIX} Form siteId (${values.siteId}) mismatch with URL siteId (${siteIdFromUrl}).`);
        toast({ title: "Error", description: "Site ID mismatch. Please refresh and try again.", variant: "destructive" });
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
        console.log(`${LOG_PREFIX} Stall ${stallId} updated successfully for site ${siteIdFromUrl}.`);
        toast({
          title: "Stall Updated",
          description: `Stall "${values.name}" has been successfully updated.`,
        });
      } else {
        const newDocRef = await addDoc(collection(db, "stalls"), stallDataToSave);
        console.log(`${LOG_PREFIX} New stall added successfully with ID: ${newDocRef.id} for site ${siteIdFromUrl}.`);
        toast({
          title: "Stall Added",
          description: `Stall "${values.name}" has been successfully added.`,
        });
      }
      router.push(`/admin/sites/${siteIdFromUrl}/stalls`); 
      router.refresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error saving stall (Mode: ${isEditMode ? 'Edit' : 'Add'}, StallID: ${stallId}, SiteID: ${siteIdFromUrl}):`, error.message, error.stack);
      toast({
        title: isEditMode ? "Update Failed" : "Add Failed",
        description: `An error occurred: ${error.message || "Please try again."}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      console.log(`${LOG_PREFIX} Form submission ended. Mode: ${isEditMode ? 'Edit' : 'Add'}.`);
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
             <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormLabel>Site ID (Hidden)</FormLabel>
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

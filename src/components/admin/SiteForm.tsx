
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { SiteFormValues, Site } from "@/types/site";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "@/lib/firebaseConfig";
import { getApps, initializeApp } from "firebase/app";
import { useState } from "react";

const LOG_PREFIX = "[SiteForm]";

if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
}
const db = getFirestore();

// Define Zod schema based on SiteFormValues and siteFormSchema from types/site.ts
const formSchema = z.object({
  name: z.string().min(2, { message: "Site name must be at least 2 characters." }),
  location: z.string().optional(),
});


interface SiteFormProps {
  initialData?: Site | null;
  siteId?: string | null;
}

export default function SiteForm({ initialData, siteId }: SiteFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData && !!siteId;

  const form = useForm<SiteFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      location: initialData.location || "",
    } : {
      name: "",
      location: "",
    },
  });

  async function onSubmit(values: SiteFormValues) {
    setIsSubmitting(true);
    console.log(`${LOG_PREFIX} Form submission started. Mode: ${isEditMode ? 'Edit' : 'Add'}. Values:`, values);
    try {
      const siteDataToSave = {
        ...values,
        updatedAt: new Date().toISOString(),
        ...(isEditMode ? {} : { createdAt: new Date().toISOString() }),
      };

      if (isEditMode && siteId) {
        const siteRef = doc(db, "sites", siteId);
        await setDoc(siteRef, siteDataToSave, { merge: true });
        console.log(`${LOG_PREFIX} Site ${siteId} updated successfully.`);
        toast({
          title: "Site Updated",
          description: `${values.name} has been successfully updated.`,
        });
      } else {
        const newDocRef = await addDoc(collection(db, "sites"), siteDataToSave);
        console.log(`${LOG_PREFIX} New site added successfully with ID: ${newDocRef.id}.`);
        toast({
          title: "Site Added",
          description: `${values.name} has been successfully added.`,
        });
      }
      router.push("/admin/sites");
      router.refresh();
    } catch (error: any) {
      console.error(`${LOG_PREFIX} Error saving site (Mode: ${isEditMode ? 'Edit' : 'Add'}, SiteID: ${siteId}):`, error.message, error.stack);
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
          {isEditMode ? "Edit Site" : "Add New Site"}
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
                  <FormLabel>Site Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Main Street Branch" {...field} disabled={isSubmitting} className="bg-input"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., New York, NY" {...field} disabled={isSubmitting} className="bg-input"/>
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
              {isEditMode ? "Save Changes" : "Add Site"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

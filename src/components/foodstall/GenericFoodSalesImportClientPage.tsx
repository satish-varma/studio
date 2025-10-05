
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText, ArrowLeft } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { Label } from "@/components/ui/label";
import { auth } from '@/lib/firebaseConfig';
import Link from 'next/link';

const LOG_PREFIX = "[GenericFoodSalesImport]";

export default function GenericFoodSalesImportClientPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast({ title: "Invalid File Type", description: "Please select a .csv file.", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast({ title: "No File Selected", description: "Please select a CSV file to import.", variant: "destructive" });
      return;
    }
    if (!user || !auth.currentUser) {
      toast({ title: "Authentication Error", description: "You must be logged in to import data.", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    toast({ title: "Importing...", description: "Your sales data is being processed. This may take a moment." });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      
      try {
        const idToken = await auth.currentUser!.getIdToken(true);

        const response = await fetch('/api/food-sales-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ csvData }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Server responded with status ${response.status}`);
        }

        toast({
          title: "Import Successful",
          description: result.message || "Data imported successfully.",
          duration: 7000,
        });

      } catch (error: any) {
        console.error(`${LOG_PREFIX} Error during import API call:`, error);
        toast({
          title: "Import Failed",
          description: error.message || "An unexpected error occurred during import.",
          variant: "destructive",
          duration: 10000,
        });
      } finally {
        setIsUploading(false);
        setSelectedFile(null);
      }
    };
    reader.readAsText(selectedFile);
  };

  return (
    <Card className="max-w-2xl mx-auto">
        <CardHeader>
            <CardTitle>Upload Sales CSV</CardTitle>
            <CardDescription>
                The CSV should contain columns like `Sale Date`, `Site Name`, `Stall Name`, `Sale Type`, `Hungerbox Sales`, and `UPI Sales`.
                If a record for a specific date, stall, and sale type exists, it will be updated. Otherwise, a new record will be created.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
             <div className="space-y-2">
                <Label htmlFor="csv-file-input">CSV File to Import</Label>
                <Input 
                id="csv-file-input" 
                type="file" 
                accept=".csv"
                onChange={handleFileChange}
                disabled={isUploading}
                className="file:text-primary file:font-semibold"
                />
            </div>
            {selectedFile && (
                <div className="flex items-center p-2 text-sm text-muted-foreground bg-muted/50 rounded-md">
                <FileText className="h-4 w-4 mr-2 text-primary" />
                <span>{selectedFile.name}</span>
                </div>
            )}
        </CardContent>
        <CardFooter className="flex justify-between">
            <Link href="/foodstall/sales">
                <Button variant="outline" disabled={isUploading}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sales List
                </Button>
            </Link>
            <Button onClick={handleImport} disabled={!selectedFile || isUploading}>
                {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Import Sales
            </Button>
        </CardFooter>
    </Card>
  );
}

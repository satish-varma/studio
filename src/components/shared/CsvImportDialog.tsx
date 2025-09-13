
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { Label } from "@/components/ui/label";
import { auth } from '@/lib/firebaseConfig';

const LOG_PREFIX = "[CsvImportDialog]";

interface CsvImportDialogProps {
  dataType: 'stock' | 'foodExpenses' | 'foodSales' | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function CsvImportDialog({ dataType, isOpen, onClose }: CsvImportDialogProps) {
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
    if (!selectedFile || !dataType) {
      toast({ title: "Missing Information", description: "Please select a file and ensure data type is set.", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to import data.", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    toast({ title: "Importing...", description: "Your data is being processed. This may take a moment." });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      
      try {
        const authInstance = auth;
        if (!authInstance || !authInstance.currentUser) throw new Error("Firebase user not available for token retrieval.");
        const idToken = await authInstance.currentUser.getIdToken(true);

        const response = await fetch('/api/csv-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({ dataType, csvData }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || `Server responded with status ${response.status}`);
        }

        toast({
          title: "Import Successful",
          description: result.message || "Data imported successfully.",
          variant: "default",
          duration: 7000,
        });
        onClose(); // Close dialog on success

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
      }
    };
    reader.readAsText(selectedFile);
  };
  
  const getTitle = () => {
      switch (dataType) {
          case 'stock': return 'Import Stock Items';
          case 'foodExpenses': return 'Import Food Expenses';
          case 'foodSales': return 'Import Food Sales';
          default: return 'Import Data';
      }
  };
  
  const getDescription = () => {
      switch (dataType) {
          case 'stock': return 'Upload a CSV file to add or update stock items. The format must match the exported CSV file, including the "ID" column for updates.';
          case 'foodExpenses': return 'Upload a CSV of food expenses. Rows with an "Expense ID" will be updated; rows without one will be created as new expenses.';
          case 'foodSales': return 'Upload a CSV of daily sales summaries. An existing entry for a given Date, Stall, and Sale Type will be updated; otherwise, a new one is created.';
          default: return 'Upload a CSV file.';
      }
  }


  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); setSelectedFile(null); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file-input">CSV File</Label>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>Cancel</Button>
          <Button onClick={handleImport} disabled={!selectedFile || isUploading}>
            {isUploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Import Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

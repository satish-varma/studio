
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Building, Store } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebaseConfig';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getFirestore, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import type { Site, Stall } from '@/types';
import { Label } from '../ui/label';

const db = getFirestore();

interface ScrapeHungerboxDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScrapeHungerboxDialog({ isOpen, onClose }: ScrapeHungerboxDialogProps) {
  const [isScraping, setIsScraping] = useState(false);
  
  // State for site/stall selection within the dialog
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedStallId, setSelectedStallId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);

  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch sites when the dialog is open
  useEffect(() => {
    if (!isOpen || !db) return;

    setLoadingContext(true);
    const sitesQuery = query(collection(db, "sites"), orderBy("name"));
    const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
        setAllSites(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Site)));
        setLoadingContext(false);
    }, (error) => {
        console.error("Error fetching sites for dialog:", error);
        setLoadingContext(false);
        toast({ title: "Error", description: "Could not load sites.", variant: "destructive" });
    });

    return () => {
      unsubSites();
    };
  }, [isOpen, toast]);

  // Update stalls dropdown when a site is selected
  useEffect(() => {
    if (selectedSiteId && db) {
        setLoadingContext(true); // Show loading while stalls fetch for new site
        const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", selectedSiteId), orderBy("name"));
        const unsub = onSnapshot(stallsQuery, (snapshot) => {
            setStallsForSite(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Stall)));
            setLoadingContext(false);
        });
        return () => unsub();
    }
    setStallsForSite([]);
    setSelectedStallId(''); // Reset stall when site changes
  }, [selectedSiteId]);


  const handleImport = async () => {
     if (!selectedSiteId || !selectedStallId) {
        toast({ title: "Context Required", description: "Please select a site and stall to associate this import with.", variant: "destructive" });
        return;
    }
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to import data.", variant: "destructive" });
      return;
    }

    setIsScraping(true);
    toast({ title: "Importing...", description: "Processing email data. This may take a moment...", duration: 10000 });

    try {
      if (!auth || !auth.currentUser) throw new Error("Firebase user not available for token retrieval.");
      const idToken = await auth.currentUser.getIdToken(true);

      const response = await fetch('/api/scrape-hungerbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ siteId: selectedSiteId, stallId: selectedStallId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      toast({ title: "Import Successful", description: result.message, variant: "default", duration: 7000 });
      onClose();

    } catch (error: any) {
      console.error("Error during Hungerbox import:", error);
      toast({ title: "Import Failed", description: error.message, variant: "destructive", duration: 10000 });
    } finally {
      setIsScraping(false);
    }
  };
  
  const handleDialogClose = () => {
    setSelectedSiteId('');
    setSelectedStallId('');
    setStallsForSite([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Sales from Hungerbox Email</DialogTitle>
          <DialogDescription>
            Select the site and stall to associate the imported sales data with. This will process the latest sales data from a sample email.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <Alert variant="default" className="border-primary/30">
            <Bot className="h-4 w-4" />
            <AlertTitle>How this works</AlertTitle>
            <AlertDescription className="text-xs">
              This feature uses an AI flow to read a sample email and automatically create a sales record for the selected stall.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label htmlFor="import-site-select">Site *</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={loadingContext || isScraping}>
                    <SelectTrigger id="import-site-select"><Building className="h-4 w-4 mr-2 text-muted-foreground"/><SelectValue placeholder="Select site..."/></SelectTrigger>
                    <SelectContent>{allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="import-stall-select">Stall *</Label>
                 <Select value={selectedStallId} onValueChange={setSelectedStallId} disabled={!selectedSiteId || loadingContext || isScraping}>
                    <SelectTrigger id="import-stall-select"><Store className="h-4 w-4 mr-2 text-muted-foreground"/><SelectValue placeholder={!selectedSiteId ? "Select site first" : "Select stall..."}/></SelectTrigger>
                    <SelectContent>{stallsForSite.map(stall => <SelectItem key={stall.id} value={stall.id}>{stall.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleDialogClose} disabled={isScraping}>Cancel</Button>
          <Button onClick={handleImport} disabled={isScraping || loadingContext || !selectedSiteId || !selectedStallId}>
            {isScraping || loadingContext ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            {loadingContext ? "Loading..." : isScraping ? "Importing..." : "Process & Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

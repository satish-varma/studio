
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Eye, EyeOff, Building, Store } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebaseConfig';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getFirestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import type { Site, Stall } from '@/types';

const db = getFirestore();

interface ScrapeHungerboxDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScrapeHungerboxDialog({ isOpen, onClose }: ScrapeHungerboxDialogProps) {
  const [username, setUsername] = useState("the_gut_guru");
  const [password, setPassword] = useState("hungerbox@123");
  const [isScraping, setIsScraping] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // New state for site/stall selection within the dialog
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedStallId, setSelectedStallId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);

  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch sites and stalls when the dialog is open
  useEffect(() => {
    if (!isOpen || !db) return;

    setLoadingContext(true);
    const sitesQuery = query(collection(db, "sites"), orderBy("name"));
    const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
        setAllSites(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Site)));
        setLoadingContext(false);
    });

    const stallsQuery = query(collection(db, "stalls"), orderBy("name"));
    const unsubStalls = onSnapshot(stallsQuery, (snapshot) => {
      const allStallsData = snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Stall));
      if (selectedSiteId) {
        setStallsForSite(allStallsData.filter(s => s.siteId === selectedSiteId));
      }
    });

    return () => {
      unsubSites();
      unsubStalls();
    };
  }, [isOpen, selectedSiteId]);

  // Update stalls dropdown when a site is selected
  useEffect(() => {
    if (selectedSiteId && allSites.length > 0) { // Check allSites to ensure stalls can be filtered
        const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", selectedSiteId), orderBy("name"));
        const unsub = onSnapshot(stallsQuery, (snapshot) => {
            setStallsForSite(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Stall)));
        });
        return () => unsub();
    }
    setStallsForSite([]);
    setSelectedStallId(''); // Reset stall when site changes
  }, [selectedSiteId, allSites]);


  const handleImport = async () => {
    if (!username || !password) {
      toast({ title: "Missing Credentials", description: "Please enter your Hungerbox username and password.", variant: "destructive" });
      return;
    }
     if (!selectedSiteId || !selectedStallId) {
        toast({ title: "Context Required", description: "Please select a site and stall to associate this import with.", variant: "destructive" });
        return;
    }
    if (!user) {
      toast({ title: "Authentication Error", description: "You must be logged in to import data.", variant: "destructive" });
      return;
    }

    setIsScraping(true);
    toast({ title: "Importing...", description: "Connecting to Hungerbox. This may take a moment...", duration: 10000 });

    try {
      if (!auth.currentUser) throw new Error("Firebase user not available.");
      const idToken = await auth.currentUser.getIdToken(true);

      const response = await fetch('/api/scrape-hungerbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ username, password, siteId: selectedSiteId, stallId: selectedStallId }),
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import from Hungerbox</DialogTitle>
          <DialogDescription>
            Enter your credentials and select the site/stall to associate the imported sales data with.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <Alert variant="default" className="border-primary/30">
            <Bot className="h-4 w-4" />
            <AlertTitle>Note on Web Scraping</AlertTitle>
            <AlertDescription className="text-xs">
              This feature works by simulating a browser login. If Hungerbox changes their website layout, this import may fail.
              The current implementation uses mock data for demonstration.
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
          <div className="space-y-2">
            <Label htmlFor="hb-username">Hungerbox Username</Label>
            <Input 
              id="hb-username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="your.email@example.com"
              disabled={isScraping}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hb-password">Hungerbox Password</Label>
            <div className="relative">
                <Input
                id="hb-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isScraping}
                />
                 <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isScraping}>Cancel</Button>
          <Button onClick={handleImport} disabled={isScraping || !username || !password || !selectedSiteId || !selectedStallId}>
            {isScraping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            Import Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

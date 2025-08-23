
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Bot, Building, Store, CheckCircle, Link as LinkIcon } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/lib/firebaseConfig';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getFirestore, collection, query, orderBy, onSnapshot, where, doc, getDoc } from 'firebase/firestore';
import type { Site, Stall } from '@/types';

interface ScrapeHungerboxDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScrapeHungerboxDialog({ isOpen, onClose }: ScrapeHungerboxDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stallsForSite, setStallsForSite] = useState<Stall[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedStallId, setSelectedStallId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState(true);

  const { toast } = useToast();
  const { user } = useAuth();
  
  useEffect(() => {
    if (!isOpen || !user) {
        setIsCheckingConnection(true);
        setIsGmailConnected(false);
        return;
    }

    const checkConnectionStatus = async () => {
      setIsCheckingConnection(true);
      if (db) {
          const tokensDocRef = doc(db, 'user_tokens', user.uid);
          const tokensDocSnap = await getDoc(tokensDocRef);
          setIsGmailConnected(tokensDocSnap.exists());
      }
      setIsCheckingConnection(false);
    };

    checkConnectionStatus();

    const sitesQuery = query(collection(db, "sites"), orderBy("name"));
    const unsubSites = onSnapshot(sitesQuery, (snapshot) => {
        setAllSites(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Site)));
        setLoadingContext(false);
    });

    return () => unsubSites();
  }, [isOpen, user, toast]);

  useEffect(() => {
    if (selectedSiteId && db) {
        setLoadingContext(true);
        const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", selectedSiteId), orderBy("name"));
        const unsub = onSnapshot(stallsQuery, (snapshot) => {
            setStallsForSite(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Stall)));
            setLoadingContext(false);
        });
        return () => unsub();
    }
    setStallsForSite([]);
    setSelectedStallId('');
  }, [selectedSiteId]);

  const handleConnectGmail = async () => {
      if (!auth.currentUser) return;
      setIsProcessing(true);
      try {
          const idToken = await auth.currentUser.getIdToken(true);
          const response = await fetch('/api/auth/google/initiate', {
              headers: { 'Authorization': `Bearer ${idToken}` }
          });
          if (response.redirected) {
              window.location.href = response.url;
          } else {
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Failed to initiate Google authentication.');
          }
      } catch (error: any) {
          toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
          setIsProcessing(false);
      }
  };

  const handleFetchAndProcess = async () => {
     if (!selectedSiteId || !selectedStallId) {
        toast({ title: "Context Required", description: "Please select a site and stall.", variant: "destructive" });
        return;
    }
    if (!user || !auth.currentUser) return;

    setIsProcessing(true);
    toast({ title: "Fetching Emails...", description: "Looking for new sales emails from Hungerbox.", duration: 10000 });

    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch('/api/gmail-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ siteId: selectedSiteId, stallId: selectedStallId }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Server responded with status ${response.status}`);
      toast({ title: "Process Complete", description: result.message, variant: "default", duration: 7000 });
      onClose();

    } catch (error: any) {
      toast({ title: "Processing Failed", description: error.message, variant: "destructive", duration: 10000 });
    } finally {
      setIsProcessing(false);
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
          <DialogTitle>Import Sales from Gmail</DialogTitle>
          <DialogDescription>
            Connect your Gmail account to automatically fetch and record sales from Hungerbox confirmation emails.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <div className="space-y-2">
                <Label htmlFor="import-site-select">Target Site *</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId} disabled={loadingContext || isProcessing}>
                    <SelectTrigger id="import-site-select"><Building className="h-4 w-4 mr-2 text-muted-foreground"/><SelectValue placeholder="Select site..."/></SelectTrigger>
                    <SelectContent>{allSites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label htmlFor="import-stall-select">Target Stall *</Label>
                 <Select value={selectedStallId} onValueChange={setSelectedStallId} disabled={!selectedSiteId || loadingContext || isProcessing}>
                    <SelectTrigger id="import-stall-select"><Store className="h-4 w-4 mr-2 text-muted-foreground"/><SelectValue placeholder={!selectedSiteId ? "Select site first" : "Select stall..."}/></SelectTrigger>
                    <SelectContent>{stallsForSite.map(stall => <SelectItem key={stall.id} value={stall.id}>{stall.name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
          </div>
          {isCheckingConnection ? (
              <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : isGmailConnected ? (
              <Alert variant="default" className="border-green-300 bg-green-50 dark:bg-green-900/30">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800 dark:text-green-300">Gmail Account Connected</AlertTitle>
                  <AlertDescription className="text-green-700 dark:text-green-400">
                      You are ready to fetch and process emails.
                  </AlertDescription>
              </Alert>
          ) : (
              <Alert variant="destructive">
                  <LinkIcon className="h-4 w-4" />
                  <AlertTitle>Gmail Account Not Connected</AlertTitle>
                  <AlertDescription>
                      You must connect your Gmail account to allow StallSync to read your sales emails.
                  </AlertDescription>
              </Alert>
          )}
        </div>
        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDialogClose} disabled={isProcessing}>Cancel</Button>
          {!isGmailConnected && (
            <Button onClick={handleConnectGmail} disabled={isProcessing || isCheckingConnection}>
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                Connect to Gmail
            </Button>
          )}
          {isGmailConnected && (
             <Button onClick={handleFetchAndProcess} disabled={isProcessing || isCheckingConnection || !selectedSiteId || !selectedStallId}>
                {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
                Fetch & Process Emails
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

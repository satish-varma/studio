
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, onSnapshot, query, where, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import type { Site, Stall } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

// Initialize Firebase only if it hasn't been initialized yet
let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error("Firebase initialization error in SiteStallSelector:", error);
  }
} else {
  db = getFirestore(getApp());
}


export default function SiteStallSelector() {
  const { user, activeSiteId, activeStallId, setActiveSite, setActiveStall } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingStalls, setLoadingStalls] = useState(false);

  // Fetch sites
  useEffect(() => {
    if (!db || !user) {
        setSites([]);
        setLoadingSites(false);
        return;
    }
    setLoadingSites(true);
    // For admins, load all sites.
    const sitesQuery = query(collection(db, "sites"));
    const unsubscribe = onSnapshot(sitesQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      const fetchedSites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
      setSites(fetchedSites.sort((a,b) => a.name.localeCompare(b.name)));

      if (activeSiteId && !fetchedSites.find(s => s.id === activeSiteId)) {
        setActiveSite(null); 
      }
      setLoadingSites(false);
    }, (error) => {
      console.error("Error fetching sites for selector:", error);
      setLoadingSites(false);
      setSites([]);
    });
    return () => unsubscribe();
  }, [user, activeSiteId, setActiveSite]);

  // Fetch stalls when activeSiteId changes
  useEffect(() => {
    if (!db || !user || !activeSiteId) {
      setStalls([]);
      setLoadingStalls(false);
      if (!activeSiteId && activeStallId) {
          setActiveStall(null);
      }
      return;
    }
    setLoadingStalls(true);
    const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
    const unsubscribe = onSnapshot(stallsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
      setStalls(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));

      if (activeStallId && !fetchedStalls.find(s => s.id === activeStallId)) {
         setActiveStall(null);
      }
      setLoadingStalls(false);
    }, (error) => {
      console.error(`Error fetching stalls for site ${activeSiteId}:`, error);
      setLoadingStalls(false);
      setStalls([]);
    });
    return () => unsubscribe();
  }, [user, activeSiteId, activeStallId, setActiveStall]);

  const handleSiteChange = (newSiteId: string) => {
    if (newSiteId === "all-sites" || newSiteId === "") {
        setActiveSite(null);
    } else {
        setActiveSite(newSiteId);
    }
  };

  const handleStallChange = (newStallId: string) => {
    if (newStallId === "all-stalls" || newStallId === "") {
        setActiveStall(null);
    } else {
        setActiveStall(newStallId);
    }
  };

  // Only render the selector for admin roles for now.
  // Non-admins will rely on their defaultSiteId/defaultStallId from profile.
  if (!user || user.role !== 'admin') {
    return null; 
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeSiteId || "all-sites"}
        onValueChange={handleSiteChange}
        disabled={loadingSites || sites.length === 0}
      >
        <SelectTrigger className="w-[180px] h-9 text-xs bg-input">
          <SelectValue placeholder={loadingSites ? "Loading sites..." : (sites.length === 0 ? "No sites available" : "Select Site")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-sites">(All Sites / None)</SelectItem>
          {sites.map(site => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={activeStallId || "all-stalls"}
        onValueChange={handleStallChange}
        disabled={!activeSiteId || loadingStalls || (stalls.length === 0 && !!activeSiteId)}
      >
        <SelectTrigger className="w-[180px] h-9 text-xs bg-input">
          <SelectValue placeholder={
            !activeSiteId ? "Select site first" :
            loadingStalls ? "Loading stalls..." :
            (stalls.length === 0 ? "No stalls in site" : "Select Stall")
          } />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-stalls">(All Stalls / None)</SelectItem>
          {stalls.map(stall => (
            <SelectItem key={stall.id} value={stall.id}>{stall.name} ({stall.stallType})</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(loadingSites || (activeSiteId && loadingStalls)) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

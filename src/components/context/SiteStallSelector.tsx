
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, onSnapshot, query, where, DocumentData, QuerySnapshot, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import type { Site, Stall } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  const [sitesForSelector, setSitesForSelector] = useState<Site[]>([]);
  const [stallsForSelector, setStallsForSelector] = useState<Stall[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingStalls, setLoadingStalls] = useState(false);

  // Fetch sites for the selector based on user role
  useEffect(() => {
    console.log("SiteStallSelector: Sites useEffect triggered. User:", user?.uid, "Role:", user?.role, "Current activeSiteId:", activeSiteId);
    if (!db || !user) {
        setSitesForSelector([]);
        setLoadingSites(false);
        if (activeSiteId !== null && !user) {
            console.log("SiteStallSelector (useEffect sites): No user, clearing activeSiteId.");
            setActiveSite(null);
        }
        return;
    }

    if (user.role === 'staff') {
        console.log("SiteStallSelector (useEffect sites): User is staff, not fetching sites for this selector.");
        setSitesForSelector([]);
        setLoadingSites(false);
        return;
    }

    setLoadingSites(true);
    let sitesQuery;

    if (user.role === 'admin') {
      sitesQuery = query(collection(db, "sites"));
      console.log("SiteStallSelector (useEffect sites): Admin role, preparing to fetch all sites.");
    } else if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 0) {
      if (user.managedSiteIds.length <= 30) { // Firestore 'in' query limit
         sitesQuery = query(collection(db, "sites"), where("__name__", "in", user.managedSiteIds));
         console.log("SiteStallSelector (useEffect sites): Manager role, fetching managed sites (<=30):", user.managedSiteIds);
      } else {
        // For managers with >30 sites, fetch all and filter client-side.
        sitesQuery = query(collection(db, "sites"));
        console.warn("SiteStallSelector (useEffect sites): Manager has >30 managed sites, fetching all sites for selector. Client-side filter will apply.");
      }
    } else {
      console.log(`SiteStallSelector (useEffect sites): User role ${user.role} has no applicable sites for selector. Clearing sitesForSelector.`);
      setSitesForSelector([]);
      setLoadingSites(false);
      // If a manager had a site selected but now has no sites (e.g., manager unassigned from all)
      if (activeSiteId !== null && user.role === 'manager') {
            console.log(`SiteStallSelector (useEffect sites): No sites for manager ${user.uid}, clearing activeSiteId.`);
            setActiveSite(null);
      }
      return;
    }

    const unsubscribe = onSnapshot(sitesQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      let fetchedSites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
      console.log("SiteStallSelector (useEffect sites): Raw fetched sites count:", fetchedSites.length);

      // Client-side filter for manager with >30 sites
      if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 30) {
          fetchedSites = fetchedSites.filter(site => user.managedSiteIds!.includes(site.id));
          console.log("SiteStallSelector (useEffect sites): Manager client-side filtered sites count:", fetchedSites.length);
      }
      setSitesForSelector(fetchedSites.sort((a,b) => a.name.localeCompare(b.name)));

      // For Admin/Manager: If their currently active site is no longer in the list they are allowed to see, then clear it.
      if ((user.role === 'admin' || user.role === 'manager') && activeSiteId && !fetchedSites.find(s => s.id === activeSiteId)) {
        console.log(`SiteStallSelector (useEffect sites): Active site ${activeSiteId} not in fetched list for ${user.role}, clearing.`);
        setActiveSite(null);
      } else if (activeSiteId && fetchedSites.find(s => s.id === activeSiteId)){
        console.log(`SiteStallSelector (useEffect sites): Active site ${activeSiteId} is valid for ${user.role}.`);
      } else if (!activeSiteId && (user.role === 'admin' || user.role === 'manager')) {
        console.log(`SiteStallSelector (useEffect sites): No active site currently selected for ${user.role}.`);
      }

      setLoadingSites(false);
    }, (error) => {
      console.error("SiteStallSelector (useEffect sites): Error fetching sites for selector:", error);
      setLoadingSites(false);
      setSitesForSelector([]);
    });
    return () => unsubscribe();
  }, [user, db, setActiveSite, activeSiteId]); // Added activeSiteId to dependency array

  // Fetch stalls when activeSiteId changes (for any user who can select a site: admin or manager)
  useEffect(() => {
    console.log("SiteStallSelector: Stalls useEffect triggered. User role:", user?.role, "ActiveSiteId:", activeSiteId, "Current activeStallId:", activeStallId);
    if (!db || !user || !activeSiteId) {
      setStallsForSelector([]);
      setLoadingStalls(false);
      if (!activeSiteId && activeStallId !== null) {
          console.log("SiteStallSelector (useEffect stalls): No activeSiteId, clearing activeStallId.");
          setActiveStall(null);
      }
      return;
    }

    if (user.role === 'manager') {
        console.log("SiteStallSelector (useEffect stalls): User is manager, setting stallsForSelector to empty and activeStall to null.");
        setStallsForSelector([]);
        setLoadingStalls(false);
        if (activeStallId !== null) {
            setActiveStall(null);
        }
        return;
    }

    if (user.role === 'admin') {
        setLoadingStalls(true);
        const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
        const unsubscribe = onSnapshot(stallsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
          const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
          setStallsForSelector(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));
          console.log("SiteStallSelector (useEffect stalls): Fetched stalls for admin for site", activeSiteId, ":", fetchedStalls.length);

          if (activeStallId && !fetchedStalls.find(s => s.id === activeStallId)) {
             console.log(`SiteStallSelector (useEffect stalls): Active stall ${activeStallId} not in new list for admin, clearing.`);
             setActiveStall(null);
          }
          setLoadingStalls(false);
        }, (error) => {
          console.error(`SiteStallSelector (useEffect stalls): Error fetching stalls for admin for site ${activeSiteId}:`, error);
          setLoadingStalls(false);
          setStallsForSelector([]);
        });
        return () => unsubscribe();
    }

    if (user.role === 'staff') {
        console.log("SiteStallSelector (useEffect stalls): User is staff, not fetching stalls for this selector.");
        setStallsForSelector([]);
        setLoadingStalls(false);
        return;
    }

  }, [user, activeSiteId, db, setActiveStall, activeStallId]); // Added activeStallId to dependency array

  const handleSiteChange = (newSiteId: string) => {
    console.log(`SiteStallSelector: handleSiteChange called with newSiteId: ${newSiteId}. Current activeSiteId: ${activeSiteId}`);
    if (newSiteId === activeSiteId) return;

    if (newSiteId === "all-sites" || newSiteId === "") {
        console.log("SiteStallSelector: handleSiteChange - setting active site to null.");
        setActiveSite(null);
    } else {
        console.log(`SiteStallSelector: handleSiteChange - setting active site to: ${newSiteId}.`);
        setActiveSite(newSiteId);
    }
  };

  const handleStallChange = (newStallId: string) => {
    console.log(`SiteStallSelector: handleStallChange called with newStallId: ${newStallId}. Current activeStallId: ${activeStallId}`);
    if (newStallId === activeStallId) return;

    if (newStallId === "all-stalls" || newStallId === "") {
        console.log("SiteStallSelector: handleStallChange - setting active stall to null.");
        setActiveStall(null);
    } else {
        console.log(`SiteStallSelector: handleStallChange - setting active stall to: ${newStallId}.`);
        setActiveStall(newStallId);
    }
  };

  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    console.log("SiteStallSelector: Not rendering, user role is not admin or manager. Role:", user?.role);
    return null;
  }

  if (user.role === 'manager' && (!user.managedSiteIds || user.managedSiteIds.length === 0)) {
      console.log("SiteStallSelector: Not rendering, manager has no assigned sites.");
      return <span className="text-xs text-muted-foreground" data-testid="manager-no-sites-message">Not assigned to any sites.</span>;
  }

  console.log("SiteStallSelector: Rendering selector. ActiveSiteId:", activeSiteId, "ActiveStallId:", activeStallId, "Sites for selector:", sitesForSelector.length);

  const getSitePlaceholder = () => {
    if (loadingSites) return "Loading sites...";
    if (sitesForSelector.length === 0) {
      if (user.role === 'manager') return "No sites managed";
      return "No sites available"; // Implicitly admin
    }
    return "Select Site";
  };

  return (
    <div className="flex items-center gap-2" data-testid="site-stall-selector-container">
      <Select
        value={activeSiteId || "all-sites"}
        onValueChange={handleSiteChange}
        disabled={loadingSites || (user.role !== 'admin' && sitesForSelector.length === 0)}
        data-testid="site-select"
      >
        <SelectTrigger className="w-[180px] h-9 text-xs bg-input" data-testid="site-select-trigger">
          <SelectValue placeholder={getSitePlaceholder()} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-sites">(All Sites / None)</SelectItem>
          {sitesForSelector.map(site => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {user.role === 'admin' && (
        <Select
            value={activeStallId || "all-stalls"}
            onValueChange={handleStallChange}
            disabled={!activeSiteId || loadingStalls || (stallsForSelector.length === 0 && !!activeSiteId)}
            data-testid="stall-select"
        >
            <SelectTrigger className="w-[180px] h-9 text-xs bg-input" data-testid="stall-select-trigger">
            <SelectValue placeholder={
                !activeSiteId ? "Select site first" :
                loadingStalls ? "Loading stalls..." :
                (stallsForSelector.length === 0 ? "No stalls in site" : "Select Stall")
            } />
            </SelectTrigger>
            <SelectContent>
            <SelectItem value="all-stalls">(All Stalls / None)</SelectItem>
            {stallsForSelector.map(stall => (
                <SelectItem key={stall.id} value={stall.id}>{stall.name} ({stall.stallType})</SelectItem>
            ))}
            </SelectContent>
        </Select>
      )}
       {user.role === 'manager' && activeSiteId && (
         <Badge variant="outline" className="h-9 px-3 text-xs" data-testid="manager-all-stalls-badge">All Stalls</Badge>
       )}
      {(loadingSites || (activeSiteId && loadingStalls && user.role === 'admin' )) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" data-testid="selector-loader"/>}
    </div>
  );
}


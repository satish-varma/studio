
"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getFirestore, collection, onSnapshot, query, where, DocumentData, QuerySnapshot, getDocs } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { getApps, initializeApp, getApp } from 'firebase/app';
import type { Site, Stall } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; // Ensure Badge is imported

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
    if (!db || !user) {
        setSitesForSelector([]);
        setLoadingSites(false);
        return;
    }

    setLoadingSites(true);
    let sitesQuery;

    if (user.role === 'admin') {
      sitesQuery = query(collection(db, "sites"));
    } else if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 0) {
      // Firestore 'in' query limit is 30. If more, fetch all and filter client-side, or paginate.
      // For simplicity, assuming less than 30 managed sites or fetching all if many.
      if (user.managedSiteIds.length <= 30) {
         sitesQuery = query(collection(db, "sites"), where("__name__", "in", user.managedSiteIds));
      } else {
        // Fallback: fetch all and filter client-side (less efficient for very many sites)
        // A better approach for >30 would be to restructure data or use more targeted queries.
        sitesQuery = query(collection(db, "sites")); 
        console.warn("Manager has >30 managed sites, fetching all sites for selector. Consider optimizing if this impacts performance.");
      }
    } else { // Staff or manager with no managed sites
      setSitesForSelector([]);
      setLoadingSites(false);
      if (activeSiteId) setActiveSite(null); // Clear if context was for a site they no longer access
      return;
    }

    const unsubscribe = onSnapshot(sitesQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      let fetchedSites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
      
      // If admin or manager with >30 sites (client-side filter needed)
      if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 30) {
          fetchedSites = fetchedSites.filter(site => user.managedSiteIds!.includes(site.id));
      }

      setSitesForSelector(fetchedSites.sort((a,b) => a.name.localeCompare(b.name)));

      if (activeSiteId && !fetchedSites.find(s => s.id === activeSiteId)) {
        setActiveSite(null); // Clear active site if it's no longer in the available list
      }
      setLoadingSites(false);
    }, (error) => {
      console.error("Error fetching sites for selector:", error);
      setLoadingSites(false);
      setSitesForSelector([]);
    });
    return () => unsubscribe();
  }, [user, activeSiteId, setActiveSite]);

  // Fetch stalls when activeSiteId changes (for any user who can select a site)
  useEffect(() => {
    if (!db || !user || !activeSiteId) {
      setStallsForSelector([]);
      setLoadingStalls(false);
      if (!activeSiteId && activeStallId) {
          setActiveStall(null);
      }
      return;
    }
    
    // Managers always see "All Stalls" conceptually, no need to fetch specific stalls for their stall selector
    if (user.role === 'manager') {
        setStallsForSelector([]); // Manager doesn't select specific stalls here
        setLoadingStalls(false);
        setActiveStall(null); // Ensure manager's active stall is null
        return;
    }

    setLoadingStalls(true);
    const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
    const unsubscribe = onSnapshot(stallsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
      setStallsForSelector(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));

      if (activeStallId && !fetchedStalls.find(s => s.id === activeStallId)) {
         setActiveStall(null);
      }
      setLoadingStalls(false);
    }, (error) => {
      console.error(`Error fetching stalls for site ${activeSiteId}:`, error);
      setLoadingStalls(false);
      setStallsForSelector([]);
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

  // Only render the selector for admin or manager roles.
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return null;
  }
  
  // If manager has no assigned sites, don't show selector
  if (user.role === 'manager' && (!user.managedSiteIds || user.managedSiteIds.length === 0)) {
      return <span className="text-xs text-muted-foreground">Not assigned to any sites.</span>;
  }


  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeSiteId || "all-sites"}
        onValueChange={handleSiteChange}
        disabled={loadingSites || sitesForSelector.length === 0}
      >
        <SelectTrigger className="w-[180px] h-9 text-xs bg-input">
          <SelectValue placeholder={loadingSites ? "Loading sites..." : (sitesForSelector.length === 0 ? "No sites available" : "Select Site")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-sites">(All Sites / None)</SelectItem>
          {sitesForSelector.map(site => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {user.role !== 'manager' && ( // Stall selector is not for managers with the new model
        <Select
            value={activeStallId || "all-stalls"}
            onValueChange={handleStallChange}
            disabled={!activeSiteId || loadingStalls || (stallsForSelector.length === 0 && !!activeSiteId)}
        >
            <SelectTrigger className="w-[180px] h-9 text-xs bg-input">
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
         <Badge variant="outline" className="h-9 px-3 text-xs">All Stalls</Badge>
       )}
      {(loadingSites || (activeSiteId && loadingStalls && user.role !== 'manager' )) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}


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
        if (activeSiteId !== null && !user) { // Only clear if no user AND it was previously set
            console.log("SiteStallSelector (useEffect sites): No user, clearing activeSiteId.");
            setActiveSite(null);
        }
        return;
    }

    // Staff users do not use this component to select their site; it's set by AuthContext.
    // So, if the user is staff, we don't need to fetch sites for *this selector*.
    if (user.role === 'staff') {
        console.log("SiteStallSelector (useEffect sites): User is staff, not fetching sites for this selector.");
        setSitesForSelector([]);
        setLoadingSites(false);
        // Crucially, DO NOT call setActiveSite(null) here for staff, as AuthContext manages their default.
        return;
    }

    setLoadingSites(true);
    let sitesQuery;

    if (user.role === 'admin') {
      sitesQuery = query(collection(db, "sites"));
      console.log("SiteStallSelector (useEffect sites): Admin role, preparing to fetch all sites.");
    } else if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 0) {
      if (user.managedSiteIds.length <= 30) {
         sitesQuery = query(collection(db, "sites"), where("__name__", "in", user.managedSiteIds));
         console.log("SiteStallSelector (useEffect sites): Manager role, fetching managed sites (<=30):", user.managedSiteIds);
      } else {
        sitesQuery = query(collection(db, "sites")); 
        console.warn("SiteStallSelector (useEffect sites): Manager has >30 managed sites, fetching all sites for selector. Client-side filter will apply.");
      }
    } else { // Manager with no managed sites, or unexpected role
      console.log(`SiteStallSelector (useEffect sites): User role ${user.role} has no applicable sites for selector. Clearing sitesForSelector.`);
      setSitesForSelector([]);
      setLoadingSites(false);
      // If an admin/manager had a site selected but now has no sites (e.g., manager unassigned from all)
      if (activeSiteId !== null && (user.role === 'admin' || user.role === 'manager')) {
            console.log(`SiteStallSelector (useEffect sites): No sites for ${user.role}, clearing activeSiteId.`);
            setActiveSite(null);
      }
      return;
    }

    const unsubscribe = onSnapshot(sitesQuery, (snapshot: QuerySnapshot<DocumentData>) => {
      let fetchedSites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Site));
      console.log("SiteStallSelector (useEffect sites): Raw fetched sites count:", fetchedSites.length);
      
      if (user.role === 'manager' && user.managedSiteIds && user.managedSiteIds.length > 30) {
          fetchedSites = fetchedSites.filter(site => user.managedSiteIds!.includes(site.id));
          console.log("SiteStallSelector (useEffect sites): Manager client-side filtered sites count:", fetchedSites.length);
      }
      setSitesForSelector(fetchedSites.sort((a,b) => a.name.localeCompare(b.name)));

      // For Admin/Manager: If their currently active site is no longer in the list they are allowed to see, then clear it.
      // This should NOT affect staff users whose activeSiteId is their default.
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
  }, [user, db, setActiveSite]); // activeSiteId was removed from here as per previous reasoning.

  // Fetch stalls when activeSiteId changes (for any user who can select a site: admin or manager)
  useEffect(() => {
    console.log("SiteStallSelector: Stalls useEffect triggered. User role:", user?.role, "ActiveSiteId:", activeSiteId, "Current activeStallId:", activeStallId);
    if (!db || !user || !activeSiteId) {
      setStallsForSelector([]);
      setLoadingStalls(false);
      if (!activeSiteId && activeStallId !== null) { // If site becomes null, stall must also become null
          console.log("SiteStallSelector (useEffect stalls): No activeSiteId, clearing activeStallId.");
          setActiveStall(null);
      }
      return;
    }
    
    // Manager always sees "All Stalls" for their selected site context, does not pick a specific stall here.
    if (user.role === 'manager') {
        console.log("SiteStallSelector (useEffect stalls): User is manager, setting stallsForSelector to empty and activeStall to null.");
        setStallsForSelector([]); 
        setLoadingStalls(false);
        if (activeStallId !== null) {
            setActiveStall(null); // Ensure manager's active stall is always null
        }
        return;
    }

    // Admin can select specific stalls
    if (user.role === 'admin') {
        setLoadingStalls(true);
        const stallsQuery = query(collection(db, "stalls"), where("siteId", "==", activeSiteId));
        const unsubscribe = onSnapshot(stallsQuery, (snapshot: QuerySnapshot<DocumentData>) => {
          const fetchedStalls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Stall));
          setStallsForSelector(fetchedStalls.sort((a,b) => a.name.localeCompare(b.name)));
          console.log("SiteStallSelector (useEffect stalls): Fetched stalls for admin for site", activeSiteId, ":", fetchedStalls.length);

          // If admin had a stall selected that's not in the new site's stall list, clear it.
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

    // Staff's activeStallId is managed by AuthContext based on their default.
    // This component shouldn't try to fetch or clear it for staff.
    if (user.role === 'staff') {
        console.log("SiteStallSelector (useEffect stalls): User is staff, not fetching stalls for this selector.");
        setStallsForSelector([]); // Staff don't use this to pick stalls
        setLoadingStalls(false);
        return;
    }
    
  }, [user, activeSiteId, db, setActiveStall]); // activeStallId removed from deps

  const handleSiteChange = (newSiteId: string) => {
    console.log(`SiteStallSelector: handleSiteChange called with newSiteId: ${newSiteId}. Current activeSiteId: ${activeSiteId}`);
    if (newSiteId === activeSiteId) return; // No change

    if (newSiteId === "all-sites" || newSiteId === "") {
        console.log("SiteStallSelector: handleSiteChange - setting active site to null.");
        setActiveSite(null); // This will also clear activeStall via AuthContext logic if not manager
    } else {
        console.log(`SiteStallSelector: handleSiteChange - setting active site to: ${newSiteId}.`);
        setActiveSite(newSiteId);
    }
  };

  const handleStallChange = (newStallId: string) => {
    console.log(`SiteStallSelector: handleStallChange called with newStallId: ${newStallId}. Current activeStallId: ${activeStallId}`);
    if (newStallId === activeStallId) return; // No change

    if (newStallId === "all-stalls" || newStallId === "") {
        console.log("SiteStallSelector: handleStallChange - setting active stall to null.");
        setActiveStall(null);
    } else {
        console.log(`SiteStallSelector: handleStallChange - setting active stall to: ${newStallId}.`);
        setActiveStall(newStallId);
    }
  };

  // Only render the selector for admin or manager roles.
  // Staff users have their context set by AuthContext based on their defaults.
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    console.log("SiteStallSelector: Not rendering, user role is not admin or manager. Role:", user?.role);
    return null;
  }
  
  if (user.role === 'manager' && (!user.managedSiteIds || user.managedSiteIds.length === 0)) {
      console.log("SiteStallSelector: Not rendering, manager has no assigned sites.");
      return <span className="text-xs text-muted-foreground">Not assigned to any sites.</span>;
  }

  console.log("SiteStallSelector: Rendering selector. ActiveSiteId:", activeSiteId, "ActiveStallId:", activeStallId, "Sites for selector:", sitesForSelector.length);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={activeSiteId || "all-sites"} // Ensure value is never null for Select if "all-sites" represents null
        onValueChange={handleSiteChange}
        disabled={loadingSites || (user.role !== 'admin' && sitesForSelector.length === 0)}
      >
        <SelectTrigger className="w-[180px] h-9 text-xs bg-input">
          <SelectValue placeholder={loadingSites ? "Loading sites..." : (sitesForSelector.length === 0 && user.role !== 'staff' ? "No sites " + (user.role === 'manager' ? 'managed' : 'available') : "Select Site")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all-sites">(All Sites / None)</SelectItem>
          {sitesForSelector.map(site => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Stall selector is primarily for Admins. Managers have "All Stalls" context. Staff use their default. */}
      {user.role === 'admin' && (
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
      {(loadingSites || (activeSiteId && loadingStalls && user.role === 'admin' )) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}



"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AppUser, UserRole } from '@/types/user';
import { initializeApp, getApps, type FirebaseApp, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User as FirebaseUser
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, type Firestore, Timestamp } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LOG_PREFIX_CONTEXT = "[AuthContext]";

let _app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (!getApps().length) {
  try {
    console.log(`${LOG_PREFIX_CONTEXT} Attempting Firebase app initialization...`);
    _app = initializeApp(firebaseConfig);
    console.log(`${LOG_PREFIX_CONTEXT} Firebase app initialized. Project ID from config:`, firebaseConfig.projectId);
  } catch (error: any) {
    console.error(`${LOG_PREFIX_CONTEXT} Firebase app initialization error:`, error.message, error.stack);
  }
} else {
  _app = getApp();
  console.log(`${LOG_PREFIX_CONTEXT} Firebase app already initialized. Project ID from app options:`, _app?.options?.projectId);
}

if (_app) {
  try {
    auth = getAuth(_app);
    db = getFirestore(_app);
    console.log(`${LOG_PREFIX_CONTEXT} Firebase Auth and Firestore services obtained.`);
  } catch (error: any) {
    console.warn(`${LOG_PREFIX_CONTEXT} Error obtaining Auth/Firestore services: ${error.message}. This might happen if Firebase app object (_app) is undefined due to an earlier initialization failure.`);
  }
} else {
  console.warn(`${LOG_PREFIX_CONTEXT} Firebase App object (_app) is undefined after initialization attempt. This indicates a problem with firebaseConfig or initializeApp itself. Firebase features will not work.`);
}


interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  initializationError: string | null;
  signIn: (email: string, pass: string) => Promise<AppUser | null>;
  signUp: (email: string, pass: string, displayName: string) => Promise<AppUser | null>;
  signOutUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  activeSiteId: string | null;
  activeSite: Site | null;
  activeStallId: string | null;
  activeStall: Stall | null;
  setActiveSite: (siteId: string | null) => void;
  setActiveStall: (stallId: string | null) => void;
}

interface Site { id: string; name: string; location?: string; }
interface Stall { id: string; name: string; siteId: string; stallType: string; }

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const [activeSiteId, setActiveSiteState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('activeSiteId');
    return null;
  });
  const [activeStallId, setActiveStallState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('activeStallId');
    return null;
  });
  const [activeSite, setActiveSiteObject] = useState<Site | null>(null);
  const [activeStall, setActiveStallObject] = useState<Stall | null>(null);

  const setUser: React.Dispatch<React.SetStateAction<AppUser | null>> = (newUser) => {
    console.log(`${LOG_PREFIX_CONTEXT} setUser manually called. New user UID:`, newUser?.uid);
    setUserState(newUser);
  };

  const setActiveSite = useCallback((siteId: string | null) => {
    console.log(`${LOG_PREFIX_CONTEXT} setActiveSite called. New siteId: ${siteId}, User role: ${user?.role}`);
    setActiveSiteState(siteId);
    if (user?.role !== 'manager') { // Managers handle their stall view ("All Stalls") differently
      console.log(`${LOG_PREFIX_CONTEXT} Site changed for non-manager or site cleared, clearing activeStallId.`);
      setActiveStallState(null);
    }
    if (typeof window !== 'undefined') {
      if (siteId) {
        localStorage.setItem('activeSiteId', siteId);
      } else {
        localStorage.removeItem('activeSiteId');
      }
       if (!siteId || user?.role !== 'manager') {
        localStorage.removeItem('activeStallId');
      }
    }
  }, [user?.role]);

  const setActiveStall = useCallback((stallId: string | null) => {
    console.log(`${LOG_PREFIX_CONTEXT} setActiveStall called. New stallId: ${stallId}, User role: ${user?.role}`);
    if (user?.role === 'manager') {
      console.log(`${LOG_PREFIX_CONTEXT} Manager role detected. Forcing activeStallId to null (All Stalls). Original request was for: ${stallId}`);
      setActiveStallState(null);
      if (typeof window !== 'undefined') localStorage.removeItem('activeStallId');
    } else {
      setActiveStallState(stallId);
      if (typeof window !== 'undefined') {
        if (stallId) {
          localStorage.setItem('activeStallId', stallId);
        } else {
          localStorage.removeItem('activeStallId');
        }
      }
    }
  }, [user?.role]);

  useEffect(() => {
    console.log(`${LOG_PREFIX_CONTEXT} useEffect: Initializing auth state listener.`);
    if (!firebaseConfig || firebaseConfig.projectId === "YOUR_PROJECT_ID" || !firebaseConfig.projectId ||
        firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey || firebaseConfig.apiKey === "") {
      const configErrorMsg = `${LOG_PREFIX_CONTEXT} CRITICAL CONFIG FAILURE: Firebase 'projectId' or 'apiKey' is a placeholder or missing in firebaseConfig. Please review your '.env.local' file and ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_API_KEY are correctly set. Then, restart your development server. This is likely due to an incomplete Firebase project setup or missing environment variables.`;
      console.error(configErrorMsg, { configUsed: firebaseConfig });
      setInitializationError(configErrorMsg);
      setLoading(false);
      return;
    }

    if (!auth || !db) {
      const serviceErrorMsg = `${LOG_PREFIX_CONTEXT} CRITICAL SERVICE FAILURE: Firebase Auth or Firestore service not initialized. This usually means the Firebase app object (_app) failed to initialize, possibly due to incorrect 'firebaseConfig' values or network issues preventing SDK load. Check previous logs for 'Firebase app initialization error'.`;
      console.error(serviceErrorMsg);
      setInitializationError(serviceErrorMsg);
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log(`${LOG_PREFIX_CONTEXT} useEffect: Subscribing to onAuthStateChanged.`);
    let userDocUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      console.log(`${LOG_PREFIX_CONTEXT} onAuthStateChanged triggered. FirebaseUser UID:`, firebaseUser?.uid);
      if (userDocUnsubscribe) {
        console.log(`${LOG_PREFIX_CONTEXT} Unsubscribing from previous user document listener.`);
        userDocUnsubscribe();
      }
      userDocUnsubscribe = null;

      if (firebaseUser) {
        console.log(`${LOG_PREFIX_CONTEXT} User authenticated: ${firebaseUser.uid}. Fetching user document...`);
        const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
        userDocUnsubscribe = onSnapshot(userDocRef, (userDocSnap) => {
          let appUserToSet: AppUser;
          if (userDocSnap.exists()) {
            console.log(`${LOG_PREFIX_CONTEXT} User document found for UID: ${firebaseUser.uid}.`);
            appUserToSet = mapFirestoreDataToAppUser(firebaseUser, userDocSnap.data());
          } else {
            console.warn(`${LOG_PREFIX_CONTEXT} User document NOT FOUND for UID: ${firebaseUser.uid}. Creating default user document.`);
            const defaultUserData: AppUser = {
              uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff',
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
              createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: [],
              defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
              defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
              defaultSalesStaffFilter: null,
            };
            setDoc(userDocRef, defaultUserData)
              .then(() => console.log(`${LOG_PREFIX_CONTEXT} Default user document created for UID: ${firebaseUser.uid}`))
              .catch(error => console.error(`${LOG_PREFIX_CONTEXT} Error creating default user document for UID: ${firebaseUser.uid}:`, error));
            appUserToSet = defaultUserData;
          }
          setUserState(appUserToSet);
          console.log(`${LOG_PREFIX_CONTEXT} AppUser state set for ${appUserToSet.uid}. Role: ${appUserToSet.role}`);
          
          let initialSiteId: string | null = null;
          let initialStallId: string | null = null;
          const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
          const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;
          console.log(`${LOG_PREFIX_CONTEXT} Initializing context. FirestoreUser: defaultSite='${appUserToSet.defaultSiteId}', defaultStall='${appUserToSet.defaultStallId}'. LocalStorage: site='${storedSiteId}', stall='${storedStallId}'. Role: '${appUserToSet.role}'.`);

          if (appUserToSet.role === 'admin') {
              initialSiteId = appUserToSet.defaultSiteId || storedSiteId || null;
              // For admin, stall follows site preference. If site is user's default, use user's default stall. If site is from localStorage, use localStorage stall (if it belongs to that site).
              initialStallId = initialSiteId === appUserToSet.defaultSiteId 
                                ? (appUserToSet.defaultStallId || (initialSiteId ? storedStallId : null)) 
                                : (initialSiteId ? storedStallId : null);
              console.log(`${LOG_PREFIX_CONTEXT} Admin context determined. Site: ${initialSiteId}, Stall: ${initialStallId}.`);
          } else if (appUserToSet.role === 'manager') {
              if (appUserToSet.managedSiteIds && appUserToSet.managedSiteIds.length > 0) {
                  const preferredSite = (appUserToSet.defaultSiteId && appUserToSet.managedSiteIds.includes(appUserToSet.defaultSiteId))
                                      ? appUserToSet.defaultSiteId
                                      : (storedSiteId && appUserToSet.managedSiteIds.includes(storedSiteId) ? storedSiteId : appUserToSet.managedSiteIds[0]);
                  initialSiteId = preferredSite;
                  console.log(`${LOG_PREFIX_CONTEXT} Manager context determined. Site chosen: ${initialSiteId} (from defaults/stored/first managed).`);
              } else {
                  initialSiteId = null; 
                  console.log(`${LOG_PREFIX_CONTEXT} Manager has no managed sites. Site set to null.`);
              }
              initialStallId = null; // Managers always see "All Stalls"
              console.log(`${LOG_PREFIX_CONTEXT} Manager stall context set to null (All Stalls).`);
          } else { // staff
              initialSiteId = appUserToSet.defaultSiteId;
              initialStallId = appUserToSet.defaultSiteId ? appUserToSet.defaultStallId : null;
              console.log(`${LOG_PREFIX_CONTEXT} Staff context determined from user document. Site: ${initialSiteId}, Stall: ${initialStallId}.`);
          }
          
          setActiveSiteState(initialSiteId);
          if (typeof window !== 'undefined') {
            if (initialSiteId) localStorage.setItem('activeSiteId', initialSiteId);
            else localStorage.removeItem('activeSiteId');
          }

          setActiveStallState(initialStallId);
          if (typeof window !== 'undefined') {
            if (initialStallId) localStorage.setItem('activeStallId', initialStallId);
            else localStorage.removeItem('activeStallId');
          }

          setLoading(false);
        }, (error) => {
          console.error(`${LOG_PREFIX_CONTEXT} Error in user document onSnapshot listener for UID ${firebaseUser.uid}:`, error);
          setUserState(mapFirestoreDataToAppUser(firebaseUser)); 
          setLoading(false);
        });
      } else {
        console.log(`${LOG_PREFIX_CONTEXT} No Firebase user authenticated. Clearing AppUser state and active context.`);
        setUserState(null);
        setActiveSiteState(null);
        setActiveStallState(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('activeSiteId');
            localStorage.removeItem('activeStallId');
        }
        setLoading(false);
      }
    });

    return () => {
      console.log(`${LOG_PREFIX_CONTEXT} useEffect cleanup: Unsubscribing from onAuthStateChanged.`);
      authUnsubscribe();
      if (userDocUnsubscribe) {
        console.log(`${LOG_PREFIX_CONTEXT} useEffect cleanup: Unsubscribing from user document listener.`);
        userDocUnsubscribe();
      }
    };
  }, []); 

  useEffect(() => {
    if (!db) return;
    if (activeSiteId) {
      console.log(`${LOG_PREFIX_CONTEXT} Active site ID changed to: ${activeSiteId}. Fetching site object...`);
      const siteDocRef = doc(db as Firestore, "sites", activeSiteId);
      const unsubSite = onSnapshot(siteDocRef, (docSnap) => {
        if (docSnap.exists()) {
          console.log(`${LOG_PREFIX_CONTEXT} Active site object updated for ID: ${activeSiteId}`);
          setActiveSiteObject({ id: docSnap.id, ...docSnap.data() } as Site);
        } else {
          console.warn(`${LOG_PREFIX_CONTEXT} Active site object NOT FOUND for ID: ${activeSiteId}. Setting to null. This might happen if the site was deleted.`);
          setActiveSiteObject(null);
          if (activeSiteId) { 
             setActiveSiteState(null);
             if (typeof window !== 'undefined') localStorage.removeItem('activeSiteId');
          }
        }
      }, (error) => {
        console.error(`${LOG_PREFIX_CONTEXT} Error fetching active site object for ID ${activeSiteId}:`, error);
        setActiveSiteObject(null);
      });
      return () => unsubSite();
    } else {
      console.log(`${LOG_PREFIX_CONTEXT} Active site ID is null. Clearing active site object.`);
      setActiveSiteObject(null);
    }
  }, [activeSiteId]);

  useEffect(() => {
    if (!db) return;
    if (activeStallId && activeSiteId) {
      console.log(`${LOG_PREFIX_CONTEXT} Active stall ID changed to: ${activeStallId} (Site: ${activeSiteId}). Fetching stall object...`);
      const stallDocRef = doc(db as Firestore, "stalls", activeStallId);
      const unsubStall = onSnapshot(stallDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const stallData = docSnap.data();
          if (stallData.siteId === activeSiteId) {
            console.log(`${LOG_PREFIX_CONTEXT} Active stall object updated for ID: ${activeStallId}`);
            setActiveStallObject({ id: docSnap.id, ...stallData } as Stall);
          } else {
            console.warn(`${LOG_PREFIX_CONTEXT} Active stall ${activeStallId} does not belong to active site ${activeSiteId}. Clearing active stall.`);
            setActiveStallObject(null);
            setActiveStallState(null);
            if (typeof window !== 'undefined') localStorage.removeItem('activeStallId');
          }
        } else {
          console.warn(`${LOG_PREFIX_CONTEXT} Active stall object NOT FOUND for ID: ${activeStallId}. Setting to null.`);
          setActiveStallObject(null);
          if (activeStallId) { 
             setActiveStallState(null);
             if (typeof window !== 'undefined') localStorage.removeItem('activeStallId');
          }
        }
      }, (error) => {
        console.error(`${LOG_PREFIX_CONTEXT} Error fetching active stall object for ID ${activeStallId}:`, error);
        setActiveStallObject(null);
      });
      return () => unsubStall();
    } else {
      console.log(`${LOG_PREFIX_CONTEXT} Active stall ID or site ID is null. Clearing active stall object.`);
      setActiveStallObject(null);
    }
  }, [activeStallId, activeSiteId]);

  const mapFirestoreDataToAppUser = (firebaseUser: FirebaseUser, userDataFromFirestore: any = {}): AppUser => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: userDataFromFirestore.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
      photoURL: firebaseUser.photoURL,
      role: userDataFromFirestore.role || 'staff',
      createdAt: userDataFromFirestore.createdAt || new Date().toISOString(),
      defaultSiteId: userDataFromFirestore.defaultSiteId ?? null,
      defaultStallId: userDataFromFirestore.defaultStallId ?? null,
      managedSiteIds: Array.isArray(userDataFromFirestore.managedSiteIds) ? userDataFromFirestore.managedSiteIds : [],
      defaultItemSearchTerm: userDataFromFirestore.defaultItemSearchTerm ?? null,
      defaultItemCategoryFilter: userDataFromFirestore.defaultItemCategoryFilter ?? null,
      defaultItemStockStatusFilter: userDataFromFirestore.defaultItemStockStatusFilter ?? null,
      defaultItemStallFilterOption: userDataFromFirestore.defaultItemStallFilterOption ?? null,
      defaultSalesDateRangeFrom: userDataFromFirestore.defaultSalesDateRangeFrom ?? null,
      defaultSalesDateRangeTo: userDataFromFirestore.defaultSalesDateRangeTo ?? null,
      defaultSalesStaffFilter: userDataFromFirestore.defaultSalesStaffFilter ?? null,
    };
  };

  const signIn = useCallback(async (email: string, pass: string): Promise<AppUser | null> => {
    if (!auth || !db) {
      console.error(`${LOG_PREFIX_CONTEXT}:signIn: Firebase Auth or DB not initialized.`);
      throw new Error("Authentication service not available. Please try again later.");
    }
    console.log(`${LOG_PREFIX_CONTEXT}:signIn: Attempting sign-in for email: ${email}`);
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      console.log(`${LOG_PREFIX_CONTEXT}:signIn: Firebase Auth successful for UID: ${firebaseUser.uid}. Fetching user document...`);
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      let appUserToReturn: AppUser;

      if (userDocSnap.exists()) {
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, userDocSnap.data());
        console.log(`${LOG_PREFIX_CONTEXT}:signIn: User document found for ${firebaseUser.uid}.`);
      } else {
        console.warn(`${LOG_PREFIX_CONTEXT}:signIn: User document NOT FOUND for UID: ${firebaseUser.uid}. Creating default staff user.`);
        const defaultUserData: AppUser = {
            uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: [],
            defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
            defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
            defaultSalesStaffFilter: null,
        };
        await setDoc(userDocRef, defaultUserData);
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, defaultUserData);
      }
      return appUserToReturn;
    } catch (error: any) {
      console.error(`${LOG_PREFIX_CONTEXT}:signIn: Sign-in error for ${email}:`, error.code, error.message);
      setLoading(false);
      throw error;
    }
  }, []);

  const signUp = useCallback(async (email: string, pass: string, displayName: string): Promise<AppUser | null> => {
    if (!auth || !db) {
      console.error(`${LOG_PREFIX_CONTEXT}:signUp: Firebase Auth or DB not initialized.`);
      throw new Error("Sign-up service not available. Please try again later.");
    }
    console.log(`${LOG_PREFIX_CONTEXT}:signUp: Attempting sign-up for email: ${email}, displayName: ${displayName}`);
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      console.log(`${LOG_PREFIX_CONTEXT}:signUp: Firebase Auth user created: ${firebaseUser.uid}. Creating Firestore document...`);

      const newUserDocData: AppUser = {
        uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff' as UserRole,
        displayName: displayName, createdAt: new Date().toISOString(), defaultSiteId: null,
        defaultStallId: null, managedSiteIds: [], defaultItemSearchTerm: null,
        defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
        defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null,
        defaultSalesDateRangeTo: null, defaultSalesStaffFilter: null,
      };
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      await setDoc(userDocRef, newUserDocData);
      console.log(`${LOG_PREFIX_CONTEXT}:signUp: Firestore document created for ${firebaseUser.uid}.`);
      return mapFirestoreDataToAppUser(firebaseUser, newUserDocData);
    } catch (error: any) {
      console.error(`${LOG_PREFIX_CONTEXT}:signUp: Sign-up error for ${email}:`, error.code, error.message);
      setLoading(false);
      throw error;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) {
      console.error(`${LOG_PREFIX_CONTEXT}:signOutUser: Firebase Auth not initialized.`);
      return;
    }
    console.log(`${LOG_PREFIX_CONTEXT}:signOutUser: Attempting sign-out.`);
    try {
      await firebaseSignOut(auth);
      console.log(`${LOG_PREFIX_CONTEXT}:signOutUser: Firebase sign-out successful. State updates handled by onAuthStateChanged.`);
    } catch (error: any) {
      console.error(`${LOG_PREFIX_CONTEXT}:signOutUser: Sign-out error:`, error.code, error.message);
    }
  }, []);

  if (initializationError) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-destructive/90 text-destructive-foreground p-4 backdrop-blur-sm">
        <div className="text-center max-w-2xl p-8 border-2 border-destructive-foreground/50 rounded-lg shadow-2xl bg-destructive">
          <Loader2 className="h-16 w-16 text-destructive-foreground mx-auto mb-6 animate-spin" />
          <h1 className="text-4xl font-extrabold text-destructive-foreground mb-4">Critical Firebase Error</h1>
          <p className="text-lg mb-2 text-destructive-foreground/90 font-semibold">The application cannot start due to a Firebase configuration or initialization issue.</p>
          <pre className="text-xs text-left whitespace-pre-wrap p-4 bg-destructive-foreground/10 border border-destructive-foreground/30 rounded-md my-4 overflow-x-auto text-destructive-foreground">
            {initializationError}
          </pre>
          <div className="text-left text-sm text-destructive-foreground/90 space-y-2 mb-6 p-4 bg-destructive-foreground/10 border border-destructive-foreground/30 rounded-md">
            <p><strong>Troubleshooting Steps:</strong></p>
            <ol className="list-decimal list-inside space-y-1 pl-4">
              <li><strong>Verify <code>.env.local</code>:</strong> Ensure this file exists at your project root.</li>
              <li><strong>Check Environment Variables:</strong> Confirm all <code>NEXT_PUBLIC_FIREBASE_...</code> variables (e.g., <code>API_KEY</code>, <code>PROJECT_ID</code>) are present and correct. They must come from your Firebase project's web app settings.</li>
              <li><strong>No Quotes in <code>.env.local</code>:</strong> Values should be like <code>NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...</code> (without surrounding quotes).</li>
              <li><strong>Restart Server:</strong> After any changes to <code>.env.local</code>, you MUST stop and restart your Next.js development server (<code>npm run dev</code>).</li>
              <li><strong>Network Connectivity:</strong> Ensure your machine can reach Firebase services.</li>
              <li><strong>Firebase Console:</strong> Double-check that the web app is correctly registered in your Firebase project console and the config values match precisely.</li>
            </ol>
          </div>
          <details className="mb-6 text-left text-xs text-destructive-foreground/80">
            <summary className="cursor-pointer font-medium text-destructive-foreground hover:underline">Click to see current Firebase config (as loaded by app)</summary>
            <pre className="mt-2 p-3 bg-destructive-foreground/10 border border-destructive-foreground/30 rounded-md overflow-x-auto text-destructive-foreground">
              {JSON.stringify(firebaseConfig, null, 2)}
            </pre>
          </details>
           <Button onClick={() => window.location.reload()} variant="outline" size="lg" className="border-destructive-foreground text-destructive-foreground hover:bg-destructive-foreground/10">
            Attempt to Reload Application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      initializationError,
      signIn,
      signUp,
      signOutUser,
      setUser,
      activeSiteId,
      activeSite,
      activeStallId,
      activeStall,
      setActiveSite,
      setActiveStall
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


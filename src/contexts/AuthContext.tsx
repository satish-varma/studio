
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
  } catch (error: any) { // Added curly braces for the catch block here
    console.warn(`${LOG_PREFIX_CONTEXT} Error obtaining Auth/Firestore services: ${error.message}. Firebase App object (_app) might be undefined if initialization failed.`);
  }
} else {
  console.warn(`${LOG_PREFIX_CONTEXT} Firebase App object (_app) is undefined after initialization attempt. This indicates a problem with firebaseConfig or initializeApp itself.`);
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
    setUserState(newUser);
  };

  const setActiveSite = useCallback((siteId: string | null) => {
    console.log(`${LOG_PREFIX_CONTEXT} setActiveSite called. New siteId: ${siteId}, User role: ${user?.role}`);
    setActiveSiteState(siteId);
    if (user?.role !== 'manager') {
      console.log(`${LOG_PREFIX_CONTEXT} User is not manager, clearing activeStallId.`);
      setActiveStallState(null);
    }
    if (typeof window !== 'undefined') {
      if (siteId) {
        localStorage.setItem('activeSiteId', siteId);
      } else {
        localStorage.removeItem('activeSiteId');
      }
      if (user?.role !== 'manager') {
        localStorage.removeItem('activeStallId');
      }
    }
  }, [user?.role]);

  const setActiveStall = useCallback((stallId: string | null) => {
    console.log(`${LOG_PREFIX_CONTEXT} setActiveStall called. New stallId: ${stallId}`);
    setActiveStallState(stallId);
    if (typeof window !== 'undefined') {
      if (stallId) {
        localStorage.setItem('activeStallId', stallId);
      } else {
        localStorage.removeItem('activeStallId');
      }
    }
  }, []);

  useEffect(() => {
    console.log(`${LOG_PREFIX_CONTEXT} useEffect: Initializing auth state listener.`);
    if (!firebaseConfig || firebaseConfig.projectId === "YOUR_PROJECT_ID" || !firebaseConfig.projectId ||
        firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
      const configErrorMsg = `${LOG_PREFIX_CONTEXT} CRITICAL CONFIG FAILURE: Firebase projectId or apiKey is a placeholder or missing. Review '.env.local' and restart the server.`;
      console.error(configErrorMsg, { configUsed: firebaseConfig });
      setInitializationError(configErrorMsg);
      setLoading(false);
      return;
    }

    if (!auth || !db) {
      const serviceErrorMsg = `${LOG_PREFIX_CONTEXT} CRITICAL SERVICE FAILURE: Firebase Auth or Firestore service not initialized. Check Firebase config and app initialization.`;
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
              createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: null,
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

          const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
          const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;
          console.log(`${LOG_PREFIX_CONTEXT} Stored context - SiteId: ${storedSiteId}, StallId: ${storedStallId}`);

          if (appUserToSet.role === 'admin') {
              setActiveSiteState(storedSiteId);
              setActiveStallState(storedSiteId ? storedStallId : null);
              console.log(`${LOG_PREFIX_CONTEXT} Admin user. Active context set to Site: ${storedSiteId}, Stall: ${storedSiteId ? storedStallId : null}`);
          } else if (appUserToSet.role === 'manager') {
              if (appUserToSet.managedSiteIds && appUserToSet.managedSiteIds.length > 0) {
                  if (storedSiteId && appUserToSet.managedSiteIds.includes(storedSiteId)) {
                      setActiveSiteState(storedSiteId);
                      console.log(`${LOG_PREFIX_CONTEXT} Manager user. Active site set to stored: ${storedSiteId}`);
                  } else {
                      setActiveSiteState(appUserToSet.managedSiteIds[0]);
                      console.log(`${LOG_PREFIX_CONTEXT} Manager user. Active site set to first managed: ${appUserToSet.managedSiteIds[0]}`);
                  }
              } else {
                  setActiveSiteState(null);
                  console.log(`${LOG_PREFIX_CONTEXT} Manager user has no managed sites. Active site set to null.`);
              }
              setActiveStallState(null); // Managers always have stall set to null (all stalls for site)
          } else { // Staff
              setActiveSiteState(appUserToSet.defaultSiteId);
              setActiveStallState(appUserToSet.defaultSiteId ? appUserToSet.defaultStallId : null);
              console.log(`${LOG_PREFIX_CONTEXT} Staff user. Active context set from defaults. Site: ${appUserToSet.defaultSiteId}, Stall: ${appUserToSet.defaultSiteId ? appUserToSet.defaultStallId : null}`);
          }
          setLoading(false);
        }, (error) => {
          console.error(`${LOG_PREFIX_CONTEXT} Error in user document onSnapshot listener for UID ${firebaseUser.uid}:`, error);
          setUserState(mapFirestoreDataToAppUser(firebaseUser)); // Fallback to basic AppUser
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
  }, []); // Empty dependency array ensures this runs only once on mount

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
          console.warn(`${LOG_PREFIX_CONTEXT} Active site object NOT FOUND for ID: ${activeSiteId}. Setting to null.`);
          setActiveSiteObject(null);
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
          console.log(`${LOG_PREFIX_CONTEXT} Active stall object updated for ID: ${activeStallId}`);
          setActiveStallObject({ id: docSnap.id, ...docSnap.data() } as Stall);
        } else {
          console.warn(`${LOG_PREFIX_CONTEXT} Active stall object NOT FOUND for ID: ${activeStallId}. Setting to null.`);
          setActiveStallObject(null);
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
      managedSiteIds: userDataFromFirestore.managedSiteIds ?? null,
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
            createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: null,
            defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
            defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
            defaultSalesStaffFilter: null,
        };
        await setDoc(userDocRef, defaultUserData);
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, defaultUserData);
      }
      // setLoading(false) and setUserState will be handled by onAuthStateChanged
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
        defaultStallId: null, managedSiteIds: null, defaultItemSearchTerm: null,
        defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
        defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null,
        defaultSalesDateRangeTo: null, defaultSalesStaffFilter: null,
      };
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      await setDoc(userDocRef, newUserDocData);
      console.log(`${LOG_PREFIX_CONTEXT}:signUp: Firestore document created for ${firebaseUser.uid}.`);
      // setLoading(false) and setUserState will be handled by onAuthStateChanged
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
      // No need to manually clear user state here; onAuthStateChanged will do it.
    } catch (error: any) {
      console.error(`${LOG_PREFIX_CONTEXT}:signOutUser: Sign-out error:`, error.code, error.message);
    }
  }, []);

  if (initializationError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-700 p-4">
        <div className="text-center max-w-2xl p-8 border-2 border-red-300 rounded-lg shadow-lg bg-white">
          <h1 className="text-3xl font-bold text-red-600 mb-4">Critical Configuration Error</h1>
          <p className="text-md mb-6 text-left whitespace-pre-wrap">{initializationError}</p>
          <div className="text-left text-sm text-red-600 space-y-2 mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p><strong>Please check the following:</strong></p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Ensure a <code>.env.local</code> file exists in the root of your project.</li>
              <li>Verify all <code>NEXT_PUBLIC_FIREBASE_API_KEY</code>, <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code>, etc., are correctly set with your Firebase project's web app credentials.</li>
              <li>There should be <strong>NO</strong> quotes around the values in <code>.env.local</code>. E.g., <code>NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...</code> NOT <code>NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."</code>.</li>
              <li>You <strong>MUST</strong> restart your Next.js development server after any changes to <code>.env.local</code> (e.g., by stopping <code>npm run dev</code> and running it again).</li>
            </ol>
          </div>
          <details className="mb-6 text-left text-xs">
            <summary className="cursor-pointer font-medium">Current Firebase Config (as seen by app)</summary>
            <pre className="mt-2 p-2 bg-gray-100 text-gray-700 rounded overflow-x-auto">
              {JSON.stringify(firebaseConfig, null, 2)}
            </pre>
          </details>
           <Button onClick={() => window.location.reload()} variant="destructive">
            Reload Application
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

    

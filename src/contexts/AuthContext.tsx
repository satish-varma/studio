
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
import { Button } from '@/components/ui/button'; // For potential use in error display

// console.log("AuthContext: Initializing with Firebase Config:", firebaseConfig);
// REMOVED top-level console.error checks for projectId and apiKey
// These checks are now handled inside the AuthProvider's useEffect

let _app: FirebaseApp | undefined; 
let auth: Auth | undefined;
let db: Firestore | undefined;

// Attempt to initialize Firebase app, auth, and db
// This section runs when the module is first loaded.
if (!getApps().length) {
  try {
    console.log("AuthContext: Attempting Firebase app initialization...");
    _app = initializeApp(firebaseConfig);
    console.log("AuthContext: Firebase app initialized successfully. Project ID from config:", firebaseConfig.projectId);
  } catch (error: any) {
    console.error("AuthContext: Firebase app initialization error during initial app load:", error.message, error.stack);
    // _app will remain undefined, caught by checks in AuthProvider
  }
} else {
  _app = getApp(); 
  console.log("AuthContext: Firebase app already initialized, got existing instance. Project ID from app options:", _app.options.projectId);
}

if (_app) { 
  try {
    auth = getAuth(_app);
    db = getFirestore(_app);
    console.log("AuthContext: Firebase Auth and Firestore services obtained successfully.");
  } catch (error: any) {
     console.error("AuthContext: Firebase Auth/DB services initialization error:", error.message, error.stack);
     // auth and db might remain undefined, caught by checks in AuthProvider
  }
} else {
    console.warn("AuthContext: Firebase App object (_app) is undefined after initialization attempt. This indicates a problem with firebaseConfig or initializeApp itself.");
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
  activeSite: Site | null; // Added activeSite for direct access
  activeStallId: string | null; 
  activeStall: Stall | null; // Added activeStall for direct access
  setActiveSite: (siteId: string | null) => void;
  setActiveStall: (stallId: string | null) => void; 
}

// Define Site and Stall types locally or import if they exist elsewhere
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
    setActiveSiteState(siteId);
    if (user?.role !== 'manager') setActiveStallState(null);
    if (typeof window !== 'undefined') {
      if (siteId) localStorage.setItem('activeSiteId', siteId);
      else localStorage.removeItem('activeSiteId');
      if (user?.role !== 'manager') localStorage.removeItem('activeStallId');
    }
  }, [user?.role]);

  const setActiveStall = useCallback((stallId: string | null) => {
    setActiveStallState(stallId);
    if (typeof window !== 'undefined') {
      if (stallId) localStorage.setItem('activeStallId', stallId);
      else localStorage.removeItem('activeStallId');
    }
  }, []);
  

  useEffect(() => {
    // CRITICAL CONFIG CHECK
    if (!firebaseConfig || firebaseConfig.projectId === "YOUR_PROJECT_ID" || !firebaseConfig.projectId || 
        firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
      const configErrorMsg = "AuthContext CRITICAL CONFIG FAILURE: Firebase projectId or apiKey is a placeholder or missing in the resolved firebaseConfig object. " +
        "This usually means your '.env.local' file is missing, misconfigured, or your development server was not restarted after changes. " +
        "Please ensure your '.env.local' file in the project root has the correct values for NEXT_PUBLIC_FIREBASE_API_KEY, " +
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID, and other NEXT_PUBLIC_FIREBASE_... variables. " +
        "After correcting, YOU MUST RESTART your Next.js development server.";
      // console.error(configErrorMsg, { configUsed: firebaseConfig }); // Removed this console.error
      setInitializationError(configErrorMsg);
      setLoading(false);
      return; // Stop further execution of this useEffect
    }

    // Check if Firebase services were initialized correctly
    if (!auth || !db) {
      const serviceErrorMsg = "AuthContext CRITICAL SERVICE FAILURE: Firebase Auth or Firestore service is not available. " +
        "This often follows an app initialization failure due to incorrect firebaseConfig. " +
        "Check previous logs for errors during `initializeApp(firebaseConfig)`.";
      // console.error(serviceErrorMsg); // Removed this console.error
      setInitializationError(serviceErrorMsg);
      setLoading(false);
      return;
    }
    
    console.log("AuthContext: useEffect for auth state and active context started.");
    setLoading(true);

    let userDocUnsubscribe: (() => void) | null = null;
    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (userDocUnsubscribe) userDocUnsubscribe();
      userDocUnsubscribe = null;

      if (firebaseUser) {
        const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
        userDocUnsubscribe = onSnapshot(userDocRef, (userDocSnap) => {
          let appUserToSet: AppUser;
          if (userDocSnap.exists()) {
            appUserToSet = mapFirestoreDataToAppUser(firebaseUser, userDocSnap.data());
          } else {
            console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid}. Creating default.`);
            const defaultUserData: AppUser = {
              uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff',
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
              createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: null,
              defaultItemSearchTerm: null, defaultItemCategoryFilter: null, defaultItemStockStatusFilter: null,
              defaultItemStallFilterOption: null, defaultSalesDateRangeFrom: null, defaultSalesDateRangeTo: null,
              defaultSalesStaffFilter: null,
            };
            setDoc(userDocRef, defaultUserData).catch(error => console.error("Error creating user doc:", error));
            appUserToSet = defaultUserData;
          }
          setUserState(appUserToSet);
          
          const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
          const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;

          if (appUserToSet.role === 'admin') {
              setActiveSiteState(storedSiteId);
              setActiveStallState(storedSiteId ? storedStallId : null);
          } else if (appUserToSet.role === 'manager') {
              if (appUserToSet.managedSiteIds && appUserToSet.managedSiteIds.length > 0) {
                  if (storedSiteId && appUserToSet.managedSiteIds.includes(storedSiteId)) {
                      setActiveSiteState(storedSiteId);
                  } else {
                      setActiveSiteState(appUserToSet.managedSiteIds[0]);
                  }
              } else {
                  setActiveSiteState(null);
              }
              setActiveStallState(null);
          } else { // Staff
              setActiveSiteState(appUserToSet.defaultSiteId);
              setActiveStallState(appUserToSet.defaultSiteId ? appUserToSet.defaultStallId : null);
          }
          setLoading(false);
        }, (error) => {
          console.error("AuthContext: Error in user doc onSnapshot:", error);
          setUserState(mapFirestoreDataToAppUser(firebaseUser)); // Fallback
          setLoading(false);
        });
      } else {
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
      authUnsubscribe();
      if (userDocUnsubscribe) userDocUnsubscribe();
    };
  }, []);


  // Effect to fetch active Site/Stall objects when their IDs change
  useEffect(() => {
    if (!db) return;
    if (activeSiteId) {
      const siteDocRef = doc(db as Firestore, "sites", activeSiteId);
      const unsubSite = onSnapshot(siteDocRef, (docSnap) => {
        setActiveSiteObject(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Site : null);
      }, (error) => {
        console.error("Error fetching active site object:", error);
        setActiveSiteObject(null);
      });
      return () => unsubSite();
    } else {
      setActiveSiteObject(null);
    }
  }, [activeSiteId]);

  useEffect(() => {
    if (!db) return;
    if (activeStallId && activeSiteId) { // Stall only makes sense if site is also active
      const stallDocRef = doc(db as Firestore, "stalls", activeStallId);
      const unsubStall = onSnapshot(stallDocRef, (docSnap) => {
        setActiveStallObject(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Stall : null);
      }, (error) => {
        console.error("Error fetching active stall object:", error);
        setActiveStallObject(null);
      });
      return () => unsubStall();
    } else {
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
    if (!auth || !db) throw new Error("Firebase not initialized for signIn.");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      let appUserToReturn: AppUser;

      if (userDocSnap.exists()) {
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, userDocSnap.data());
      } else {
        console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during sign-in. Creating default staff user (onSnapshot will also do this).`);
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
      // No need to call setUserState here, onAuthStateChanged will handle it.
      // setLoading(false) will also be handled by onAuthStateChanged's effect.
      return appUserToReturn; 
    } catch (error) {
      console.error("Sign in error:", error);
      setLoading(false); 
      throw error; 
    }
  }, []);
  
  const signUp = useCallback(async (email: string, pass: string, displayName: string): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized for signUp.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
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
      // No need to call setUserState here, onAuthStateChanged will handle it.
      // setLoading(false) will also be handled by onAuthStateChanged's effect.
      return mapFirestoreDataToAppUser(firebaseUser, newUserDocData);
    } catch (error) {
      console.error("Sign up error:", error);
      setLoading(false); 
      throw error;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) {
      console.error("AuthContext: Firebase Auth not initialized for signOut.");
      return;
    }
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: User signed out successfully.");
      // State updates (user, activeSite/Stall, loading) are handled by onAuthStateChanged
    } catch (error) {
      console.error("Sign out error:", error);
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

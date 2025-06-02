
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
import { getFirestore, doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig'; 

console.log("AuthContext: Initializing with Firebase Config:", firebaseConfig);
if (firebaseConfig.projectId === "YOUR_PROJECT_ID" || !firebaseConfig.projectId) {
  console.error("AuthContext CRITICAL: Firebase projectId is a placeholder or missing! Ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set correctly in your .env.local file and accessible by the application.");
}
if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE" || !firebaseConfig.apiKey) {
  console.error("AuthContext CRITICAL: Firebase apiKey is a placeholder or missing! Ensure NEXT_PUBLIC_FIREBASE_API_KEY is set.");
}

let _app: FirebaseApp | undefined; 
let auth: Auth | undefined;
let db: Firestore | undefined;

if (!getApps().length) {
  try {
    _app = initializeApp(firebaseConfig);
    console.log("AuthContext: Firebase app initialized successfully.");
  } catch (error) {
    console.error("AuthContext: Firebase initialization error during initial app load:", error);
  }
} else {
  _app = getApp(); 
  console.log("AuthContext: Firebase app already initialized, got existing instance.");
}

if (_app) { 
  try {
    auth = getAuth(_app);
    db = getFirestore(_app);
    console.log("AuthContext: Firebase Auth and Firestore services obtained successfully.");
  } catch (error) {
     console.error("AuthContext: Firebase Auth/DB services initialization error:", error);
  }
} else {
    console.error("AuthContext CRITICAL: Firebase App object is undefined. Auth and Firestore setup will be skipped. This usually means initializeApp failed due to incorrect configuration.");
}


interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<AppUser | null>;
  signUp: (email: string, pass: string, displayName: string) => Promise<AppUser | null>;
  signOutUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  activeSiteId: string | null;
  activeStallId: string | null; // Will typically be null for managers with new model
  setActiveSite: (siteId: string | null) => void;
  setActiveStall: (stallId: string | null) => void; // For admins/staff using specific stalls
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSiteId, setActiveSiteState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeSiteId');
    }
    return null;
  });
  const [activeStallId, setActiveStallState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('activeStallId');
    }
    return null;
  });

  const setActiveSite = (siteId: string | null) => {
    setActiveSiteState(siteId);
    // For managers, activeStallId should likely remain null or "all-stalls" conceptually
    // For staff/admins selecting a specific site, clearing stall is fine.
    if (user?.role !== 'manager') {
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
  };

  const setActiveStall = (stallId: string | null) => {
    // Managers typically operate at site level, so this might be less relevant for them
    // or always be 'null' or a special value.
    // This function is more for Admins and Staff.
    setActiveStallState(stallId);
    if (typeof window !== 'undefined') {
      if (stallId) {
        localStorage.setItem('activeStallId', stallId);
      } else {
        localStorage.removeItem('activeStallId');
      }
    }
  };

  const mapFirestoreDataToAppUser = (firebaseUser: FirebaseUser, userDataFromFirestore: any = {}): AppUser => {
    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: userDataFromFirestore.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
      photoURL: firebaseUser.photoURL,
      role: userDataFromFirestore.role || 'staff',
      createdAt: userDataFromFirestore.createdAt || new Date().toISOString(),
      // Staff/generic defaults
      defaultSiteId: userDataFromFirestore.defaultSiteId ?? null,
      defaultStallId: userDataFromFirestore.defaultStallId ?? null,
      // Manager specific
      managedSiteIds: userDataFromFirestore.managedSiteIds ?? null, 
      // Preferences
      defaultItemSearchTerm: userDataFromFirestore.defaultItemSearchTerm ?? null,
      defaultItemCategoryFilter: userDataFromFirestore.defaultItemCategoryFilter ?? null,
      defaultItemStockStatusFilter: userDataFromFirestore.defaultItemStockStatusFilter ?? null,
      defaultItemStallFilterOption: userDataFromFirestore.defaultItemStallFilterOption ?? null,
      defaultSalesDateRangeFrom: userDataFromFirestore.defaultSalesDateRangeFrom ?? null,
      defaultSalesDateRangeTo: userDataFromFirestore.defaultSalesDateRangeTo ?? null,
      defaultSalesStaffFilter: userDataFromFirestore.defaultSalesStaffFilter ?? null,
    };
  };

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      console.error(
        "AuthContext: CRITICAL - Firebase Auth or Firestore service is not available in the onAuthStateChanged listener. This will prevent user authentication and data fetching. Ensure Firebase is correctly initialized with valid configuration. This is a common cause for 'Missing or insufficient permissions' errors if subsequent operations are attempted without a valid authenticated user.",
      );
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          let appUser: AppUser;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            appUser = mapFirestoreDataToAppUser(firebaseUser, userData);

            const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
            const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;

            if (appUser.role === 'admin') {
                setActiveSiteState(storedSiteId);
                setActiveStallState(storedSiteId ? storedStallId : null); 
            } else if (appUser.role === 'manager') {
                // If manager has managed sites, check if storedSiteId is one of them.
                // If not, or if no storedSiteId, set to first managed site or null.
                if (appUser.managedSiteIds && appUser.managedSiteIds.length > 0) {
                    if (storedSiteId && appUser.managedSiteIds.includes(storedSiteId)) {
                        setActiveSiteState(storedSiteId);
                    } else {
                        setActiveSiteState(appUser.managedSiteIds[0]); // Default to first managed site
                    }
                } else {
                    setActiveSiteState(null); // No sites managed
                }
                setActiveStallState(null); // Managers operate at site level, so stall is null (all stalls)
            } else { // Staff
                setActiveSiteState(appUser.defaultSiteId); 
                setActiveStallState(appUser.defaultSiteId ? appUser.defaultStallId : null); 
            }

          } else {
            console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during auth state change. Creating one with default role 'staff'.`);
            const defaultUserData: Partial<AppUser> = { // Using Partial as some fields are role-dependent
              uid: firebaseUser.uid,
              email: firebaseUser.email, 
              role: 'staff', 
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
              createdAt: new Date().toISOString(),
              defaultSiteId: null, // Staff specific
              defaultStallId: null, // Staff specific
              managedSiteIds: null, // Manager specific
              // preferences null by default
            };
            await setDoc(userDocRef, defaultUserData);
            appUser = mapFirestoreDataToAppUser(firebaseUser, defaultUserData);
            setActiveSiteState(null); // New staff has no default site yet
            setActiveStallState(null);
          }
          setUser(appUser);
        } catch (error) {
          console.error("AuthContext: Error fetching/creating user data from Firestore:", error);
          const fallbackUser = mapFirestoreDataToAppUser(firebaseUser); 
          setUser(fallbackUser);
          setActiveSiteState(null);
          setActiveStallState(null);
        }
      } else {
        setUser(null);
        setActiveSiteState(null);
        setActiveStallState(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('activeSiteId');
            localStorage.removeItem('activeStallId');
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []); 

  const signIn = useCallback(async (email: string, pass: string): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized for signIn.");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let appUser: AppUser;
      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        appUser = mapFirestoreDataToAppUser(firebaseUser, userData);

        const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
        const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;

        if (appUser.role === 'admin') {
            setActiveSiteState(storedSiteId);
            setActiveStallState(storedSiteId ? storedStallId : null);
        } else if (appUser.role === 'manager') {
             if (appUser.managedSiteIds && appUser.managedSiteIds.length > 0) {
                if (storedSiteId && appUser.managedSiteIds.includes(storedSiteId)) {
                    setActiveSiteState(storedSiteId);
                } else {
                    setActiveSiteState(appUser.managedSiteIds[0]);
                }
            } else {
                setActiveSiteState(null);
            }
            setActiveStallState(null); // Managers operate at site level
        } else { // Staff
            setActiveSiteState(appUser.defaultSiteId);
            setActiveStallState(appUser.defaultSiteId ? appUser.defaultStallId : null);
        }
      } else {
        console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during sign-in. Creating default staff user.`);
        const defaultUserData: Partial<AppUser> = {
            uid: firebaseUser.uid,
            email: firebaseUser.email, 
            role: 'staff', 
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            createdAt: new Date().toISOString(),
            defaultSiteId: null,
            defaultStallId: null,
            managedSiteIds: null,
        };
         await setDoc(userDocRef, defaultUserData);
        appUser = mapFirestoreDataToAppUser(firebaseUser, defaultUserData);
        setActiveSiteState(null);
        setActiveStallState(null);
      }
      setUser(appUser);
      return appUser;
    } catch (error) {
      console.error("Sign in error:", error);
      setUser(null);
      setActiveSiteState(null);
      setActiveStallState(null);
      throw error; 
    } finally {
      setLoading(false);
    }
  }, []);
  
  const signUp = useCallback(async (email: string, pass: string, displayName: string): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized for signUp.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const newUserDocData: AppUser = { // Ensure all fields are initialized
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: 'staff' as UserRole, 
        displayName: displayName,
        createdAt: new Date().toISOString(),
        defaultSiteId: null, 
        defaultStallId: null,
        managedSiteIds: null, // Initialize for managers
        defaultItemSearchTerm: null,
        defaultItemCategoryFilter: null,
        defaultItemStockStatusFilter: null,
        defaultItemStallFilterOption: null,
        defaultSalesDateRangeFrom: null,
        defaultSalesDateRangeTo: null,
        defaultSalesStaffFilter: null,
      };
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      await setDoc(userDocRef, newUserDocData);

      const appUser = mapFirestoreDataToAppUser(firebaseUser, newUserDocData);
      setUser(appUser); 
      setActiveSiteState(null); // New users start with no active site/stall
      setActiveStallState(null);
      return appUser;
    } catch (error) {
      console.error("Sign up error:", error);
      setUser(null); 
      setActiveSiteState(null);
      setActiveStallState(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) {
      console.error("AuthContext: Firebase Auth not initialized for signOut.");
      return;
    }
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setActiveSiteState(null);
      setActiveStallState(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('activeSiteId');
        localStorage.removeItem('activeStallId');
      }
      console.log("AuthContext: User signed out successfully.");
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signIn, 
      signUp, 
      signOutUser, 
      setUser,
      activeSiteId,
      activeStallId,
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

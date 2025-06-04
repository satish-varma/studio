
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
import { getFirestore, doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
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
  activeStallId: string | null; 
  setActiveSite: (siteId: string | null) => void;
  setActiveStall: (stallId: string | null) => void; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true
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

  const setUser: React.Dispatch<React.SetStateAction<AppUser | null>> = (newUser) => {
    setUserState(newUser);
  };


  const setActiveSite = (siteId: string | null) => {
    setActiveSiteState(siteId);
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

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      console.error("AuthContext: Firebase Auth or Firestore service is not available.");
      return;
    }

    let userDocUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
        userDocUnsubscribe = null;
      }
      // Keep loading true until user data is confirmed or user is confirmed null
      setLoading(true); 

      if (firebaseUser) {
        const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
        
        userDocUnsubscribe = onSnapshot(userDocRef, (userDocSnap) => {
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
                setActiveStallState(null); 
            } else { // Staff
                setActiveSiteState(appUser.defaultSiteId); 
                setActiveStallState(appUser.defaultSiteId ? appUser.defaultStallId : null); 
            }
            setUser(appUser);
          } else {
            console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid}. Attempting to create default.`);
            const defaultUserData: Partial<AppUser> = {
              uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff',
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
              createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: null,
            };
            // Set doc and expect this onSnapshot listener to fire again with the new data
            setDoc(userDocRef, defaultUserData).catch(error => {
                 console.error("AuthContext: Error creating user document in onSnapshot fallback:", error);
                 // If doc creation fails, map with FirebaseUser data only and stop loading
                 setUser(mapFirestoreDataToAppUser(firebaseUser));
                 setLoading(false); 
            });
            // Don't set loading false yet, wait for onSnapshot to re-fire with created doc or error out
            return; 
          }
          setLoading(false); // Firestore data for user processed, set loading to false
        }, (error) => {
          console.error("AuthContext: Error in user document onSnapshot listener:", error);
          setUser(mapFirestoreDataToAppUser(firebaseUser)); // Fallback
          setActiveSiteState(null);
          setActiveStallState(null);
          setLoading(false); // Error occurred, stop loading
        });

      } else { // User logged out
        setUser(null);
        setActiveSiteState(null);
        setActiveStallState(null);
        if (typeof window !== 'undefined') {
            localStorage.removeItem('activeSiteId');
            localStorage.removeItem('activeStallId');
        }
        setLoading(false); // No user, stop loading
      }
      // setLoading(false) was here, moved inside or to else block
    });

    return () => {
      authUnsubscribe();
      if (userDocUnsubscribe) {
        userDocUnsubscribe();
      }
    };
  }, []); 

  const signIn = useCallback(async (email: string, pass: string): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized for signIn.");
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      // The onSnapshot listener will handle setting user, activeSite/Stall, and setLoading(false)
      // We can optimistically fetch the doc here for return, but context update relies on listener
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      let appUserToReturn: AppUser;

      if (userDocSnap.exists()) {
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, userDocSnap.data());
      } else {
        console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during sign-in. Creating default staff user (onSnapshot will also do this).`);
        const defaultUserData: Partial<AppUser> = {
            uid: firebaseUser.uid, email: firebaseUser.email, role: 'staff',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            createdAt: new Date().toISOString(), defaultSiteId: null, defaultStallId: null, managedSiteIds: null,
        };
        await setDoc(userDocRef, defaultUserData); // This will trigger the onSnapshot
        appUserToReturn = mapFirestoreDataToAppUser(firebaseUser, defaultUserData);
      }
      return appUserToReturn; 
    } catch (error) {
      console.error("Sign in error:", error);
      setLoading(false); // Ensure loading is false on error
      throw error; 
    }
    // setLoading(false) will be handled by the onSnapshot listener
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
      // The onSnapshot listener will pick up this new user and set context state, including setLoading(false).
      return mapFirestoreDataToAppUser(firebaseUser, newUserDocData);
    } catch (error) {
      console.error("Sign up error:", error);
      setLoading(false); // Ensure loading is false on error
      throw error;
    }
    // setLoading(false) will be handled by the onSnapshot listener
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) {
      console.error("AuthContext: Firebase Auth not initialized for signOut.");
      return;
    }
    // setLoading(true) not strictly needed here as onAuthStateChanged will handle it
    try {
      await firebaseSignOut(auth);
      console.log("AuthContext: User signed out successfully.");
    } catch (error) {
      console.error("Sign out error:", error);
    }
    // setLoading(false) and state clearing will be handled by onAuthStateChanged listener
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


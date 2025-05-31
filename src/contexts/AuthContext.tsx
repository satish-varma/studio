
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
import { getFirestore, doc, getDoc, setDoc, type Firestore, collection, query, where, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from '@/lib/firebaseConfig'; 

// Diagnostic logging for Firebase configuration
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
  signUp: (email: string, pass: string, displayName: string, role?: UserRole) => Promise<AppUser | null>; 
  signOutUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>;
  activeSiteId: string | null;
  activeStallId: string | null;
  setActiveSite: (siteId: string | null) => void;
  setActiveStall: (stallId: string | null) => void;
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
    setActiveStallState(null); 
    if (typeof window !== 'undefined') {
      if (siteId) {
        localStorage.setItem('activeSiteId', siteId);
      } else {
        localStorage.removeItem('activeSiteId');
      }
      localStorage.removeItem('activeStallId'); 
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
          
          let userRole: UserRole = 'staff'; 
          let currentDisplayName = firebaseUser.displayName;
          let userDefaultSiteId: string | null = null;
          let userDefaultStallId: string | null = null;
          let createdAt = new Date().toISOString();

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            userRole = userData.role || 'staff';
            currentDisplayName = userData.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
            userDefaultSiteId = userData.defaultSiteId || null;
            userDefaultStallId = userData.defaultStallId || null;
            createdAt = userData.createdAt || createdAt;

             if (userRole === 'admin') {
                const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
                const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;
                setActiveSiteState(storedSiteId);
                setActiveStallState(storedSiteId ? storedStallId : null); 
            } else { 
                setActiveSiteState(userDefaultSiteId);
                setActiveStallState(userDefaultSiteId ? userDefaultStallId : null); 
            }

          } else {
            console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during auth state change. Creating one with default role 'staff'.`);
            currentDisplayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
            await setDoc(userDocRef, { 
              uid: firebaseUser.uid,
              email: firebaseUser.email, 
              role: 'staff', 
              displayName: currentDisplayName,
              createdAt: createdAt,
              defaultSiteId: null,
              defaultStallId: null,
            });
            setActiveSiteState(null);
            setActiveStallState(null);
          }

          const appUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: currentDisplayName,
            photoURL: firebaseUser.photoURL,
            role: userRole,
            createdAt: createdAt,
            defaultSiteId: userDefaultSiteId || undefined,
            defaultStallId: userDefaultStallId || undefined,
          };
          setUser(appUser);
        } catch (error) {
          console.error("AuthContext: Error fetching user data from Firestore:", error);
          const fallbackUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            photoURL: firebaseUser.photoURL,
            role: 'staff', 
            createdAt: new Date().toISOString(),
          };
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
      
      let userRole: UserRole = 'staff';
      let currentDisplayName = firebaseUser.displayName;
      let userDefaultSiteId: string | null = null;
      let userDefaultStallId: string | null = null;
      let createdAt = new Date().toISOString();

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        userRole = userData.role || 'staff';
        currentDisplayName = userData.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
        userDefaultSiteId = userData.defaultSiteId || null;
        userDefaultStallId = userData.defaultStallId || null;
        createdAt = userData.createdAt || createdAt;

        if (userRole === 'admin') {
            const storedSiteId = typeof window !== 'undefined' ? localStorage.getItem('activeSiteId') : null;
            const storedStallId = typeof window !== 'undefined' ? localStorage.getItem('activeStallId') : null;
            setActiveSiteState(storedSiteId);
            setActiveStallState(storedSiteId ? storedStallId : null);
        } else { 
            setActiveSiteState(userDefaultSiteId);
            setActiveStallState(userDefaultSiteId ? userDefaultStallId : null);
        }
      } else {
        console.warn(`AuthContext: User document not found for UID: ${firebaseUser.uid} during sign-in. Assigning default role 'staff'.`);
        currentDisplayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
         await setDoc(userDocRef, { 
            uid: firebaseUser.uid,
            email: firebaseUser.email, 
            role: 'staff',
            displayName: currentDisplayName,
            createdAt: createdAt,
            defaultSiteId: null,
            defaultStallId: null,
          });
        setActiveSiteState(null);
        setActiveStallState(null);
      }

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: currentDisplayName, 
        photoURL: firebaseUser.photoURL, 
        role: userRole,
        createdAt: createdAt,
        defaultSiteId: userDefaultSiteId || undefined,
        defaultStallId: userDefaultStallId || undefined,
      };
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
  
  const signUp = useCallback(async (email: string, pass: string, displayName: string, role: UserRole = 'staff'): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized for signUp.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const createdAtDate = new Date().toISOString();
      const userDocRef = doc(db as Firestore, "users", firebaseUser.uid);
      const newUserDocData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: role,
        displayName: displayName,
        createdAt: createdAtDate,
        defaultSiteId: null, 
        defaultStallId: null,
      };
      await setDoc(userDocRef, newUserDocData);

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: displayName, 
        photoURL: firebaseUser.photoURL, 
        role,
        createdAt: createdAtDate,
        defaultSiteId: undefined,
        defaultStallId: undefined,
      };
      setUser(appUser); 
      setActiveSiteState(null);
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


    

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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Initialize Firebase only if it hasn't been initialized yet
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
  } catch (error) {
    console.error("Firebase initialization error during initial app load:", error);
  }
} else {
  app = getApps()[0];
}

// Ensure auth and db are initialized after app
try {
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
   console.error("Firebase Auth/DB initialization error:", error);
}


interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<AppUser | null>;
  signUp: (email: string, pass: string, displayName: string, role?: UserRole) => Promise<AppUser | null>; 
  signOutUser: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AppUser | null>>; // Expose setUser for profile updates
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      console.error("Firebase Auth or Firestore is not initialized in AuthProvider effect.");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          let userRole: UserRole = 'staff'; 
          let currentDisplayName = firebaseUser.displayName;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            userRole = userData.role || 'staff';
            currentDisplayName = userData.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
          } else {
            console.warn(`User document not found for UID: ${firebaseUser.uid} during auth state change. Creating one with default role.`);
            currentDisplayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
            await setDoc(userDocRef, { 
              email: firebaseUser.email, 
              role: 'staff', 
              displayName: currentDisplayName,
              createdAt: new Date().toISOString(),
            });
          }

          const appUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: currentDisplayName,
            photoURL: firebaseUser.photoURL,
            role: userRole,
          };
          setUser(appUser);
        } catch (error) {
          console.error("Error fetching user data from Firestore:", error);
          const fallbackUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            photoURL: firebaseUser.photoURL,
            role: 'staff', 
          };
          setUser(fallbackUser);
        }
      } else {
        setUser(null);
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
      
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let userRole: UserRole = 'staff';
      let currentDisplayName = firebaseUser.displayName;

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        userRole = userData.role || 'staff';
        currentDisplayName = userData.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
      } else {
        console.warn(`User document not found for UID: ${firebaseUser.uid} during sign-in. Assigning default role and creating document.`);
        currentDisplayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
         await setDoc(userDocRef, { 
            email: firebaseUser.email, 
            role: 'staff',
            displayName: currentDisplayName,
            createdAt: new Date().toISOString(),
          });
      }

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: currentDisplayName, 
        photoURL: firebaseUser.photoURL, 
        role: userRole 
      };
      setUser(appUser);
      return appUser;
    } catch (error) {
      console.error("Sign in error:", error);
      setUser(null);
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
      
      // It's good practice to update the Firebase Auth profile display name as well
      // This doesn't happen automatically with createUserWithEmailAndPassword
      // await updateProfile(firebaseUser, { displayName: displayName }); // If you need this immediately for firebaseUser.displayName

      const userDocRef = doc(db, "users", firebaseUser.uid);
      await setDoc(userDocRef, {
        email: firebaseUser.email,
        role: role,
        displayName: displayName,
        createdAt: new Date().toISOString(),
      });

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: displayName, 
        photoURL: firebaseUser.photoURL, 
        role 
      };
      setUser(appUser); 
      return appUser;
    } catch (error) {
      console.error("Sign up error:", error);
      setUser(null); 
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) throw new Error("Firebase Auth not initialized for signOut.");
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOutUser, setUser }}>
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

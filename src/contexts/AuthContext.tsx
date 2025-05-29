
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppUser, UserRole } from '@/types/user';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.error("Firebase initialization error:", error);
    // In a production app, you might want to show a global error message 
    // or prevent the app from rendering if Firebase fails to initialize.
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<AppUser | null>;
  signUp: (email: string, pass: string, displayName: string, role?: UserRole) => Promise<AppUser | null>; 
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth || !db) {
      // Firebase not initialized, handle accordingly
      setLoading(false);
      console.error("Firebase Auth or Firestore is not initialized.");
      // Potentially set an error state here to inform the user
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          let userRole: UserRole = 'staff'; // Default role
          let currentDisplayName = firebaseUser.displayName;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            userRole = userData.role || 'staff';
            currentDisplayName = userData.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User";
          } else {
            // This case handles users who might exist in Firebase Auth but not in Firestore
            // (e.g. if they were created directly in Firebase console or if Firestore doc creation failed previously).
            // For new sign-ups via the app, the document is created in the signUp function.
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

  const signIn = async (email: string, pass: string): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized.");
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
      setLoading(false);
      return appUser;
    } catch (error) {
      console.error("Sign in error:", error);
      setUser(null);
      setLoading(false);
      throw error; 
    }
  };
  
  const signUp = async (email: string, pass: string, displayName: string, role: UserRole = 'staff'): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
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
        photoURL: firebaseUser.photoURL, // This will likely be null initially from Firebase Auth
        role 
      };
      setUser(appUser); // Set the user in context after successful sign-up & Firestore doc creation
      setLoading(false);
      return appUser;
    } catch (error) {
      console.error("Sign up error:", error);
      setUser(null); // Clear user on error
      setLoading(false);
      throw error;
    }
  };

  const signOutUser = async () => {
    if (!auth) throw new Error("Firebase Auth not initialized.");
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Sign out error:", error);
      // Handle sign-out error
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOutUser }}>
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

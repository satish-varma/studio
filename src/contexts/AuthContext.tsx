
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
  signUp: (email: string, pass: string, role?: UserRole) => Promise<AppUser | null>; 
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
          let displayName = firebaseUser.displayName;

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            userRole = userData.role || 'staff';
            displayName = userData.displayName || firebaseUser.displayName || "User";
          } else {
            // If user doc doesn't exist (e.g., migrated user or direct Firebase Console creation), create it.
            // For new sign-ups, the doc is created in the signUp function.
            // This handles cases where a user might exist in Auth but not Firestore.
             await setDoc(userDocRef, { 
              email: firebaseUser.email, 
              role: 'staff', // Default role for users found in Auth but not Firestore
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
              createdAt: new Date().toISOString(),
            });
          }

          const appUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: displayName,
            photoURL: firebaseUser.photoURL,
            role: userRole,
          };
          setUser(appUser);
        } catch (error) {
          console.error("Error fetching user role from Firestore:", error);
          // Fallback: create a user object without a role or with a default one
          const fallbackUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || "User",
            photoURL: firebaseUser.photoURL,
            role: 'staff', // Fallback role
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
      let displayName = firebaseUser.displayName;

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        userRole = userData.role || 'staff';
        displayName = userData.displayName || firebaseUser.displayName || "User";
      } else {
        // This case should be rare for sign-in if signUp creates the doc.
        // However, to be safe, assign a default role.
        console.warn(`User document not found for UID: ${firebaseUser.uid} during sign-in. Assigning default role.`);
         await setDoc(userDocRef, { 
            email: firebaseUser.email, 
            role: 'staff',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "User",
            createdAt: new Date().toISOString(),
          });
      }

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: displayName, 
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
  
  const signUp = async (email: string, pass: string, role: UserRole = 'staff'): Promise<AppUser | null> => {
    if (!auth || !db) throw new Error("Firebase not initialized.");
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      // Store user details (including role) in Firestore
      // TODO: Consider adding more profile details here if needed (e.g., firstName, lastName)
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const initialDisplayName = firebaseUser.displayName || email.split('@')[0] || "New User";
      await setDoc(userDocRef, {
        email: firebaseUser.email,
        role: role,
        displayName: initialDisplayName,
        createdAt: new Date().toISOString(),
        // You might want to set a default photoURL or leave it to Firebase profile updates
      });

      const appUser: AppUser = { 
        uid: firebaseUser.uid, 
        email: firebaseUser.email, 
        displayName: initialDisplayName, 
        photoURL: firebaseUser.photoURL, // This will likely be null initially
        role 
      };
      setUser(appUser);
      setLoading(false);
      return appUser;
    } catch (error) {
      console.error("Sign up error:", error);
      setUser(null);
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

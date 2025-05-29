// =================================================================================
// !! IMPORTANT FOR PRODUCTION !!
// This AuthContext uses a MOCK implementation. For a production application,
// you MUST replace this with a real Firebase Authentication setup.
// 1. Uncomment the Firebase imports and initialization code.
// 2. Ensure `firebaseConfig.ts` contains your actual Firebase project configuration.
// 3. Replace all `mockAuth` calls with their `firebase/auth` equivalents.
// 4. Implement proper user data fetching (e.g., roles from Firestore) after authentication.
// =================================================================================
"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppUser, UserRole } from '@/types/user';
// import { initializeApp, type FirebaseApp } from 'firebase/app';
// import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, type Auth, type User as FirebaseUser } from 'firebase/auth';
// import { firebaseConfig } from '@/lib/firebaseConfig'; 

// Mock Firebase App and Auth
interface MockAuth {
  onAuthStateChanged: (callback: (user: AppUser | null) => void) => () => void;
  signInWithEmailAndPassword: (email: string, pass: string) => Promise<{ user: AppUser }>;
  createUserWithEmailAndPassword: (email: string, pass: string) => Promise<{ user: AppUser }>;
  signOut: () => Promise<void>;
  currentUser: AppUser | null;
}

// let app: FirebaseApp;
// let auth: Auth;

// try {
//   app = initializeApp(firebaseConfig);
//   auth = getAuth(app);
// } catch (error) {
//   console.error("Firebase initialization error:", error);
//   // Handle initialization error in a production app, e.g., show an error message to the user
// }

// MOCK IMPLEMENTATION - REPLACE FOR PRODUCTION
const mockAuth: MockAuth = {
  currentUser: null,
  onAuthStateChanged: (callback) => {
    const timeoutId = setTimeout(() => {
      if (mockAuth.currentUser) {
         callback(mockAuth.currentUser);
      } else {
         callback(null);
      }
    }, 500); // Reduced delay for faster mock auth check
    return () => clearTimeout(timeoutId); 
  },
  signInWithEmailAndPassword: async (email, password) => {
    if (email === 'staff@example.com' && password === 'password') {
      const user: AppUser = { id: 'staff-id', email, role: 'staff', displayName: 'Staff User', photoURL: `https://placehold.co/40x40/E3F2FD/4285F4?text=SU` };
      mockAuth.currentUser = user;
      return { user };
    }
    if (email === 'manager@example.com' && password === 'password') {
       const user: AppUser = { id: 'manager-id', email, role: 'manager', displayName: 'Manager User', photoURL: `https://placehold.co/40x40/E3F2FD/4285F4?text=MU` };
       mockAuth.currentUser = user;
      return { user };
    }
    if (email === 'admin@example.com' && password === 'password') {
       const user: AppUser = { id: 'admin-id', email, role: 'admin', displayName: 'Admin User', photoURL: `https://placehold.co/40x40/E3F2FD/4285F4?text=AU` };
       mockAuth.currentUser = user;
      return { user };
    }
    throw new Error('Invalid credentials. Hint: try staff@example.com with password "password".');
  },
  createUserWithEmailAndPassword: async (email, password) => {
    const user: AppUser = { id: `new-${Date.now()}`, email, role: 'staff', displayName: 'New User', photoURL: `https://placehold.co/40x40/E3F2FD/4285F4?text=NU` };
    mockAuth.currentUser = user;
    return { user };
  },
  signOut: async () => {
    mockAuth.currentUser = null;
  },
};
// END MOCK IMPLEMENTATION


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
    // PRODUCTION: Replace mockAuth.onAuthStateChanged with firebase/auth onAuthStateChanged
    // const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    const unsubscribe = mockAuth.onAuthStateChanged((mockUser: AppUser | null) => {
      if (mockUser) {
        // PRODUCTION: If using Firebase, firebaseUser would be the object.
        // You would then fetch additional user data (like role) from your database (e.g., Firestore).
        // const userDoc = await getDoc(doc(firestore, "users", firebaseUser.uid));
        // const userRole = userDoc.exists() ? userDoc.data().role : 'staff';
        const appUser: AppUser = {
          id: mockUser.id, // firebaseUser.uid,
          email: mockUser.email, // firebaseUser.email,
          displayName: mockUser.displayName, // firebaseUser.displayName,
          photoURL: mockUser.photoURL, // firebaseUser.photoURL,
          role: mockUser.role || 'staff', // Replace with role from your DB
        };
        setUser(appUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string): Promise<AppUser | null> => {
    setLoading(true);
    try {
      // PRODUCTION: Replace with signInWithEmailAndPassword(auth, email, pass);
      const userCredential = await mockAuth.signInWithEmailAndPassword(email, pass);
      // const firebaseUser = userCredential.user;
      // const userDoc = await getDoc(doc(firestore, "users", firebaseUser.uid)); // Fetch role
      // const appUser: AppUser = { id: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName, photoURL: firebaseUser.photoURL, role: userDoc.exists() ? userDoc.data().role : 'staff' };
      // setUser(appUser);
      setUser(userCredential.user); 
      setLoading(false);
      return userCredential.user; // appUser
    } catch (error) {
      console.error("Sign in error:", error);
      setUser(null);
      setLoading(false);
      throw error; 
    }
  };
  
  const signUp = async (email: string, pass: string, role: UserRole = 'staff'): Promise<AppUser | null> => {
    setLoading(true);
    try {
      // PRODUCTION: Replace with createUserWithEmailAndPassword(auth, email, pass);
      const userCredential = await mockAuth.createUserWithEmailAndPassword(email, pass);
      // const firebaseUser = userCredential.user;
      // await setDoc(doc(firestore, "users", firebaseUser.uid), { email: firebaseUser.email, role, displayName: "New User" }); // Store role in Firestore
      // const appUser: AppUser = { id: firebaseUser.uid, email: firebaseUser.email, role, displayName: "New User" };
      // setUser(appUser);
      const newUser = { ...userCredential.user, role, displayName: userCredential.user.displayName || "New User" };
      mockAuth.currentUser = newUser;
      setUser(newUser);
      setLoading(false);
      return newUser; // appUser
    } catch (error) {
      console.error("Sign up error:", error);
      setUser(null);
      setLoading(false);
      throw error;
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      // PRODUCTION: await firebaseSignOut(auth);
      await mockAuth.signOut();
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

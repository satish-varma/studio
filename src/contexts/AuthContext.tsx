"use client";

import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppUser, UserRole } from '@/types/user';
// import { initializeApp, type FirebaseApp } from 'firebase/app';
// import { getAuth, onAuthStateChanged, type Auth, type User as FirebaseUser } from 'firebase/auth';
// import { firebaseConfig } from '@/lib/firebaseConfig'; // Assuming you have this file

// Mock Firebase App and Auth for now to avoid build errors if Firebase isn't fully set up
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
// }

// MOCK IMPLEMENTATION
const mockAuth: MockAuth = {
  currentUser: null,
  onAuthStateChanged: (callback) => {
    // Simulate async auth check and then call callback
    const timeoutId = setTimeout(() => {
      // To test authenticated state, you can uncomment the line below
      // and comment out callback(null)
      // callback({ id: 'mock-user-id', email: 'staff@example.com', role: 'staff', displayName: 'Mock Staff' });
      if (mockAuth.currentUser) {
         callback(mockAuth.currentUser);
      } else {
         callback(null);
      }
    }, 1000);
    return () => clearTimeout(timeoutId); // Cleanup function
  },
  signInWithEmailAndPassword: async (email, password) => {
    // Simulate login
    if (email === 'staff@example.com' && password === 'password') {
      const user: AppUser = { id: 'staff-id', email, role: 'staff', displayName: 'Staff User' };
      mockAuth.currentUser = user;
      return { user };
    }
    if (email === 'manager@example.com' && password === 'password') {
       const user: AppUser = { id: 'manager-id', email, role: 'manager', displayName: 'Manager User' };
       mockAuth.currentUser = user;
      return { user };
    }
    if (email === 'admin@example.com' && password === 'password') {
       const user: AppUser = { id: 'admin-id', email, role: 'admin', displayName: 'Admin User' };
       mockAuth.currentUser = user;
      return { user };
    }
    throw new Error('Invalid credentials');
  },
  createUserWithEmailAndPassword: async (email, password) => {
    // Simulate signup
    const user: AppUser = { id: `new-${Date.now()}`, email, role: 'staff', displayName: 'New User' };
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
  signUp: (email: string, pass: string, role?: UserRole) => Promise<AppUser | null>; // Role might be set server-side
  signOutUser: () => Promise<void>;
  // firebaseAuth: Auth | MockAuth; // Expose auth instance if needed for more direct Firebase interactions
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    const unsubscribe = mockAuth.onAuthStateChanged((mockUser: AppUser | null) => {
      if (mockUser) {
        // In a real app, you might fetch additional user data (like role) from Firestore here
        const appUser: AppUser = {
          id: mockUser.id,
          email: mockUser.email,
          displayName: mockUser.displayName,
          photoURL: mockUser.photoURL,
          // role: 'staff', // Default role, or fetch from DB
          role: mockUser.role || 'staff', // Use role from mock user
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
      // const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const userCredential = await mockAuth.signInWithEmailAndPassword(email, pass);
      // const firebaseUser = userCredential.user;
      // const appUser: AppUser = { /* map firebaseUser to AppUser, fetch role */ id: firebaseUser.uid, email: firebaseUser.email, role: 'staff' };
      // setUser(appUser);
      setUser(userCredential.user);
      setLoading(false);
      return userCredential.user;
    } catch (error) {
      console.error("Sign in error:", error);
      setUser(null);
      setLoading(false);
      throw error; // Re-throw to be caught by the form
    }
  };
  
  const signUp = async (email: string, pass: string, role: UserRole = 'staff'): Promise<AppUser | null> => {
    setLoading(true);
    try {
      // const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const userCredential = await mockAuth.createUserWithEmailAndPassword(email, pass);
      // const firebaseUser = userCredential.user;
      // In a real app, you'd set the user's role in Firestore here.
      // const appUser: AppUser = { /* map firebaseUser to AppUser, set role */ id: firebaseUser.uid, email: firebaseUser.email, role };
      // setUser(appUser);
      const newUser = { ...userCredential.user, role };
      mockAuth.currentUser = newUser; // Update mock current user
      setUser(newUser);
      setLoading(false);
      return newUser;
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
      // await firebaseSignOut(auth);
      await mockAuth.signOut();
      setUser(null);
    } catch (error) {
      console.error("Sign out error:", error);
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


import { getFirestore, collection, addDoc } from "firebase/firestore";
import type { StockMovementLog } from "@/types/log";
import type { AppUser } from "@/types";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) { 
    console.error("StockLogger: Firebase initialization error:", error);
  }
} else {
  db = getFirestore(getApp());
}

export async function logStockMovement(
  user: AppUser | null,
  logData: Omit<StockMovementLog, 'id' | 'userId' | 'userName' | 'timestamp'>
): Promise<void> {
  if (!db || !user) {
    console.warn("Stock movement logging skipped: DB or user not available.", {userId: user?.uid, ...logData});
    return;
  }

  try {
    const movementLog: Omit<StockMovementLog, 'id'> = {
      ...logData,
      userId: user.uid,
      userName: user.displayName || user.email || 'Unknown User',
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, "stockMovementLogs"), movementLog);
  } catch (error) {
    console.error("Failed to log stock movement:", error, logData);
  }
}

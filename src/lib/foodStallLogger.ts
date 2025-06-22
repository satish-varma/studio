
import { getFirestore, collection, addDoc } from "firebase/firestore";
import type { FoodStallActivityLog } from "@/types";
import type { AppUser } from "@/types";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

const LOG_PREFIX = "[FoodStallLogger]";

let db: ReturnType<typeof getFirestore> | undefined;
if (!getApps().length) {
  try {
    initializeApp(firebaseConfig);
    db = getFirestore();
  } catch (error) {
    console.error(`${LOG_PREFIX} Firebase initialization error:`, error);
  }
} else {
  db = getFirestore(getApp());
}

export async function logFoodStallActivity(
  user: AppUser | null,
  logData: Omit<FoodStallActivityLog, 'id' | 'userId' | 'userName' | 'timestamp'>
): Promise<void> {
  if (!db || !user) {
    console.warn("Food stall activity logging skipped: DB or user not available.", {userId: user?.uid, ...logData});
    return;
  }

  try {
    const activityLog: Omit<FoodStallActivityLog, 'id'> = {
      ...logData,
      userId: user.uid,
      userName: user.displayName || user.email || 'Unknown User',
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, "foodStallActivityLogs"), activityLog);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to log food stall activity:`, error, logData);
  }
}

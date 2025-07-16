
import { getFirestore, collection, addDoc } from "firebase/firestore";
import type { StaffActivityLog } from "@/types";
import type { AppUser } from "@/types";
import { getApps, initializeApp, getApp } from 'firebase/app';
import { firebaseConfig } from '@/lib/firebaseConfig';

const LOG_PREFIX = "[StaffLogger]";

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

export async function logStaffActivity(
  user: AppUser | null,
  logData: Omit<StaffActivityLog, 'id' | 'userId' | 'userName' | 'timestamp'>
): Promise<void> {
  if (!db || !user) {
    console.warn("Staff activity logging skipped: DB or user not available.", { userId: user?.uid, ...logData });
    return;
  }

  try {
    const activityLog: Omit<StaffActivityLog, 'id'> = {
      ...logData,
      userId: user.uid,
      userName: user.displayName || user.email || 'Unknown User',
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, "staffActivityLogs"), activityLog);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to log staff activity:`, error, logData);
  }
}

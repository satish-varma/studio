
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import type { CallableContext } from "firebase-functions/v1/https";

interface CreateAuthUserData {
  email: string;
  password: string;
  displayName: string;
}

if (admin.apps.length === 0) {
  try {
    admin.initializeApp();
    functions.logger.info("Firebase Admin SDK initialized successfully in Cloud Function.");
  } catch (error: any) {
    functions.logger.error("Firebase Admin SDK initialization in Cloud Function FAILED:", error.message, error.stack);
  }
}

export const createAuthUser = functions.https.onCall(async (data: CreateAuthUserData, context: CallableContext) => {
  functions.logger.info("createAuthUser function triggered.", { structuredData: true, email: data.email, displayName: data.displayName, callerUid: context.auth?.uid });

  if (!context.auth) {
    functions.logger.warn("createAuthUser: Call from unauthenticated user.");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }
  const callerUid = context.auth.uid;
  functions.logger.info(`createAuthUser: Authenticated call from UID: ${callerUid}.`);

  try {
    const adminDocSnapshot = await admin.firestore().collection("users").doc(callerUid).get();
    
    if (!adminDocSnapshot.exists || adminDocSnapshot.data()?.role !== "admin") {
      functions.logger.warn(`createAuthUser: Caller UID ${callerUid} does not have 'admin' role. Role found: '${adminDocSnapshot.data()?.role}'.`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "You must be an admin to create users."
      );
    }
    functions.logger.info(`createAuthUser: Caller UID ${callerUid} confirmed as admin. Proceeding...`);
  } catch (err: any) {
     functions.logger.error(`createAuthUser: Error during admin role verification for UID ${callerUid}:`, { message: err.message, stack: err.stack, code: err.code });
     if (err instanceof functions.https.HttpsError) {
       throw err;
     }
     throw new functions.https.HttpsError(
        "internal",
        `Could not verify admin privileges. Original error: ${err.message}`
      );
  }

  const { email, password, displayName } = data;
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    functions.logger.error("createAuthUser: Invalid or missing email.", { emailProvided: email });
    throw new functions.https.HttpsError("invalid-argument", "A valid email address is required.");
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    functions.logger.error("createAuthUser: Invalid or missing password.", { passwordLength: password?.length, passwordType: typeof password });
    throw new functions.https.HttpsError("invalid-argument", "Password must be a string and at least 6 characters long.");
  }
  if (!displayName || typeof displayName !== 'string' || displayName.trim().length < 2) {
    functions.logger.error("createAuthUser: Invalid or missing displayName.", { displayNameProvided: displayName });
    throw new functions.https.HttpsError("invalid-argument", "Display name must be a string and at least 2 characters long.");
  }

  try {
    functions.logger.info(`createAuthUser: Calling admin.auth().createUser() for email: ${email}.`);
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      emailVerified: false,
    });
    functions.logger.info(`createAuthUser: Successfully created Firebase Auth user UID: ${userRecord.uid} for email: ${email}.`);
    return {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
    };
  } catch (error: any) {
    functions.logger.error(`createAuthUser: Error from admin.auth().createUser() for email ${email}:`, { code: error.code, message: error.message, stack: error.stack });
    if (error.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", `The email address ${email} is already in use by another account.`);
    } else if (error.code === "auth/invalid-password") {
       throw new functions.https.HttpsError("invalid-argument", "Password must be at least 6 characters long (Firebase requirement).");
    } else if (error.code === "auth/invalid-email") {
       throw new functions.https.HttpsError("invalid-argument", `The email address ${email} is badly formatted.`);
    }
    throw new functions.https.HttpsError( "internal", `Firebase Auth user creation failed (code: ${error.code || 'UNKNOWN'}). Check function logs for details.`);
  }
});

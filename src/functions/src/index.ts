
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// Import CallableContext for correct typing
import type { CallableContext } from "firebase-functions/v1/https";

// Define an interface for the expected data structure from the client
interface CreateAuthUserData {
  email: string;
  password: string;
  displayName: string;
}

// Initialize Firebase Admin SDK only once.
if (admin.apps.length === 0) {
  admin.initializeApp();
  functions.logger.info("Firebase Admin SDK initialized in Cloud Function.");
}

export const createAuthUser = functions.https.onCall(async (data: CreateAuthUserData, context: CallableContext) => {
  functions.logger.info("createAuthUser function triggered.", { structuredData: true, email: data.email, displayName: data.displayName, callerUid: context.auth?.uid });

  // 1. Authentication Check: Ensure the caller is authenticated.
  if (!context.auth) {
    functions.logger.warn("createAuthUser: Call from unauthenticated user.");
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }
  const callerUid = context.auth.uid;
  functions.logger.info(`createAuthUser: Authenticated call from UID: ${callerUid}.`);

  // 2. Admin Privileges Check: Verify the caller is an admin.
  let adminDocSnapshot;
  try {
    functions.logger.info(`createAuthUser: Fetching admin document for UID: ${callerUid} from path: /users/${callerUid}`);
    adminDocSnapshot = await admin.firestore().collection("users").doc(callerUid).get();
    
    if (!adminDocSnapshot.exists) {
      functions.logger.warn(`createAuthUser: Admin document for UID ${callerUid} does not exist.`);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin privileges cannot be confirmed (admin document missing)."
      );
    }
    
    const adminData = adminDocSnapshot.data();
    const adminRole = adminData?.role;
    functions.logger.info(`createAuthUser: Fetched admin document for UID ${callerUid}. Role found: '${adminRole}'.`);

    if (adminRole !== "admin") {
      functions.logger.warn(`createAuthUser: Caller UID ${callerUid} does not have 'admin' role. Role found: '${adminRole}'.`);
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

  // 3. Input Data Validation
  const { email, password, displayName } = data;
  functions.logger.info(`createAuthUser: Validating input data. Email: ${email}, DisplayName: ${displayName}, Password provided: ${!!password}`);

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

  // 4. Create Firebase Authentication User
  try {
    functions.logger.info(`createAuthUser: Calling admin.auth().createUser() for email: ${email}.`);
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: displayName,
      emailVerified: false, // Default to false, admin can request verification later if needed
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
    // Add more specific error handling if needed based on Firebase Auth error codes
    throw new functions.https.HttpsError( "internal", `Firebase Auth user creation failed (code: ${error.code || 'UNKNOWN'}). Check function logs for details.`);
  }
});

    
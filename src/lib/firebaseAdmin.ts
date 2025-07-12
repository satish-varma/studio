
import admin, { App as AdminApp, cert } from 'firebase-admin/app';

const LOG_PREFIX = "[FirebaseAdmin]";

let adminAppInstance: AdminApp | null = null;
let initializationError: string | null = null;

export function initializeAdminSdk(): { adminApp: AdminApp | null, error: string | null } {
  if (adminAppInstance) {
    // console.log(`${LOG_PREFIX} Re-using existing initialized Admin SDK instance.`);
    return { adminApp: adminAppInstance, error: null };
  }
  
  if (initializationError) {
    // If a previous initialization attempt failed, don't try again, just return the error.
    console.error(`${LOG_PREFIX} Returning previous initialization error.`);
    return { adminApp: null, error: initializationError };
  }

  try {
    console.log(`${LOG_PREFIX} Attempting Firebase Admin SDK initialization...`);
    const serviceAccountJsonEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

    if (admin.apps.length > 0) {
      console.log(`${LOG_PREFIX} An admin app is already initialized. Getting default app.`);
      adminAppInstance = admin.app();
      return { adminApp: adminAppInstance, error: null };
    }

    if (serviceAccountJsonEnv) {
      console.log(`${LOG_PREFIX} Found GOOGLE_APPLICATION_CREDENTIALS_JSON. Initializing with service account...`);
      const serviceAccount = JSON.parse(serviceAccountJsonEnv);
      adminAppInstance = admin.initializeApp({
        credential: cert(serviceAccount)
      });
    } else {
      console.log(`${LOG_PREFIX} No specific service account JSON found. Initializing with Application Default Credentials (ADC).`);
      // This will be used in deployed environments (e.g., Cloud Run, Cloud Functions)
      adminAppInstance = admin.initializeApp();
    }
    
    if (!adminAppInstance?.options?.projectId) {
      const errorMsg = "Admin SDK initialized, but the resulting app instance is missing a projectId. This is a critical configuration error.";
      console.error(`${LOG_PREFIX} ${errorMsg} App options: ${JSON.stringify(adminAppInstance?.options)}`);
      initializationError = errorMsg;
      adminAppInstance = null; // Invalidate the instance
      return { adminApp: null, error: errorMsg };
    }

    console.log(`${LOG_PREFIX} Admin SDK initialized successfully. Project ID: ${adminAppInstance.options.projectId}`);
    return { adminApp: adminAppInstance, error: null };

  } catch (error: any) {
    const errorMsg = `Firebase Admin SDK initialization CRITICAL error: ${error.message}. Please check your GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable or your ADC setup.`;
    console.error(`${LOG_PREFIX} ${errorMsg}`, error.stack);
    initializationError = errorMsg;
    return { adminApp: null, error: errorMsg };
  }
}

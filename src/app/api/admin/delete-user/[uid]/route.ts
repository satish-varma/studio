
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert, App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const LOG_PREFIX = "[API:DeleteUser]";

function initializeAdminApp(): AdminApp {
    if (getApps().length > 0) {
        return getApps()[0];
    }
    const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!serviceAccountJson) {
        throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set. Cannot initialize admin app.");
    }
    return initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
    });
}

interface DeleteContext {
  params: {
    uid: string;
  };
}

export async function DELETE(
  request: NextRequest,
  context: DeleteContext
) {
  const uidToDelete = context.params.uid; 
  console.log(`${LOG_PREFIX} DELETE request received for UID: ${uidToDelete}`);
  
  let adminApp: AdminApp;
  try {
      adminApp = initializeAdminApp();
  } catch (e: any) {
      console.error(`${LOG_PREFIX} Critical Failure initializing admin app: ${e.message}`);
      return NextResponse.json({ error: 'Server Configuration Error.', details: e.message }, { status: 500 });
  }
  const adminAuth = getAdminAuth(adminApp);
  const adminFirestore = getAdminFirestore(adminApp);

  if (!uidToDelete) {
    return NextResponse.json({ error: 'Missing UID parameter in request path.' }, { status: 400 });
  }

  let callingAdminUid: string | undefined;
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    callingAdminUid = decodedToken.uid;

    const adminUserDoc = await adminFirestore.collection('users').doc(callingAdminUid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }

    if (callingAdminUid === uidToDelete) {
      return NextResponse.json({ error: 'Forbidden: Admins cannot delete their own account via this API.' }, { status: 403 });
    }

    console.log(`${LOG_PREFIX} Attempting to delete Firebase Auth user: ${uidToDelete} by admin: ${callingAdminUid}`);
    await adminAuth.deleteUser(uidToDelete);
    console.log(`${LOG_PREFIX} Firebase Auth user ${uidToDelete} deleted successfully.`);
    
    return NextResponse.json({ message: `Firebase Auth user ${uidToDelete} deleted successfully.` }, { status: 200 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during Auth user deletion for UID ${uidToDelete} by admin ${callingAdminUid || 'unknown'}:`, error.message, error.code, error.stack);
    let errorMessage = 'Failed to delete Firebase Authentication user.';
    let statusCode = 500;

    if (error.code === 'auth/user-not-found') {
      errorMessage = `Firebase Auth user with UID ${uidToDelete} not found. They may have already been deleted.`;
      statusCode = 404; 
    } else if (error.message?.includes("UNAUTHENTICATED") || error.code === 'auth/insufficient-permission' || error.code === 16 || String(error.code) === '16') { 
        errorMessage = `Firebase service reported a permission error (Code: ${error.code}). This usually means the service account used by the Admin SDK lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin'). Please check its roles in the Google Cloud Console. Original error: ${error.message}`;
        statusCode = 403;
    } else if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      errorMessage = 'Unauthorized: Invalid or expired admin token.';
      statusCode = 401;
    } else {
      errorMessage = error.message || errorMessage;
    }
    
    return NextResponse.json({ error: errorMessage, details: error.code || error.message }, { status: statusCode });
  }
}

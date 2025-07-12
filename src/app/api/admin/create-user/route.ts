
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeAdminSdk } from '@/lib/firebaseAdmin';

const LOG_PREFIX = "[API:CreateUser]";

export async function POST(request: NextRequest) {
  console.log(`${LOG_PREFIX} POST request received.`);
  
  const { adminApp, error: adminAppError } = initializeAdminSdk();
  if (adminAppError || !adminApp) {
    console.error(`${LOG_PREFIX} Critical Failure: ${adminAppError}`);
    return NextResponse.json({ error: 'Server Configuration Error.', details: adminAppError }, { status: 500 });
  }
  const adminAuth = getAdminAuth(adminApp);
  const adminFirestore = getAdminFirestore(adminApp);

  let values;
  try {
    values = await request.json();
  } catch (jsonError: any) {
    console.error(`${LOG_PREFIX} Invalid JSON in request body:`, jsonError.message);
    return NextResponse.json({ error: "Invalid JSON in request body.", details: jsonError.message }, { status: 400 });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      console.warn(`${LOG_PREFIX} Authorization header missing or malformed.`);
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token format.' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    
    const callingUser = await adminAuth.verifyIdToken(idToken);
    console.log(`${LOG_PREFIX} ID Token verified successfully for UID: ${callingUser.uid}`);

    console.log(`${LOG_PREFIX} Checking admin privileges for UID: ${callingUser.uid}`);
    const adminUserDoc = await adminFirestore.collection('users').doc(callingUser.uid).get();
    if (!adminUserDoc.exists || adminUserDoc.data()?.role !== 'admin') {
      console.warn(`${LOG_PREFIX} Forbidden. Caller UID ${callingUser.uid} is not an admin. Role: ${adminUserDoc.data()?.role ?? 'not found'}`);
      return NextResponse.json({ error: 'Forbidden: Caller is not an admin.' }, { status: 403 });
    }
    console.log(`${LOG_PREFIX} Caller ${callingUser.uid} authorized as admin.`);

    const { email, password, displayName } = values;
    console.log(`${LOG_PREFIX} Request body parsed. Email: ${email}, DisplayName: ${displayName}, Password provided: ${!!password}`);

    if (!email || !password || !displayName) {
      console.warn(`${LOG_PREFIX} Missing required fields in request body.`);
      return NextResponse.json({ error: 'Missing required fields: email, password, or displayName.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 6) {
      console.warn(`${LOG_PREFIX} Invalid password format or length.`);
      return NextResponse.json({ error: 'Password must be a string and at least 6 characters long.' }, { status: 400 });
    }
    if (typeof displayName !== 'string' || displayName.trim().length < 2) {
      console.warn(`${LOG_PREFIX} Invalid displayName format or length.`);
      return NextResponse.json({ error: "Display name must be a string and at least 2 characters long." }, { status: 400 });
    }

    console.log(`${LOG_PREFIX} Attempting to create Firebase Auth user for email: ${email}`);
    const newUserRecord = await adminAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });
    console.log(`${LOG_PREFIX} Firebase Auth user created successfully. UID: ${newUserRecord.uid}, Email: ${newUserRecord.email}`);

    return NextResponse.json({
      uid: newUserRecord.uid,
      email: newUserRecord.email,
      displayName: newUserRecord.displayName,
    }, { status: 201 });

  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error during user creation process: Code: ${error.code}, Message: ${error.message}`, error.stack);
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;

    if (error.code === 'auth/email-already-exists') {
      errorMessage = `The email address ${values?.email || 'provided'} is already in use by another account.`;
      statusCode = 409;
    } else if (error.code === 'auth/invalid-password') {
      errorMessage = 'Password must be at least 6 characters long (Firebase requirement).';
      statusCode = 400;
    } else if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired') {
      errorMessage = 'Unauthorized: Invalid or expired admin token.';
      statusCode = 401;
    } else if (error.message?.includes('UNAUTHENTICATED') || error.code === 'auth/internal-error' || error.code === 16 || error.code === '16' || error.code === 'auth/insufficient-permission') {
        errorMessage = `Firebase service reported an permission error. This usually means the service account used by the Admin SDK lacks the necessary IAM permissions (e.g., 'Firebase Authentication Admin') to perform this action. Please check the service account's roles in the Google Cloud Console. Original error: ${error.message}`;
        statusCode = 403;
    } else {
        errorMessage = error.message || errorMessage;
    }
    return NextResponse.json({ error: errorMessage, details: error.code || error.message || 'UNKNOWN_SERVER_ERROR' }, { status: statusCode });
  }
}

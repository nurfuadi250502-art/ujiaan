import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'] as const;

const typedFirebaseConfig = firebaseConfig as typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};

const app = initializeApp(typedFirebaseConfig);
export const db = typedFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, typedFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
for (const scope of DRIVE_SCOPES) {
  googleProvider.addScope(scope);
}

// In-memory cache ONLY (never persisted to localStorage or sessionStorage)
let cachedDriveAccessToken: string | null = null;
const driveTokenListeners = new Set<(token: string | null) => void>();

function notifyDriveTokenListeners() {
  for (const listener of driveTokenListeners) {
    listener(cachedDriveAccessToken);
  }
}

export function setInMemoryDriveToken(token: string | null) {
  cachedDriveAccessToken = token;
  notifyDriveTokenListeners();
}

export function getInMemoryDriveToken(): string | null {
  return cachedDriveAccessToken;
}

export function subscribeDriveToken(listener: (token: string | null) => void): () => void {
  driveTokenListeners.add(listener);
  listener(cachedDriveAccessToken);
  return () => {
    driveTokenListeners.delete(listener);
  };
}

// Clear in-memory Drive token whenever user signs out
onAuthStateChanged(auth, (user: User | null) => {
  if (!user) {
    setInMemoryDriveToken(null);
  }
});

export async function signInWithGoogleAndCaptureDriveToken(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken || null;
  if (token) {
    setInMemoryDriveToken(token);
  }
  return { user: result.user, accessToken: token };
}

export async function connectGoogleDriveAccess(): Promise<string> {
  const driveProvider = new GoogleAuthProvider();
  for (const scope of DRIVE_SCOPES) {
    driveProvider.addScope(scope);
  }
  driveProvider.setCustomParameters({ prompt: 'consent' });
  const result = await signInWithPopup(auth, driveProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Tidak dapat memperoleh izin akses Google Drive dari akun Google Anda.');
  }
  setInMemoryDriveToken(credential.accessToken);
  return credential.accessToken;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration (client is offline).');
      return false;
    }
    // Permission denied on test/connection confirms live server reachability
    return true;
  }
}

testConnection();

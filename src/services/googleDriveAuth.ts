import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));

// In-memory token cache (NEVER persisted to localStorage/sessionStorage per security rules)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

const authListeners = new Set<(user: User, token: string) => void>();

export const onDriveAuthChanged = (callback: (user: User, token: string) => void): (() => void) => {
  authListeners.add(callback);
  if (cachedAccessToken && auth.currentUser) {
    try {
      callback(auth.currentUser, cachedAccessToken);
    } catch {}
  }
  return () => {
    authListeners.delete(callback);
  };
};

export const initDriveAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (onAuthSuccess) {
    authListeners.add(onAuthSuccess);
    if (cachedAccessToken && auth.currentUser) {
      try {
        onAuthSuccess(auth.currentUser, cachedAccessToken);
      } catch {}
    }
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleDriveSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Drive OAuth access token.');
    }

    cachedAccessToken = credential.accessToken;
    authListeners.forEach((cb) => {
      try {
        cb(result.user, credential.accessToken!);
      } catch {}
    });

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Drive sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getDriveAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const isDriveConnected = (): boolean => {
  return Boolean(cachedAccessToken && auth.currentUser);
};

export const googleDriveSignOut = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};


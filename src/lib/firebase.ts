// Firebase for the scorecard photo app: the ucg-lineups project (meets, sheet lists and admins live there). Volunteers at the
// scoring table sign in anonymously (no login) and may only add a photo for a sheet in a session's sheet list; admins sign in
// with Google (same rule as Lineups) to view. Access is enforced by storage.rules here and firestore.rules in ucg-lineups.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInAnonymously, signInWithPopup, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

export const ADMIN_DOMAIN = 'unitedclubgymnastics.org';

// Public web config (safe to commit; access is enforced by the rules). Same as ucg-lineups src/lib/firebase.ts.
const firebaseConfig = {
  apiKey: 'AIzaSyCf7XdpS7QvArMdImw05PaTuVcRfxUJs8U',
  authDomain: 'ucg-lineups.firebaseapp.com',
  projectId: 'ucg-lineups',
  storageBucket: 'ucg-lineups.firebasestorage.app',
  messagingSenderId: '477552512737',
  appId: '1:477552512737:web:c8e20b2a1a79584e98b1a0',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
// The SDK retries a dropped upload silently for this long before it gives up; kept short so the capture page can say "weak
// signal" soon, then it waits and starts again on its own (src/lib/retry.ts), and at once when the phone is back online.
storage.maxUploadRetryTime = 20_000;

if (import.meta.env.VITE_USE_EMULATOR === '1') {
  connectFirestoreEmulator(db, '127.0.0.1', 8282);
  connectStorageEmulator(storage, '127.0.0.1', 9198);
  connectAuthEmulator(auth, 'http://127.0.0.1:9098', { disableWarnings: true });
}

/** A verified @unitedclubgymnastics.org account (listed admins are checked by the rules; the screen asks Firestore). */
export const isDomainAdmin = (email: string | null | undefined, verified: boolean): boolean =>
  verified && !!email && email.toLowerCase().endsWith(`@${ADMIN_DOMAIN}`);

/** The volunteer's phone: an anonymous account, unless someone is already signed in. */
export async function ensureUploader(): Promise<void> {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
}

export function signInAdmin() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: ADMIN_DOMAIN, prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export const signOutAdmin = () => signOut(auth);

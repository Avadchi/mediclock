// OPTIONAL Firebase template. MediClock runs fully without it (LocalStorage demo mode).
// To enable: copy .env.example to .env, fill the VITE_FIREBASE_* values, then wire `getDb()` into src/store.jsx.
// The web config is not secret, but data is only safe if firestore.rules (included) are deployed.
export const firebaseEnabled = Boolean(import.meta.env.VITE_FIREBASE_API_KEY && import.meta.env.VITE_FIREBASE_PROJECT_ID);

let cached;
export async function getFirebase() {
  if (!firebaseEnabled) return null;
  if (cached) return cached;
  const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  cached = { app, auth: getAuth(app), db: getFirestore(app) };
  return cached;
}

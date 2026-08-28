/**
 * Firebase Admin initialization (single global app).
 *
 * Credentials come from FIREBASE_SERVICE_ACCOUNT (the full service-account
 * JSON as a string) — or from the three discrete vars FIREBASE_PROJECT_ID /
 * FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.
 *
 * Used for BOTH Firestore (the app database, replacing Supabase Postgres)
 * and FCM push notifications.
 *
 * The exported `firestore` and `messaging` singletons are LAZY: the Admin
 * SDK is only initialized on first actual use. `next build` evaluates
 * route modules while collecting page data — with lazy proxies the build
 * succeeds even before credentials are present; credentials are then
 * required at request time only.
 *
 * Local testing: set FIRESTORE_EMULATOR_HOST (e.g. "127.0.0.1:8080") to
 * run against the Cloud Firestore emulator — the Admin SDK picks it up
 * automatically.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

const globalForFirebase = globalThis as unknown as {
  __firebaseApp: App | undefined;
};

function buildCredential() {
  // Preferred: single JSON blob
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw && raw.trim().startsWith("{")) {
    const parsed = JSON.parse(raw);
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }
  // Fallback: discrete vars (private key may keep the literal \n encoding)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase credentials missing: set FIREBASE_SERVICE_ACCOUNT (full JSON) or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY"
    );
  }
  return { projectId, clientEmail, privateKey };
}

function getOrCreateApp(): App {
  if (globalForFirebase.__firebaseApp) return globalForFirebase.__firebaseApp;
  const existing = getApps()[0];
  if (existing) {
    globalForFirebase.__firebaseApp = existing;
    return existing;
  }
  const app = initializeApp({ credential: cert(buildCredential()) });
  globalForFirebase.__firebaseApp = app;
  return app;
}

/** Lazy Firestore singleton — initializes on first property access. */
export const firestore: Firestore = new Proxy({} as Firestore, {
  get(_target, prop, receiver) {
    const real = getFirestore(getOrCreateApp()) as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});

/** Lazy Messaging singleton — initializes on first property access. */
export const messaging: Messaging = new Proxy({} as Messaging, {
  get(_target, prop, receiver) {
    const real = getMessaging(getOrCreateApp()) as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  },
});

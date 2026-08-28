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
 * Local testing: set FIRESTORE_EMULATOR_HOST (e.g. "127.0.0.1:8080") to
 * run against the Cloud Firestore emulator — the Admin SDK picks it up
 * automatically.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

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

export const firebaseApp: App =
  getApps()[0] ??
  initializeApp({
    credential: cert(buildCredential()),
  });

if (process.env.NODE_ENV !== "production") globalForFirebase.__firebaseApp = firebaseApp;

export const firestore = getFirestore(firebaseApp);
export const messaging = getMessaging(firebaseApp);

// Never choke on undefined properties; matches modern Firestore defaults.
firestore.settings({ ignoreUndefinedProperties: true });

/**
 * FCM push notifications via Firebase Admin (the same service account
 * that powers Firestore). Fire-and-forget: failures never block the
 * API response — pushes are best-effort exactly like the legacy app.
 */
import { messaging } from "@/lib/firebase";
import { db } from "@/lib/db";

interface PushPayload {
  title: string;
  body: string;
}

async function sendToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return;
  // Chunk (FCM multicast limit = 500)
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title: payload.title, body: payload.body },
        android: { priority: "high" },
      });
      // Drop dead tokens so they don't pile up forever.
      const dead = res.responses
        .map((r, idx) => (!r.success ? chunk[idx] : null))
        .filter((t): t is string => !!t);
      if (dead.length) {
        await db.fcmToken
          .deleteMany({ where: { token: { in: dead } } })
          .catch(() => {});
      }
    } catch {
      // best-effort — never throw to the caller
    }
  }
}

/** Push to every registered device (broadcast notifications). */
export async function pushBroadcast(payload: PushPayload): Promise<void> {
  const tokens = await db.fcmToken.findMany({ select: { token: true } });
  await sendToTokens(tokens.map((t) => t.token), payload);
}

/** Push to a specific user's devices (targeted notifications). */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  const tokens = await db.fcmToken.findMany({ where: { userId }, select: { token: true } });
  await sendToTokens(tokens.map((t) => t.token), payload);
}

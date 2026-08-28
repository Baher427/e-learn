/**
 * POST /api/auth/login
 * Body: { username, password }
 * Validates credentials, checks status (approved/pending/expired),
 * sets the session cookie.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie } from "@/lib/auth";
import { ok, fail, parseBody, withRatelimit, clientIp } from "@/lib/api";
import { ensureSeeded } from "@/lib/ensure-seed";
import { z } from "zod";

/** Friendly message when the Firebase project hasn't enabled Firestore yet. */
function isFirestoreDisabled(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Firestore API has not been used|API is not enabled|PERMISSION_DENIED/i.test(msg) && /firestore|PERMISSION/i.test(msg);
}

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  return withRatelimit(`login:${clientIp(req)}`, async () => {
    // Self-bootstrap an empty database (no-op once seeded).
    await ensureSeeded().catch(() => {});
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    const { username, password } = parsed.data;

    let user;
    try {
      user = await db.user.findFirst({
        where: { OR: [{ username }, { email: username }] },
      });
    } catch (e) {
      if (isFirestoreDisabled(e)) {
        return fail(
          "قاعدة بيانات Firestore غير مفعّلة بعد في مشروع Firebase. افتح Firebase Console ← Build ← Firestore Database ← Create database ثم أعد المحاولة.",
          503,
        );
      }
      throw e;
    }

    if (!user) return fail("بيانات الدخول غير صحيحة", 401);
    const match = await verifyPassword(password, user.passwordHash);
    if (!match) return fail("بيانات الدخول غير صحيحة", 401);

    // Status checks
    if (user.status === "pending") {
      return fail("حسابك قيد الانتظار لموافقة الإدارة", 403);
    }
    if (user.status === "expired" || (user.validityEnd && user.validityEnd < new Date())) {
      await db.user.update({ where: { id: user.id }, data: { status: "expired" } });
      return fail("انتهت صلاحية حسابك. يرجى التجديد", 403);
    }

    // Activity log
    const ip = clientIp(req);
    await db.activityLog.create({
      data: {
        userId: user.id,
        activityType: "login",
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });
    await db.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date() },
    });

    const token = await signSession({
      userId: user.id,
      role: user.role as "student" | "admin",
      username: user.username,
    });
    await setSessionCookie(token);

    return ok({
      userId: user.id,
      role: user.role,
      status: user.status,
    });
  }, 8, 60_000);
}

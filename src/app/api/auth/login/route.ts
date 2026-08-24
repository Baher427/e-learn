/**
 * POST /api/auth/login
 * Body: { username, password, forceLogout?: boolean, otpCode?: string }
 *
 * Validates credentials, checks status (approved/pending/expired), then
 * runs the legacy "تأمين الحساب" device-conflict flow:
 *
 *  - deviceToken = sha256(clientIp + userAgent), stored on the user.
 *  - First login from any device stores the token (no conflict).
 *  - If the stored token differs from the current device fingerprint,
 *    respond 409 { code: "device_conflict" } — the client shows the
 *    "تأمين الحساب" modal which emails an OTP (purpose "login_force")
 *    and re-submits with { forceLogout: true, otpCode }.
 *  - Admins skip the device check (same as the legacy PHP app).
 *
 * On success, sets the session cookie.
 */
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie, verifyOtp } from "@/lib/auth";
import { ok, fail, parseBody, withRatelimit, clientIp } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  forceLogout: z.boolean().optional(),
  otpCode: z.string().min(4).max(8).optional(),
});

/** Stable device fingerprint: sha256(ip + user-agent). */
function deviceFingerprint(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}::${userAgent}`).digest("hex");
}

export async function POST(req: NextRequest) {
  return withRatelimit(`login:${clientIp(req)}`, async () => {
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    const { username, password, forceLogout, otpCode } = parsed.data;

    const user = await db.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
    });

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

    // ---- تأمين الحساب: device-conflict detection (students only) ----
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";
    const fingerprint = deviceFingerprint(ip, userAgent);
    const storedToken = user.deviceToken;
    const isConflict =
      user.role !== "admin" && !!storedToken && storedToken !== fingerprint;

    if (isConflict && !forceLogout) {
      // Signal the client to run the OTP force-logout flow.
      return fail(
        "الحساب مفتوح من جهاز آخر. للأمان، أرسل كود التحقق إلى بريدك الإلكتروني.",
        409,
        { code: "device_conflict" }
      );
    }

    if (isConflict && forceLogout) {
      // Must present a valid emailed OTP to take over the session.
      if (!otpCode) {
        return fail("رمز التحقق مطلوب لتأكيد الدخول من الجهاز الجديد", 401, {
          code: "device_conflict",
        });
      }
      const otpCheck = await verifyOtp({
        email: user.email,
        purpose: "login_force",
        code: otpCode,
      });
      if (!otpCheck.ok) {
        return fail("رمز التحقق خاطئ أو منتهي الصلاحية!", 401, {
          code: "device_conflict",
        });
      }
    }

    // Activity log
    await db.activityLog.create({
      data: {
        userId: user.id,
        activityType: "login",
        ip,
        userAgent,
      },
    });

    // Bind this device (first login, same device, or forced takeover).
    await db.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date(), deviceToken: fingerprint },
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

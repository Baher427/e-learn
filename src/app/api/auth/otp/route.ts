/**
 * POST /api/auth/otp
 * Body: { email, purpose } — or — { username, purpose: "login_force" }
 *
 * Creates a 6-digit OTP, stores it hashed in the DB with a TTL, and
 * emails it. For the "login_force" purpose (تأمين الحساب), the caller
 * supplies the USERNAME instead of the email — the server resolves the
 * account's email (the user may not know which email is registered,
 * exactly like the legacy PHP login.php flow).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createOtp, maskEmail } from "@/lib/auth";
import { sendEmail, otpEmailTemplate } from "@/lib/email";
import { ok, fail, parseBody, withRatelimit, clientIp } from "@/lib/api";
import { z } from "zod";

const schema = z
  .object({
    email: z.string().email().toLowerCase().optional(),
    username: z.string().min(1).optional(),
    purpose: z.enum(["register", "login_force", "withdrawal", "password_reset"]),
  })
  .refine((v) => !!v.email || !!v.username, {
    message: "البريد الإلكتروني أو اسم المستخدم مطلوب",
  });

export async function POST(req: NextRequest) {
  return withRatelimit(`otp:${clientIp(req)}`, async () => {
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    const { email: emailInput, username, purpose } = parsed.data;

    let email = emailInput ?? null;
    let userId: string | undefined;

    // login_force resolves the email from the username (legacy behavior).
    if (!email && username) {
      if (purpose !== "login_force") {
        return fail("اسم المستخدم مدعوم لغرض تأمين الحساب فقط", 400);
      }
      const user = await db.user.findFirst({
        where: { OR: [{ username }, { email: username }] },
        select: { id: true, email: true },
      });
      if (!user || !user.email) {
        return fail(
          "عذراً، لا يوجد بريد إلكتروني مسجّل لهذا الحساب. تواصل مع الإدارة.",
          404
        );
      }
      email = user.email;
      userId = user.id;
    }

    if (!email) return fail("البريد الإلكتروني مطلوب", 400);

    const { code } = await createOtp({ email, purpose, userId });
    const html = otpEmailTemplate({ code, purpose, username });
    const result = await sendEmail({
      to: email,
      subject:
        purpose === "login_force"
          ? "رمز تأكيد الدخول — ساحة العباقرة"
          : "رمز التحقق — منصة e-learn",
      html,
    });
    if (!result.ok) return fail(`فشل الإرسال: ${result.error}`, 500);

    return ok({ maskedEmail: maskEmail(email) });
  }, 3, 60_000); // 3 OTPs/min/IP
}

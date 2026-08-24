/**
 * POST /api/auth/otp
 * Body: { email, purpose: "register" | "withdrawal" | "password_reset" }
 * Creates a 6-digit OTP, stores hashed in DB with TTL, emails it.
 */
import { NextRequest } from "next/server";
import { createOtp, maskEmail } from "@/lib/auth";
import { sendEmail, otpEmailTemplate } from "@/lib/email";
import { ok, fail, parseBody, withRatelimit, clientIp } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  purpose: z.enum(["register", "withdrawal", "password_reset"]),
});

export async function POST(req: NextRequest) {
  return withRatelimit(`otp:${clientIp(req)}`, async () => {
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    const { email, purpose } = parsed.data;

    const { code } = await createOtp({ email, purpose });
    const html = otpEmailTemplate({ code, purpose });
    const result = await sendEmail({
      to: email,
      subject: "رمز التحقق — منصة e-learn",
      html,
    });
    if (!result.ok) return fail(`فشل الإرسال: ${result.error}`, 500);

    return ok({ maskedEmail: maskEmail(email) });
  }, 3, 60_000); // 3 OTPs/min/IP
}

/**
 * POST /api/wallet/otp — send a withdrawal OTP to the user's email.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createOtp, maskEmail } from "@/lib/auth";
import { sendEmail, otpEmailTemplate } from "@/lib/email";
import { ok, fail, requireUser, withRatelimit } from "@/lib/api";

export async function POST(req: NextRequest) {
  const got = await requireUser();
  if ("error" in got) return got.error;

  return withRatelimit(`withdraw-otp:${got.session.userId}`, async () => {
    const user = await db.user.findUnique({
      where: { id: got.session.userId },
      select: { email: true },
    });
    if (!user?.email) return fail("لا يوجد بريد مسجّل", 400);

    // Check system status
    const status = await db.systemSetting.findUnique({
      where: { key: "money_system_status" },
    });
    if (status?.value === "0") return fail("نظام السحب مغلق حالياً", 403);

    const { code } = await createOtp({
      email: user.email,
      purpose: "withdrawal",
      userId: user.id,
    });
    const result = await sendEmail({
      to: user.email,
      subject: "رمز تأكيد طلب السحب — e-learn",
      html: otpEmailTemplate({ code, purpose: "withdrawal" }),
    });
    if (!result.ok) return fail(`فشل الإرسال: ${result.error}`, 500);

    return ok({ maskedEmail: maskEmail(user.email) });
  }, 2, 60_000); // 2 OTPs/min/user
}

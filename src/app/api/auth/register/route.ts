/**
 * POST /api/auth/register
 * Body: { username, email, phone, studentName, trainerId?, level, password }
 * Final step of the 4-wizard registration. Creates the user with
 * status='pending' (admin approves later) and validityEnd +1 month.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  signSession,
  setSessionCookie,
} from "@/lib/auth";
import { ok, fail, parseBody, withRatelimit, clientIp, firestoreSetupFail } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  username: z
    .string()
    .min(4)
    .max(20)
    .regex(/^[a-z0-9]+$/, "اسم المستخدم: حروف إنجليزية صغيرة وأرقام فقط"),
  email: z.string().email().toLowerCase(),
  phone: z.string().regex(/^\d{11}$/, "رقم هاتف مصري 11 رقماً"),
  studentName: z.string().min(3).max(80),
  trainerId: z.string().optional(),
  level: z.number().int().min(1).max(10),
  password: z.string().min(6).max(72),
});

export async function POST(req: NextRequest) {
  return withRatelimit(`register:${clientIp(req)}`, async () => {
    const parsed = await parseBody(req, schema);
    if ("error" in parsed) return parsed.error;
    const { username, email, phone, studentName, trainerId, level, password } =
      parsed.data;

    // 1. Uniqueness check
    let exists;
    try {
      exists = await db.user.findFirst({
        where: { OR: [{ email }, { username }] },
        select: { id: true },
      });
    } catch (e) {
      const setupFail = firestoreSetupFail(e);
      if (setupFail) return setupFail;
      throw e;
    }
    if (exists) return fail("اسم المستخدم أو البريد مسجّل مسبقاً", 409);

    // 2. Hash & create
    const passwordHash = await hashPassword(password);
    const validityEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +1 month

    const user = await db.user.create({
      data: {
        username,
        email,
        phone,
        studentName,
        trainerId: trainerId || null,
        level,
        passwordHash,
        status: "pending", // admin approves
        validityEnd,
      },
    });

    // 3. Audit + activity log
    await db.activityLog.create({
      data: {
        userId: user.id,
        activityType: "register",
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      },
    });

    // 4. Create session (so the user is logged in but pending admin approval)
    const token = await signSession({
      userId: user.id,
      role: "student",
      username: user.username,
    });
    await setSessionCookie(token);

    return ok({
      userId: user.id,
      status: user.status,
      message: "تم إنشاء حسابك! سيتم تفعيله بعد موافقة الإدارة.",
    });
  }, 5, 60_000); // 5 registrations/min/IP
}

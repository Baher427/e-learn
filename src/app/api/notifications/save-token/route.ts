import { db } from "@/lib/db";
import { ok, fail, requireUser, clientIp } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const got = await requireUser();
  if ("error" in got) return got.error;

  let body;
  try { body = schema.parse(await req.json()); } catch { return fail("توكن غير صالح", 400); }

  await db.fcmToken.upsert({
    where: { token: body.token },
    update: { userId: got.session.userId, updatedAt: new Date(), userAgent: req.headers.get("user-agent") ?? null },
    create: { token: body.token, userId: got.session.userId, userAgent: req.headers.get("user-agent") ?? null },
  });

  return ok({ saved: true });
}

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  username: z.string().min(4).max(20),
});

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { username } = parsed.data;

  const exists = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (exists) return fail("اسم المستخدم محجوز", 200);
  return ok({ available: true });
}

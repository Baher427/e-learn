/**
 * POST /api/wallet/withdraw — create a withdrawal request.
 * Body: { points, method, account }
 * Checks balance + minimum, inserts request, deducts points.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireUser, parseBody } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  points: z.number().int().positive(),
  method: z.enum(["vodafone_cash", "orange_cash", "instapay", "etisalat_cash"]),
  account: z.string().min(6, "بيانات الحساب غير صحيحة"),
});

export async function POST(req: NextRequest) {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  const { points, method, account } = parsed.data;

  const user = await db.user.findUnique({
    where: { id: got.session.userId },
    select: { id: true, pvpPoints: true },
  });
  if (!user) return fail("المستخدم غير موجود", 404);

  // Settings
  const settings = await db.systemSetting.findMany({
    where: { key: { in: ["money_exchange_rate", "money_min_withdrawal", "money_system_status"] } },
  });
  const get = (k: string, def: string) =>
    settings.find((s) => s.key === k)?.value ?? def;
  const rate = parseFloat(get("money_exchange_rate", "0.020"));
  const minW = parseInt(get("money_min_withdrawal", "50"));
  const open = get("money_system_status", "1") === "1";
  if (!open) return fail("نظام السحب مغلق حالياً", 403);
  if (points < minW) return fail(`الحد الأدنى للسحب ${minW} نقطة`, 400);
  if (user.pvpPoints < points) return fail("لا تملك نقاطاً كافية", 400);

  const moneyAmount = Math.round(points * rate * 100) / 100;

  // Atomic: deduct + insert request
  const [, request] = await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { pvpPoints: { decrement: points } },
    }),
    db.withdrawalRequest.create({
      data: {
        userId: user.id,
        pointsAmount: points,
        moneyAmount,
        paymentMethod: method,
        accountDetails: account,
        status: "pending",
      },
    }),
  ]);

  return ok({
    requestId: request.id,
    newBalance: user.pvpPoints - points,
    moneyAmount,
  });
}

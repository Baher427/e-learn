import { db } from "@/lib/db";
import { ok, fail, requireUser } from "@/lib/api";

/**
 * GET /api/wallet — current user's pvp_points + exchange rate + history
 */
export async function GET() {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const user = await db.user.findUnique({
    where: { id: got.session.userId },
    select: { pvpPoints: true },
  });
  if (!user) return fail("المستخدم غير موجود", 404);

  // Settings (with dev defaults)
  const settings = await db.systemSetting.findMany({
    where: {
      key: { in: ["money_exchange_rate", "money_min_withdrawal", "money_system_status"] },
    },
  });
  const get = (k: string, def: string) =>
    settings.find((s) => s.key === k)?.value ?? def;

  const history = await db.withdrawalRequest.findMany({
    where: { userId: got.session.userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      pointsAmount: true,
      moneyAmount: true,
      paymentMethod: true,
      accountDetails: true,
      status: true,
      createdAt: true,
    },
  });

  return ok({
    points: user.pvpPoints,
    exchangeRate: parseFloat(get("money_exchange_rate", "0.020")),
    minWithdrawal: parseInt(get("money_min_withdrawal", "50")),
    systemStatus: get("money_system_status", "1") === "1",
    history,
  });
}

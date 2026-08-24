/**
 * /api/admin/withdrawals
 *   GET                          — list withdrawal requests + money settings + stats
 *  POST action=update_settings  — upsert pricing/min/status settings
 *  POST action=process_request   — approve or reject a request
 *                                  reject REFUNDS the user's pvp_points
 *                                  approve just marks approved (legacy behaviour;
 *                                  payment executed offline).
 *
 * All admin destructive actions call `audit()`.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

const DEFAULTS = {
  money_exchange_rate: "0.020",
  money_min_withdrawal: "50",
  money_system_status: "1",
};

// --------------------------------------------------------------------
// GET /api/admin/withdrawals?page=1
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 25;

  const [total, requests, settings, pendingCount, totalPaid] = await Promise.all([
    db.withdrawalRequest.count(),
    db.withdrawalRequest.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: {
          select: { id: true, studentName: true, username: true, pvpPoints: true },
        },
      },
    }),
    db.systemSetting.findMany({
      where: { key: { in: ["money_exchange_rate", "money_min_withdrawal", "money_system_status"] } },
    }),
    db.withdrawalRequest.count({ where: { status: "pending" } }),
    db.withdrawalRequest.aggregate({
      _sum: { moneyAmount: true },
      where: { status: "approved" },
    }),
  ]);

  const map = new Map(settings.map((s) => [s.key, s.value]));

  return ok({
    stats: {
      pending: pendingCount,
      totalPaid: totalPaid._sum.moneyAmount ?? 0,
    },
    settings: {
      exchangeRate: parseFloat(map.get("money_exchange_rate") ?? DEFAULTS.money_exchange_rate),
      minWithdrawal: parseInt(map.get("money_min_withdrawal") ?? DEFAULTS.money_min_withdrawal),
      systemStatus: map.get("money_system_status") ?? DEFAULTS.money_system_status,
    },
    requests: requests.map((r) => ({
      id: r.id,
      userId: r.userId,
      studentName: r.user.studentName,
      username: r.user.username,
      userBalance: r.user.pvpPoints,
      pointsAmount: r.pointsAmount,
      moneyAmount: r.moneyAmount,
      paymentMethod: r.paymentMethod,
      accountDetails: r.accountDetails,
      status: r.status,
      decidedBy: r.decidedBy,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------
const updateSettingsSchema = z.object({
  action: z.literal("update_settings"),
  exchangeRate: z.number().positive(),
  minWithdrawal: z.number().int().positive(),
  systemStatus: z.enum(["0", "1"]),
});

const processRequestSchema = z.object({
  action: z.literal("process_request"),
  requestId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().or(z.literal("")),
});

const rootSchema = z.discriminatedUnion("action", [updateSettingsSchema, processRequestSchema]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  if (args.action === "update_settings") {
    const entries = [
      { key: "money_exchange_rate", value: String(args.exchangeRate) },
      { key: "money_min_withdrawal", value: String(args.minWithdrawal) },
      { key: "money_system_status", value: args.systemStatus },
    ];
    await db.$transaction(
      entries.map((e) =>
        db.systemSetting.upsert({
          where: { key: e.key },
          update: { value: e.value },
          create: { key: e.key, value: e.value },
        })
      )
    );
    await audit({
      actorId: adminId,
      action: "update_money_settings",
      meta: {
        exchangeRate: args.exchangeRate,
        minWithdrawal: args.minWithdrawal,
        systemStatus: args.systemStatus,
      },
    });
    return ok({ saved: true });
  }

  // process_request
  const request = await db.withdrawalRequest.findUnique({
    where: { id: args.requestId },
    include: { user: { select: { id: true, studentName: true, pvpPoints: true } } },
  });
  if (!request) return fail("الطلب غير موجود", 404);
  if (request.status !== "pending") return fail("تمت معالجة الطلب مسبقاً", 400);

  if (args.decision === "approve") {
    const updated = await db.withdrawalRequest.update({
      where: { id: args.requestId },
      data: { status: "approved", decidedBy: adminId, decidedAt: new Date() },
    });
    await audit({
      actorId: adminId,
      targetUserId: request.userId,
      action: "approve_withdrawal",
      meta: {
        requestId: args.requestId,
        pointsAmount: request.pointsAmount,
        moneyAmount: request.moneyAmount,
        paymentMethod: request.paymentMethod,
        note: args.note || null,
      },
    });
    return ok({ request: { id: updated.id, status: updated.status } });
  }

  // reject — refund the user's pvp_points
  await db.$transaction([
    db.user.update({
      where: { id: request.userId },
      data: { pvpPoints: { increment: request.pointsAmount } },
    }),
    db.withdrawalRequest.update({
      where: { id: args.requestId },
      data: { status: "rejected", decidedBy: adminId, decidedAt: new Date() },
    }),
  ]);
  await audit({
    actorId: adminId,
    targetUserId: request.userId,
    action: "reject_withdrawal",
    meta: {
      requestId: args.requestId,
      refundedPoints: request.pointsAmount,
      newBalance: (request.user?.pvpPoints ?? 0) + request.pointsAmount,
      note: args.note || null,
    },
  });
  return ok({ refunded: request.pointsAmount });
}

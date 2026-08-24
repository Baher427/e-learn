/**
 * /api/admin/arena
 *   GET  action=live_arena             — all approved students with live status
 *   GET  action=history&studentId=...  — last 50 PVP+AI matches for one user
 *   GET  action=game_config             — read game tier + AI config
 *  POST action=save_game_config         — upsert tier/AI settings
 *  POST action=quick_update             — update pvpPoints/level (severs cross-level friendships)
 *  POST action=adjust_ai                — increment/decrement/reset aiAttemptsCount
 *  POST action=live_action              — cancel or force-win a live match
 *  POST action=wipe_history             — delete all matches for a user
 *  POST action=delete_history_item      — delete a single match
 *
 * All admin destructive actions call `audit()`.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

// --------------------------------------------------------------------
// Default game config (legacy fallbacks)
// --------------------------------------------------------------------
const DEFAULT_GAME_CONFIG = {
  tiers: {
    tier1: { q: 10, time: 30, win: 10, loss: 5, status: "1", msg: "البرونزية — للمبتدئين" },
    tier2: { q: 15, time: 25, win: 20, loss: 10, status: "1", msg: "الفضية — للمتوسطين" },
    tier3: { q: 20, time: 20, win: 30, loss: 15, status: "1", msg: "الذهبية — للمحترفين" },
  },
  ai: { daily_limit: 5, msg: "التحدّي بالذكاء الاصطناعي", status: "1" },
};

// --------------------------------------------------------------------
// GET
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "live_arena";

  if (action === "live_arena") {
    return liveArena();
  }
  if (action === "history") {
    const studentId = url.searchParams.get("studentId");
    if (!studentId) return fail("studentId مطلوب", 400);
    return userHistory(studentId);
  }
  if (action === "game_config") {
    return gameConfig();
  }
  return fail(`إجراء غير معروف: ${action}`, 404);
}

async function liveArena() {
  const students = await db.user.findMany({
    where: { role: "student", status: "approved" },
    orderBy: { studentName: "asc" },
    select: {
      id: true,
      username: true,
      studentName: true,
      level: true,
      pvpPoints: true,
      totalPoints: true,
      currentStatus: true,
      aiAttemptsCount: true,
      aiLastDate: true,
    },
  });

  // Find active matches involving each student
  const userIds = students.map((s) => s.id);
  const activeMatches = await db.pvpMatch.findMany({
    where: {
      status: { in: ["pending", "active"] },
      OR: [{ player1Id: { in: userIds } }, { player2Id: { in: userIds } }],
    },
    include: {
      player1: { select: { id: true, studentName: true, username: true } },
      player2: { select: { id: true, studentName: true, username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Index matches by player id
  const matchByPlayer = new Map<string, typeof activeMatches[number]>();
  for (const m of activeMatches) {
    if (!matchByPlayer.has(m.player1Id)) matchByPlayer.set(m.player1Id, m);
    if (m.player2Id && !matchByPlayer.has(m.player2Id)) matchByPlayer.set(m.player2Id, m);
  }

  return ok({
    students: students.map((s) => {
      const m = matchByPlayer.get(s.id);
      let liveStatus: { kind: "idle" } | { kind: "pvp"; opponent: string; matchId: string } | { kind: "ai"; matchId: string };
      if (!m || s.currentStatus === "idle") {
        liveStatus = { kind: "idle" };
      } else if (m.isAiMatch) {
        liveStatus = { kind: "ai", matchId: m.id };
      } else {
        const opponentId = m.player1Id === s.id ? m.player2Id : m.player1Id;
        const opponent = m.player1Id === s.id ? m.player2?.studentName : m.player1.studentName;
        liveStatus = { kind: "pvp", opponent: opponent ?? "—", matchId: m.id };
        void opponentId;
      }
      return {
        id: s.id,
        username: s.username,
        studentName: s.studentName,
        level: s.level,
        pvpPoints: s.pvpPoints,
        totalPoints: s.totalPoints,
        currentStatus: s.currentStatus,
        aiAttemptsCount: s.aiAttemptsCount,
        aiLastDate: s.aiLastDate?.toISOString() ?? null,
        liveStatus,
      };
    }),
  });
}

async function userHistory(studentId: string) {
  // Last 50 matches where this student is player1 or player2 OR winner.
  const matches = await db.pvpMatch.findMany({
    where: {
      OR: [
        { player1Id: studentId },
        { player2Id: studentId },
        { winnerId: studentId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      player1: { select: { id: true, studentName: true, username: true } },
      player2: { select: { id: true, studentName: true, username: true } },
      winner: { select: { id: true, studentName: true } },
    },
  });

  return ok({
    matches: matches.map((m) => {
      const isP1 = m.player1Id === studentId;
      const opp = isP1 ? m.player2 : m.player1;
      const myScore = isP1 ? m.p1Score : m.p2Score ?? 0;
      const oppScore = isP1 ? m.p2Score ?? 0 : m.p1Score;
      return {
        id: m.id,
        isAiMatch: m.isAiMatch,
        opponentName: m.isAiMatch ? "AI" : (opp?.studentName ?? "—"),
        opponentId: isP1 ? m.player2Id : m.player1Id,
        tier: m.tier,
        status: m.status,
        betAmount: m.betAmount,
        questionCount: m.questionCount,
        myScore,
        oppScore,
        winnerId: m.winnerId,
        isWinner: m.winnerId === studentId,
        createdAt: m.createdAt.toISOString(),
      };
    }),
  });
}

async function gameConfig() {
  const settings = await db.systemSetting.findMany({
    where: {
      key: {
        in: [
          "tier1_q","tier1_time","tier1_win","tier1_loss","tier1_status","tier1_msg",
          "tier2_q","tier2_time","tier2_win","tier2_loss","tier2_status","tier2_msg",
          "tier3_q","tier3_time","tier3_win","tier3_loss","tier3_status","tier3_msg",
          "ai_daily_limit","ai_msg","ai_status",
        ],
      },
    },
  });
  const map = new Map(settings.map((s) => [s.key, s.value]));

  const tier = (n: 1 | 2 | 3) => ({
    q: parseInt(map.get(`tier${n}_q`) ?? String(DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].q)),
    time: parseInt(map.get(`tier${n}_time`) ?? String(DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].time)),
    win: parseInt(map.get(`tier${n}_win`) ?? String(DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].win)),
    loss: parseInt(map.get(`tier${n}_loss`) ?? String(DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].loss)),
    status: map.get(`tier${n}_status`) ?? DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].status,
    msg: map.get(`tier${n}_msg`) ?? DEFAULT_GAME_CONFIG.tiers[`tier${n}` as const].msg,
  });

  return ok({
    tiers: { tier1: tier(1), tier2: tier(2), tier3: tier(3) },
    ai: {
      daily_limit: parseInt(map.get("ai_daily_limit") ?? String(DEFAULT_GAME_CONFIG.ai.daily_limit)),
      msg: map.get("ai_msg") ?? DEFAULT_GAME_CONFIG.ai.msg,
      status: map.get("ai_status") ?? DEFAULT_GAME_CONFIG.ai.status,
    },
  });
}

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------
const tierConfigSchema = z.object({
  q: z.number().int().min(1).max(100),
  time: z.number().int().min(5).max(600),
  win: z.number().int().min(0).max(1000),
  loss: z.number().int().min(0).max(1000),
  status: z.string(),
  msg: z.string().max(500),
});

const saveConfigSchema = z.object({
  action: z.literal("save_game_config"),
  config: z.object({
    tiers: z.object({
      tier1: tierConfigSchema,
      tier2: tierConfigSchema,
      tier3: tierConfigSchema,
    }),
    ai: z.object({
      daily_limit: z.number().int().min(0).max(1000),
      msg: z.string().max(500),
      status: z.string(),
    }),
  }),
});

const quickUpdateSchema = z.object({
  action: z.literal("quick_update"),
  studentId: z.string().min(1),
  pvpPoints: z.number().int().min(0).max(1_000_000).optional(),
  level: z.number().int().min(1).max(10).optional(),
});

const adjustAiSchema = z.object({
  action: z.literal("adjust_ai"),
  studentId: z.string().min(1),
  delta: z.enum(["increment", "decrement", "reset"]),
});

const liveActionSchema = z.object({
  action: z.literal("live_action"),
  matchId: z.string().min(1),
  command: z.enum(["cancel", "force_win_p1", "force_win_p2"]),
});

const wipeSchema = z.object({
  action: z.literal("wipe_history"),
  studentId: z.string().min(1),
});

const deleteHistorySchema = z.object({
  action: z.literal("delete_history_item"),
  matchId: z.string().min(1),
});

const rootSchema = z.discriminatedUnion("action", [
  saveConfigSchema,
  quickUpdateSchema,
  adjustAiSchema,
  liveActionSchema,
  wipeSchema,
  deleteHistorySchema,
]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  switch (args.action) {
    case "save_game_config": {
      const c = args.config;
      const entries: { key: string; value: string }[] = [];
      (["tier1", "tier2", "tier3"] as const).forEach((k) => {
        const t = c.tiers[k];
        entries.push(
          { key: `${k}_q`, value: String(t.q) },
          { key: `${k}_time`, value: String(t.time) },
          { key: `${k}_win`, value: String(t.win) },
          { key: `${k}_loss`, value: String(t.loss) },
          { key: `${k}_status`, value: t.status },
          { key: `${k}_msg`, value: t.msg },
        );
      });
      entries.push(
        { key: "ai_daily_limit", value: String(c.ai.daily_limit) },
        { key: "ai_msg", value: c.ai.msg },
        { key: "ai_status", value: c.ai.status },
      );
      // upsert all entries in a transaction
      await db.$transaction(
        entries.map((e) =>
          db.systemSetting.upsert({
            where: { key: e.key },
            update: { value: e.value },
            create: { key: e.key, value: e.value },
          })
        )
      );
      await audit({ actorId: adminId, action: "save_game_config", meta: { config: c } });
      return ok({ saved: true });
    }

    case "quick_update": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student) return fail("الطالب غير موجود", 404);
      const before = {
        pvpPoints: student.pvpPoints,
        level: student.level,
      };
      const data: Record<string, number> = {};
      if (args.pvpPoints !== undefined) data.pvpPoints = args.pvpPoints;
      if (args.level !== undefined && args.level !== student.level) data.level = args.level;

      // sever cross-level friendships when level changed
      let severed = 0;
      if (args.level !== undefined && args.level !== student.level) {
        const friends = await db.user.findMany({
          where: {
            OR: [
              { friendshipsReceived: { some: { senderId: args.studentId, status: "accepted" } } },
              { friendshipsSent: { some: { receiverId: args.studentId, status: "accepted" } } },
            ],
            level: { not: args.level },
          },
          select: { id: true },
        });
        const friendIds = friends.map((u) => u.id);
        if (friendIds.length) {
          const r1 = await db.friendship.deleteMany({
            where: { senderId: args.studentId, receiverId: { in: friendIds }, status: "accepted" },
          });
          const r2 = await db.friendship.deleteMany({
            where: { receiverId: args.studentId, senderId: { in: friendIds }, status: "accepted" },
          });
          severed = r1.count + r2.count;
        }
      }

      const updated = await db.user.update({
        where: { id: args.studentId },
        data,
        select: { id: true, pvpPoints: true, level: true },
      });
      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "quick_update_arena",
        meta: { before, after: { pvpPoints: updated.pvpPoints, level: updated.level }, severedFriendships: severed },
      });
      return ok({ student: updated, severedFriendships: severed });
    }

    case "adjust_ai": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student) return fail("الطالب غير موجود", 404);
      const before = student.aiAttemptsCount;
      let newCount: number;
      if (args.delta === "reset") newCount = 0;
      else if (args.delta === "increment") newCount = before + 1;
      else newCount = Math.max(0, before - 1);
      await db.user.update({
        where: { id: args.studentId },
        data: { aiAttemptsCount: newCount },
      });
      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "adjust_ai",
        meta: { before, after: newCount, delta: args.delta },
      });
      return ok({ aiAttemptsCount: newCount });
    }

    case "live_action": {
      const match = await db.pvpMatch.findUnique({ where: { id: args.matchId } });
      if (!match) return fail("المباراة غير موجودة", 404);
      if (match.status === "completed" || match.status === "cancelled") {
        return fail("المباراة منتهية بالفعل", 400);
      }

      if (args.command === "cancel") {
        const updated = await db.pvpMatch.update({
          where: { id: args.matchId },
          data: { status: "cancelled", p1Status: "surrendered", p2Status: "surrendered" },
        });
        await db.user.updateMany({
          where: { id: { in: [match.player1Id, match.player2Id ?? ""].filter(Boolean) } },
          data: { currentStatus: "idle" },
        });
        await audit({
          actorId: adminId,
          action: "cancel_match",
          meta: { matchId: args.matchId, before: { status: match.status }, after: { status: updated.status } },
        });
        return ok({ match: { id: updated.id, status: updated.status } });
      }

      // force win
      const winnerId = args.command === "force_win_p1" ? match.player1Id : match.player2Id;
      if (!winnerId) return fail("لا يوجد لاعب ثانٍ", 400);
      const loserId = args.command === "force_win_p1" ? match.player2Id : match.player1Id;

      const [, updated] = await db.$transaction([
        db.user.updateMany({
          where: { id: { in: [match.player1Id, match.player2Id ?? ""].filter(Boolean) } },
          data: { currentStatus: "idle" },
        }),
        db.pvpMatch.update({
          where: { id: args.matchId },
          data: {
            status: "completed",
            winnerId,
            p1Status: match.player1Id === winnerId ? "finished" : "surrendered",
            p2Status: match.player2Id === winnerId ? "finished" : "surrendered",
          },
        }),
      ]);
      await audit({
        actorId: adminId,
        action: "force_win_match",
        meta: { matchId: args.matchId, winnerId, loserId },
      });
      return ok({ match: { id: updated.id, status: updated.status, winnerId } });
    }

    case "wipe_history": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student) return fail("الطالب غير موجود", 404);
      const result = await db.pvpMatch.deleteMany({
        where: { OR: [{ player1Id: args.studentId }, { player2Id: args.studentId }] },
      });
      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "wipe_history",
        meta: { deleted: result.count },
      });
      return ok({ deleted: result.count });
    }

    case "delete_history_item": {
      const before = await db.pvpMatch.findUnique({ where: { id: args.matchId } });
      if (!before) return fail("المباراة غير موجودة", 404);
      await db.pvpMatch.delete({ where: { id: args.matchId } });
      await audit({
        actorId: adminId,
        action: "delete_match",
        meta: { matchId: args.matchId, status: before.status, winnerId: before.winnerId },
      });
      return ok({ deleted: true });
    }
  }
}

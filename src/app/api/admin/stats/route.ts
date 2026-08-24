/**
 * /api/admin/stats
 *   GET  action=overview             — 4 overview cards + 7-day activity + game distribution
 *   GET  action=filtered_table&page=1&game_type=all&q=
 *   GET  action=user_detail&user_id=  — for the per-user drill-down (shows that
 *                                       user's stats + reset-all-trainings trigger)
 *  POST action=delete_training        — delete one training record
 *  POST action=reset_user_trainings   — wipe ALL of a user's trainings
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

const PER_PAGE = 20;

interface ResultItem {
  question?: string;
  userAnswer?: string | number | null;
  correctAnswer?: string | number | null;
  isCorrect?: boolean;
  timeTaken?: number | string;
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const GAME_LABELS_AR: Record<string, string> = {
  addition_subtraction: "الجمع والطرح",
  multiplication: "الضرب",
  division: "القسمة",
  abacus: "الأباكوس",
  ai_match: "AI",
  math_exam_generator: "مولّد الامتحانات",
};

// --------------------------------------------------------------------
// GET
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "overview";

  if (action === "overview") return overview();
  if (action === "filtered_table") return filteredTable(req);
  if (action === "user_detail") return userDetail(url.searchParams.get("user_id") ?? "");
  return fail(`إجراء غير معروف: ${action}`, 404);
}

async function overview() {
  // total trainings + total correct (across all users)
  const trainings = await db.training.findMany({
    select: { gameType: true, resultsJson: true, createdAt: true },
  });

  let totalQuestions = 0;
  let totalCorrect = 0;
  const gameCounts: Record<string, number> = {};
  const perStudent = new Map<string, number>();
  const sevenDaysActivity: { date: string; count: number }[] = [];

  // 7-day bucket from scratch
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayBuckets: Map<string, number> = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const t of trainings) {
    gameCounts[t.gameType] = (gameCounts[t.gameType] ?? 0) + 1;
    const results = safeParse<ResultItem[]>(t.resultsJson, []);
    if (Array.isArray(results)) {
      totalQuestions += results.length;
      totalCorrect += results.filter((r) => r?.isCorrect).length;
    }
    const day = t.createdAt.toISOString().slice(0, 10);
    if (dayBuckets.has(day)) dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);

    // top-student aggregation: we'd need userId; skip per-student here and do a
    // separate query below.
  }

  for (const [date, count] of dayBuckets.entries()) {
    sevenDaysActivity.push({ date, count });
  }

  // Top student by total_points
  const topStudent = await db.user.findFirst({
    where: { role: "student", status: "approved" },
    orderBy: { totalPoints: "desc" },
    select: { id: true, studentName: true, username: true, totalPoints: true },
  });

  // Popular game (max count)
  let popularGame: string | null = null;
  let maxCount = -1;
  for (const [g, c] of Object.entries(gameCounts)) {
    if (c > maxCount) { maxCount = c; popularGame = g; }
  }

  // Build game distribution for the doughnut
  const gameDist = Object.entries(gameCounts)
    .map(([k, v]) => ({ name: GAME_LABELS_AR[k] ?? k, value: v, key: k }))
    .sort((a, b) => b.value - a.value);

  return ok({
    overview: {
      totalTrainings: trainings.length,
      totalCorrect,
      topStudent: topStudent ? {
        id: topStudent.id,
        studentName: topStudent.studentName,
        username: topStudent.username,
        totalPoints: topStudent.totalPoints,
      } : null,
      popularGame: popularGame ? { key: popularGame, label: GAME_LABELS_AR[popularGame] ?? popularGame } : null,
    },
    sevenDaysActivity,
    gameDist,
  });
}

async function filteredTable(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const gameType = url.searchParams.get("game_type") ?? "all";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const userFilter = q ? {
    user: {
      OR: [
        { studentName: { contains: q } },
        { username: { contains: q } },
      ],
    },
  } : {};

  const gameFilter = gameType !== "all" ? { gameType } : {};

  const [total, trainings] = await Promise.all([
    db.training.count({ where: { ...userFilter, ...gameFilter } }),
    db.training.findMany({
      where: { ...userFilter, ...gameFilter },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        user: { select: { id: true, studentName: true, username: true } },
      },
    }),
  ]);

  return ok({
    items: trainings.map((t) => {
      const results = safeParse<ResultItem[]>(t.resultsJson, []);
      const correctCount = Array.isArray(results) ? results.filter((r) => r?.isCorrect).length : 0;
      const questionCount = Array.isArray(results) ? results.length : 0;
      return {
        id: t.id,
        userId: t.user.id,
        studentName: t.user.studentName,
        username: t.user.username,
        gameType: t.gameType,
        gameLabel: GAME_LABELS_AR[t.gameType] ?? t.gameType,
        correctCount,
        questionCount,
        resultsJson: t.resultsJson,
        createdAt: t.createdAt.toISOString(),
      };
    }),
    pagination: {
      page,
      pageSize: PER_PAGE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    },
  });
}

async function userDetail(userId: string) {
  if (!userId) return fail("user_id مطلوب", 400);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, studentName: true, username: true, totalPoints: true, level: true },
  });
  if (!user) return fail("المستخدم غير موجود", 404);

  const trainings = await db.training.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      gameType: true,
      resultsJson: true,
      settingsJson: true,
      totalScore: true,
      averageScore: true,
      createdAt: true,
    },
  });

  const items = trainings.map((t) => {
    const results = safeParse<ResultItem[]>(t.resultsJson, []);
    const correctCount = Array.isArray(results) ? results.filter((r) => r?.isCorrect).length : 0;
    const questionCount = Array.isArray(results) ? results.length : 0;
    return {
      id: t.id,
      gameType: t.gameType,
      gameLabel: GAME_LABELS_AR[t.gameType] ?? t.gameType,
      correctCount,
      questionCount,
      averageScore: t.averageScore,
      createdAt: t.createdAt.toISOString(),
    };
  });

  const totalCount = await db.training.count({ where: { userId } });

  return ok({
    user: {
      id: user.id,
      studentName: user.studentName,
      username: user.username,
      totalPoints: user.totalPoints,
      level: user.level,
    },
    trainings: items,
    totalCount,
  });
}

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------
const deleteTrainingSchema = z.object({
  action: z.literal("delete_training"),
  trainingId: z.string().min(1),
});

const resetUserTrainingsSchema = z.object({
  action: z.literal("reset_user_trainings"),
  userId: z.string().min(1),
});

const rootSchema = z.discriminatedUnion("action", [deleteTrainingSchema, resetUserTrainingsSchema]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  if (args.action === "delete_training") {
    const before = await db.training.findUnique({
      where: { id: args.trainingId },
      select: { id: true, userId: true, gameType: true, createdAt: true },
    });
    if (!before) return fail("التدريب غير موجود", 404);
    await db.training.delete({ where: { id: args.trainingId } });
    await audit({
      actorId: adminId,
      targetUserId: before.userId,
      action: "delete_training",
      meta: { trainingId: before.id, gameType: before.gameType, createdAt: before.createdAt },
    });
    return ok({ deleted: true });
  }

  // reset_user_trainings
  const user = await db.user.findUnique({ where: { id: args.userId }, select: { id: true, username: true } });
  if (!user) return fail("المستخدم غير موجود", 404);
  const result = await db.training.deleteMany({ where: { userId: args.userId } });
  await audit({
    actorId: adminId,
    targetUserId: args.userId,
    action: "reset_user_trainings",
    meta: { username: user.username, deleted: result.count },
  });
  return ok({ deleted: result.count });
}

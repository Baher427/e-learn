/**
 * GET /api/statistics?game_type=all|addition_subtraction|multiplication|division&page=1
 *
 * Returns the student-facing statistics dashboard payload:
 *  - generalStats         (4 headline cards)
 *  - gamePerformance      per-game-type aggregate metrics
 *  - chartData            improvement line + bar comparison + settings doughnut
 *  - bestGame             gameType with the highest avg score (only among played games)
 *  - history              paginated newest-first per-session rows (10/page)
 *  - totalPoints          current user.points snapshot
 *
 * All aggregates are computed server-side from `trainings.resultsJson` /
 * `settingsJson`. Empty / malformed sessions are skipped (matches the
 * legacy `if(!$results) continue;` behaviour of statistics.php).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";

// --------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------

const GAME_TYPES = [
  "addition_subtraction",
  "multiplication",
  "division",
] as const;
type GameType = (typeof GAME_TYPES)[number];

const GAME_LABELS_AR: Record<GameType, string> = {
  addition_subtraction: "الجمع والطرح",
  multiplication: "الضرب",
  division: "القسمة",
};

const NUMBER_LENGTH_LABELS: Record<string, string> = {
  "1": "آحاد",
  "2": "عشرات",
  "3": "مئات",
  "4": "آلاف",
};

const PER_PAGE = 10;

const EMPTY_GAME_PERF = {
  count: 0,
  correct: 0,
  total: 0,
  time: 0,
  avgScore: 0,
  avgTime: 0,
} as const;

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

interface ResultItem {
  question?: string;
  userAnswer?: string | number | null;
  correctAnswer?: string | number | null;
  isCorrect?: boolean;
  timeTaken?: number | string;
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface SessionStats {
  correctCount: number;
  questionCount: number;
  timeSum: number;
  avgTime: number;
  avgScore: number;
}

function computeSessionStats(results: ResultItem[]): SessionStats {
  const questionCount = results.length;
  if (questionCount === 0) {
    return { correctCount: 0, questionCount: 0, timeSum: 0, avgTime: 0, avgScore: 0 };
  }
  let correctCount = 0;
  let timeSum = 0;
  for (const r of results) {
    if (r?.isCorrect) correctCount += 1;
    const raw =
      typeof r?.timeTaken === "string" ? parseFloat(r.timeTaken) : (r?.timeTaken ?? 0);
    const t = Number.isFinite(raw) ? raw : 0;
    timeSum += t;
  }
  const avgTime = timeSum / questionCount;
  const avgScore = (correctCount / questionCount) * 100;
  return { correctCount, questionCount, timeSum, avgTime, avgScore };
}

function settingsLabel(
  gameType: string,
  settings: Record<string, unknown>,
): string {
  if (gameType === "addition_subtraction") {
    const len = String(settings.numberLength ?? "1");
    return `جمع - ${NUMBER_LENGTH_LABELS[len] ?? "غير معروف"}`;
  }
  if (gameType === "multiplication") {
    const l1 = settings.num1Length ?? "?";
    const l2 = settings.num2Length ?? "?";
    return `ضرب ${l1}×${l2}`;
  }
  if (gameType === "division") {
    const l1 = settings.dividendLength ?? "?";
    const l2 = settings.divisorLength ?? "?";
    return `قسمة ${l1}÷${l2}`;
  }
  return "غير معروف";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --------------------------------------------------------------------
// Route
// --------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const rawGameType = url.searchParams.get("game_type") ?? "all";
  const gameTypeFilter: GameType | "all" = (
    GAME_TYPES as readonly string[]
  ).includes(rawGameType)
    ? (rawGameType as GameType)
    : "all";

  const pageParam = Math.max(
    1,
    parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );

  const where = {
    userId: got.session.userId,
    ...(gameTypeFilter !== "all" ? { gameType: gameTypeFilter } : {}),
  };

  // Pull every matching training — we need full JSON for aggregations
  const trainings = await db.training.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      gameType: true,
      settingsJson: true,
      resultsJson: true,
      averageScore: true,
      totalScore: true,
      createdAt: true,
    },
  });

  // ------------------------------------------------------------------
  // 1. Per-session enrichment (skip empties, like legacy `if(!$results) continue;`)
  // ------------------------------------------------------------------
  type EnrichedSession = SessionStats & {
    id: string;
    gameType: GameType;
    createdAt: Date;
    summary: string;
    improvement: number | null;
  };

  const perTypeAccumulator: Record<GameType, { sum: number; count: number }> = {
    addition_subtraction: { sum: 0, count: 0 },
    multiplication: { sum: 0, count: 0 },
    division: { sum: 0, count: 0 },
  };

  const enriched: EnrichedSession[] = [];

  for (const t of trainings) {
    const results = safeParse<ResultItem[]>(t.resultsJson, []);
    if (!Array.isArray(results) || results.length === 0) continue;
    const settings = safeParse<Record<string, unknown>>(t.settingsJson, {});
    const stats = computeSessionStats(results);

    // Improvement vs the avg of previous same-type sessions
    const prev =
      perTypeAccumulator[t.gameType as GameType] ?? { sum: 0, count: 0 };
    let improvement: number | null = null;
    if (prev.count > 0 && prev.sum > 0) {
      const prevAvg = prev.sum / prev.count;
      if (prevAvg > 0) {
        improvement = ((stats.avgScore - prevAvg) / prevAvg) * 100;
      }
    }
    perTypeAccumulator[t.gameType as GameType] = {
      sum: prev.sum + stats.avgScore,
      count: prev.count + 1,
    };

    enriched.push({
      id: t.id,
      gameType: t.gameType as GameType,
      createdAt: t.createdAt,
      summary: settingsLabel(t.gameType, settings),
      ...stats,
      improvement,
    });
  }

  // ------------------------------------------------------------------
  // 2. General stats + per-game performance + chart data + settings dist
  // ------------------------------------------------------------------
  const gamePerformance: Record<
    GameType,
    {
      count: number;
      correct: number;
      total: number;
      time: number;
      avgScore: number;
      avgTime: number;
    }
  > = {
    addition_subtraction: { ...EMPTY_GAME_PERF },
    multiplication: { ...EMPTY_GAME_PERF },
    division: { ...EMPTY_GAME_PERF },
  };

  const settingsCounter: Record<string, number> = {};
  const improvementRows: Array<{
    index: number;
    label: string;
    date: string;
    addition_subtraction: number | null;
    multiplication: number | null;
    division: number | null;
  }> = [];

  let totalQuestions = 0;
  let totalCorrect = 0;
  let totalTime = 0;

  let addSubIdx = 0;
  let multIdx = 0;
  let divIdx = 0;

  for (const s of enriched) {
    totalQuestions += s.questionCount;
    totalCorrect += s.correctCount;
    totalTime += s.timeSum;

    const g = gamePerformance[s.gameType];
    if (g) {
      g.count += 1;
      g.correct += s.correctCount;
      g.total += s.questionCount;
      g.time += s.timeSum;
    }

    settingsCounter[s.summary] = (settingsCounter[s.summary] ?? 0) + 1;

    let label = "";
    if (s.gameType === "addition_subtraction") label = `جمع ${++addSubIdx}`;
    else if (s.gameType === "multiplication") label = `ضرب ${++multIdx}`;
    else if (s.gameType === "division") label = `قسمة ${++divIdx}`;

    improvementRows.push({
      index: improvementRows.length + 1,
      label,
      date: s.createdAt.toISOString(),
      addition_subtraction:
        s.gameType === "addition_subtraction" ? round2(s.avgScore) : null,
      multiplication:
        s.gameType === "multiplication" ? round2(s.avgScore) : null,
      division: s.gameType === "division" ? round2(s.avgScore) : null,
    });
  }

  for (const g of GAME_TYPES) {
    const p = gamePerformance[g];
    p.avgScore = p.total > 0 ? (p.correct / p.total) * 100 : 0;
    p.avgTime = p.total > 0 ? p.time / p.total : 0;
  }

  const totalTrainings = enriched.length;
  const totalAccuracy =
    totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
  const avgTime = totalQuestions > 0 ? totalTime / totalQuestions : 0;

  // Best game (only among games the user actually played)
  let bestGame: GameType | null = null;
  let bestScore = -1;
  for (const g of GAME_TYPES) {
    const p = gamePerformance[g];
    if (p.count > 0 && p.avgScore > bestScore) {
      bestScore = p.avgScore;
      bestGame = g;
    }
  }

  // Bar comparison across the 3 game types (always all 3, even if 0 played)
  const barComparison = GAME_TYPES.map((g) => ({
    gameType: g,
    label: GAME_LABELS_AR[g],
    avgScore: round2(gamePerformance[g].avgScore),
    avgTime: round2(gamePerformance[g].avgTime),
  }));

  // Settings distribution (sorted desc by count)
  const settingsDist = Object.entries(settingsCounter)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // ------------------------------------------------------------------
  // 3. Pagination — newest first, 10/page
  // ------------------------------------------------------------------
  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(pageParam, totalPages);
  const startIdx = (currentPage - 1) * PER_PAGE;
  const reversed = [...enriched].reverse();
  const pageItems = reversed.slice(startIdx, startIdx + PER_PAGE);
  const hasMore = currentPage < totalPages;

  const historyItems = pageItems.map((s) => ({
    id: s.id,
    gameType: s.gameType,
    settingsSummary: s.summary,
    date: s.createdAt.toISOString(),
    correctCount: s.correctCount,
    questionCount: s.questionCount,
    accuracy: round2((s.correctCount / Math.max(1, s.questionCount)) * 100),
    avgTime: round2(s.avgTime),
    improvement: s.improvement === null ? null : round2(s.improvement),
  }));

  // ------------------------------------------------------------------
  // 4. Current user's points snapshot
  // ------------------------------------------------------------------
  const user = await db.user.findUnique({
    where: { id: got.session.userId },
    select: { totalPoints: true },
  });

  return ok({
    generalStats: {
      totalTrainings,
      totalQuestions,
      totalCorrect,
      totalAccuracy: round2(totalAccuracy),
      avgTime: round2(avgTime),
    },
    gamePerformance,
    chartData: {
      improvement: improvementRows,
      barComparison,
      settingsDist,
    },
    bestGame,
    history: {
      items: historyItems,
      hasMore,
      currentPage,
      totalPages,
    },
    totalPoints: user?.totalPoints ?? 0,
  });
}

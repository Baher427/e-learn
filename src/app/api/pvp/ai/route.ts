/**
 * POST /api/pvp/ai
 *
 * Action dispatcher for the AI match flow:
 *   - start_ai_game    : check ai_status, daily limit, generate 50-100 questions
 *                        with a seed, store the answer key in the DB (NOT in
 *                        session — hardening vs legacy). Return only question
 *                        TEXTS to the client + bot speed config + matchId.
 *   - submit_ai_score  : re-derive correctness server-side using the stored
 *                        questions + the seed via scoreAttempt(). NEVER trust
 *                        client-supplied isCorrect or ai_score/user_time.
 *                        The bot's score is computed server-side via
 *                        computeBotScore() (deterministic RNG). Winner =
 *                        user correct > bot correct, OR equal correct AND
 *                        user_time < bot_time. Award 50 on win, 0 otherwise.
 *                        Log to trainings with gameType='ai_match'.
 *
 * Hardening vs the legacy:
 *  - Answer key persisted in the PvpMatch row's questionsJson (DB), not in
 *    PHP $_SESSION.
 *  - Server-authoritative scoring (re-derive via scoreAttempt).
 *  - Bot run is deterministic from the match seed — no client trust.
 *  - Daily-limit check uses transactions + a re-read inside the tx.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody, requireUser } from '@/lib/api'
import {
  MatchConfig,
  QuestionsJsonShape,
  StoredQuestion,
  botSpeedForLevel,
  computeBotScore,
  encodeQuestionsJson,
  todayKey,
} from '@/lib/pvp'
import { loadAiConfigFromDb } from '@/lib/pvp-config'
import { generateBatch, GameSettings, scoreAttempt, AnswerRecord } from '@/lib/game'
import { nanoid } from 'nanoid'
import { z } from 'zod'

// --------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------

const startAiSchema = z.object({ action: z.literal('start_ai_game') })

const submitAiSchema = z.object({
  action: z.literal('submit_ai_score'),
  matchId: z.string().min(1).max(64),
  answers: z
    .array(
      z.object({
        questionIndex: z.number().int().min(0).max(10_000),
        userAnswer: z.union([z.number(), z.string()]),
      })
    )
    .max(200),
  timesMs: z.array(z.number().min(0).max(600_000)).max(200).optional(),
})

const bodySchema = z.union([startAiSchema, submitAiSchema])

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { session } = auth
  if (session.role === 'admin') {
    return fail('لا يمكن للحسابات الإدارية استخدام ساحة المعارك', 403)
  }

  const parsed = await parseBody(req, bodySchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  switch (body.action) {
    case 'start_ai_game':
      return startAiGame(session.userId)
    case 'submit_ai_score':
      return submitAiScore(session.userId, body.matchId, body.answers as AnswerRecord[], body.timesMs)
  }
}

// --------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------

async function startAiGame(userId: string): Promise<NextResponse> {
  // Check AI is enabled
  const aiConfig = await loadAiConfigFromDb()
  if (aiConfig.status !== 1) {
    return fail(aiConfig.msg || 'وضع الذكاء الاصطناعي مغلق حالياً', 403)
  }

  // Check daily limit atomically (re-read inside the tx to avoid the legacy race).
  const today = todayKey()
  const startResult = await db.$transaction(async (tx) => {
    const me = await tx.user.findUnique({
      where: { id: userId },
      select: { aiAttemptsCount: true, aiLastDate: true, currentStatus: true, status: true, level: true },
    })
    if (!me) throw new Error('USER_GONE')
    if (me.status !== 'approved') throw new Error('NOT_APPROVED')
    if (me.currentStatus === 'playing') throw new Error('ALREADY_PLAYING')
    const lastStr = me.aiLastDate ? me.aiLastDate.toISOString().slice(0, 10) : null
    const usedToday = lastStr === today ? me.aiAttemptsCount : 0
    if (usedToday >= aiConfig.dailyLimit) throw new Error('DAILY_LIMIT')

    // Bump the attempt count, set aiLastDate, mark playing
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        aiAttemptsCount: usedToday + 1,
        aiLastDate: new Date(),
        currentStatus: 'playing',
      },
      select: { level: true },
    })
    return { level: me.level ?? updated.level ?? 1 }
  }).catch((err: Error) => {
    if (err.message === 'USER_GONE') return { _error: 'USER_GONE' } as const
    if (err.message === 'NOT_APPROVED') return { _error: 'NOT_APPROVED' } as const
    if (err.message === 'ALREADY_PLAYING') return { _error: 'ALREADY_PLAYING' } as const
    if (err.message === 'DAILY_LIMIT') return { _error: 'DAILY_LIMIT' } as const
    throw err
  })

  if ('_error' in startResult) {
    const reason =
      startResult._error === 'DAILY_LIMIT' ? 'استكملت حدّك اليومي من مباريات الذكاء الاصطناعي' :
      startResult._error === 'NOT_APPROVED' ? 'حسابك غير مفعّل' :
      startResult._error === 'ALREADY_PLAYING' ? 'أنت مشغول في مباراة الآن' :
      'المستخدم غير موجود'
    return fail(reason, 400)
  }

  const level = startResult.level

  // Generate 50-100 questions — scale by level for some variety.
  const questionCount = Math.min(100, 50 + Math.floor(level / 2) * 10)
  const seed = nanoid(16)
  const numberLength = Math.min(4, Math.max(1, Math.ceil(level / 2)))
  const gameSettings: GameSettings = {
    type: 'addition_subtraction',
    numberLength,
    termsCount: 3,
    displayTime: 1.5,
    disappearTime: 0.5,
    displayMethod: 'sequential',
    seed,
  }
  const questions = generateBatch(gameSettings, questionCount)
  const stored: StoredQuestion[] = questions.map((q, i) => ({
    i,
    q: q.text,
    a: q.answer,
    terms: q.terms,
  }))

  const [botMin, botMax] = botSpeedForLevel(level)
  const config: MatchConfig = {
    tier: 1,
    durationSec: 7 * 60,
    winPoints: 50,
    lossPoints: 0,
    botMin,
    botMax,
    gameType: 'addition_subtraction',
    settings: gameSettings as unknown as Record<string, unknown>,
  }

  const questionsJson = encodeQuestionsJson({
    questions: stored,
    config,
    seed,
  } as QuestionsJsonShape)

  // Persist the AI match (no opponent; both player slots = the user).
  // player2Id null; isAiMatch=true; status=active so the arena can fetch it
  // via `check_incoming`.
  const match = await db.pvpMatch.create({
    data: {
      player1Id: userId,
      player2Id: null,
      betAmount: 0,
      questionCount,
      questionsJson,
      status: 'active',
      p1Status: 'playing',
      p2Status: 'playing', // bot is "playing" too
      tier: 1,
      isAiMatch: true,
    },
    select: { id: true },
  })

  // Public questions: strip answers.
  const publicQuestions = stored.map((q) => ({
    i: q.i,
    q: q.q,
    terms: q.terms,
  }))

  return ok({
    matchId: match.id,
    questions: publicQuestions,
    questionCount,
    botConfig: { min: botMin, max: botMax },
    levelUsed: level,
    gameConfig: {
      mode: 'AI',
      durationSec: config.durationSec,
      winPoints: config.winPoints,
      lossPoints: config.lossPoints,
    },
  })
}

async function submitAiScore(
  userId: string,
  matchId: string,
  answers: AnswerRecord[],
  timesMs?: number[]
): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      isAiMatch: true,
      status: true,
      questionsJson: true,
      betAmount: true,
    },
  })
  if (!match) return fail('المباراة غير موجودة', 404)
  // Ownership check (RLS-like)
  if (match.player1Id !== userId) {
    return fail('لا تملك صلاحية تسليم هذه المباراة', 403)
  }
  if (!match.isAiMatch) {
    return fail('هذه ليست مباراة ضد الذكاء الاصطناعي', 400)
  }
  if (match.status !== 'active') {
    return fail('المباراة ليست نشطة', 400)
  }

  // Parse the stored questions + config
  let shape: QuestionsJsonShape
  try {
    shape = JSON.parse(match.questionsJson) as QuestionsJsonShape
  } catch {
    return fail('بيانات المباراة تالفة', 500)
  }
  const { questions, config, seed } = shape

  // Re-derive the user's correctness server-side via scoreAttempt()
  const settings: GameSettings = (config.settings as unknown as GameSettings) ?? {
    type: 'addition_subtraction',
    numberLength: 1,
    termsCount: 2,
    displayTime: 1.5,
    disappearTime: 0.5,
    displayMethod: 'sequential',
    seed,
  }
  const userScoring = scoreAttempt({
    settings: { ...settings, seed },
    seed,
    answers,
    timesMs,
  })

  // Compute the bot's run server-side (deterministic from the seed)
  const botMin = config.botMin ?? 1500
  const botMax = config.botMax ?? 3000
  const botRun = computeBotScore({
    seed,
    questions,
    botMin,
    botMax,
  })

  // Winner logic (server-authoritative):
  //   user wins if user_correct > bot_correct,
  //   or (user_correct == bot_correct AND user_time < bot_time).
  let userWon: boolean
  let winReason: string
  if (userScoring.correctCount > botRun.correct) {
    userWon = true
    winReason = 'صحيح أكثر'
  } else if (userScoring.correctCount < botRun.correct) {
    userWon = false
    winReason = 'أخطأ أكثر'
  } else {
    if (userScoring.totalTimeMs < botRun.totalTimeMs) {
      userWon = true
      winReason = 'أسرع زمناً'
    } else {
      userWon = false
      winReason = 'أبطأ زمناً'
    }
  }

  const pointsAwarded = userWon ? config.winPoints : 0

  // ---- Persist: mark match completed, bump user points, log to trainings ----
  await db.$transaction(async (tx) => {
    await tx.pvpMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        winnerId: userWon ? userId : null,
        p1Score: userScoring.correctCount,
        p2Score: botRun.correct,
        p1Progress: answers.length,
        p2Progress: questions.length,
        p1Status: 'finished',
        p2Status: 'finished',
        updatedAt: new Date(),
      },
    })
    await tx.user.update({
      where: { id: userId },
      data: {
        pvpPoints: { increment: pointsAwarded },
        currentStatus: 'idle',
      },
    })
    // Audit log in trainings table
    await tx.training.create({
      data: {
        userId,
        gameType: 'ai_match',
        settingsJson: JSON.stringify({ ...settings, seed, botMin, botMax }),
        resultsJson: JSON.stringify({
          rows: userScoring.results,
          correctCount: userScoring.correctCount,
          totalCount: userScoring.totalCount,
          averageScore: userScoring.averageScore,
          totalTimeMs: userScoring.totalTimeMs,
          botCorrect: botRun.correct,
          botTotalTimeMs: botRun.totalTimeMs,
          botPerQuestion: botRun.perQuestion,
          winReason,
        }),
        totalScore: pointsAwarded,
        averageScore: userScoring.averageScore,
        performanceNotes: userWon ? 'win' : 'loss',
        seed,
      },
    })
  })

  return ok({
    status: userWon ? 'win' : 'loss',
    myScore: userScoring.correctCount,
    myWrong: userScoring.totalCount - userScoring.correctCount,
    myTimeMs: userScoring.totalTimeMs,
    oppScore: botRun.correct,
    oppTimeMs: botRun.totalTimeMs,
    pointsAwarded,
    winReason,
    resultStatus: userWon ? 'win' : 'loss',
  })
}

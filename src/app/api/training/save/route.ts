import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody, requireUser } from '@/lib/api'
import {
  anySettingsSchema,
  scoreAttempt,
  GameSettings,
  AnswerRecord,
} from '@/lib/game'
import { z } from 'zod'

// --------------------------------------------------------------------
// POST /api/training/save
// Server-authoritative save:
//  - Re-derives the correct answers from (settings, seed) via scoreAttempt
//  - Never trusts client-supplied isCorrect
//  - Persists a Training row + atomically bumps users.totalPoints
// --------------------------------------------------------------------

const ANSWER_SCHEMA = z.object({
  questionIndex: z.number().int().min(0),
  userAnswer: z.union([z.number(), z.string()]),
})

const bodySchema = z.object({
  gameType: z.enum(['addition_subtraction', 'multiplication', 'division']),
  settings: anySettingsSchema,
  seed: z.string().min(8).max(128),
  answers: z.array(ANSWER_SCHEMA).min(0).max(1000),
  timesMs: z.array(z.number().min(0).max(60_000)).optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireUser()
  if ('error' in auth) return auth.error
  const { session } = auth
  // Only students (not admins) should write training rows
  if (session.role === 'admin') {
    return fail('لا يمكن للحسابات الإدارية حفظ نتائج تدريب', 403)
  }

  const parsed = await parseBody(req, bodySchema)
  if ('error' in parsed) return parsed.error

  const { gameType, settings, seed, answers, timesMs } = parsed.data

  // Type-safety: the discriminated union's "type" must match the body's gameType
  if (settings.type !== gameType) {
    return fail('عدم تطابق بين نوع اللعبة والإعدادات', 422)
  }

  // Server-side scoring — re-derive correctness from the seed (NEVER trust client)
  const scoring = scoreAttempt({
    settings: { ...settings, seed } as GameSettings,
    seed,
    answers: answers as AnswerRecord[],
    timesMs,
  })

  const pointsAwarded = scoring.correctCount // 1 point per correct answer

  // Insert training row + bump user totalPoints atomically
  const training = await db.$transaction(async (tx) => {
    const row = await tx.training.create({
      data: {
        userId: session.userId,
        gameType,
        settingsJson: JSON.stringify({ ...settings, seed }),
        resultsJson: JSON.stringify({
          rows: scoring.results,
          correctCount: scoring.correctCount,
          totalCount: scoring.totalCount,
          averageScore: scoring.averageScore,
          totalTimeMs: scoring.totalTimeMs,
        }),
        totalScore: scoring.correctCount,
        averageScore: scoring.averageScore,
        performanceNotes: buildPerfNotes(scoring),
        seed,
      },
    })

    // Atomic increment of user's points
    await tx.user.update({
      where: { id: session.userId },
      data: {
        totalPoints: { increment: pointsAwarded },
        lastActivity: new Date(),
      },
    })

    return row
  })

  return ok({
    trainingId: training.id,
    pointsAwarded,
    correctCount: scoring.correctCount,
    totalCount: scoring.totalCount,
    averageScore: scoring.averageScore,
  })
}

function buildPerfNotes(s: {
  correctCount: number
  totalCount: number
  averageScore: number
  totalTimeMs: number
  results: { timeTaken?: number }[]
}): string {
  const avgTimeSec = s.totalCount ? s.totalTimeMs / 1000 / s.totalCount : 0
  const slowest = Math.max(
    0,
    ...s.results.map((r) => (typeof r.timeTaken === 'number' ? r.timeTaken : 0))
  )
  return `صحيح: ${s.correctCount}/${s.totalCount} (${s.averageScore.toFixed(1)}%) · متوسط زمن: ${avgTimeSec.toFixed(2)}ث · أبطأ سؤال: ${slowest.toFixed(2)}ث`
}

// GET not supported — this is a write-only endpoint
export async function GET(): Promise<NextResponse> {
  return fail('Method Not Allowed', 405)
}

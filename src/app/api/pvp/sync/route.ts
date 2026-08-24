/**
 * POST /api/pvp/sync
 *
 * Real-time PVP match sync (used as a REST fallback when socket.io isn't
 * connected; the client also emits `submit_score` over the websocket for
 * low-latency updates).
 *
 *   - game_sync       : returns { status, myScore, oppScore, oppWrong,
 *                            opponentFinished, ...result }.
 *                        If both players finished and status isn't 'completed'
 *                        yet, run finishGameLogic server-side.
 *   - submit_score    : update the caller's column on the match row. Uses
 *                        EXPLICIT column selection (no string interpolation —
 *                        hardening vs the legacy SQL-injection pattern).
 *   - surrender_game  : if active → winner = opponent, award pot, mark
 *                        completed, set both idle.
 *
 * Hardening vs the legacy:
 *  - RLS-like check: every mutation verifies the caller is player1 or player2.
 *  - Server-authoritative: the server reads the stored `config` block to
 *    determine the win/loss pot, never trusting the client.
 *  - Atomic finish via transaction.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody, requireUser } from '@/lib/api'
import { QuestionsJsonShape } from '@/lib/pvp'
import { z } from 'zod'

// --------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------

const gameSyncSchema = z.object({
  action: z.literal('game_sync'),
  matchId: z.string().min(1).max(64),
})

const submitScoreSchema = z.object({
  action: z.literal('submit_score'),
  matchId: z.string().min(1).max(64),
  score: z.number().int().min(0).max(10_000),
  progress: z.number().int().min(0).max(10_000),
  finished: z.boolean(),
})

const surrenderSchema = z.object({
  action: z.literal('surrender_game'),
  matchId: z.string().min(1).max(64),
})

const bodySchema = z.union([gameSyncSchema, submitScoreSchema, surrenderSchema])

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

  // Refresh lastActivity
  await db.user.update({
    where: { id: session.userId },
    data: { lastActivity: new Date() },
  })

  switch (body.action) {
    case 'game_sync':
      return gameSync(session.userId, body.matchId)
    case 'submit_score':
      return submitScore(session.userId, body.matchId, body.score, body.progress, body.finished)
    case 'surrender_game':
      return surrenderGame(session.userId, body.matchId)
  }
}

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

function parseConfig(questionsJson: string): { winPoints: number; lossPoints: number; tier: number } {
  try {
    const shape = JSON.parse(questionsJson) as QuestionsJsonShape
    const c = shape.config
    return {
      winPoints: c?.winPoints ?? 0,
      lossPoints: c?.lossPoints ?? 0,
      tier: c?.tier ?? 1,
    }
  } catch {
    return { winPoints: 0, lossPoints: 0, tier: 1 }
  }
}

interface MatchRow {
  id: string
  player1Id: string
  player2Id: string | null
  betAmount: number
  status: string
  p1Score: number
  p2Score: number
  p1Progress: number
  p2Progress: number
  p1Status: string
  p2Status: string
  winnerId: string | null
  questionsJson: string
  createdAt: Date
}

async function runFinishLogic(match: MatchRow): Promise<{ winnerId: string | null; pot: number }> {
  const { winPoints, lossPoints } = parseConfig(match.questionsJson)
  // Winner = higher score; tie = null (draw).
  let winnerId: string | null
  if (match.p1Score > match.p2Score) winnerId = match.player1Id
  else if (match.p2Score > match.p1Score) winnerId = match.player2Id ?? null
  else winnerId = null

  const pot = winPoints + lossPoints // both sides each wagered `lossPoints`

  await db.$transaction(async (tx) => {
    if (winnerId) {
      // Award the pot to the winner
      await tx.user.update({
        where: { id: winnerId },
        data: {
          pvpPoints: { increment: pot },
          currentStatus: 'idle',
        },
      })
    } else {
      // Draw: refund each player's `lossPoints`
      await tx.user.update({
        where: { id: match.player1Id },
        data: { pvpPoints: { increment: lossPoints }, currentStatus: 'idle' },
      })
      if (match.player2Id) {
        await tx.user.update({
          where: { id: match.player2Id },
          data: { pvpPoints: { increment: lossPoints }, currentStatus: 'idle' },
        })
      }
    }
    await tx.pvpMatch.update({
      where: { id: match.id },
      data: {
        status: 'completed',
        winnerId,
        updatedAt: new Date(),
      },
    })
  })
  return { winnerId, pot }
}

// --------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------

async function gameSync(userId: string, matchId: string): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      betAmount: true,
      status: true,
      p1Score: true,
      p2Score: true,
      p1Progress: true,
      p2Progress: true,
      p1Status: true,
      p2Status: true,
      winnerId: true,
      questionsJson: true,
      createdAt: true,
    },
  }) as MatchRow | null

  if (!match) return fail('المباراة غير موجودة', 404)
  if (match.player1Id !== userId && match.player2Id !== userId) {
    return fail('لا تملك صلاحية الوصول لهذه المباراة', 403)
  }

  const iAmP1 = match.player1Id === userId
  const myScore = iAmP1 ? match.p1Score : match.p2Score
  const oppScore = iAmP1 ? match.p2Score : match.p1Score
  const oppProgress = iAmP1 ? match.p2Progress : match.p1Progress
  const oppFinished = (iAmP1 ? match.p2Status : match.p1Status) === 'finished'
  const iFinished = (iAmP1 ? match.p1Status : match.p2Status) === 'finished'

  // If both finished but the match isn't completed yet, run finish logic now.
  if (
    match.status === 'active' &&
    match.p1Status === 'finished' &&
    match.p2Status === 'finished'
  ) {
    const result = await runFinishLogic(match)
    return ok({
      status: 'completed',
      check_result: {
        winnerId: result.winnerId,
        pot: result.pot,
        myScore,
        oppScore,
      },
    })
  }

  // If the match is already completed (e.g. opponent surrendered), return that.
  if (match.status === 'completed' || match.status === 'cancelled' || match.status === 'rejected') {
    return ok({
      status: match.status === 'completed' ? 'completed' : match.status === 'cancelled' ? 'ended' : 'ended',
      winnerId: match.winnerId,
      myScore,
      oppScore,
      oppProgress,
      opponentFinished: oppFinished,
      iFinished,
    })
  }

  return ok({
    status: 'playing',
    myScore,
    oppScore,
    oppProgress,
    opponentFinished: oppFinished,
    iFinished,
  })
}

async function submitScore(
  userId: string,
  matchId: string,
  score: number,
  progress: number,
  finished: boolean
): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      status: true,
      p1Status: true,
      p2Status: true,
      p1Score: true,
      p2Score: true,
      p1Progress: true,
      p2Progress: true,
      questionsJson: true,
      createdAt: true,
      betAmount: true,
    },
  }) as MatchRow | null

  if (!match) return fail('المباراة غير موجودة', 404)
  if (match.player1Id !== userId && match.player2Id !== userId) {
    return fail('لا تملك صلاحية الكتابة على هذه المباراة', 403)
  }
  if (match.status !== 'active' && match.status !== 'completed') {
    return fail('المباراة ليست نشطة', 400)
  }

  // EXPLICIT column selection — no string interpolation. Hardening vs legacy.
  const iAmP1 = match.player1Id === userId
  const newStatus = finished ? 'finished' : 'playing'
  const updated = await db.pvpMatch.update({
    where: { id: matchId },
    data: iAmP1
      ? {
          p1Score: score,
          p1Progress: progress,
          p1Status: newStatus,
          updatedAt: new Date(),
        }
      : {
          p2Score: score,
          p2Progress: progress,
          p2Status: newStatus,
          updatedAt: new Date(),
        },
    select: {
      id: true,
      p1Score: true,
      p2Score: true,
      p1Progress: true,
      p2Progress: true,
      p1Status: true,
      p2Status: true,
      status: true,
      player1Id: true,
      player2Id: true,
      questionsJson: true,
      betAmount: true,
      createdAt: true,
      winnerId: true,
    },
  }) as unknown as MatchRow

  // If both finished now, run finish logic and return check_result
  if (
    updated.status === 'active' &&
    updated.p1Status === 'finished' &&
    updated.p2Status === 'finished'
  ) {
    const result = await runFinishLogic(updated)
    return ok({
      status: 'completed',
      check_result: {
        winnerId: result.winnerId,
        pot: result.pot,
        myScore: iAmP1 ? updated.p1Score : updated.p2Score,
        oppScore: iAmP1 ? updated.p2Score : updated.p1Score,
      },
    })
  }

  return ok({ status: 'success' })
}

async function surrenderGame(userId: string, matchId: string): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      betAmount: true,
      status: true,
      questionsJson: true,
      winnerId: true,
      createdAt: true,
      p1Status: true,
      p2Status: true,
      p1Score: true,
      p2Score: true,
      p1Progress: true,
      p2Progress: true,
    },
  }) as MatchRow | null

  if (!match) return fail('المباراة غير موجودة', 404)
  if (match.player1Id !== userId && match.player2Id !== userId) {
    return fail('لا تملك صلاحية الاستسلام في هذه المباراة', 403)
  }
  if (match.status !== 'active') {
    return fail('المباراة ليست نشطة', 400)
  }

  const { winPoints, lossPoints } = parseConfig(match.questionsJson)
  const winnerId = match.player1Id === userId ? match.player2Id : match.player1Id
  const pot = winPoints + lossPoints

  await db.$transaction(async (tx) => {
    await tx.pvpMatch.update({
      where: { id: matchId },
      data: {
        status: 'completed',
        winnerId: winnerId ?? null,
        updatedAt: new Date(),
      },
    })
    if (winnerId) {
      await tx.user.update({
        where: { id: winnerId },
        data: {
          pvpPoints: { increment: pot },
          currentStatus: 'idle',
        },
      })
    }
    // Surrendering player: mark idle (no refund — they forfeited their stake)
    await tx.user.update({
      where: { id: userId },
      data: { currentStatus: 'idle' },
    })
    // Other player (in case winnerId is null because both null): mark idle too
    const otherId = match.player1Id === userId ? match.player2Id : match.player1Id
    if (otherId && otherId !== winnerId) {
      await tx.user.update({
        where: { id: otherId },
        data: { currentStatus: 'idle' },
      })
    }
  })

  return ok({
    status: 'surrendered',
    winnerId,
    myScore: match.player1Id === userId ? match.p1Score : match.p2Score,
    oppScore: match.player1Id === userId ? match.p2Score : match.p1Score,
  })
}

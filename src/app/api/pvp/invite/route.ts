/**
 * POST /api/pvp/invite
 *
 * Action dispatcher for the invite flow:
 *   - send_invite        : create a PvpMatch(status=pending), deduct bet from sender,
 *                          emit `invite_received` to the target via socket.io.
 *   - check_match_status: returns the current status (pending/active/completed/
 *                          rejected/cancelled). If pending > 30s, refund + cancel
 *                          (legacy used 30s; stuck-match cron uses 60s — we keep
 *                          the per-call 30s timeout here so the lobby experience
 *                          is responsive without waiting for the 30s cron sweep).
 *   - check_incoming     : returns any incoming invite (where I'm player2 and the
 *                          match is pending) + any active game I'm a participant
 *                          in. **CRITICAL: returns question TEXTS only — never
 *                          the answer key.**
 *   - respond_invite     : accept → verify invitee balance, deduct, set status=active,
 *                          set both users currentStatus=playing, refresh createdAt.
 *                          reject → refund sender, set status=rejected.
 *
 * Hardening vs the legacy:
 *  - Race-safe: respond_invite uses a transaction with a re-check of the
 *    invitee's balance.
 *  - Answer key NEVER sent to the client (check_incoming strips the `a`).
 *  - Participant check on every mutation.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody, requireUser } from '@/lib/api'
import {
  MatchConfig,
  PublicQuestion,
  QuestionsJsonShape,
  StoredQuestion,
  TierId,
  encodeQuestionsJson,
  loadTiersFromDb,
} from '@/lib/pvp'
import { generateBatch, GameSettings } from '@/lib/game'
import { nanoid } from 'nanoid'
import { z } from 'zod'

// --------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------

const sendInviteSchema = z.object({
  action: z.literal('send_invite'),
  targetId: z.string().min(1).max(64),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

const checkMatchStatusSchema = z.object({
  action: z.literal('check_match_status'),
  matchId: z.string().min(1).max(64),
})

const checkIncomingSchema = z.object({
  action: z.literal('check_incoming'),
})

const respondInviteSchema = z.object({
  action: z.literal('respond_invite'),
  matchId: z.string().min(1).max(64),
  response: z.enum(['accept', 'reject']),
})

const bodySchema = z.union([
  sendInviteSchema,
  checkMatchStatusSchema,
  checkIncomingSchema,
  respondInviteSchema,
])

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

  // Refresh the user's lastActivity on every call (matches legacy).
  await db.user.update({
    where: { id: session.userId },
    data: { lastActivity: new Date() },
  })

  switch (body.action) {
    case 'send_invite':
      return sendInvite(session.userId, body.targetId, body.tier)
    case 'check_match_status':
      return checkMatchStatus(session.userId, body.matchId)
    case 'check_incoming':
      return checkIncoming(session.userId)
    case 'respond_invite':
      return respondInvite(session.userId, body.matchId, body.response)
  }
}

// --------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------

async function sendInvite(
  senderId: string,
  targetId: string,
  tierId: TierId
): Promise<NextResponse> {
  if (senderId === targetId) return fail('لا يمكنك تحدّي نفسك', 400)

  const tiers = await loadTiersFromDb()
  const tier = tiers[tierId]
  if (!tier) return fail('فئة غير صالحة', 400)
  if (tier.status !== 1) {
    return fail(tier.msg || 'هذه الفئة مغلقة حالياً', 400)
  }

  // Verify the target exists + is approved + idle
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, role: true, currentStatus: true, level: true },
  })
  if (!target) return fail('المستخدم غير موجود', 404)
  if (target.role !== 'student' || target.status !== 'approved') {
    return fail('هذا المستخدم غير متاح للتحدي', 400)
  }
  if (target.currentStatus === 'playing') {
    return fail('هذا المستخدم مشغول في مباراة الآن', 400)
  }

  // Verify sender has enough pvpPoints and is idle
  const sender = await db.user.findUnique({
    where: { id: senderId },
    select: { pvpPoints: true, currentStatus: true, level: true, status: true },
  })
  if (!sender) return fail('المستخدم غير موجود', 404)
  if (sender.status !== 'approved') return fail('حسابك غير مفعّل', 403)
  if (sender.currentStatus === 'playing') {
    return fail('أنت مشغول في مباراة بالفعل', 400)
  }
  if (sender.pvpPoints < tier.loss) {
    return fail(`نقاطك غير كافية. تحتاج ${tier.loss} نقطة على الأقل`, 400)
  }

  // Block if either party already has an active/pending match with the other
  const existingActive = await db.pvpMatch.findFirst({
    where: {
      status: { in: ['pending', 'active'] },
      OR: [
        { player1Id: senderId, player2Id: targetId },
        { player1Id: targetId, player2Id: senderId },
      ],
    },
  })
  if (existingActive) return fail('يوجد تحدٍ قائم بينكما بالفعل', 400)

  // Block if the sender already has a pending outgoing invite to anyone
  const myPending = await db.pvpMatch.findFirst({
    where: { player1Id: senderId, status: 'pending' },
  })
  if (myPending) return fail('لديك دعوة معلّقة بالفعل، انتظر الرد أو ألغها', 400)

  // Generate the question batch
  const seed = nanoid(16)
  // PVP matches use a basic add/sub batch sized by the sender's level.
  const numberLength = Math.min(4, Math.max(1, Math.ceil((sender.level || 1) / 2)))
  const gameSettings: GameSettings = {
    type: 'addition_subtraction',
    numberLength,
    termsCount: 3,
    displayTime: 1.5,
    disappearTime: 0.5,
    displayMethod: 'sequential',
    seed,
  }
  const questions = generateBatch(gameSettings, tier.q)
  const stored: StoredQuestion[] = questions.map((q, i) => ({
    i,
    q: q.text,
    a: q.answer,
    terms: q.terms,
  }))

  const config: MatchConfig = {
    tier: tierId,
    durationSec: Math.round(tier.time * 60),
    winPoints: tier.win,
    lossPoints: tier.loss,
    settings: gameSettings as unknown as Record<string, unknown>,
  }

  const questionsJson = encodeQuestionsJson({
    questions: stored,
    config,
    seed,
  } as QuestionsJsonShape)

  // BEGIN transaction: deduct bet + insert match
  type TxResult = { id: string } | { _error: string }
  const match = await db.$transaction(async (tx): Promise<TxResult> => {
    const fresh = await tx.user.findUnique({
      where: { id: senderId },
      select: { pvpPoints: true, currentStatus: true },
    })
    if (!fresh) throw new Error('USER_GONE')
    if (fresh.currentStatus === 'playing') throw new Error('ALREADY_PLAYING')
    if (fresh.pvpPoints < tier.loss) throw new Error('INSUFFICIENT')

    await tx.user.update({
      where: { id: senderId },
      data: { pvpPoints: { decrement: tier.loss } },
    })

    const created = await tx.pvpMatch.create({
      data: {
        player1Id: senderId,
        player2Id: targetId,
        betAmount: tier.loss,
        questionCount: tier.q,
        questionsJson,
        status: 'pending',
        p1Status: 'playing',
        p2Status: 'waiting',
        tier: tierId,
        isAiMatch: false,
      },
      select: { id: true },
    })
    return { id: created.id }
  }).catch((err: Error) => {
    if (err.message === 'ALREADY_PLAYING') return { _error: 'ALREADY_PLAYING' } as const
    if (err.message === 'INSUFFICIENT') return { _error: 'INSUFFICIENT' } as const
    if (err.message === 'USER_GONE') return { _error: 'USER_GONE' } as const
    throw err
  })

  if ('_error' in match) {
    if (match._error === 'ALREADY_PLAYING') return fail('أنت مشغول في مباراة الآن', 400)
    if (match._error === 'INSUFFICIENT') return fail('نقاطك غير كافية', 400)
    return fail('المستخدم غير موجود', 404)
  }

  // The socket.io relay is handled client-side (the inviter emits `send_invite`
  // to the mini-service; we keep the DB as the source of truth here).
  return ok({
    matchId: match.id,
    tier: tierId,
    bet: tier.loss,
    opponentId: targetId,
  })
}

async function checkMatchStatus(
  userId: string,
  matchId: string
): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      status: true,
      createdAt: true,
      winnerId: true,
      tier: true,
      betAmount: true,
    },
  })
  if (!match) return fail('المباراة غير موجودة', 404)

  // Participant check
  if (match.player1Id !== userId && match.player2Id !== userId) {
    return fail('لا تملك صلاحية الوصول لهذه المباراة', 403)
  }

  // If pending and older than 30s, refund + cancel (legacy lobby timeout)
  if (match.status === 'pending') {
    const ageMs = Date.now() - match.createdAt.getTime()
    if (ageMs > 30_000) {
      await db.$transaction(async (tx) => {
        await tx.pvpMatch.update({
          where: { id: matchId },
          data: { status: 'cancelled', updatedAt: new Date() },
        })
        await tx.user.update({
          where: { id: match.player1Id },
          data: {
            pvpPoints: { increment: match.betAmount },
            currentStatus: 'idle',
          },
        })
      })
      return ok({ status: 'timeout' })
    }
  }

  // Map DB statuses to the legacy vocabulary
  const status =
    match.status === 'pending' ? 'waiting' :
    match.status === 'active' ? 'accepted' :
    match.status === 'completed' ? 'completed' :
    match.status === 'rejected' ? 'rejected' :
    match.status === 'cancelled' ? 'timeout' :
    'waiting'

  return ok({
    status,
    winnerId: match.winnerId,
    tier: match.tier,
  })
}

async function checkIncoming(userId: string): Promise<NextResponse> {
  // 1) Incoming invite: a pending match where I am player2.
  const incoming = await db.pvpMatch.findFirst({
    where: {
      player2Id: userId,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
    include: {
      player1: { select: { id: true, studentName: true, username: true, level: true, pvpPoints: true } },
    },
  })

  // 2) Active game: a match where I'm a participant and status is active
  const active = await db.pvpMatch.findFirst({
    where: {
      status: 'active',
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      status: true,
      questionCount: true,
      tier: true,
      isAiMatch: true,
      p1Score: true,
      p2Score: true,
      p1Progress: true,
      p2Progress: true,
      p1Status: true,
      p2Status: true,
      questionsJson: true,
    },
  })

  let activeGame: {
    id: string
    isAi: boolean
    questionCount: number
    tier: number
    questions: PublicQuestion[]
  } | null = null

  if (active) {
    // Parse questionsJson server-side, strip answers, return only public fields.
    try {
      const shape = JSON.parse(active.questionsJson) as QuestionsJsonShape
      const questions: PublicQuestion[] = (shape.questions || []).map((q) => ({
        i: q.i,
        q: q.q,
        terms: q.terms,
      }))
      activeGame = {
        id: active.id,
        isAi: active.isAiMatch,
        questionCount: active.questionCount,
        tier: active.tier,
        questions,
      }
    } catch {
      activeGame = null
    }
  }

  return ok({
    invite: incoming
      ? {
          matchId: incoming.id,
          fromUserId: incoming.player1.id,
          fromUserName: incoming.player1.studentName,
          fromUserUsername: incoming.player1.username,
          fromUserLevel: incoming.player1.level,
          fromUserPoints: incoming.player1.pvpPoints,
          tier: incoming.tier,
          bet: incoming.betAmount,
          createdAt: incoming.createdAt.toISOString(),
        }
      : null,
    activeGame,
  })
}

async function respondInvite(
  userId: string,
  matchId: string,
  response: 'accept' | 'reject'
): Promise<NextResponse> {
  const match = await db.pvpMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      betAmount: true,
      status: true,
      p1Status: true,
      p2Status: true,
      createdAt: true,
    },
  })
  if (!match) return fail('المباراة غير موجودة', 404)
  // The invitee (the one responding) is player2.
  if (match.player2Id !== userId) {
    return fail('لا تملك صلاحية الرد على هذه الدعوة', 403)
  }
  if (match.status !== 'pending') {
    return fail('تم الرد على هذه الدعوة بالفعل', 400)
  }

  // ---- Reject: refund sender + mark rejected ----
  if (response === 'reject') {
    await db.$transaction(async (tx) => {
      await tx.pvpMatch.update({
        where: { id: matchId },
        data: { status: 'rejected', p2Status: 'waiting', updatedAt: new Date() },
      })
      await tx.user.update({
        where: { id: match.player1Id },
        data: {
          pvpPoints: { increment: match.betAmount },
          currentStatus: 'idle',
        },
      })
      await tx.user.update({
        where: { id: userId },
        data: { currentStatus: 'idle' },
      })
    })
    return ok({ status: 'rejected' })
  }

  // ---- Accept: verify invitee balance, deduct, set active, both playing ----
  type TxResult = { id: string } | { _error: string }
  const outcome = await db.$transaction(async (tx): Promise<TxResult> => {
    const me = await tx.user.findUnique({
      where: { id: userId },
      select: { pvpPoints: true, currentStatus: true, status: true },
    })
    if (!me) throw new Error('USER_GONE')
    if (me.status !== 'approved') throw new Error('NOT_APPROVED')
    if (me.currentStatus === 'playing') throw new Error('ALREADY_PLAYING')
    if (me.pvpPoints < match.betAmount) throw new Error('INSUFFICIENT')

    // Re-fetch the match inside the tx to make sure it's still pending
    const fresh = await tx.pvpMatch.findUnique({ where: { id: matchId }, select: { status: true } })
    if (!fresh || fresh.status !== 'pending') throw new Error('NOT_PENDING')

    await tx.user.update({
      where: { id: userId },
      data: { pvpPoints: { decrement: match.betAmount }, currentStatus: 'playing' },
    })
    await tx.user.update({
      where: { id: match.player1Id },
      data: { currentStatus: 'playing' },
    })
    const updated = await tx.pvpMatch.update({
      where: { id: matchId },
      data: {
        status: 'active',
        p2Status: 'playing',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      select: { id: true },
    })
    return { id: updated.id }
  }).catch((err: Error) => {
    if (err.message === 'USER_GONE') return { _error: 'USER_GONE' } as const
    if (err.message === 'NOT_APPROVED') return { _error: 'NOT_APPROVED' } as const
    if (err.message === 'ALREADY_PLAYING') return { _error: 'ALREADY_PLAYING' } as const
    if (err.message === 'INSUFFICIENT') return { _error: 'INSUFFICIENT' } as const
    if (err.message === 'NOT_PENDING') return { _error: 'NOT_PENDING' } as const
    throw err
  })

  if ('_error' in outcome) {
    // Refund the sender since we couldn't accept
    await db.$transaction(async (tx) => {
      await tx.pvpMatch.update({
        where: { id: matchId },
        data: { status: 'cancelled', updatedAt: new Date() },
      })
      await tx.user.update({
        where: { id: match.player1Id },
        data: {
          pvpPoints: { increment: match.betAmount },
          currentStatus: 'idle',
        },
      })
    })
    const reason =
      outcome._error === 'INSUFFICIENT' ? 'نقاطك غير كافية لقبول الدعوة' :
      outcome._error === 'NOT_APPROVED' ? 'حسابك غير مفعّل' :
      outcome._error === 'ALREADY_PLAYING' ? 'أنت مشغول في مباراة الآن' :
      outcome._error === 'NOT_PENDING' ? 'انتهت صلاحية الدعوة' :
      'تعذّر قبول الدعوة'
    return fail(reason, 400)
  }

  return ok({ status: 'accepted', matchId: outcome.id })
}

/**
 * POST /api/pvp/lobby
 *
 * Action dispatcher covering the lobby / friends / history / daily-bonus flows.
 * Body: `{ action: "get_lobby_data" | "get_history_page" | "friend_request" |
 *         "respond_friend" | "remove_friend" | "clear_rejection" |
 *         "claim_daily_bonus", ... }`
 *
 * Hardening vs the legacy code:
 *  - No cron on request path (stuck-match cleanup moved to the socket.io mini-service).
 *  - Daily-bonus uses a transaction with a re-check so two concurrent claims
 *    can't double-award.
 *  - `get_lobby_data` never returns raw `lastDailyBonus` — only the boolean.
 *  - Friends list strips `email` / `phone` etc. — only the public profile fields.
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ok, fail, parseBody, requireUser } from '@/lib/api'
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_TIERS,
  TierId,
  secondsToMidnight,
  todayKey,
} from '@/lib/pvp'
import { z } from 'zod'

// --------------------------------------------------------------------
// Schemas
// --------------------------------------------------------------------

const getLobbySchema = z.object({ action: z.literal('get_lobby_data') })

const getHistorySchema = z.object({
  action: z.literal('get_history_page'),
  page: z.number().int().min(1).max(10_000),
})

const friendRequestSchema = z.object({
  action: z.literal('friend_request'),
  targetId: z.string().min(1).max(64),
})

const respondFriendSchema = z.object({
  action: z.literal('respond_friend'),
  requestId: z.string().min(1).max(64),
  response: z.enum(['accept', 'reject']),
})

const removeFriendSchema = z.object({
  action: z.literal('remove_friend'),
  friendId: z.string().min(1).max(64),
})

const clearRejectionSchema = z.object({
  action: z.literal('clear_rejection'),
  rejectionId: z.string().min(1).max(64),
})

const claimDailyBonusSchema = z.object({
  action: z.literal('claim_daily_bonus'),
})

const bodySchema = z.union([
  getLobbySchema,
  getHistorySchema,
  friendRequestSchema,
  respondFriendSchema,
  removeFriendSchema,
  clearRejectionSchema,
  claimDailyBonusSchema,
])

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

interface PublicUser {
  id: string
  username: string
  studentName: string
  level: number
  pvpPoints: number
  currentStatus: string
  isOnline: boolean
  lastActivityAgoSec: number
}

interface PublicFriend extends PublicUser {
  friendshipId: string
}

interface IncomingRequest {
  id: string
  senderId: string
  senderName: string
  senderUsername: string
  senderLevel: number
  createdAt: string
}

interface IncomingRejection {
  id: string
  otherUserId: string
  otherUserName: string
}

interface LeaderboardEntry {
  rank: number
  id: string
  username: string
  studentName: string
  pvpPoints: number
  level: number
}

const PAGE_SIZE = 15

async function loadTiers(): Promise<typeof DEFAULT_TIERS> {
  // Allow admin overrides via SystemSetting rows (keys: tier1_q, tier1_status, etc.)
  const rows = await db.systemSetting.findMany()
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const result = { ...DEFAULT_TIERS }
  ;([1, 2, 3] as TierId[]).forEach((tierId) => {
    const t = { ...result[tierId] }
    if (map[`tier${tierId}_q`]) t.q = parseInt(map[`tier${tierId}_q`], 10) || t.q
    if (map[`tier${tierId}_time`]) t.time = parseFloat(map[`tier${tierId}_time`]) || t.time
    if (map[`tier${tierId}_win`]) t.win = parseInt(map[`tier${tierId}_win`], 10) || t.win
    if (map[`tier${tierId}_loss`]) t.loss = parseInt(map[`tier${tierId}_loss`], 10) || t.loss
    if (map[`tier${tierId}_status`]) t.status = (parseInt(map[`tier${tierId}_status`], 10) === 1 ? 1 : 0) as 0 | 1
    if (map[`tier${tierId}_msg`]) t.msg = map[`tier${tierId}_msg`]
    result[tierId] = t
  })
  return result
}

async function loadAiConfig() {
  const rows = await db.systemSetting.findMany({
    where: { key: { startsWith: 'ai_' } },
  })
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return {
    status: map.ai_status ? (parseInt(map.ai_status, 10) === 1 ? 1 : 0) : DEFAULT_AI_CONFIG.status,
    msg: map.ai_msg ?? DEFAULT_AI_CONFIG.msg,
    dailyLimit: map.ai_daily_limit ? parseInt(map.ai_daily_limit, 10) : DEFAULT_AI_CONFIG.dailyLimit,
  }
}

// --------------------------------------------------------------------
// POST handler
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

  // Refresh the user's lastActivity on every lobby call (matches legacy).
  await db.user.update({
    where: { id: session.userId },
    data: { lastActivity: new Date() },
  })

  switch (body.action) {
    case 'get_lobby_data':
      return getLobbyData(session.userId)
    case 'get_history_page':
      return getHistoryPage(session.userId, body.page)
    case 'friend_request':
      return friendRequest(session.userId, body.targetId)
    case 'respond_friend':
      return respondFriend(session.userId, body.requestId, body.response)
    case 'remove_friend':
      return removeFriend(session.userId, body.friendId)
    case 'clear_rejection':
      return clearRejection(session.userId, body.rejectionId)
    case 'claim_daily_bonus':
      return claimDailyBonus(session.userId)
  }
}

// --------------------------------------------------------------------
// Actions
// --------------------------------------------------------------------

async function getLobbyData(userId: string): Promise<NextResponse> {
  const now = new Date()
  const onlineCutoff = new Date(now.getTime() - 15_000)

  const me = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      studentName: true,
      level: true,
      pvpPoints: true,
      currentStatus: true,
      lastActivity: true,
      lastDailyBonus: true,
      aiAttemptsCount: true,
      aiLastDate: true,
      trainerId: true,
    },
  })
  if (!me) return fail('المستخدم غير موجود', 404)

  // Online students (excluding self, excluding non-approved)
  const onlineRows = await db.user.findMany({
    where: {
      status: 'approved',
      role: 'student',
      id: { not: userId },
      lastActivity: { gt: onlineCutoff },
    },
    select: {
      id: true,
      username: true,
      studentName: true,
      level: true,
      pvpPoints: true,
      currentStatus: true,
      lastActivity: true,
    },
    orderBy: { lastActivity: 'desc' },
    take: 50,
  })

  const online: PublicUser[] = onlineRows.map((u) => ({
    ...u,
    isOnline: true,
    lastActivityAgoSec: Math.max(0, Math.floor((now.getTime() - u.lastActivity.getTime()) / 1000)),
  }))

  // Friends (accepted friendships, both directions)
  const friendsRows = await db.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    include: {
      sender: { select: { id: true, username: true, studentName: true, level: true, pvpPoints: true, currentStatus: true, lastActivity: true } },
      receiver: { select: { id: true, username: true, studentName: true, level: true, pvpPoints: true, currentStatus: true, lastActivity: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const friends: PublicFriend[] = friendsRows.map((f) => {
    const other = f.senderId === userId ? f.receiver : f.sender
    return {
      ...other,
      isOnline: other.lastActivity > onlineCutoff,
      lastActivityAgoSec: Math.max(0, Math.floor((now.getTime() - other.lastActivity.getTime()) / 1000)),
      friendshipId: f.id,
    }
  })

  // Pending incoming friend requests
  const reqRows = await db.friendship.findMany({
    where: { receiverId: userId, status: 'pending' },
    include: { sender: { select: { id: true, studentName: true, username: true, level: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const friendRequests: IncomingRequest[] = reqRows.map((r) => ({
    id: r.id,
    senderId: r.sender.id,
    senderName: r.sender.studentName,
    senderUsername: r.sender.username,
    senderLevel: r.sender.level,
    createdAt: r.createdAt.toISOString(),
  }))

  // Rejections (received): friendships where I sent the request and got rejected.
  // These are surfaced so the user can clear them later.
  const rejRows = await db.friendship.findMany({
    where: { senderId: userId, status: 'rejected' },
    include: { receiver: { select: { id: true, studentName: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  })
  const friendRejections: IncomingRejection[] = rejRows.map((r) => ({
    id: r.id,
    otherUserId: r.receiver.id,
    otherUserName: r.receiver.studentName,
  }))

  // Leaderboard (top 10 by pvp_points among approved students)
  const top = await db.user.findMany({
    where: { status: 'approved', role: 'student' },
    orderBy: { pvpPoints: 'desc' },
    take: 10,
    select: { id: true, username: true, studentName: true, pvpPoints: true, level: true },
  })
  const leaderboard: LeaderboardEntry[] = top.map((u, i) => ({ rank: i + 1, ...u }))

  // My rank
  const betterCount = await db.user.count({
    where: { status: 'approved', role: 'student', pvpPoints: { gt: me.pvpPoints } },
  })

  // Daily-bonus availability
  const today = todayKey(now)
  const lastBonusDate = me.lastDailyBonus ? me.lastDailyBonus.toISOString().slice(0, 10) : null
  const bonusAvailable = lastBonusDate !== today

  // AI daily attempts
  const aiLastDateStr = me.aiLastDate ? me.aiLastDate.toISOString().slice(0, 10) : null
  const aiAttemptsUsed = aiLastDateStr === today ? me.aiAttemptsCount : 0

  const tiers = await loadTiers()
  const ai = await loadAiConfig()
  const aiAttemptsLeft = Math.max(0, ai.dailyLimit - aiAttemptsUsed)

  return ok({
    online,
    friends,
    friendRequests,
    friendRejections,
    leaderboard,
    myRank: betterCount + 1,
    myPoints: me.pvpPoints,
    myLevel: me.level,
    aiAttemptsLeft,
    aiDailyLimit: ai.dailyLimit,
    bonusAvailable,
    secondsToMidnight: secondsToMidnight(now),
    gameConfig: {
      tiers: [tiers[1], tiers[2], tiers[3]],
      ai_status: ai.status,
      ai_msg: ai.msg,
    },
  })
}

async function getHistoryPage(userId: string, page: number): Promise<NextResponse> {
  // Merge PVP + AI matches, newest first, 15 per page.
  // PVP matches: only those where status is 'completed'/'rejected'/'cancelled' and user is a participant.
  // AI matches: trainings with gameType='ai_match'.
  const [pvpRows, aiRows] = await Promise.all([
    db.pvpMatch.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: { in: ['completed', 'rejected', 'cancelled'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        player1Id: true,
        player2Id: true,
        winnerId: true,
        betAmount: true,
        status: true,
        tier: true,
        updatedAt: true,
      },
    }),
    db.training.findMany({
      where: { userId, gameType: 'ai_match' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, totalScore: true, performanceNotes: true, createdAt: true },
    }),
  ])

  type Merged =
    | { kind: 'pvp'; id: string; createdAt: Date; opponent?: string; result: 'win' | 'loss' | 'draw' | 'cancelled' | 'rejected'; points: number; tier: number }
    | { kind: 'ai'; id: string; createdAt: Date; opponent: string; result: 'win' | 'loss' | 'draw' | 'surrender'; points: number }

  // Build merged list (we need opponent names for pvp)
  const otherIds = new Set<string>()
  for (const r of pvpRows) {
    const opp = r.player1Id === userId ? r.player2Id : r.player1Id
    if (opp) otherIds.add(opp)
  }
  const otherUsers = await db.user.findMany({
    where: { id: { in: Array.from(otherIds) } },
    select: { id: true, studentName: true },
  })
  const otherMap = new Map(otherUsers.map((u) => [u.id, u.studentName]))

  const merged: Merged[] = []
  for (const r of pvpRows) {
    const oppId = r.player1Id === userId ? r.player2Id : r.player1Id
    const opponent = oppId ? (otherMap.get(oppId) ?? '—') : '—'
    let result: 'win' | 'loss' | 'draw' | 'cancelled' | 'rejected'
    if (r.status === 'cancelled') result = 'cancelled'
    else if (r.status === 'rejected') result = 'rejected'
    else if (r.winnerId === null) result = 'draw'
    else if (r.winnerId === userId) result = 'win'
    else result = 'loss'
    const points =
      r.status === 'completed'
        ? result === 'win'
          ? r.betAmount
          : result === 'loss'
            ? -r.betAmount
            : 0
        : 0
    merged.push({ kind: 'pvp', id: r.id, createdAt: r.updatedAt, opponent, result, points, tier: r.tier })
  }
  for (const a of aiRows) {
    const notes = a.performanceNotes ?? ''
    const result = (notes === 'win' ? 'win' : notes === 'loss' ? 'loss' : notes === 'draw' ? 'draw' : 'surrender') as 'win' | 'loss' | 'draw' | 'surrender'
    merged.push({ kind: 'ai', id: a.id, createdAt: a.createdAt, opponent: 'الروبوت', result, points: a.totalScore })
  }

  // Sort newest first
  merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const total = merged.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const items = merged.slice(start, start + PAGE_SIZE).map((m) => ({
    kind: m.kind,
    id: m.id,
    date: m.createdAt.toISOString(),
    opponent: m.opponent ?? '—',
    result: m.result,
    points: m.points,
    tier: m.kind === 'pvp' ? m.tier : undefined,
  }))

  return ok({
    history: items,
    hasMore: safePage < totalPages,
    currentPage: safePage,
    totalPages,
  })
}

async function friendRequest(userId: string, targetId: string): Promise<NextResponse> {
  if (targetId === userId) return fail('لا يمكنك إضافة نفسك', 400)

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, role: true },
  })
  if (!target) return fail('المستخدم غير موجود', 404)
  if (target.role !== 'student' || target.status !== 'approved') {
    return fail('هذا المستخدم غير متاح', 400)
  }

  // Reject if an existing friendship (any direction, any status) already exists.
  const existing = await db.friendship.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: targetId },
        { senderId: targetId, receiverId: userId },
      ],
    },
  })
  if (existing) {
    if (existing.status === 'accepted') return fail('أنتما أصدقاء بالفعل', 400)
    if (existing.status === 'pending') return fail('طلب صداقة معلّق بالفعل', 400)
    if (existing.status === 'rejected') {
      // allow re-request by removing the rejected row first
      await db.friendship.delete({ where: { id: existing.id } })
    }
  }

  await db.friendship.create({
    data: { senderId: userId, receiverId: targetId, status: 'pending' },
  })
  return ok({ status: 'sent' })
}

async function respondFriend(
  userId: string,
  requestId: string,
  response: 'accept' | 'reject'
): Promise<NextResponse> {
  const fr = await db.friendship.findUnique({ where: { id: requestId } })
  if (!fr) return fail('الطلب غير موجود', 404)
  if (fr.receiverId !== userId) return fail('لا تملك صلاحية الرد على هذا الطلب', 403)
  if (fr.status !== 'pending') return fail('تم الرد على هذا الطلب بالفعل', 400)

  await db.friendship.update({
    where: { id: requestId },
    data: { status: response === 'accept' ? 'accepted' : 'rejected' },
  })
  return ok({ status: response })
}

async function removeFriend(userId: string, friendId: string): Promise<NextResponse> {
  // Delete any friendship row in either direction
  const fr = await db.friendship.findFirst({
    where: {
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
  })
  if (!fr) return fail('الصداقة غير موجودة', 404)
  await db.friendship.delete({ where: { id: fr.id } })
  return ok({ status: 'removed' })
}

async function clearRejection(userId: string, rejectionId: string): Promise<NextResponse> {
  // Only the original sender can clear their own rejection record
  const fr = await db.friendship.findUnique({ where: { id: rejectionId } })
  if (!fr) return ok({ status: 'cleared' }) // idempotent
  if (fr.senderId !== userId) return fail('لا تملك صلاحية مسح هذا السجل', 403)
  await db.friendship.delete({ where: { id: rejectionId } })
  return ok({ status: 'cleared' })
}

async function claimDailyBonus(userId: string): Promise<NextResponse> {
  const today = todayKey()
  // Transaction with a re-check inside to avoid the legacy's race condition.
  const result = await db.$transaction(async (tx) => {
    const me = await tx.user.findUnique({
      where: { id: userId },
      select: { lastDailyBonus: true, pvpPoints: true },
    })
    if (!me) throw new Error('USER_NOT_FOUND')
    const lastBonusDate = me.lastDailyBonus ? me.lastDailyBonus.toISOString().slice(0, 10) : null
    if (lastBonusDate === today) {
      return { alreadyClaimed: true as const, awarded: 0, balance: me.pvpPoints }
    }
    const award = Math.floor(50 + Math.random() * 11) // 50..60 inclusive
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        pvpPoints: { increment: award },
        lastDailyBonus: new Date(),
      },
      select: { pvpPoints: true },
    })
    return { alreadyClaimed: false as const, awarded: award, balance: updated.pvpPoints }
  })

  if ('alreadyClaimed' in result && result.alreadyClaimed) {
    return fail('تم استلام المكافأة اليوم بالفعل', 400)
  }
  return ok({
    status: 'awarded',
    awarded: result.awarded,
    balance: result.balance,
  })
}

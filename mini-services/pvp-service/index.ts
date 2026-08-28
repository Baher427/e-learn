/**
 * PVP socket.io mini-service (port 3003).
 *
 * Responsibilities:
 *  - Relay real-time PVP events between clients (invites, score updates, surrender).
 *  - Maintain the live lobby presence (online users list).
 *  - Periodic cleanup of stuck matches (pending > 60s) — runs off the request path.
 *
 * Path-requirement: the Caddy gateway forwards `/?XTransformPort=3003` to this port.
 * We MUST keep socket.io's `path: "/"` so the gateway routes correctly.
 *
 * DB access: Firebase Firestore via firebase-admin (same database as the
 * Next.js app). Credentials come from the FIREBASE_SERVICE_ACCOUNT env var
 * in /home/z/my-project/.env (falls back to the Firestore emulator via
 * FIRESTORE_EMULATOR_HOST for local testing).
 *
 * Auto-restart: `bun --hot index.ts` watches this file and reloads on change.
 */
import { createServer } from 'http'
import { Server } from 'socket.io'
import { readFileSync } from 'fs'

// --------------------------------------------------------------------
// Config
// --------------------------------------------------------------------
const PORT = 3003
const ONLINE_TTL_MS = 15_000 // a user is "online" if last_activity < now - 15s
const STUCK_PENDING_MS = 60_000 // a pending match older than 60s is considered stuck
const CLEANUP_INTERVAL_MS = 30_000

// --------------------------------------------------------------------
// Firebase Firestore (same DB as the Next.js app)
// --------------------------------------------------------------------
function loadEnv() {
  try {
    const raw = readFileSync('/home/z/my-project/.env', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !process.env[m[1]]) {
        let val = m[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        process.env[m[1]] = val
      }
    }
  } catch { /* .env optional */ }
}
loadEnv()

const firebaseAdmin = await import('firebase-admin/app')
const firestoreMod = await import('firebase-admin/firestore')
const { getApps, initializeApp, cert } = firebaseAdmin as any
const { getFirestore, Timestamp } = firestoreMod as any

if (getApps().length === 0) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (raw && raw.trim().startsWith('{')) {
    const sa = JSON.parse(raw)
    initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }) })
  } else {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }) })
  }
}
const db = getFirestore()

// --------------------------------------------------------------------
// HTTP server + socket.io
// --------------------------------------------------------------------
const httpServer = createServer((_req, res) => {
  // tiny health-check endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true, service: 'pvp', port: PORT }))
})

const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
})

// --------------------------------------------------------------------
// Presence tracking (in-memory mirror of who has an open socket)
// --------------------------------------------------------------------
interface Presence {
  userId: string
  socketId: string
  joinedAt: number
}
const presenceByUser = new Map<string, Presence>()
const presenceBySocket = new Map<string, Presence>()

function emitLobbyPresence() {
  const onlineIds = Array.from(presenceByUser.keys())
  io.to('lobby').emit('lobby_presence', { online: onlineIds, count: onlineIds.length })
}

// --------------------------------------------------------------------
// Stuck-match cleanup (off-request-path cron)
// --------------------------------------------------------------------
async function cleanupStuckMatches() {
  try {
    const cutoff = Timestamp.fromDate(new Date(Date.now() - STUCK_PENDING_MS))
    const stuckSnap = await db
      .collection('pvpMatches')
      .where('status', '==', 'pending')
      .where('createdAt', '<', cutoff)
      .limit(200)
      .get()
    if (stuckSnap.empty) return

    for (const docSnap of stuckSnap.docs) {
      const m = docSnap.data() as { player1Id: string; betAmount: number }
      // Atomic per match: refund + cancel + idle.
      await db.runTransaction(async (tx) => {
        const userRef = db.collection('users').doc(m.player1Id)
        const matchRef = db.collection('pvpMatches').doc(docSnap.id)
        const [userDoc, matchDoc] = await Promise.all([tx.get(userRef), tx.get(matchRef)])
        if (!matchDoc.exists) return
        const match = matchDoc.data()!
        if (match.status !== 'pending') return // already handled
        tx.update(userRef, {
          pvpPoints: (userDoc.data()?.pvpPoints ?? 0) + (m.betAmount ?? 0),
          currentStatus: 'idle',
        })
        tx.update(matchRef, { status: 'cancelled', updatedAt: Timestamp.now() })
      })
      // notify the sender (if connected) that the match timed out
      io.to(`user_${m.player1Id}`).emit('invite_response', {
        matchId: docSnap.id,
        response: 'timeout',
      })
    }
    console.log(`[cleanup] cancelled ${stuckSnap.size} stuck pending matches`)
  } catch (err) {
    console.error('[cleanup] error:', err)
  }
}

setInterval(cleanupStuckMatches, CLEANUP_INTERVAL_MS)

// --------------------------------------------------------------------
// Socket event handlers
// --------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`)

  // ---- Lobby presence ----
  socket.on('join_lobby', ({ userId }: { userId: string }) => {
    if (!userId) return
    socket.join('lobby')
    socket.join(`user_${userId}`)
    presenceByUser.set(userId, { userId, socketId: socket.id, joinedAt: Date.now() })
    presenceBySocket.set(socket.id, { userId, socketId: socket.id, joinedAt: Date.now() })
    emitLobbyPresence()
    console.log(`[lobby] ${userId} joined (${presenceByUser.size} online)`)
  })

  // ---- Invites ----
  socket.on(
    'send_invite',
    (payload: { fromUserId: string; toUserId: string; tier: number; matchId: string }) => {
      if (!payload?.fromUserId || !payload?.toUserId || !payload?.matchId) return
      io.to(`user_${payload.toUserId}`).emit('invite_received', {
        fromUserId: payload.fromUserId,
        toUserId: payload.toUserId,
        tier: payload.tier,
        matchId: payload.matchId,
      })
    }
  )

  socket.on(
    'respond_invite',
    (payload: { matchId: string; response: 'accept' | 'reject'; fromUserId: string; toUserId: string }) => {
      if (!payload?.matchId || !payload?.response) return
      // Notify both players of the response
      io.to(`user_${payload.fromUserId}`).emit('invite_response', {
        matchId: payload.matchId,
        response: payload.response,
        fromUserId: payload.fromUserId,
        toUserId: payload.toUserId,
      })
      io.to(`user_${payload.toUserId}`).emit('invite_response', {
        matchId: payload.matchId,
        response: payload.response,
        fromUserId: payload.fromUserId,
        toUserId: payload.toUserId,
      })
    }
  )

  // ---- Match room ----
  socket.on('join_match', ({ matchId, userId }: { matchId: string; userId: string }) => {
    if (!matchId || !userId) return
    const room = `match_${matchId}`
    socket.join(room)
    socket.to(room).emit('opponent_joined', { matchId, userId })
    console.log(`[match] ${userId} joined ${room}`)
  })

  socket.on(
    'submit_score',
    (payload: {
      matchId: string
      userId: string
      score: number
      progress: number
      finished: boolean
    }) => {
      if (!payload?.matchId || !payload?.userId) return
      const room = `match_${payload.matchId}`
      socket.to(room).emit('opponent_score', {
        matchId: payload.matchId,
        userId: payload.userId,
        score: payload.score,
        progress: payload.progress,
        finished: payload.finished,
      })
    }
  )

  socket.on(
    'surrender',
    (payload: { matchId: string; userId: string; opponentId: string }) => {
      if (!payload?.matchId || !payload?.userId || !payload?.opponentId) return
      io.to(`user_${payload.opponentId}`).emit('opponent_surrendered', {
        matchId: payload.matchId,
        userId: payload.userId,
      })
    }
  )

  socket.on('leave_match', ({ matchId, userId }: { matchId: string; userId: string }) => {
    if (!matchId) return
    const room = `match_${matchId}`
    socket.leave(room)
    socket.to(room).emit('opponent_left', { matchId, userId })
  })

  // ---- Disconnect cleanup ----
  socket.on('disconnect', () => {
    const p = presenceBySocket.get(socket.id)
    if (p) {
      presenceByUser.delete(p.userId)
      presenceBySocket.delete(socket.id)
      emitLobbyPresence()
      console.log(`[socket] ${p.userId} disconnected (${presenceByUser.size} online)`)
    } else {
      console.log(`[socket] ${socket.id} disconnected (unknown)`)
    }
  })

  socket.on('error', (err: unknown) => {
    console.error(`[socket] error on ${socket.id}:`, err)
  })
})

// --------------------------------------------------------------------
// Start
// --------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`PVP socket.io service running on port ${PORT}`)
  // Run cleanup once at startup so we don't wait 30s for the first sweep
  cleanupStuckMatches()
})

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`\n[${sig}] shutting down pvp-service...`)
  io.close()
  httpServer.close(() => {
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

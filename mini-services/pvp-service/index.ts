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
 * DB access uses `bun:sqlite` (built into Bun) — no Prisma needed. The DB file
 * is the same SQLite file the Next.js app uses (`/home/z/my-project/db/custom.db`).
 *
 * Auto-restart: `bun --hot index.ts` watches this file and reloads on change.
 */
import { createServer } from 'http'
import { Server } from 'socket.io'
import { Database } from 'bun:sqlite'

// --------------------------------------------------------------------
// Config
// --------------------------------------------------------------------
const PORT = 3003
const DB_PATH = '/home/z/my-project/db/custom.db'
const ONLINE_TTL_MS = 15_000 // a user is "online" if last_activity < now - 15s
const STUCK_PENDING_MS = 60_000 // a pending match older than 60s is considered stuck
const CLEANUP_INTERVAL_MS = 30_000

// --------------------------------------------------------------------
// SQLite (read-write, safe WAL for concurrent access with the Next app)
// --------------------------------------------------------------------
const db = new Database(DB_PATH)
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

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
function cleanupStuckMatches() {
  try {
    const cutoff = new Date(Date.now() - STUCK_PENDING_MS).toISOString()
    const stuck = db
      .query(
        `SELECT id, player1Id, betAmount FROM PvpMatch
         WHERE status = 'pending' AND createdAt < ?`
      )
      .all(cutoff) as Array<{ id: string; player1Id: string; betAmount: number }>

    if (stuck.length === 0) return

    const refundStmt = db.prepare(
      `UPDATE User SET pvpPoints = pvpPoints + ? WHERE id = ?`
    )
    const cancelStmt = db.prepare(
      `UPDATE PvpMatch SET status = 'cancelled', updatedAt = ? WHERE id = ?`
    )
    const idleStmt = db.prepare(
      `UPDATE User SET currentStatus = 'idle' WHERE id = ?`
    )

    for (const m of stuck) {
      const tx = db.transaction(() => {
        refundStmt.run(m.betAmount, m.player1Id)
        cancelStmt.run(new Date().toISOString(), m.id)
        idleStmt.run(m.player1Id)
      })
      tx()
      // notify the sender (if connected) that the match timed out
      io.to(`user_${m.player1Id}`).emit('invite_response', {
        matchId: m.id,
        response: 'timeout',
      })
    }
    console.log(`[cleanup] cancelled ${stuck.length} stuck pending matches`)
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
    db.close()
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

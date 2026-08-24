/**
 * Auth core — JWT (jose) + bcrypt.
 * Works locally (SQLite) and in production (Supabase Postgres).
 * Sessions live in an httpOnly cookie named `elearn_session`.
 */
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { env, isProd } from '@/lib/env'

export const SESSION_COOKIE = 'elearn_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

// --------------------------------------------------------------------
// Password hashing
// --------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12)
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// --------------------------------------------------------------------
// JWT session
// --------------------------------------------------------------------

const secret = new TextEncoder().encode(env.JWT_SECRET)

export interface SessionPayload {
  userId: string
  role: 'student' | 'admin'
  username: string
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret)
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// --------------------------------------------------------------------
// Cookie helpers (work in both App Router server components & route handlers)
// --------------------------------------------------------------------
// The app is frequently embedded inside a third-party iframe (preview
// panel, etc.). In such a context, browsers refuse to set/send cookies
// with `SameSite=Lax`, so login succeeds (200 + Set-Cookie) but the
// follow-up `/api/auth/me` request never carries the cookie (401).
//
// We therefore emit `SameSite=None; Secure` whenever the request is
// served over HTTPS (detected via the `x-forwarded-proto` header set by
// the Caddy gateway, or when running in production). For plain-HTTP
// local dev (no TLS-terminating proxy), we keep `SameSite=Lax` because
// `SameSite=None` requires `Secure` which is illegal on http://localhost.
// --------------------------------------------------------------------

import { cookies, headers } from 'next/headers'
import { NextRequest } from 'next/server'

async function isHttpsRequest(): Promise<boolean> {
  if (isProd) return true
  const h = await headers()
  // Caddy sets x-forwarded-proto when it terminates TLS.
  return h.get('x-forwarded-proto') === 'https'
}

async function buildCookieOptions(maxAge: number) {
  const https = await isHttpsRequest()
  return {
    httpOnly: true,
    sameSite: (https ? 'none' : 'lax') as 'none' | 'lax',
    secure: https,
    path: '/',
    maxAge,
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, token, await buildCookieOptions(SESSION_TTL_SECONDS))
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, '', await buildCookieOptions(0))
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

/** Read session from a NextRequest (for middleware/route handlers). */
export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  // verify is async, but for middleware we use a sync wrapper via jose isn't available;
  // we use a fast unverified decode for middleware gating, then re-verify in handlers.
  return decodeUnverified(token)
}

function decodeUnverified(token: string): SessionPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
    return {
      userId: payload.userId,
      role: payload.role,
      username: payload.username,
    }
  } catch {
    return null
  }
}

// --------------------------------------------------------------------
// Misc helpers
// --------------------------------------------------------------------

/** Returns the current user record (with trainer join) or null. */
export async function getCurrentUser() {
  const session = await getSession()
  if (!session) return null
  return db.user.findUnique({
    where: { id: session.userId },
    include: { trainer: true },
  })
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>

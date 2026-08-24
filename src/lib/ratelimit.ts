/**
 * Rate limiter — uses Upstash Redis in production,
 * falls back to an in-memory sliding-window counter in dev.
 */
import { env, isProd } from '@/lib/env'

// --------------------------------------------------------------------
// In-memory fallback (single-instance dev only)
// --------------------------------------------------------------------

type Bucket = { count: number; resetAt: number }
const memoryStore = new Map<string, Bucket>()

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now()
  const existing = memoryStore.get(key)
  if (existing && existing.resetAt > now) {
    if (existing.count >= limit) {
      return { success: false, remaining: 0 }
    }
    existing.count++
    return { success: true, remaining: limit - existing.count }
  }
  memoryStore.set(key, { count: 1, resetAt: now + windowMs })
  return { success: true, remaining: limit - 1 }
}

// --------------------------------------------------------------------
// Upstash-backed (production)
// --------------------------------------------------------------------

let redisClient: import('@upstash/redis').Redis | null = null
let ratelimitInstance: import('@upstash/ratelimit').Ratelimit | null = null

async function getRatelimit() {
  if (!isProd || !env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  if (!ratelimitInstance) {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const { Redis } = await import('@upstash/redis')
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
    ratelimitInstance = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'elearn:rl',
    })
  }
  return ratelimitInstance
}

/** Returns true if the limit was exceeded. */
export async function ratelimit(
  identifier: string,
  limit = 10,
  windowMs = 60_000
): Promise<boolean> {
  const rl = await getRatelimit()
  if (rl) {
    const { success } = await rl.limit(identifier)
    return !success
  }
  const result = memoryLimit(identifier, limit, windowMs)
  return !result.success
}

/**
 * Single source of truth for environment variables.
 * Validates at process start; throws if a required var is missing.
 * Usage: import { env } from '@/lib/env'
 */
import { z } from 'zod'

const schema = z.object({
  // --- Database (Supabase Postgres) --------------------------------
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required for Prisma migrations'),

  // --- Auth --------------------------------------------------------
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),

  // --- App ---------------------------------------------------------
  NEXT_PUBLIC_APP_NAME: z.string().default('e-learn'),
  NEXT_PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),

  // --- Supabase (server-side clients) ------------------------------
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),

  // --- Realtime socket.io mini-service ----------------------------
  NEXT_PUBLIC_SOCKET_PORT: z.string().default('3003'),

  // --- Email (Resend) ---------------------------------------------
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // --- Firebase Admin (FCM) ---------------------------------------
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),

  // --- Rate limiting (Upstash Redis, optional) --------------------
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
})

function parseEnv() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment variables')
    }
    // Dev fallbacks — keep app running for quick iteration
    return {
      DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
      DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'file:./dev.db',
      JWT_SECRET:
        process.env.JWT_SECRET || 'dev-super-secret-change-in-production-min-16-chars',
      NEXT_PUBLIC_APP_NAME: 'e-learn',
      NEXT_PUBLIC_BASE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SOCKET_PORT: '3003',
    } as z.infer<typeof schema>
  }
  return parsed.data
}

export const env = parseEnv()

/** True when running in production (Vercel). */
export const isProd = process.env.NODE_ENV === 'production'

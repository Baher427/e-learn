/**
 * Shared helpers for Next.js App Router route handlers.
 */
import { NextResponse } from 'next/server'
import { ZodError, ZodSchema } from 'zod'
import type { SessionPayload } from '@/lib/auth'
import { ratelimit } from '@/lib/ratelimit'

// --------------------------------------------------------------------
// JSON responses
// --------------------------------------------------------------------

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ status: 'success', data }, init)
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ status: 'error', message, ...extra }, { status })
}

// --------------------------------------------------------------------
// Body parsing with Zod
// --------------------------------------------------------------------

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  try {
    const json = await req.json().catch(() => null)
    if (!json) return { error: fail('الرجال إرسال جسم JSON صالح', 400) }
    const parsed = schema.parse(json)
    return { data: parsed }
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        error: fail('البيانات غير صحيحة', 422, {
          issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
        }),
      }
    }
    return { error: fail('خطأ غير متوقع', 500) }
  }
}

// --------------------------------------------------------------------
// Action dispatcher (one route, multiple actions via body.action)
// --------------------------------------------------------------------

type Handler<C, A extends { action: string }> = (
  ctx: C,
  args: A
) => Promise<NextResponse> | NextResponse

export function createDispatcher<
  A extends { action: string },
  C
>(handlers: Record<string, Handler<C, A>>) {
  return async (ctx: C, args: A): Promise<NextResponse> => {
    const handler = handlers[args.action]
    if (!handler) return fail(`إجراء غير معروف: ${args.action}`, 404)
    return handler(ctx, args)
  }
}

// --------------------------------------------------------------------
// Guard: requires authenticated user (and optionally admin)
// --------------------------------------------------------------------

export async function requireUser(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  if (!session) return { error: fail('يجب تسجيل الدخول', 401) }
  return { session }
}

export async function requireAdmin(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const got = await requireUser()
  if ('error' in got) return got
  if (got.session.role !== 'admin') return { error: fail('مطلوب صلاحية إدارية', 403) }
  return got
}

// --------------------------------------------------------------------
// Rate limiting wrapper
// --------------------------------------------------------------------

export async function withRatelimit(
  identifier: string,
  fn: () => Promise<NextResponse>,
  limit = 10,
  windowMs = 60_000
): Promise<NextResponse> {
  const limited = await ratelimit(identifier, limit, windowMs)
  if (limited) {
    return NextResponse.json(
      { status: 'error', message: 'تجاوزت الحد المسموح من المحاولات. حاول لاحقاً' },
      { status: 429 }
    )
  }
  return fn()
}

/** Extract client IP (CF-aware) from a Request. */
export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    '0.0.0.0'
  )
}

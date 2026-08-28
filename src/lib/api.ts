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

// --------------------------------------------------------------------
// Firestore setup-level failure detection (not app bugs)
// --------------------------------------------------------------------

let saInfoCache: { email: string; projectId: string } | null | undefined

function serviceAccountInfo(): { email: string; projectId: string } | null {
  if (saInfoCache !== undefined) return saInfoCache
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw || !raw.trim().startsWith('{')) {
      saInfoCache = null
      return saInfoCache
    }
    const parsed = JSON.parse(raw)
    saInfoCache = {
      email: parsed.client_email ?? '',
      projectId: parsed.project_id ?? '',
    }
  } catch {
    saInfoCache = null
  }
  return saInfoCache
}

/**
 * Detects Firestore *setup* failures and returns a 503 carrying precise
 * Arabic guidance for the one remaining console step. Returns null when the
 * error is unrelated to setup (let the caller handle/throw it).
 *
 *  Case A — the Firestore database was never created in the project.
 *  Case B — the database exists but the service account has no IAM role.
 *  Case C — the FIREBASE_SERVICE_ACCOUNT credential is missing/broken.
 */
export function firestoreSetupFail(e: unknown): NextResponse | null {
  const msg = e instanceof Error ? e.message : String(e)
  const sa = serviceAccountInfo()

  // Case A must be tested BEFORE Case B: the gRPC "API disabled" error also
  // contains the word PERMISSION_DENIED.
  if (
    /Firestore API has not been used|API is not enabled|SERVICE_DISABLED/i.test(msg)
  ) {
    return fail(
      'قاعدة بيانات Firestore غير مُنشأة بعد في مشروع Firebase. افتح Firebase Console ← Build ← Firestore Database ← Create database ثم أعد المحاولة.',
      503,
      { code: 'firestore_setup' }
    )
  }
  if (
    /Missing or insufficient permissions|caller does not have permission|PERMISSION_DENIED/i.test(
      msg
    )
  ) {
    const email = sa?.email || 'firebase-adminsdk-fbsvc@e-learn-8c670.iam.gserviceaccount.com'
    const pid = sa?.projectId || 'e-learn-8c670'
    return fail(
      `قاعدة بيانات Firestore جاهزة ✓ وبقيت خطوة أخيرة من جوجل: منح صلاحية الوصول لحساب الخدمة. افتح Google Cloud Console ← IAM & Admin ← Grant Access، أدخل ${email} وامنحه دور «Cloud Datastore Owner» ثم احفظ وأعد المحاولة — الرابط المباشر: https://console.cloud.google.com/iam-admin/iam?project=${pid}`,
      503,
      { code: 'firestore_permission' }
    )
  }
  if (/credentials missing|Failed to parse private key|invalid_grant/i.test(msg)) {
    return fail(
      'بيانات اعتماد Firebase غير مكتملة على الخادم — تأكد من ضبط متغيّر البيئة FIREBASE_SERVICE_ACCOUNT (ملف JSON لحساب الخدمة كاملاً).',
      503,
      { code: 'firestore_credentials' }
    )
  }
  return null
}

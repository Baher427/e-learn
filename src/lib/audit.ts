/**
 * Audit logger — append-only record of admin destructive actions.
 */
import { db } from '@/lib/db'

export async function audit(opts: {
  actorId: string
  targetUserId?: string
  action: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: opts.actorId,
        targetUserId: opts.targetUserId ?? null,
        action: opts.action,
        metaJson: opts.meta ? JSON.stringify(opts.meta) : null,
      },
    })
  } catch (e) {
    console.error('audit log failed', e)
  }
}

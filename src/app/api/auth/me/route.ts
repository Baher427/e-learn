/**
 * GET /api/auth/me — returns the current authenticated user (or 401).
 */
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ok, fail, requireUser } from "@/lib/api";

export async function GET() {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const user = await getCurrentUser();
  if (!user) return fail("المستخدم غير موجود", 404);

  const unread = await db.notification.count({
    where: {
      OR: [{ isBroadcast: true }, { userId: user.id }],
      notificationReads: { none: { userId: user.id } },
    },
  });

  return ok({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      studentName: user.studentName,
      phone: user.phone,
      role: user.role,
      status: user.status,
      level: user.level,
      totalPoints: user.totalPoints,
      pvpPoints: user.pvpPoints,
      currentStatus: user.currentStatus,
      validityEnd: user.validityEnd,
      trainer: user.trainer ? { id: user.trainer.id, name: user.trainer.name } : null,
    },
    unreadNotifications: unread,
  });
}

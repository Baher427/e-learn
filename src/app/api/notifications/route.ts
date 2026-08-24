import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";

/**
 * GET /api/notifications — list user's notifications (broadcast + targeted)
 */
export async function GET() {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const list = await db.notification.findMany({
    where: { OR: [{ isBroadcast: true }, { userId: got.session.userId }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      notificationReads: { where: { userId: got.session.userId }, select: { id: true } },
    },
  });

  const items = list.map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    isBroadcast: n.isBroadcast,
    createdAt: n.createdAt,
    isRead: n.notificationReads.length > 0,
  }));

  return ok({ items });
}

/**
 * POST /api/notifications?mark_read=<id>  — mark a notification as read
 */
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const got = await requireUser();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const id = url.searchParams.get("mark_read");
  if (!id) return ok({ ok: true }); // no-op

  await db.notificationRead.upsert({
    where: { notificationId_userId: { notificationId: id, userId: got.session.userId } },
    update: {},
    create: { notificationId: id, userId: got.session.userId },
  });
  return ok({ ok: true });
}

/**
 * /api/admin/notifications
 *   GET                            — paginated log + search
 *  POST action=send               — broadcast or targeted notification
 *  POST action=bulk_delete        — delete multiple notifications
 *  POST action=delete_all         — delete every notification (cascade)
 *
 * Targeted user search uses the `target_user_query` query string (so the
 * admin UI can show a Select2-style autocomplete via Popover + Command).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

const PAGE_SIZE = 15;

// --------------------------------------------------------------------
// GET
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const userQuery = (url.searchParams.get("target_user_query") ?? "").trim();

  // If target_user_query is provided, return a small autocomplete list.
  if (userQuery) {
    const matches = await db.user.findMany({
      where: {
        role: "student",
        OR: [
          { studentName: { contains: userQuery } },
          { username: { contains: userQuery } },
          { email: { contains: userQuery } },
        ],
      },
      take: 10,
      select: { id: true, studentName: true, username: true, email: true },
    });
    return ok({ users: matches });
  }

  const where = q ? { title: { contains: q } } : {};
  const [total, items] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, studentName: true, username: true } },
      },
    }),
  ]);

  return ok({
    items: items.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      isBroadcast: n.isBroadcast,
      target: n.user
        ? { id: n.user.id, studentName: n.user.studentName, username: n.user.username }
        : null,
      createdAt: n.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
  });
}

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------
const sendSchema = z.object({
  action: z.literal("send"),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  sendType: z.enum(["broadcast", "specific"]),
  targetUserId: z.string().min(1).optional(),
});

const bulkDeleteSchema = z.object({
  action: z.literal("bulk_delete"),
  ids: z.array(z.string().min(1)).min(1),
});

const deleteAllSchema = z.object({
  action: z.literal("delete_all"),
});

const rootSchema = z.discriminatedUnion("action", [sendSchema, bulkDeleteSchema, deleteAllSchema]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  if (args.action === "send") {
    if (args.sendType === "specific") {
      if (!args.targetUserId) return fail("targetUserId مطلوب للإرسال الموجّه", 400);
      const target = await db.user.findUnique({
        where: { id: args.targetUserId },
        select: { id: true, studentName: true, username: true },
      });
      if (!target) return fail("الطالب المستهدف غير موجود", 404);
      // Plain text — no HTML sanitization needed since we use Textarea
      const n = await db.notification.create({
        data: {
          title: args.title,
          message: args.message,
          userId: args.targetUserId,
          isBroadcast: false,
        },
      });
      await audit({
        actorId: adminId,
        targetUserId: args.targetUserId,
        action: "send_notification",
        meta: { notificationId: n.id, title: args.title, target: target.studentName },
      });
      return ok({ notification: { id: n.id } });
    }

    const n = await db.notification.create({
      data: {
        title: args.title,
        message: args.message,
        userId: null,
        isBroadcast: true,
      },
    });
    await audit({
      actorId: adminId,
      action: "send_broadcast_notification",
      meta: { notificationId: n.id, title: args.title },
    });
    return ok({ notification: { id: n.id } });
  }

  if (args.action === "bulk_delete") {
    const result = await db.notification.deleteMany({ where: { id: { in: args.ids } } });
    await audit({
      actorId: adminId,
      action: "bulk_delete_notifications",
      meta: { ids: args.ids, deleted: result.count },
    });
    return ok({ deleted: result.count });
  }

  // delete_all
  const result = await db.notification.deleteMany({});
  await audit({
    actorId: adminId,
    action: "delete_all_notifications",
    meta: { deleted: result.count },
  });
  return ok({ deleted: result.count });
}

/**
 * /api/admin/users
 *  GET  list_users          — paginated user list + headline stats
 *  POST action=update_user  — edit student_name, email, phone, level,
 *                              trainer, validity_end, status, optional
 *                              new_password. Auto-extend validity_end
 *                              +1 month on first activation when admin
 *                              didn't manually change the date.
 *  POST action=logout_device— invalidates the user's session (deletes
 *                              every Session row + rotates any device
 *                              token; here we just delete sessions).
 *  POST action=delete_user  — cascade delete. Audit-logged.
 *
 * All admin destructive actions call `audit()` with before/after meta.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { z } from "zod";

const PAGE_SIZE = 25;

// --------------------------------------------------------------------
// GET /api/admin/users?q=...&page=1
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const where = q
    ? {
        OR: [
          { studentName: { contains: q } },
          { username: { contains: q } },
          { email: { contains: q } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { trainer: { select: { id: true, name: true } } },
    }),
  ]);

  // Headline stats — single round-trip aggregations
  const [totalUsers, pendingCount, trainersCount, examsCount] = await Promise.all([
    db.user.count({ where: { role: "student" } }),
    db.user.count({ where: { role: "student", status: "pending" } }),
    db.trainer.count(),
    db.generatedExam.count(),
  ]);

  return ok({
    stats: { totalUsers, pendingCount, trainersCount, examsCount },
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      studentName: u.studentName,
      email: u.email,
      phone: u.phone,
      level: u.level,
      role: u.role,
      status: u.status,
      pvpPoints: u.pvpPoints,
      totalPoints: u.totalPoints,
      currentStatus: u.currentStatus,
      validityEnd: u.validityEnd?.toISOString() ?? null,
      trainerId: u.trainerId,
      trainer: u.trainer ? { id: u.trainer.id, name: u.trainer.name } : null,
      createdAt: u.createdAt.toISOString(),
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
// POST /api/admin/users
// --------------------------------------------------------------------
const updateSchema = z.object({
  action: z.literal("update_user"),
  id: z.string().min(1),
  studentName: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().max(40).nullable().or(z.literal("")),
  level: z.number().int().min(1).max(10),
  trainerId: z.string().nullable().or(z.literal("")),
  validityEnd: z.string().nullable(), // ISO datetime
  status: z.enum(["approved", "pending", "expired"]),
  new_password: z.string().min(6).max(80).optional().or(z.literal("")),
  validityManuallyChanged: z.boolean().optional(),
});

const logoutSchema = z.object({
  action: z.literal("logout_device"),
  id: z.string().min(1),
});

const deleteSchema = z.object({
  action: z.literal("delete_user"),
  id: z.string().min(1),
});

const rootSchema = z.union([updateSchema, logoutSchema, deleteSchema]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  // ---------------- update_user ----------------
  if (args.action === "update_user") {
    const before = await db.user.findUnique({
      where: { id: args.id },
      include: { trainer: { select: { id: true, name: true } } },
    });
    if (!before) return fail("المستخدم غير موجود", 404);
    if (before.role === "admin" && args.id !== adminId) {
      return fail("لا يمكن تعديل حساب إداري آخر", 403);
    }

    // Email uniqueness check
    const dup = await db.user.findFirst({
      where: { email: args.email.toLowerCase(), NOT: { id: args.id } },
    });
    if (dup) return fail("البريد الإلكتروني مستخدم بالفعل", 409);

    // Smart auto-extend: if status is approved AND the user wasn't approved
    // before AND the admin didn't manually change the validity_end, push
    // validity_end +1 month from now.
    let validityEnd: Date | null = args.validityEnd ? new Date(args.validityEnd) : null;
    const activatingForFirstTime =
      args.status === "approved" &&
      before.status !== "approved" &&
      !args.validityManuallyChanged;
    if (activatingForFirstTime) {
      const base = validityEnd ?? new Date();
      base.setMonth(base.getMonth() + 1);
      validityEnd = base;
    }

    const trainerId =
      args.trainerId && args.trainerId !== "" ? args.trainerId : null;

    const data: Record<string, unknown> = {
      studentName: args.studentName,
      email: args.email.toLowerCase(),
      phone: args.phone === "" ? null : args.phone,
      level: args.level,
      trainerId,
      validityEnd,
      status: args.status,
    };

    if (args.new_password && args.new_password.length >= 6) {
      data.passwordHash = await hashPassword(args.new_password);
    }

    const after = await db.user.update({
      where: { id: args.id },
      data,
      include: { trainer: { select: { id: true, name: true } } },
    });

    await audit({
      actorId: adminId,
      targetUserId: args.id,
      action: "update_user",
      meta: {
        before: {
          studentName: before.studentName,
          email: before.email,
          phone: before.phone,
          level: before.level,
          trainerId: before.trainerId,
          status: before.status,
          validityEnd: before.validityEnd?.toISOString() ?? null,
        },
        after: {
          studentName: after.studentName,
          email: after.email,
          phone: after.phone,
          level: after.level,
          trainerId: after.trainerId,
          status: after.status,
          validityEnd: after.validityEnd?.toISOString() ?? null,
        },
        autoExtended: activatingForFirstTime,
        passwordReset: !!args.new_password,
      },
    });

    return ok({ user: serializeUser(after), autoExtended: activatingForFirstTime });
  }

  // ---------------- logout_device ----------------
  if (args.action === "logout_device") {
    const target = await db.user.findUnique({ where: { id: args.id } });
    if (!target) return fail("المستخدم غير موجود", 404);
    // We only have JWT-cookie sessions, not DB sessions in legacy — but the
    // schema has Session model. Delete any DB sessions (no-op today).
    const deleted = await db.session.deleteMany({ where: { userId: args.id } });
    await audit({
      actorId: adminId,
      targetUserId: args.id,
      action: "logout_device",
      meta: { sessionsDeleted: deleted.count },
    });
    return ok({ sessionsDeleted: deleted.count });
  }

  // ---------------- delete_user ----------------
  if (args.action === "delete_user") {
    const target = await db.user.findUnique({ where: { id: args.id } });
    if (!target) return fail("المستخدم غير موجود", 404);
    if (target.role === "admin") return fail("لا يمكن حذف حساب إداري", 403);

    await db.user.delete({ where: { id: args.id } });
    await audit({
      actorId: adminId,
      targetUserId: args.id,
      action: "delete_user",
      meta: {
        username: target.username,
        email: target.email,
        studentName: target.studentName,
      },
    });
    return ok({ deleted: true });
  }

  return fail("إجراء غير معروف", 404);
}

function serializeUser(u: {
  id: string;
  username: string;
  studentName: string;
  email: string;
  phone: string | null;
  level: number;
  role: string;
  status: string;
  pvpPoints: number;
  totalPoints: number;
  currentStatus: string;
  validityEnd: Date | null;
  trainerId: string | null;
  trainer?: { id: string; name: string } | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    username: u.username,
    studentName: u.studentName,
    email: u.email,
    phone: u.phone,
    level: u.level,
    role: u.role,
    status: u.status,
    pvpPoints: u.pvpPoints,
    totalPoints: u.totalPoints,
    currentStatus: u.currentStatus,
    validityEnd: u.validityEnd?.toISOString() ?? null,
    trainerId: u.trainerId,
    trainer: u.trainer ? { id: u.trainer.id, name: u.trainer.name } : null,
    createdAt: u.createdAt.toISOString(),
  };
}

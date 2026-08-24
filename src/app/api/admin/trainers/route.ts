/**
 * /api/admin/trainers
 *  GET                          — list trainers with student counts + unassigned students
 *  POST action=add_trainer      — create new trainer (name + phone)
 *  POST action=edit_trainer     — update trainer name/phone
 *  POST action=delete_trainer   — delete trainer (cascade-nullify users.trainerId)
 *  POST action=assign_student   — assign one student to trainer
 *  POST action=bulk_assign      — assign many students to one trainer
 *  POST action=unassign_student — set trainerId=null for one student
 *  POST action=update_level     — change student level (1..10) — also severs
 *                                  cross-level friendships when changed.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

// --------------------------------------------------------------------
// GET
// --------------------------------------------------------------------
export async function GET() {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const [trainers, assignedStudents, totalStudents, unassignedStudents] = await Promise.all([
    db.trainer.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true } },
      },
    }),
    db.user.count({
      where: { role: "student", trainerId: { not: null } },
    }),
    db.user.count({ where: { role: "student" } }),
    db.user.findMany({
      where: { role: "student", trainerId: null },
      orderBy: { studentName: "asc" },
      select: { id: true, studentName: true, username: true, level: true, status: true },
    }),
  ]);

  return ok({
    stats: {
      totalTrainers: trainers.length,
      assignedStudents,
      totalStudents,
      unassignedCount: unassignedStudents.length,
    },
    trainers: trainers.map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
      studentCount: t._count.users,
      createdAt: t.createdAt.toISOString(),
    })),
    unassignedStudents,
  });
}

// --------------------------------------------------------------------
// POST
// --------------------------------------------------------------------
const addSchema = z.object({
  action: z.literal("add_trainer"),
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
  email: z.string().email().optional().or(z.literal("")),
});

const editSchema = z.object({
  action: z.literal("edit_trainer"),
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
});

const deleteSchema = z.object({
  action: z.literal("delete_trainer"),
  id: z.string().min(1),
});

const assignSchema = z.object({
  action: z.literal("assign_student"),
  studentId: z.string().min(1),
  trainerId: z.string().min(1),
});

const bulkAssignSchema = z.object({
  action: z.literal("bulk_assign"),
  studentIds: z.array(z.string().min(1)).min(1),
  trainerId: z.string().min(1),
});

const unassignSchema = z.object({
  action: z.literal("unassign_student"),
  studentId: z.string().min(1),
});

const updateLevelSchema = z.object({
  action: z.literal("update_level"),
  studentId: z.string().min(1),
  level: z.number().int().min(1).max(10),
});

const rootSchema = z.discriminatedUnion("action", [
  addSchema,
  editSchema,
  deleteSchema,
  assignSchema,
  bulkAssignSchema,
  unassignSchema,
  updateLevelSchema,
]);

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, rootSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  switch (args.action) {
    case "add_trainer": {
      const exists = await db.trainer.findUnique({ where: { phone: args.phone } });
      if (exists) return fail("رقم الهاتف مستخدم بالفعل", 409);
      const t = await db.trainer.create({
        data: {
          name: args.name,
          phone: args.phone,
          email: args.email === "" ? null : args.email,
        },
      });
      await audit({ actorId: adminId, action: "add_trainer", meta: { trainerId: t.id, name: t.name, phone: t.phone } });
      return ok({ trainer: { id: t.id, name: t.name, phone: t.phone } });
    }

    case "edit_trainer": {
      const dup = await db.trainer.findFirst({
        where: { phone: args.phone, NOT: { id: args.id } },
      });
      if (dup) return fail("رقم الهاتف مستخدم بالفعل", 409);
      const before = await db.trainer.findUnique({ where: { id: args.id } });
      if (!before) return fail("المدرّب غير موجود", 404);
      const t = await db.trainer.update({
        where: { id: args.id },
        data: { name: args.name, phone: args.phone },
      });
      await audit({
        actorId: adminId,
        action: "edit_trainer",
        meta: { before: { name: before.name, phone: before.phone }, after: { name: t.name, phone: t.phone } },
      });
      return ok({ trainer: { id: t.id, name: t.name, phone: t.phone } });
    }

    case "delete_trainer": {
      const before = await db.trainer.findUnique({ where: { id: args.id } });
      if (!before) return fail("المدرّب غير موجود", 404);
      // cascade-nullify happens automatically via onDelete: SetNull
      await db.trainer.delete({ where: { id: args.id } });
      await audit({
        actorId: adminId,
        action: "delete_trainer",
        meta: { trainerId: args.id, name: before.name, phone: before.phone },
      });
      return ok({ deleted: true });
    }

    case "assign_student": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student || student.role !== "student") return fail("الطالب غير موجود", 404);
      const trainer = await db.trainer.findUnique({ where: { id: args.trainerId } });
      if (!trainer) return fail("المدرّب غير موجود", 404);
      const updated = await db.user.update({
        where: { id: args.studentId },
        data: { trainerId: args.trainerId },
        select: { id: true, studentName: true, trainerId: true },
      });
      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "assign_student",
        meta: { before: student.trainerId, after: args.trainerId, trainerName: trainer.name },
      });
      return ok({ student: updated });
    }

    case "bulk_assign": {
      const trainer = await db.trainer.findUnique({ where: { id: args.trainerId } });
      if (!trainer) return fail("المدرّب غير موجود", 404);
      const result = await db.user.updateMany({
        where: { id: { in: args.studentIds }, role: "student" },
        data: { trainerId: args.trainerId },
      });
      await audit({
        actorId: adminId,
        action: "bulk_assign_students",
        meta: { trainerId: args.trainerId, trainerName: trainer.name, studentIds: args.studentIds, updated: result.count },
      });
      return ok({ updated: result.count });
    }

    case "unassign_student": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student) return fail("الطالب غير موجود", 404);
      await db.user.update({ where: { id: args.studentId }, data: { trainerId: null } });
      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "unassign_student",
        meta: { before: student.trainerId, after: null },
      });
      return ok({ ok: true });
    }

    case "update_level": {
      const student = await db.user.findUnique({ where: { id: args.studentId } });
      if (!student) return fail("الطالب غير موجود", 404);
      const beforeLevel = student.level;
      if (beforeLevel === args.level) return ok({ unchanged: true });

      // sever cross-level friendships: delete accepted friendships where
      // this user is sender or receiver AND the counter-party's level
      // differs from the new one.
      const friendsToSever = await db.user.findMany({
        where: {
          OR: [
            { friendshipsReceived: { some: { senderId: args.studentId, status: "accepted" } } },
            { friendshipsSent: { some: { receiverId: args.studentId, status: "accepted" } } },
          ],
          level: { not: args.level },
        },
        select: { id: true },
      });
      const friendIds = friendsToSever.map((u) => u.id);

      const [, , updated] = await db.$transaction([
        // sever friendships sent BY this user
        db.friendship.deleteMany({
          where: {
            senderId: args.studentId,
            receiverId: { in: friendIds },
            status: "accepted",
          },
        }),
        // sever friendships received BY this user
        db.friendship.deleteMany({
          where: {
            receiverId: args.studentId,
            senderId: { in: friendIds },
            status: "accepted",
          },
        }),
        db.user.update({
          where: { id: args.studentId },
          data: { level: args.level },
          select: { id: true, level: true },
        }),
      ]);

      await audit({
        actorId: adminId,
        targetUserId: args.studentId,
        action: "update_level",
        meta: { before: beforeLevel, after: args.level, severedFriendships: friendIds.length },
      });
      return ok({ student: updated, severedFriendships: friendIds.length });
    }
  }
}

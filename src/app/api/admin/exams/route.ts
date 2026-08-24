/**
 * /api/admin/exams
 *   GET                      — paginated list grouped by user (15 users/page)
 *  POST action=delete_exam   — delete a single generated exam
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, requireAdmin, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { z } from "zod";

const USERS_PER_PAGE = 15;

// --------------------------------------------------------------------
// GET
// --------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  // 15 users per page that have at least one exam, newest first by
  // their most-recent exam.
  const usersWithExams = await db.user.findMany({
    where: { role: "student", exams: { some: {} } },
    orderBy: { studentName: "asc" },
    skip: (page - 1) * USERS_PER_PAGE,
    take: USERS_PER_PAGE,
    select: {
      id: true,
      studentName: true,
      username: true,
      level: true,
      exams: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          examTitle: true,
          questionsCount: true,
          operationTypes: true,
          settingsJson: true,
          createdAt: true,
        },
      },
    },
  });

  const totalUsers = await db.user.count({
    where: { role: "student", exams: { some: {} } },
  });

  return ok({
    pagination: {
      page,
      pageSize: USERS_PER_PAGE,
      total: totalUsers,
      totalPages: Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE)),
    },
    users: usersWithExams.map((u) => ({
      id: u.id,
      studentName: u.studentName,
      username: u.username,
      level: u.level,
      examCount: u.exams.length,
      exams: u.exams.map((e) => ({
        id: e.id,
        examTitle: e.examTitle,
        questionsCount: e.questionsCount,
        operationTypes: e.operationTypes,
        settingsJson: e.settingsJson,
        createdAt: e.createdAt.toISOString(),
      })),
    })),
  });
}

// --------------------------------------------------------------------
// POST action=delete_exam
// --------------------------------------------------------------------
const deleteSchema = z.object({
  action: z.literal("delete_exam"),
  examId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const got = await requireAdmin();
  if ("error" in got) return got.error;
  const adminId = got.session.userId;

  const parsed = await parseBody(req, deleteSchema);
  if ("error" in parsed) return parsed.error;
  const args = parsed.data;

  const before = await db.generatedExam.findUnique({
    where: { id: args.examId },
    select: { id: true, examTitle: true, userId: true, questionsCount: true },
  });
  if (!before) return fail("الامتحان غير موجود", 404);

  await db.generatedExam.delete({ where: { id: args.examId } });
  await audit({
    actorId: adminId,
    targetUserId: before.userId,
    action: "delete_exam",
    meta: {
      examId: before.id,
      examTitle: before.examTitle,
      questionsCount: before.questionsCount,
    },
  });
  return ok({ deleted: true });
}

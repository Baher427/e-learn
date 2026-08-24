import { db } from "@/lib/db";
import { ok, fail, requireUser } from "@/lib/api";

export async function GET() {
  const got = await requireUser();
  if ("error" in got) return got.error;

  // Top 10 by total_points
  const top = await db.user.findMany({
    where: { status: "approved", role: "student" },
    orderBy: { totalPoints: "desc" },
    take: 10,
    select: {
      id: true,
      username: true,
      studentName: true,
      totalPoints: true,
      level: true,
    },
  });

  // Current user's rank (count users with more points)
  const currentUser = await db.user.findUnique({
    where: { id: got.session.userId },
    select: { totalPoints: true },
  });
  if (!currentUser) return fail("المستخدم غير موجود", 404);

  const betterCount = await db.user.count({
    where: {
      status: "approved",
      role: "student",
      totalPoints: { gt: currentUser.totalPoints },
    },
  });

  const totalUsers = await db.user.count({
    where: { status: "approved", role: "student" },
  });

  return ok({
    leaderboard: top.map((u, i) => ({
      rank: i + 1,
      ...u,
    })),
    me: {
      rank: betterCount + 1,
      totalPoints: currentUser.totalPoints,
      totalUsers,
    },
  });
}

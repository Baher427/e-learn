import { db } from "@/lib/db";
import { ok } from "@/lib/api";

/**
 * GET /api/trainers — list all trainers (public for registration dropdown).
 */
export async function GET() {
  const trainers = await db.trainer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return ok({ trainers });
}

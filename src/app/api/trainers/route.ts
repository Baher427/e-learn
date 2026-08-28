import { db } from "@/lib/db";
import { ok, firestoreSetupFail } from "@/lib/api";

/**
 * GET /api/trainers — list all trainers (public for registration dropdown).
 */
export async function GET() {
  let trainers;
  try {
    trainers = await db.trainer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  } catch (e) {
    const setupFail = firestoreSetupFail(e);
    if (setupFail) return setupFail;
    throw e;
  }
  return ok({ trainers });
}

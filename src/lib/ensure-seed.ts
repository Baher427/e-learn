/**
 * Idempotent auto-seed — runs once per server instance, on the first
 * login attempt against an EMPTY Firestore database. This makes the
 * production database self-bootstrap: the moment Firestore is enabled
 * in the Firebase console, the first login creates the admin/student
 * accounts, default settings and the welcome notification.
 *
 * (The same data can also be created manually via `bun run src/scripts/seed.ts`.)
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

const globalForSeed = globalThis as unknown as { __elearnSeeded: boolean };

export async function ensureSeeded(): Promise<void> {
  if (globalForSeed.__elearnSeeded) return;

  const existing = await db.user.findFirst({ where: { username: "admin" }, select: { id: true } });
  if (existing) {
    globalForSeed.__elearnSeeded = true;
    return;
  }

  // Empty database → bootstrap everything (same data as seed.ts).
  const adminPass = await hashPassword("admin123456");
  const studentPass = await hashPassword("student123");

  const trainer = await db.trainer.upsert({
    where: { phone: "01000000000" },
    update: {},
    create: { name: "أ. أحمد محمد", phone: "01000000000", email: "trainer@elearn.test" },
  });

  await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@elearn.test",
      phone: "01000000001",
      studentName: "المدير العام",
      role: "admin",
      passwordHash: adminPass,
      status: "approved",
      level: 10,
      validityEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  await db.user.upsert({
    where: { username: "student" },
    update: {},
    create: {
      username: "student",
      email: "student@elearn.test",
      phone: "01000000002",
      studentName: "طالب تجريبي",
      passwordHash: studentPass,
      status: "approved",
      level: 3,
      trainerId: trainer.id,
      totalPoints: 120,
      pvpPoints: 75,
      validityEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  const defaults: Record<string, string> = {
    money_exchange_rate: "0.020",
    money_min_withdrawal: "50",
    money_system_status: "1",
    ai_daily_limit: "5",
    ai_status: "1",
    ai_msg: "تحدّي الروبوت مفتوح! استعد لمباراة ذكية.",
    tier1_q: "10", tier1_time: "2", tier1_win: "5", tier1_loss: "2", tier1_status: "1", tier1_msg: "الطبقة البرونزية مفتوحة",
    tier2_q: "15", tier2_time: "3", tier2_win: "10", tier2_loss: "5", tier2_status: "1", tier2_msg: "الطبقة الفضية مفتوحة",
    tier3_q: "20", tier3_time: "5", tier3_win: "20", tier3_loss: "10", tier3_status: "1", tier3_msg: "الطبقة الذهبية مفتوحة",
  };
  for (const [k, v] of Object.entries(defaults)) {
    await db.systemSetting.upsert({ where: { key: k }, update: {}, create: { key: k, value: v } });
  }

  await db.notification.upsert({
    where: { id: "welcome-broadcast" },
    update: {},
    create: {
      id: "welcome-broadcast",
      title: "مرحباً بك في e-learn! 🎉",
      message: "أهلاً بك في منصة e-learn الجديدة لعام 2027. استكشف التدريبات والمسابقات وابدأ رحلتك نحو التميّز!",
      isBroadcast: true,
    },
  });

  globalForSeed.__elearnSeeded = true;
  console.log("🌱 Firestore auto-seeded (admin / student / settings / welcome).");
}

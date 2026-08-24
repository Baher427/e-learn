/**
 * Seed script — creates a demo trainer + admin + student for testing.
 * Run with: bun run src/scripts/seed.ts
 */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

async function main() {
  // 1. Create a demo trainer
  const trainer = await db.trainer.upsert({
    where: { phone: "01000000000" },
    update: {},
    create: { name: "أ. أحمد محمد", phone: "01000000000", email: "trainer@elearn.test" },
  });
  console.log("✓ Trainer:", trainer.name);

  // 2. Create admin
  const adminPass = await hashPassword("admin123456");
  const admin = await db.user.upsert({
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
  console.log("✓ Admin:", admin.username, "(password: admin123456)");

  // 3. Create demo student (approved)
  const studentPass = await hashPassword("student123");
  const student = await db.user.upsert({
    where: { username: "student" },
    update: {},
    create: {
      username: "student",
      email: "student@elearn.test",
      phone: "01000000002",
      studentName: "طالب تجريبي",
      role: "student",
      passwordHash: studentPass,
      status: "approved",
      level: 3,
      trainerId: trainer.id,
      totalPoints: 120,
      pvpPoints: 75,
      validityEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("✓ Student:", student.username, "(password: student123)");

  // 4. Seed default system settings
  const defaults: Record<string, string> = {
    "money_exchange_rate": "0.020",
    "money_min_withdrawal": "50",
    "money_system_status": "1",
    "ai_daily_limit": "5",
    "ai_status": "1",
    "ai_msg": "تحدّي الروبوت مفتوح! استعد لمباراة ذكية.",
    "tier1_q": "10", "tier1_time": "2", "tier1_win": "5", "tier1_loss": "2", "tier1_status": "1", "tier1_msg": "الطبقة البرونزية مفتوحة",
    "tier2_q": "15", "tier2_time": "3", "tier2_win": "10", "tier2_loss": "5", "tier2_status": "1", "tier2_msg": "الطبقة الفضية مفتوحة",
    "tier3_q": "20", "tier3_time": "5", "tier3_win": "20", "tier3_loss": "10", "tier3_status": "1", "tier3_msg": "الطبقة الذهبية مفتوحة",
    "last_point_deduction": new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(defaults)) {
    await db.systemSetting.upsert({ where: { key: k }, update: {}, create: { key: k, value: v } });
  }
  console.log("✓ System settings seeded");

  // 5. Broadcast welcome notification
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
  console.log("✓ Welcome notification");

  console.log("\n--- Seed complete ---");
  console.log("Admin login:    admin / admin123456");
  console.log("Student login:  student / student123");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

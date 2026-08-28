/**
 * One-time migration: Supabase Postgres (legacy Prisma) → Firebase Firestore.
 * Preserves all IDs, dates and relations. Idempotent (upsert by id).
 *
 * Usage (reads Supabase via DATABASE_URL, writes Firestore via src/lib/db):
 *   DATABASE_URL='<supabase pooler url>' DIRECT_URL='<supabase session url>' \
 *     bun run src/scripts/migrate-supabase-to-firestore.ts
 *
 * • Locally it writes to the Firestore EMULATOR (FIRESTORE_EMULATOR_HOST in .env).
 * • For the REAL database run it with `env -u FIRESTORE_EMULATOR_HOST` …
 *   (requires the service account to have the Cloud Datastore Owner role).
 */
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

const prisma = new PrismaClient();

type Row = Record<string, unknown>;

async function migrate(model: string, rows: Row[]) {
  let n = 0;
  for (const row of rows) {
    const data = { ...row };
    await (db as any)[model].upsert({ where: { id: row.id }, update: data, create: data });
    n++;
  }
  console.log(`✓ ${model}: ${n} rows migrated`);
}

async function main() {
  console.log("— reading Supabase Postgres …");

  const trainers = await prisma.trainer.findMany();
  const users = await prisma.user.findMany();
  const settings = await prisma.systemSetting.findMany();
  const notifications = await prisma.notification.findMany();
  const notificationReads = await prisma.notificationRead.findMany();
  const trainings = await prisma.training.findMany();
  const exams = await prisma.generatedExam.findMany();
  const matches = await prisma.pvpMatch.findMany();
  const friendships = await prisma.friendship.findMany();
  const withdrawals = await prisma.withdrawalRequest.findMany();
  const activity = await prisma.activityLog.findMany();
  const audits = await prisma.auditLog.findMany();
  const fcmTokens = await prisma.fcmToken.findMany();

  console.log(
    `source rows → users:${users.length} trainers:${trainers.length} settings:${settings.length} ` +
      `notifications:${notifications.length} reads:${notificationReads.length} trainings:${trainings.length} ` +
      `exams:${exams.length} pvpMatches:${matches.length} friendships:${friendships.length} ` +
      `withdrawals:${withdrawals.length} activity:${activity.length} audits:${audits.length} fcm:${fcmTokens.length}`
  );

  console.log("— writing to Firestore …");
  // Dependency order: parents before children (Firestore has no FK constraints,
  // this just keeps relation hydration consistent if anything reads mid-run).
  await migrate("trainer", trainers);
  await migrate("user", users);
  await migrate("systemSetting", settings);
  await migrate("notification", notifications);
  await migrate("notificationRead", notificationReads);
  await migrate("training", trainings);
  await migrate("generatedExam", exams);
  await migrate("pvpMatch", matches);
  await migrate("friendship", friendships);
  await migrate("withdrawalRequest", withdrawals);
  await migrate("activityLog", activity);
  await migrate("auditLog", audits);
  await migrate("fcmToken", fcmTokens);

  console.log("✅ migration complete");
}

main()
  .catch((e: unknown) => {
    console.error("MIGRATION FAILED:", (e as Error)?.message ?? e);
    process.exit(1);
  })
  .finally(() => {
    (prisma as any).$disconnect();
  });

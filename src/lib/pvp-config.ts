/**
 * Server-only PVP config loaders (Firebase Firestore).
 * Split out of pvp.ts so client components importing pvp types never
 * pull the DB (firebase-admin) into the browser bundle.
 */
import { db } from '@/lib/db'

/**
 * Loads the merged AI config (defaults + admin overrides from SystemSetting).
 * Reads `ai_status`, `ai_msg`, `ai_daily_limit`.
 *
 * Imported by the API routes.
 */
export async function loadAiConfigFromDb(
  rows?: Array<{ key: string; value: string }>
): Promise<typeof DEFAULT_AI_CONFIG> {
  let settingRows: Array<{ key: string; value: string }>
  if (rows) {
    settingRows = rows
  } else {
    settingRows = await db.systemSetting.findMany({
      where: { key: { startsWith: 'ai_' } },
    })
  }
  const map: Record<string, string> = {}
  for (const r of settingRows) map[r.key] = r.value
  return {
    status: map.ai_status
      ? (parseInt(map.ai_status, 10) === 1 ? 1 : 0)
      : DEFAULT_AI_CONFIG.status,
    msg: map.ai_msg ?? DEFAULT_AI_CONFIG.msg,
    dailyLimit: map.ai_daily_limit
      ? parseInt(map.ai_daily_limit, 10)
      : DEFAULT_AI_CONFIG.dailyLimit,
  }
}

/**
 * Loads the merged tier config (defaults + admin overrides from SystemSetting).
 * Reads the same DB row keys the legacy app used: `tier1_q`, `tier1_time`, etc.
 *
 * Imported by the API routes so the same config drives both the lobby display
 * (sent to client for UI) and the server-side bet deduction logic.
 */
export async function loadTiersFromDb(
  rows?: Array<{ key: string; value: string }>
): Promise<Record<TierId, TierConfig>> {
  // Allow callers to pass pre-fetched rows to avoid an extra query.
  let settingRows: Array<{ key: string; value: string }>
  if (rows) {
    settingRows = rows
  } else {
    settingRows = await db.systemSetting.findMany()
  }
  const map: Record<string, string> = {}
  for (const r of settingRows) map[r.key] = r.value

  const result: Record<TierId, TierConfig> = {
    1: { ...DEFAULT_TIERS[1] },
    2: { ...DEFAULT_TIERS[2] },
    3: { ...DEFAULT_TIERS[3] },
  }
  ;([1, 2, 3] as TierId[]).forEach((tierId) => {
    const t = { ...result[tierId] }
    if (map[`tier${tierId}_q`]) t.q = parseInt(map[`tier${tierId}_q`], 10) || t.q
    if (map[`tier${tierId}_time`]) t.time = parseFloat(map[`tier${tierId}_time`]) || t.time
    if (map[`tier${tierId}_win`]) t.win = parseInt(map[`tier${tierId}_win`], 10) || t.win
    if (map[`tier${tierId}_loss`]) t.loss = parseInt(map[`tier${tierId}_loss`], 10) || t.loss
    if (map[`tier${tierId}_status`]) {
      t.status = (parseInt(map[`tier${tierId}_status`], 10) === 1 ? 1 : 0) as 0 | 1
    }
    if (map[`tier${tierId}_msg`]) t.msg = map[`tier${tierId}_msg`]
    result[tierId] = t
  })
  return result
}

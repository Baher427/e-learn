/**
 * PVP shared lib — tier configs, bot configs, types.
 * Imported by both the API routes and the views so there's one source of truth.
 *
 * Hard requirements (from legacy analysis):
 *  - All scoring is server-authoritative; the client never sees the answer key.
 *  - `check_incoming` returns ONLY question texts (no answers).
 *  - Tier configs must not be client-trusted; the server reads them back from
 *    the stored `questionsJson` when computing the winner.
 */

import seedrandom from 'seedrandom'

export type TierId = 1 | 2 | 3

export interface TierConfig {
  id: TierId
  /** Tier name (Arabic) */
  name: string
  /** English label used for CSS classnames */
  slug: 'bronze' | 'silver' | 'gold'
  /** Number of questions per match */
  q: number
  /** Duration in MINUTES (legacy used minutes) */
  time: number
  /** Points the winner takes */
  win: number
  /** Points each side wagers (also = loss for the loser) */
  loss: number
  /** Whether the tier is currently open */
  status: 0 | 1
  /** Optional message shown when the tier is closed */
  msg?: string
  gradient: string
}

/**
 * Default tier config — admin can override via `system_settings` rows.
 * The keys in DB are: `tier1_q`, `tier1_time`, `tier1_win`, `tier1_loss`,
 * `tier1_status`, `tier1_msg`, etc.
 */
export const DEFAULT_TIERS: Record<TierId, TierConfig> = {
  1: {
    id: 1,
    name: 'برونزي',
    slug: 'bronze',
    q: 10,
    time: 2,
    win: 20,
    loss: 10,
    status: 1,
    msg: '',
    gradient: 'from-amber-700 to-yellow-800',
  },
  2: {
    id: 2,
    name: 'فضي',
    slug: 'silver',
    q: 15,
    time: 3,
    win: 40,
    loss: 20,
    status: 1,
    msg: '',
    gradient: 'from-slate-400 to-slate-600',
  },
  3: {
    id: 3,
    name: 'ذهبي',
    slug: 'gold',
    q: 20,
    time: 4,
    win: 80,
    loss: 40,
    status: 1,
    msg: '',
    gradient: 'from-yellow-500 to-amber-600',
  },
}

export interface AiConfig {
  status: 0 | 1
  msg: string
  dailyLimit: number
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  status: 1,
  msg: 'العب ضد الذكاء الاصطناعي!',
  dailyLimit: 5,
}

/** Bot-speed table indexed by user level. Each entry is `[minMs, maxMs]` per question. */
export const BOT_SPEED_BY_LEVEL: Record<number, [number, number]> = {
  1: [2140, 4280],
  2: [1800, 3600],
  3: [1500, 3200],
  4: [1200, 3000],
}
/** Fallback for levels above 4 (or unknown). */
export const DEFAULT_BOT_SPEED: [number, number] = [1200, 3000]

export function botSpeedForLevel(level: number): [number, number] {
  return BOT_SPEED_BY_LEVEL[level] ?? DEFAULT_BOT_SPEED
}

/** Question types selectable for an AI match — legacy used addition/subtraction only. */
export type AiQuestionType = 'addition_subtraction' | 'multiplication' | 'division'

/**
 * Stored in the PvpMatch.questionsJson `config` block. We persist this so the
 * server can re-derive the winner without trusting any client-supplied score.
 */
export interface MatchConfig {
  tier: TierId
  /** Total duration in SECONDS (we convert minutes→seconds at insert time) */
  durationSec: number
  winPoints: number
  lossPoints: number
  /** For AI matches: bot speed [minMs, maxMs] */
  botMin?: number
  botMax?: number
  /** For AI matches: question type used to generate the batch */
  gameType?: AiQuestionType
  /** Number settings shared for both AI and PVP */
  settings?: Record<string, unknown>
}

/** Stored questions shape (server-side only — the client NEVER sees `answer`). */
export interface StoredQuestion {
  /** Question index, 0-based */
  i: number
  /** Question display text (e.g. "5 + 3" or stacked) */
  q: string
  /** Authoritative answer */
  a: number
  /** Operands for rendering */
  terms: (number | string)[]
}

/** What the client is allowed to see (no `a`, no `terms` if sensitive). */
export interface PublicQuestion {
  i: number
  q: string
  terms: (number | string)[]
}

/** Convert stored questions to public ones (strips the answer). */
export function toPublicQuestions(qs: StoredQuestion[]): PublicQuestion[] {
  return qs.map(({ i, q, terms }) => ({ i, q, terms }))
}

/** Shape of the persisted `questionsJson` field. */
export interface QuestionsJsonShape {
  questions: StoredQuestion[]
  config: MatchConfig
  seed: string
}

/** Helper to serialize a QuestionsJsonShape for DB storage. */
export function encodeQuestionsJson(shape: QuestionsJsonShape): string {
  return JSON.stringify(shape)
}

/** Helper to deserialize — throws on malformed JSON. */
export function decodeQuestionsJson(raw: string): QuestionsJsonShape {
  const parsed = JSON.parse(raw) as QuestionsJsonShape
  if (!Array.isArray(parsed.questions) || !parsed.config) {
    throw new Error('malformed questionsJson')
  }
  return parsed
}

/** Compute the bot's correctness count deterministically from the seed + questions. */
export function computeBotScore(opts: {
  seed: string
  questions: StoredQuestion[]
  botMin: number
  botMax: number
}): { correct: number; totalTimeMs: number; perQuestion: Array<{ i: number; correct: boolean; timeMs: number }> } {
  // Use a derived RNG seeded with the match seed so the bot's run is reproducible.
  const rng = seedrandom(`${opts.seed}-bot`)
  const perQuestion: Array<{ i: number; correct: boolean; timeMs: number }> = []
  let totalTimeMs = 0
  let correct = 0
  for (const q of opts.questions) {
    // 85% chance of correct (matches legacy)
    const isCorrect = rng() > 0.15
    if (isCorrect) correct++
    // random delay in [botMin, botMax]
    const tMs = Math.floor(rng() * (opts.botMax - opts.botMin + 1)) + opts.botMin
    totalTimeMs += tMs
    perQuestion.push({ i: q.i, correct: isCorrect, timeMs: tMs })
  }
  return { correct, totalTimeMs, perQuestion }
}

/** Compute seconds until next local midnight (Africa/Cairo equivalent). */
export function secondsToMidnight(now: Date = new Date()): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000))
}

/** Format `secondsToMidnight` as `HH:MM:SS` Arabic-style. */
export function formatCountdown(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

/** Returns `YYYY-MM-DD` for the local date (used for daily-bonus gating). */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

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
    const { db } = await import('@/lib/db')
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
    const { db } = await import('@/lib/db')
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

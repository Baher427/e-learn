/**
 * Mental-math question generators (ported from the PHP legacy,
 * hardened with seeded RNG so the server can re-derive correctness
 * without ever trusting the client).
 */
import seedrandom from 'seedrandom'

export type QuestionType =
  | 'addition_subtraction'
  | 'multiplication'
  | 'division'
  | 'imagination'

export interface Question {
  /** "5 + 3" or "12 × 4" or stacked representation */
  text: string
  answer: number
  /** Raw operands for rendering */
  terms: (number | string)[]
}

export interface GameSettings {
  type: QuestionType
  numberLength?: number
  num1Length?: number
  num2Length?: number
  dividendLength?: number
  divisorLength?: number
  termsCount?: number
  displayTime?: number // seconds
  disappearTime?: number // seconds
  displayMethod?: 'sequential' | 'full'
  solvingMethod?: 'direct' | 'friendsOf5' | 'friendsOf10'
  questionCount?: number
  seed?: string
}

// --------------------------------------------------------------------
// Seeded RNG (deterministic per seed)
// --------------------------------------------------------------------

export function makeRng(seed: string) {
  return seedrandom(seed)
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

// --------------------------------------------------------------------
// Generators
// --------------------------------------------------------------------

/**
 * أصدقاء الخمسة / أصدقاء العشرة — complement-pair generation.
 * Terms after the first come in pairs (a, target−a) that sum exactly
 * to 5 or 10, sharing one sign per pair, with the running total
 * guarded to [0, 10_000_000]. Mirrors the client-side generator in
 * game-view.tsx exactly (same seeded RNG derivation) so the server
 * can re-derive correctness for friends-mode attempts.
 */
export function generateAddSubFriends(
  rng: () => number,
  method: 'friendsOf5' | 'friendsOf10',
  numberLength = 1,
  termsCount = 2
): Question {
  const target = method === 'friendsOf5' ? 5 : 10

  // Classic two-term drill: either "a + (target−a)" (the friend pair,
  // e.g. "2 + 3") or "target − a" where the answer IS the friend.
  if (termsCount <= 2) {
    const a = randInt(rng, 1, target - 1)
    const b = target - a
    if (rng() > 0.5) {
      return { text: `${a} + ${b}`, answer: target, terms: [a, '+', b] }
    }
    return { text: `${target} - ${a}`, answer: b, terms: [target, '-', a] }
  }

  const max = Math.pow(10, numberLength)
  let total = randInt(rng, 0, max - 1)
  const terms: (number | string)[] = [total]

  let remaining = termsCount - 1
  while (remaining > 0) {
    if (remaining >= 2) {
      const a = randInt(rng, 1, target - 1)
      const b = target - a // the friend/complement
      const negative = rng() > 0.5
      if (negative && total - (a + b) >= 0) {
        terms.push('-', a, '-', b)
        total -= a + b
      } else {
        terms.push('+', a, '+', b)
        total += a + b
      }
      remaining -= 2
    } else {
      // Odd tail: a single friend value with a guarded sign.
      const a = randInt(rng, 1, target - 1)
      if (rng() > 0.5 && total - a >= 0) {
        terms.push('-', a)
        total -= a
      } else {
        terms.push('+', a)
        total += a
      }
      remaining -= 1
    }
  }

  return { text: terms.join(' '), answer: total, terms }
}

export function generateAddSub(
  rng: () => number,
  numberLength = 1,
  termsCount = 2
): Question {
  const max = Math.pow(10, numberLength)
  let total = randInt(rng, 0, max - 1)
  const terms: (number | string)[] = [total]
  for (let i = 1; i < termsCount; i++) {
    const op = rng() > 0.5 ? '+' : '-'
    const num = randInt(rng, 0, max - 1)
    if (op === '+' && total + num < 10_000_000) {
      terms.push('+', num)
      total += num
    } else if (op === '-' && total - num >= 0) {
      terms.push('-', num)
      total -= num
    } else {
      terms.push('+', 0)
    }
  }
  return { text: terms.join(' '), answer: total, terms }
}

export function generateMultiplication(
  rng: () => number,
  num1Length = 2,
  num2Length = 1
): Question {
  const getNum = (digits: number) => {
    if (digits === 1) return randInt(rng, 1, 9)
    const min = Math.pow(10, digits - 1)
    const max = Math.pow(10, digits) - 1
    return randInt(rng, min, max)
  }
  const n1 = getNum(num1Length)
  const n2 = getNum(num2Length)
  return { text: `${n1} × ${n2}`, answer: n1 * n2, terms: [n1, '×', n2] }
}

export function generateDivision(
  rng: () => number,
  dividendLength = 3,
  divisorLength = 1
): Question {
  let d: number
  if (divisorLength === 1) {
    d = randInt(rng, 2, 9)
  } else {
    const min = Math.pow(10, divisorLength - 1)
    const max = Math.pow(10, divisorLength) - 1
    d = randInt(rng, min, max)
  }
  const minD = Math.pow(10, dividendLength - 1)
  const maxD = Math.pow(10, dividendLength) - 1
  const minQ = Math.ceil(minD / d)
  const maxQ = Math.floor(maxD / d)
  if (minQ > maxQ) {
    return { text: '100 ÷ 2', answer: 50, terms: [100, '÷', 2] }
  }
  const q = randInt(rng, minQ, maxQ)
  const D = q * d
  return { text: `${D} ÷ ${d}`, answer: q, terms: [D, '÷', d] }
}

/** Imagination = same as add/sub but historically treated separately. */
export const generateImagination = generateAddSub

export function generateQuestion(
  settings: GameSettings,
  seedSuffix = ''
): Question {
  const seed = `${settings.seed ?? 'default'}-${settings.type}-${seedSuffix}`
  const rng = makeRng(seed)
  switch (settings.type) {
    case 'addition_subtraction':
      if (
        settings.solvingMethod === 'friendsOf5' ||
        settings.solvingMethod === 'friendsOf10'
      ) {
        return generateAddSubFriends(
          rng,
          settings.solvingMethod,
          settings.numberLength ?? 1,
          settings.termsCount ?? 2
        )
      }
      return generateAddSub(rng, settings.numberLength ?? 1, settings.termsCount ?? 2)
    case 'multiplication':
      return generateMultiplication(rng, settings.num1Length ?? 2, settings.num2Length ?? 1)
    case 'division':
      return generateDivision(rng, settings.dividendLength ?? 3, settings.divisorLength ?? 1)
    case 'imagination':
      return generateImagination(rng, settings.numberLength ?? 1, settings.termsCount ?? 2)
  }
}

/** Generate a batch of N questions. */
export function generateBatch(settings: GameSettings, count: number): Question[] {
  return Array.from({ length: count }, (_, i) => generateQuestion(settings, String(i)))
}

// --------------------------------------------------------------------
// Server-side scoring (re-derive correctness; never trust the client)
// --------------------------------------------------------------------

export interface AnswerRecord {
  questionIndex: number
  userAnswer: number | string
}

export interface ScoringResult {
  correctCount: number
  totalCount: number
  averageScore: number // 0..100
  totalTimeMs: number
  results: {
    questionIndex: number
    questionText: string
    correctAnswer: number
    userAnswer: number | string
    isCorrect: boolean
    timeTaken?: number
  }[]
}

/**
 * Re-derives the questions from the settings+seed, then compares each
 * userAnswer against the authoritative correct answer.
 */
export function scoreAttempt(opts: {
  settings: GameSettings
  seed: string
  answers: AnswerRecord[]
  timesMs?: number[]
}): ScoringResult {
  const { settings, seed, answers, timesMs } = opts
  const settingsWithSeed = { ...settings, seed }
  const questions = generateBatch(settingsWithSeed, answers.length)

  const results = answers.map((a, i) => {
    const q = questions[i]
    if (!q) {
      return {
        questionIndex: a.questionIndex,
        questionText: '?',
        correctAnswer: 0,
        userAnswer: a.userAnswer,
        isCorrect: false,
        timeTaken: timesMs?.[i],
      }
    }
    const userNum = typeof a.userAnswer === 'string' ? Number(a.userAnswer) : a.userAnswer
    const isCorrect = !Number.isNaN(userNum) && userNum === q.answer
    return {
      questionIndex: a.questionIndex,
      questionText: q.text,
      correctAnswer: q.answer,
      userAnswer: a.userAnswer,
      isCorrect,
      timeTaken: timesMs?.[i],
    }
  })

  const correctCount = results.filter((r) => r.isCorrect).length
  const totalTimeMs = timesMs?.reduce((s, t) => s + t, 0) ?? 0
  return {
    correctCount,
    totalCount: answers.length,
    averageScore: answers.length ? (correctCount / answers.length) * 100 : 0,
    totalTimeMs,
    results,
  }
}

// --------------------------------------------------------------------
// Settings validation schemas (shared with the client)
// --------------------------------------------------------------------

import { z } from 'zod'

export const addSubSettingsSchema = z.object({
  type: z.literal('addition_subtraction'),
  numberLength: z.number().int().min(1).max(4),
  termsCount: z.number().int().min(2).max(20),
  displayTime: z.number().min(0.1).max(10),
  disappearTime: z.number().min(0.1).max(10),
  displayMethod: z.enum(['sequential', 'full']),
  solvingMethod: z.enum(['direct', 'friendsOf5', 'friendsOf10']).optional(),
})

export const multSettingsSchema = z.object({
  type: z.literal('multiplication'),
  num1Length: z.number().int().min(1).max(4),
  num2Length: z.number().int().min(1).max(3),
  displayTime: z.number().min(0.1).max(10),
  disappearTime: z.number().min(0.1).max(10),
  displayMethod: z.enum(['sequential', 'full']),
})

export const divSettingsSchema = z.object({
  type: z.literal('division'),
  dividendLength: z.number().int().min(2).max(4),
  divisorLength: z.number().int().min(1).max(2),
  displayTime: z.number().min(0.1).max(10),
  disappearTime: z.number().min(0.1).max(10),
  displayMethod: z.enum(['sequential', 'full']),
})

export const anySettingsSchema = z.union([
  addSubSettingsSchema,
  multSettingsSchema,
  divSettingsSchema,
])

export type ValidatedSettings = z.infer<typeof anySettingsSchema>

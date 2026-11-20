/**
 * 習熟度（学習アルゴリズム）
 *
 * 1回正解しただけでは「習得」にならない。
 * - 連続正解数（streak）・累計正解数・正解した日数・最終正解日 から習熟レベルを計算する
 * - 正解するたびに次の復習時刻（due）を延ばす（間隔反復）
 * - 間違えると streak がリセットされ、すぐに再出題対象になる
 */
import type { StationId } from './network'

export interface StationRecord {
  seen: number
  correct: number
  wrong: number
  streak: number
  lastAt: number
  lastCorrectAt: number
  lastWrongAt: number
  lastResult: boolean | null
  /** 正解した日（YYYY-MM-DD）。最大7日分 */
  correctDays: string[]
  /** 次に復習すべき時刻 */
  due: number
}

export const emptyRecord = (): StationRecord => ({
  seen: 0, correct: 0, wrong: 0, streak: 0, lastAt: 0, lastCorrectAt: 0, lastWrongAt: 0,
  lastResult: null, correctDays: [], due: 0,
})

const MIN = 60_000
const DAY = 86_400_000
/** streak ごとの復習間隔 */
const INTERVALS = [0, 5 * MIN, 30 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]

export function applyAnswer(r: StationRecord, correct: boolean, now = Date.now(), day: string): StationRecord {
  const n = { ...r, correctDays: [...r.correctDays] }
  n.seen++
  n.lastAt = now
  n.lastResult = correct
  if (correct) {
    n.correct++
    n.streak++
    n.lastCorrectAt = now
    if (!n.correctDays.includes(day)) n.correctDays = [...n.correctDays, day].slice(-7)
    n.due = now + INTERVALS[Math.min(n.streak, INTERVALS.length - 1)]
  } else {
    n.wrong++
    n.streak = 0
    n.lastWrongAt = now
    n.due = now
  }
  return n
}

export const LEVEL_NAMES = ['未学習', '学習中', 'うろ覚え', '定着中', '習得', 'マスター'] as const
export const LEVEL_COLORS = ['#cbd5e1', '#f87171', '#fb923c', '#facc15', '#4ade80', '#3b82f6'] as const

/** 習熟レベル 0〜5 */
export function masteryLevel(r: StationRecord | undefined, now = Date.now()): number {
  if (!r || r.seen === 0) return 0
  let lv: number
  if (r.streak >= 3 && r.correct >= 4) {
    lv = r.correctDays.length >= 2 && now - r.lastCorrectAt < 14 * DAY ? 5 : 4
  } else if (r.streak >= 2) lv = 3
  else if (r.streak >= 1) lv = 2
  else lv = 1
  // 長期間正解していない駅は1段階下げる（忘却）
  if (lv >= 3 && now - r.lastCorrectAt > 21 * DAY) lv -= 1
  return lv
}

/** 出題の優先度。苦手・未学習・復習時期の駅ほど大きい */
export function priority(r: StationRecord | undefined, now = Date.now()): number {
  if (!r || r.seen === 0) return 3
  const lv = masteryLevel(r, now)
  let w = 1
  w += (r.wrong / r.seen) * 4
  if (r.lastResult === false) w += 5
  if (r.due <= now) w += 2.5
  if (lv <= 2) w += 2
  if (lv >= 5) w *= 0.25
  else if (lv === 4) w *= 0.5
  return w
}

/** 苦手度スコア（苦手駅ランキング用） */
export function weakness(r: StationRecord | undefined): number {
  if (!r || r.wrong === 0) return 0
  return r.wrong * 2 - r.correct * 0.6 + (r.lastResult === false ? 3 : 0) - r.streak
}

export function isWeak(r: StationRecord | undefined) {
  return !!r && r.wrong > 0 && (r.lastResult === false || r.wrong >= r.correct || r.streak < 2)
}

export type Records = Record<StationId, StationRecord>

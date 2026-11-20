/**
 * 進捗データ（LocalStorage保存）と育成システム
 * 経験値・レベル・称号・連続正解・デイリーチャレンジ・学習履歴
 */
import { useSyncExternalStore } from 'react'
import { applyAnswer, emptyRecord, masteryLevel, type Records } from './mastery'
import { KEIHAN_STATIONS, getLine, type StationId } from './network'
import { todayKey } from './random'

export interface HistoryEntry {
  at: number
  mode: string
  title: string
  correct: number
  total: number
  xp: number
}

export interface Progress {
  version: 1
  records: Records
  xp: number
  answered: number
  correct: number
  streak: number
  bestStreak: number
  lineStats: Record<string, { answered: number; correct: number }>
  history: HistoryEntry[]
  daily: { lastDone: string; streakDays: number; bestScore: Record<string, number> }
  titles: string[]
  fullTest: Record<string, { correct: number; total: number; seconds: number; at: number }>
  sugoroku: { played: number; won: number; bestMoney: number }
  kansaiCorrect: number
  settings: { sound: boolean }
}

const KEY = 'railway-quest-kansai/v1'

const initial = (): Progress => ({
  version: 1, records: {}, xp: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0,
  lineStats: {}, history: [], daily: { lastDone: '', streakDays: 0, bestScore: {} }, titles: ['minarai'],
  fullTest: {}, sugoroku: { played: 0, won: 0, bestMoney: 0 }, kansaiCorrect: 0, settings: { sound: true },
})

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...initial(), ...JSON.parse(raw) }
  } catch {
    /* 保存データが壊れている・使えない場合は初期化 */
  }
  return initial()
}

let state: Progress = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* プライベートモード等で保存できない場合は無視 */
  }
}

export function update(fn: (p: Progress) => Progress) {
  state = fn(state)
  state = { ...state, titles: computeTitles(state) }
  save()
  listeners.forEach((l) => l())
}

export const getProgress = () => state

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
  )
}

export function resetProgress() {
  state = initial()
  save()
  listeners.forEach((l) => l())
}

// ---------- 経験値・レベル ----------
/** レベル n に必要な累計経験値 = 40 * n * (n - 1) */
export const xpForLevel = (lv: number) => 40 * lv * (lv - 1)
export function levelOf(xp: number) {
  let lv = 1
  while (xpForLevel(lv + 1) <= xp) lv++
  return lv
}

export const RANKS = [
  [1, '見習い駅員'], [5, '駅員'], [10, '主任駅員'], [15, '車掌'], [20, '運転士'],
  [30, '指令員'], [40, '駅長'], [60, '鉄道王'],
] as const
export const rankName = (lv: number) => [...RANKS].reverse().find(([l]) => lv >= l)![1]

// ---------- 回答の記録 ----------
export interface AnswerResult {
  xp: number
  streak: number
  levelUp: boolean
}

export function recordAnswer(opts: { stations: StationId[]; lineId?: string; correct: boolean; kansai?: boolean }): AnswerResult {
  const { stations, lineId, correct } = opts
  const now = Date.now()
  const day = todayKey()
  let gained = 0
  let levelUp = false
  update((p) => {
    const records = { ...p.records }
    for (const id of stations) records[id] = applyAnswer(records[id] ?? emptyRecord(), correct, now, day)
    const streak = correct ? p.streak + 1 : 0
    gained = correct ? 10 + Math.min(streak, 20) : 2
    const xp = p.xp + gained
    levelUp = levelOf(xp) > levelOf(p.xp)
    const lineStats = { ...p.lineStats }
    if (lineId) {
      const s = lineStats[lineId] ?? { answered: 0, correct: 0 }
      lineStats[lineId] = { answered: s.answered + 1, correct: s.correct + (correct ? 1 : 0) }
    }
    return {
      ...p, records, xp, streak, bestStreak: Math.max(p.bestStreak, streak), lineStats,
      answered: p.answered + 1, correct: p.correct + (correct ? 1 : 0),
      kansaiCorrect: p.kansaiCorrect + (opts.kansai && correct ? 1 : 0),
    }
  })
  return { xp: gained, streak: state.streak, levelUp }
}

export function addXp(n: number) {
  update((p) => ({ ...p, xp: p.xp + n }))
}

export function addHistory(e: Omit<HistoryEntry, 'at'>) {
  update((p) => ({ ...p, history: [{ ...e, at: Date.now() }, ...p.history].slice(0, 100) }))
}

export function completeDaily(score: number, total: number) {
  const day = todayKey()
  const yesterday = todayKey(new Date(Date.now() - 86_400_000))
  update((p) => {
    if (p.daily.lastDone === day) {
      return { ...p, daily: { ...p.daily, bestScore: { ...p.daily.bestScore, [day]: Math.max(p.daily.bestScore[day] ?? 0, score) } } }
    }
    const streakDays = p.daily.lastDone === yesterday ? p.daily.streakDays + 1 : 1
    return {
      ...p,
      xp: p.xp + 50 + score * 10,
      daily: { lastDone: day, streakDays, bestScore: { ...p.daily.bestScore, [day]: score } },
    }
  })
  return total
}

// ---------- 称号 ----------
export interface TitleDef {
  id: string
  name: string
  desc: string
  check: (p: Progress) => boolean
}

const keihanIds = (lineIds?: string[]) =>
  lineIds ? [...new Set(lineIds.flatMap((l) => getLine(l).stations))] : KEIHAN_STATIONS.map((s) => s.id)

const allAtLeast = (p: Progress, ids: StationId[], lv: number) => ids.every((id) => masteryLevel(p.records[id]) >= lv)
const countAtLeast = (p: Progress, ids: StationId[], lv: number) => ids.filter((id) => masteryLevel(p.records[id]) >= lv).length

export const TITLES: TitleDef[] = [
  { id: 'minarai', name: '見習い駅員', desc: 'ゲームを始めた', check: () => true },
  { id: 'beginner', name: '京阪ビギナー', desc: '京阪の駅を10駅「うろ覚え」以上にする', check: (p) => countAtLeast(p, keihanIds(), 2) >= 10 },
  { id: 'half', name: '京阪の半分を知る者', desc: '京阪の駅の半数を「習得」以上にする', check: (p) => countAtLeast(p, keihanIds(), 4) >= keihanIds().length / 2 },
  { id: 'main', name: '本線の達人', desc: '京阪本線・鴨東線の全駅を「習得」以上にする', check: (p) => allAtLeast(p, keihanIds(['keihan-main', 'keihan-oto']), 4) },
  { id: 'branch', name: '支線の達人', desc: '中之島線・宇治線・交野線の全駅を「習得」以上にする', check: (p) => allAtLeast(p, keihanIds(['keihan-nakanoshima', 'keihan-uji', 'keihan-katano']), 4) },
  { id: 'otsu', name: '大津線の達人', desc: '京津線・石山坂本線の全駅を「習得」以上にする', check: (p) => allAtLeast(p, keihanIds(['keihan-keishin', 'keihan-ishiyama']), 4) },
  { id: 'keihan-master', name: '京阪マスター', desc: '京阪の全駅を「習得」以上にする', check: (p) => allAtLeast(p, keihanIds(), 4) },
  { id: 'keihan-grand', name: '京阪グランドマスター', desc: '京阪の全駅を「マスター」にする（別々の日に正解が必要）', check: (p) => allAtLeast(p, keihanIds(), 5) },
  { id: 'perfect', name: 'パーフェクト駅員', desc: '全駅テストで満点を取る', check: (p) => Object.values(p.fullTest).some((t) => t.total > 0 && t.correct === t.total) },
  { id: 'streak10', name: '連続正解の星', desc: '10問連続正解', check: (p) => p.bestStreak >= 10 },
  { id: 'streak30', name: '連続正解の鬼', desc: '30問連続正解', check: (p) => p.bestStreak >= 30 },
  { id: 'streak100', name: '無敵の運転士', desc: '100問連続正解', check: (p) => p.bestStreak >= 100 },
  { id: 'daily7', name: '毎日乗車', desc: 'デイリーチャレンジを7日連続達成', check: (p) => p.daily.streakDays >= 7 },
  { id: 'kansai100', name: '関西鉄道通', desc: '関西鉄道クイズで100問正解', check: (p) => p.kansaiCorrect >= 100 },
  { id: 'kansai500', name: '関西鉄道博士', desc: '関西鉄道クイズで500問正解', check: (p) => p.kansaiCorrect >= 500 },
  { id: 'sugoroku1', name: 'すごろく初勝利', desc: '関西鉄道すごろくで1位になる', check: (p) => p.sugoroku.won >= 1 },
  { id: 'sugoroku10', name: '関西すごろく王', desc: '関西鉄道すごろくで10回1位になる', check: (p) => p.sugoroku.won >= 10 },
]

function computeTitles(p: Progress) {
  const have = new Set(p.titles)
  for (const t of TITLES) if (!have.has(t.id) && t.check(p)) have.add(t.id)
  return TITLES.filter((t) => have.has(t.id)).map((t) => t.id)
}

export const titleName = (id: string) => TITLES.find((t) => t.id === id)?.name ?? id

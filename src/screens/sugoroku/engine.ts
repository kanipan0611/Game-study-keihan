/**
 * 関西鉄道すごろく：ゲームロジック
 * - 駅がマス。隣の駅へ1歩ずつ進む。乗換駅では他社線へ0歩で乗り換えられる
 * - 実在する路線・乗換（transfers.json）以外の移動はできない
 */
import {
  adjacency, allStations, distancesFrom, getLine, getStation, isInterchange, isTerminal, lines,
  transferPartners, type StationId,
} from '../../lib/network'
import { hashString, pick, randInt } from '../../lib/random'

export type SquareType = 'blue' | 'red' | 'yellow' | 'green' | 'purple' | 'station'

export const SQUARE_INFO: Record<SquareType, { name: string; color: string; desc: string }> = {
  blue: { name: '青マス', color: '#3b82f6', desc: 'お金がもらえる' },
  red: { name: '赤マス', color: '#ef4444', desc: 'お金を失う' },
  yellow: { name: 'クイズマス', color: '#eab308', desc: '鉄道クイズに正解でボーナス' },
  green: { name: 'カードマス', color: '#22c55e', desc: '特急カードなどがもらえる' },
  purple: { name: 'イベントマス', color: '#a855f7', desc: '何かが起こる！' },
  station: { name: '乗換駅', color: '#f97316', desc: '大きな駅。少し多めにお金がもらえる' },
}

export function squareOf(id: StationId): SquareType {
  if (isInterchange(id) || isTerminal(id)) return 'station'
  const h = hashString(id) % 20
  if (h < 8) return 'blue'
  if (h < 11) return 'red'
  if (h < 14) return 'yellow'
  if (h < 17) return 'green'
  return 'purple'
}

export type CardId = 'tokkyu' | 'kaisoku' | 'kyuko' | 'teiki'
export const CARDS: Record<CardId, { name: string; desc: string; dice: number; bonus: number; icon: string }> = {
  tokkyu: { name: '特急カード', desc: 'サイコロを2個ふれる', dice: 2, bonus: 0, icon: '🚄' },
  kaisoku: { name: '快速特急カード', desc: 'サイコロを3個ふれる', dice: 3, bonus: 0, icon: '⚡' },
  kyuko: { name: '急行カード', desc: 'サイコロ1個＋3駅', dice: 1, bonus: 3, icon: '🚃' },
  teiki: { name: '定期券カード', desc: '使うと100万円もらえる', dice: 0, bonus: 0, icon: '🎫' },
}

export interface Player {
  id: number
  name: string
  color: string
  cpu: boolean
  pos: StationId
  money: number
  cards: CardId[]
  visited: StationId[]
  owned: StationId[]
  skip: number
  completedLines: string[]
  arrivals: number
}

export interface GameState {
  players: Player[]
  turn: number
  /** 1人1回で1ターン。maxRounds 周で終了 */
  round: number
  maxRounds: number
  current: number
  destination: StationId
  log: string[]
  cpuLevel: 1 | 2 | 3
  owner: Record<StationId, number>
}

export const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b']

/** 目的地候補：乗換駅や終点など分かりやすい駅 */
const DEST_POOL = allStations.filter((s) => (isInterchange(s.id) || isTerminal(s.id)) && !getLine(s.lines[0]).minor).map((s) => s.id)

export function chooseDestination(players: Player[], avoid?: StationId): StationId {
  for (let i = 0; i < 50; i++) {
    const d = pick(DEST_POOL)
    if (d === avoid) continue
    const dist = distancesFrom(d)
    const min = Math.min(...players.map((p) => dist.get(p.pos) ?? 99))
    if (min >= 8 && min <= 30) return d
  }
  return pick(DEST_POOL)
}

export function newGame(opts: { names: string[]; cpu: boolean[]; maxRounds: number; cpuLevel: 1 | 2 | 3; start: StationId }): GameState {
  const players: Player[] = opts.names.map((name, i) => ({
    id: i, name, color: PLAYER_COLORS[i], cpu: opts.cpu[i], pos: opts.start, money: 1000,
    cards: ['tokkyu'], visited: [opts.start], owned: [], skip: 0, completedLines: [], arrivals: 0,
  }))
  return {
    players, turn: 0, round: 1, maxRounds: opts.maxRounds, current: 0, destination: chooseDestination(players),
    log: [`ゲーム開始！ ${getStation(opts.start).name}から出発`], cpuLevel: opts.cpuLevel, owner: {},
  }
}

export interface MoveOption {
  to: StationId
  path: StationId[]
}

/**
 * サイコロの目 n で止まれる駅と、そこまでの経路を列挙する。
 * 直前の駅へは戻れない（行き止まりのみ折り返し可）。乗換は0歩。
 * 途中で目的地を通れる場合は目的地で止まる選択肢も加える。
 */
export function moveOptions(from: StationId, n: number, destination: StationId): MoveOption[] {
  type S = { at: StationId; prev: StationId | null; path: StationId[] }
  let frontier: S[] = [{ at: from, prev: null, path: [from] }]
  const destPaths: StationId[][] = []
  for (let step = 0; step < n; step++) {
    const next = new Map<string, S>()
    for (const s of frontier) {
      // 乗換（0歩）で行ける駅も出発点にする
      const origins: { at: StationId; prev: StationId | null; path: StationId[] }[] = [s]
      for (const t of transferPartners(s.at)) origins.push({ at: t, prev: null, path: [...s.path, t] })
      for (const o of origins) {
        const edges = adjacency.get(o.at)!
        let cand = edges.filter((e) => e.to !== o.prev)
        if (!cand.length) cand = edges
        for (const e of cand) {
          const k = `${e.to}|${o.at}`
          if (!next.has(k)) next.set(k, { at: e.to, prev: o.at, path: [...o.path, e.to] })
        }
      }
    }
    frontier = [...next.values()]
    for (const f of frontier) {
      if (f.at === destination || transferPartners(f.at).includes(destination)) {
        destPaths.push(f.at === destination ? f.path : [...f.path, destination])
      }
    }
  }
  const out = new Map<StationId, MoveOption>()
  for (const f of frontier) if (!out.has(f.at)) out.set(f.at, { to: f.at, path: f.path })
  if (destPaths.length) {
    destPaths.sort((a, b) => a.length - b.length)
    out.set(destination, { to: destination, path: destPaths[0] })
  }
  return [...out.values()]
}

/** CPU の行き先選び */
export function cpuChoose(opts: MoveOption[], destination: StationId, level: 1 | 2 | 3): MoveOption {
  const dist = distancesFrom(destination)
  if (level === 1 && Math.random() < 0.5) return pick(opts)
  const pref: Record<SquareType, number> = { blue: 0.3, station: 0.4, yellow: 0.2, green: 0.25, purple: 0.1, red: -0.6 }
  const score = (o: MoveOption) =>
    (o.to === destination ? -100 : 0) + (dist.get(o.to) ?? 99) - (level === 3 ? pref[squareOf(o.to)] : 0) + (level === 2 ? Math.random() * 1.5 : 0)
  return [...opts].sort((a, b) => score(a) - score(b))[0]
}

export function rollDice(count: number) {
  return Array.from({ length: count }, () => randInt(6) + 1)
}

/** 目的地到着ボーナス（遠いほど高い） */
export function arrivalBonus(round: number) {
  return 500 + round * 40
}

export interface EventDef {
  text: string
  apply: (p: Player, g: GameState) => { money?: number; skip?: number; card?: CardId; again?: boolean }
}

export const EVENTS: EventDef[] = [
  { text: '臨時列車が出発！もう一度サイコロをふれる', apply: () => ({ again: true }) },
  { text: '車両点検で運転見合わせ…1回休み', apply: () => ({ skip: 1 }) },
  { text: '沿線のお祭りで臨時収入！ +200万円', apply: () => ({ money: 200 }) },
  { text: 'ICカードを落としてしまった… -100万円', apply: () => ({ money: -100 }) },
  { text: '乗り換え名人と認定！特急カードをもらった', apply: () => ({ card: 'tokkyu' }) },
  { text: '駅ナカのお店が大繁盛！ +300万円', apply: () => ({ money: 300 }) },
  { text: '観光キャンペーンが大成功！ +150万円', apply: () => ({ money: 150 }) },
  { text: '台風接近で計画運休…1回休み', apply: () => ({ skip: 1 }) },
  { text: '鉄道ファンから快速特急カードをもらった！', apply: () => ({ card: 'kaisoku' }) },
  { text: '乗り過ごしてタクシー代 -150万円', apply: () => ({ money: -150 }) },
]

export function randomCard(): CardId {
  const r = Math.random()
  return r < 0.45 ? 'kyuko' : r < 0.8 ? 'tokkyu' : r < 0.9 ? 'kaisoku' : 'teiki'
}

/** 新たに全駅を訪れた路線（路線制覇ボーナス対象） */
export function newlyCompletedLines(p: Player): string[] {
  const v = new Set(p.visited)
  return lines.filter((l) => !l.minor && !p.completedLines.includes(l.id) && l.stations.every((s) => v.has(s))).map((l) => l.id)
}

export const totalAssets = (p: Player) => p.money + p.owned.length * 50

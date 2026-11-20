/**
 * MODE 1: 京阪マスター の問題生成
 */
import { getProgress } from '../progress'
import { priority } from '../mastery'
import {
  KEIHAN_LINES, KEIHAN_TRUNK, getLine, getStation, type StationId,
} from '../network'
import { buildChoices, pick, randInt, shuffle, weightedPick } from '../random'
import type { Generator, Question } from './types'

/** 出題用の「1本の線」。本線＋鴨東線は淀屋橋〜出町柳として扱う */
export interface Seq {
  id: string
  name: string
  stations: StationId[]
}

export const KEIHAN_SEQS: Seq[] = [
  { id: 'trunk', name: '京阪本線・鴨東線', stations: KEIHAN_TRUNK },
  ...['keihan-nakanoshima', 'keihan-uji', 'keihan-katano', 'keihan-keishin', 'keihan-ishiyama', 'keihan-cable'].map((id) => {
    const l = getLine(id)
    return { id, name: l.name, stations: l.stations }
  }),
]

export const KEIHAN_SCOPES = [
  { id: 'all', name: '京阪全線', lines: KEIHAN_LINES.map((l) => l.id) },
  { id: 'main', name: '本線・鴨東線', lines: ['keihan-main', 'keihan-oto'] },
  { id: 'branch', name: '中之島線・宇治線・交野線', lines: ['keihan-nakanoshima', 'keihan-uji', 'keihan-katano'] },
  { id: 'otsu', name: '大津線（京津線・石山坂本線）', lines: ['keihan-keishin', 'keihan-ishiyama'] },
] as const
export type ScopeId = (typeof KEIHAN_SCOPES)[number]['id']

export function scopeStations(scope: ScopeId): StationId[] {
  const lines = KEIHAN_SCOPES.find((s) => s.id === scope)!.lines as readonly string[]
  return [...new Set(lines.flatMap((l) => getLine(l).stations))]
}

const nm = (id: StationId) => getStation(id).name

/** 駅が実際に属する京阪の路線（統計用） */
export function primaryLine(id: StationId, seq?: Seq): string {
  const s = getStation(id)
  if (seq && seq.id !== 'trunk' && s.lines.includes(seq.id)) return seq.id
  return s.lines[0]
}

export function describe(id: StationId) {
  const s = getStation(id)
  const lines = s.lines.map((l) => getLine(l).name).join('・')
  return `${s.name}（${s.kana ?? ''}）${s.code ? ` ${s.code}` : ''}｜${lines}｜${s.pref}`
}

function neighborsText(seq: Seq, id: StationId) {
  const i = seq.stations.indexOf(id)
  const a = seq.stations[i - 1]
  const b = seq.stations[i + 1]
  if (a && b) return `${seq.name}で ${nm(a)} と ${nm(b)} の間。`
  if (a) return `${seq.name}の終点（${nm(a)}の隣）。`
  return `${seq.name}の起点（${b ? nm(b) : ''}の隣）。`
}

const explainOf = (seq: Seq, id: StationId) => `${describe(id)}\n${neighborsText(seq, id)}`

/** 対象駅を苦手度・復習時期で重み付けして選ぶ */
function pickTarget(pool: StationId[], filter?: (id: StationId) => boolean): StationId {
  const recs = getProgress().records
  const cands = filter ? pool.filter(filter) : pool
  return weightedPick(cands.length ? cands : pool, (id) => priority(recs[id]))
}

function seqsOf(id: StationId, minLen = 2) {
  return KEIHAN_SEQS.filter((q) => q.stations.includes(id) && q.stations.length >= minLen)
}

/** 近くの駅名（紛らわしい選択肢） */
function nearbyNames(seq: Seq, idx: number, range = 5) {
  const out: string[] = []
  for (let d = 1; d <= range; d++) {
    if (seq.stations[idx - d]) out.push(nm(seq.stations[idx - d]))
    if (seq.stations[idx + d]) out.push(nm(seq.stations[idx + d]))
  }
  return out
}

function withFill(names: string[], need: number) {
  if (names.length >= need) return names
  const extra = shuffle(KEIHAN_SEQS.flatMap((s) => s.stations).map(nm))
  return [...new Set([...names, ...extra])]
}

// ---------- 1. 駅名暗記 ----------
export function genName(pool: StationId[]): Question {
  const t = pickTarget(pool)
  const s = getStation(t)
  const seq = pick(seqsOf(t))
  const idx = seq.stations.indexOf(t)
  const near = withFill(nearbyNames(seq, idx, 6), 4)
  const mode = !s.code ? 'kana' : pick(['code', 'code', 'kana', 'toCode'] as const)
  if (mode === 'toCode') {
    const codes = seq.stations.map((x) => getStation(x).code).filter((c): c is string => !!c && c !== s.code)
    const { choices, answer } = buildChoices(s.code!, shuffle(codes).slice(0, 6))
    return {
      kind: 'choice', tag: '駅名暗記', prompt: `「${s.name}」の駅ナンバーは？`, choices, answer,
      stations: [t], lineId: primaryLine(t, seq), explain: explainOf(seq, t), strip: { lineId: seq.id, focus: t },
    }
  }
  const { choices, answer } = buildChoices(s.name, near)
  return {
    kind: 'choice', tag: '駅名暗記',
    prompt: mode === 'code' ? `駅ナンバー「${s.code}」の駅は？` : `「${s.kana}」と読む駅は？`,
    sub: mode === 'code' ? seq.name : undefined,
    choices, answer, stations: [t], lineId: primaryLine(t, seq), explain: explainOf(seq, t),
    strip: { lineId: seq.id, focus: t },
  }
}

// ---------- 2. 隣接駅当て ----------
export function genNeighbor(pool: StationId[]): Question {
  const t = pickTarget(pool)
  const seq = pick(seqsOf(t, 3).length ? seqsOf(t, 3) : seqsOf(t))
  const st = seq.stations
  const i = st.indexOf(t)
  const dirs: (1 | -1)[] = []
  if (i < st.length - 1) dirs.push(1)
  if (i > 0) dirs.push(-1)
  const d = pick(dirs)
  const ans = st[i + d]
  const toward = d === 1 ? nm(st[st.length - 1]) : nm(st[0])
  const near = withFill(nearbyNames(seq, i, 4).filter((n) => n !== nm(t)), 4)
  const { choices, answer } = buildChoices(nm(ans), near)
  return {
    kind: 'choice', tag: '隣接駅当て',
    prompt: `${nm(t)} の隣の駅は？`, sub: `${seq.name}・${toward}方面`,
    choices, answer, stations: [t, ans], lineId: primaryLine(t, seq),
    explain: explainOf(seq, t), strip: { lineId: seq.id, focus: t },
  }
}

// ---------- 3. 駅順並べ替え ----------
export function genOrder(pool: StationId[]): Question {
  const t = pickTarget(pool, (id) => seqsOf(id, 4).length > 0)
  const seq = pick(seqsOf(t, 4))
  const len = Math.min(5, seq.stations.length)
  const i = seq.stations.indexOf(t)
  const start = Math.max(0, Math.min(seq.stations.length - len, i - randInt(len)))
  const items = seq.stations.slice(start, start + len)
  return {
    kind: 'order', tag: '駅順並べ替え',
    prompt: `${nm(seq.stations[0])}側から順に並べよう`, sub: seq.name,
    items: items.map(nm), stations: items, lineId: primaryLine(t, seq),
    explain: `${seq.name}： ${items.map(nm).join(' → ')}`, strip: { lineId: seq.id, focus: t },
  }
}

// ---------- 4. 路線別穴埋め ----------
export function genFill(pool: StationId[]): Question {
  const t = pickTarget(pool, (id) => seqsOf(id, 3).length > 0)
  const seq = pick(seqsOf(t, 3))
  const st = seq.stations
  const i = st.indexOf(t)
  const before = st.slice(Math.max(0, i - 2), i).map(nm)
  const after = st.slice(i + 1, i + 3).map(nm)
  const { choices, answer } = buildChoices(nm(t), withFill(nearbyNames(seq, i, 6), 4))
  return {
    kind: 'choice', tag: '路線別穴埋め',
    prompt: [...before, '？', ...after].join(' → '), sub: `${seq.name}の空欄に入る駅は？`,
    choices, answer, stations: [t], lineId: primaryLine(t, seq), explain: explainOf(seq, t),
    strip: { lineId: seq.id, focus: t },
  }
}

// ---------- 5. 駅名から路線を当てる ----------
export function genWhichLine(pool: StationId[]): Question {
  const t = pickTarget(pool)
  const s = getStation(t)
  const ans = pick(s.lines)
  const others = KEIHAN_LINES.filter((l) => !s.lines.includes(l.id)).map((l) => l.name)
  const { choices, answer } = buildChoices(getLine(ans).name, others)
  const multi = s.lines.length > 1
  return {
    kind: 'choice', tag: '路線当て',
    prompt: multi ? `「${s.name}」駅を通る路線はどれ？` : `「${s.name}」は何線の駅？`,
    choices, answer, stations: [t], lineId: ans,
    explain: `${describe(t)}${multi ? '\n（複数の路線が通る駅です）' : ''}`,
    strip: { lineId: ans === 'keihan-main' || ans === 'keihan-oto' ? 'trunk' : ans, focus: t },
  }
}

// ---------- 6. 路線図上の位置当て ----------
export function genMapPick(pool: StationId[]): Question {
  const t = pickTarget(pool)
  const seq = pick(seqsOf(t))
  return {
    kind: 'mapPick', tag: '位置当て', prompt: `「${nm(t)}」はどこ？`, sub: '路線図の駅をタップ',
    target: t, stations: [t], lineId: primaryLine(t, seq), explain: explainOf(seq, t),
    strip: { lineId: seq.id, focus: t },
  }
}

export function genMapIdentify(pool: StationId[]): Question {
  const t = pickTarget(pool)
  const seq = pick(seqsOf(t))
  const i = seq.stations.indexOf(t)
  const { choices, answer } = buildChoices(nm(t), withFill(nearbyNames(seq, i, 4), 4))
  return {
    kind: 'choice', tag: '位置当て', prompt: '光っている駅はどこ？', sub: '路線図を見て答えよう',
    choices, answer, mapHighlight: t, stations: [t], lineId: primaryLine(t, seq),
    explain: explainOf(seq, t), strip: { lineId: seq.id, focus: t },
  }
}

// ---------- 7. 起点から何駅目 ----------
export function genCount(pool: StationId[]): Question {
  const t = pickTarget(pool, (id) => seqsOf(id, 4).some((q) => q.stations.indexOf(id) > 0))
  const seq = pick(seqsOf(t, 4).filter((q) => q.stations.indexOf(t) > 0))
  const n = seq.stations.indexOf(t)
  const opts = new Set<number>([n])
  for (const d of shuffle([-3, -2, -1, 1, 2, 3])) {
    if (opts.size >= 4) break
    if (n + d >= 1 && n + d < seq.stations.length) opts.add(n + d)
  }
  const choices = shuffle([...opts]).map((x) => `${x}駅目`)
  return {
    kind: 'choice', tag: '何駅目',
    prompt: `${nm(seq.stations[0])}から数えて「${nm(t)}」は何駅目？`,
    sub: `${seq.name}（${nm(seq.stations[0])}の次の${nm(seq.stations[1])}を1駅目とする）`,
    choices, answer: choices.indexOf(`${n}駅目`), stations: [t], lineId: primaryLine(t, seq),
    explain: `${seq.name}： ${seq.stations.slice(0, n + 1).map(nm).join(' → ')}\n→ ${n}駅目`,
    strip: { lineId: seq.id, focus: t },
  }
}

export const KEIHAN_TYPES = [
  { id: 'name', name: '駅名暗記', icon: '🔤', desc: '駅ナンバー・読みから駅名を答える', gen: genName },
  { id: 'neighbor', name: '隣接駅当て', icon: '↔️', desc: '方面つきで隣の駅を答える', gen: genNeighbor },
  { id: 'order', name: '駅順並べ替え', icon: '🔢', desc: 'バラバラの駅を正しい順に', gen: genOrder },
  { id: 'fill', name: '路線別穴埋め', icon: '🧩', desc: '路線の空欄に入る駅は？', gen: genFill },
  { id: 'line', name: '路線当て', icon: '🚃', desc: 'この駅は何線？', gen: genWhichLine },
  { id: 'map', name: '路線図の位置当て', icon: '🗺️', desc: '路線図の上で駅の場所を当てる', gen: (p: StationId[]) => (Math.random() < 0.6 ? genMapPick(p) : genMapIdentify(p)) },
  { id: 'count', name: '起点から何駅目', icon: '📏', desc: '淀屋橋などから何駅目？', gen: genCount },
] as const

/** 全形式ミックス（苦手駅の復習や通常プレイ用） */
export function mixedGenerator(pool: StationId[]): Generator {
  return () => pick(KEIHAN_TYPES).gen(pool)
}

/** 苦手駅だけを集中的に出題する */
export function reviewGenerator(weak: StationId[]): Generator {
  const pool = weak.length ? weak : scopeStations('all')
  const gens = [genNeighbor, genFill, genName, genMapPick, genWhichLine]
  return () => pick(gens)(pool)
}

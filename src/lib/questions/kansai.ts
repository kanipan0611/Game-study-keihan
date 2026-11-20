/**
 * MODE 3: 関西鉄道クイズ の問題生成（全社）
 */
import { priority } from '../mastery'
import {
  PREFS, allStations, bestRoute, companyById, getLine, getStation, lines, linesAvailableAt,
  transferGroupOf, transferPartners, type StationId,
} from '../network'
import { getProgress } from '../progress'
import { buildChoices, pick, shuffle, weightedPick } from '../random'
import type { Question } from './types'

const nm = (id: StationId) => getStation(id).name
const co = (id: StationId) => companyById.get(getStation(id).company)!.short
const fullLineName = (lineId: string) => {
  const l = getLine(lineId)
  const c = companyById.get(l.company)!
  return l.name.startsWith(c.short) || l.name.startsWith('JR') ? l.name : `${c.short} ${l.name}`
}

export const KANSAI_COMPANIES = ['keihan', 'hankyu', 'hanshin', 'jr', 'metro', 'kintetsu', 'nankai', 'kyotosubway', 'kobesubway']

let companyFilter: string[] = KANSAI_COMPANIES
export function setCompanyFilter(ids: string[]) {
  companyFilter = ids.length ? ids : KANSAI_COMPANIES
}
const pool = () => allStations.filter((s) => companyFilter.includes(s.company) && !getLine(s.lines[0]).minor)
const linePool = () => lines.filter((l) => companyFilter.includes(l.company) && !l.minor)

function target(filter?: (id: StationId) => boolean): StationId {
  const recs = getProgress().records
  const c = pool().map((s) => s.id).filter((id) => !filter || filter(id))
  return weightedPick(c, (id) => priority(recs[id]))
}

function describe(id: StationId) {
  const s = getStation(id)
  const ls = s.lines.map(fullLineName).join('・')
  const tr = transferPartners(id).map((t) => `${co(t)} ${nm(t)}`)
  return `${co(id)} ${s.name}${s.code ? `（${s.code}）` : ''}｜${ls}｜${s.pref}${tr.length ? `\n乗換: ${tr.join('、')}` : ''}`
}

// この駅の隣駅は？
function qNeighbor(): Question {
  const t = target()
  const s = getStation(t)
  const lineId = pick(s.lines)
  const l = getLine(lineId)
  const i = l.stations.indexOf(t)
  const n = l.stations.length
  const dirs: (1 | -1)[] = []
  if (l.loop || i < n - 1) dirs.push(1)
  if (l.loop || i > 0) dirs.push(-1)
  const d = pick(dirs)
  const ans = l.stations[(i + d + n) % n]
  const toward = l.loop ? (d === 1 ? '内回り（反時計回り）' : '外回り（時計回り）') : `${nm(d === 1 ? l.stations[n - 1] : l.stations[0])}方面`
  const near: string[] = []
  for (let k = 1; k <= 4; k++) {
    for (const j of [i - k, i + k]) if (l.stations[(j + n) % n] && (l.loop || (j >= 0 && j < n))) near.push(nm(l.stations[(j + n) % n]))
  }
  const { choices, answer } = buildChoices(nm(ans), near.filter((x) => x !== nm(t)))
  return {
    kind: 'choice', tag: '隣の駅', prompt: `${nm(t)} の隣の駅は？`, sub: `${fullLineName(lineId)}・${toward}`,
    choices, answer, stations: [t, ans], lineId, explain: describe(t), strip: { lineId, focus: t },
  }
}

// この駅は何線？
function qWhichLine(): Question {
  const t = target()
  const name = nm(t)
  // 同名駅（他社含む）がある路線はすべて正解扱いになるので選択肢から除外
  const valid = new Set(allStations.filter((s) => s.name === name).flatMap((s) => s.lines))
  const ans = pick(getStation(t).lines)
  const others = shuffle(linePool().filter((l) => !valid.has(l.id))).map((l) => fullLineName(l.id))
  const { choices, answer } = buildChoices(fullLineName(ans), others)
  return {
    kind: 'choice', tag: '何線？', prompt: `「${name}」駅がある路線はどれ？`,
    choices, answer, stations: [t], lineId: ans, explain: describe(t), strip: { lineId: ans, focus: t },
  }
}

// この駅で乗り換え可能な路線は？
function qTransfer(): Question {
  const t = target((id) => transferPartners(id).length > 0 || getStation(id).lines.length > 1)
  const own = getStation(t).lines
  const avail = linesAvailableAt(t)
  const foreign = avail.filter((l) => !own.includes(l))
  const ans = pick(foreign.length ? foreign : own)
  const others = shuffle(linePool().filter((l) => !avail.includes(l.id))).map((l) => fullLineName(l.id))
  const { choices, answer } = buildChoices(fullLineName(ans), others)
  const g = transferGroupOf(t)
  return {
    kind: 'choice', tag: '乗換', prompt: `${co(t)}「${nm(t)}」駅で乗り換えできる路線は？`,
    sub: g?.walk ? '（改札外の徒歩連絡を含む）' : undefined,
    choices, answer, stations: [t], lineId: own[0],
    explain: `${describe(t)}\n利用できる路線: ${avail.map(fullLineName).join('、')}`,
  }
}

// この駅は何府県？
function qPref(): Question {
  const t = target()
  const s = getStation(t)
  const { choices, answer } = buildChoices(s.pref, PREFS)
  return {
    kind: 'choice', tag: '府県', prompt: `${co(t)}「${s.name}」駅は何府県？`, sub: fullLineName(s.lines[0]),
    choices, answer, stations: [t], lineId: s.lines[0], explain: describe(t),
  }
}

// 目的地へ行くには？（乗換なし／1回乗換）
function qRoute(): Question {
  for (let tries = 0; tries < 40; tries++) {
    const a = target()
    const b = target((id) => id !== a && nm(id) !== nm(a))
    const route = bestRoute(a, b)
    if (!route || route.length === 0 || route.length > 2) continue
    if (route.length === 1) {
      const lineId = route[0].line
      // a と b の両方を通る路線はすべて正解になり得るので除外
      const both = lines.filter((l) => l.stations.includes(a) && l.stations.includes(b)).map((l) => l.id)
      const others = shuffle(linePool().filter((l) => !both.includes(l.id))).map((l) => fullLineName(l.id))
      const { choices, answer } = buildChoices(fullLineName(lineId), others)
      return {
        kind: 'choice', tag: '経路', prompt: `${co(a)} ${nm(a)} → ${co(b)} ${nm(b)}`,
        sub: '乗り換えなしで行ける路線は？', choices, answer, stations: [a, b], lineId,
        explain: `${fullLineName(lineId)}で${route[0].stops}駅。`,
      }
    }
    const [l1, l2] = route
    const transferAt = l1.to
    // 1路線目上の駅のうち、2路線目に乗り換えられる駅（正解候補）を除いた駅を不正解にする
    const line1 = getLine(l1.line)
    const line2 = getLine(l2.line)
    const okAt = new Set(line1.stations.filter((s) => [s, ...transferPartners(s)].some((x) => line2.stations.includes(x))).map(nm))
    if (okAt.size !== 1) continue
    const wrong = line1.stations.map(nm).filter((x) => !okAt.has(x) && x !== nm(a))
    if (wrong.length < 3) continue
    const { choices, answer } = buildChoices(nm(transferAt), wrong)
    return {
      kind: 'choice', tag: '経路', prompt: `${co(a)} ${nm(a)} → ${co(b)} ${nm(b)}`,
      sub: `${fullLineName(l1.line)}に乗って、どこで乗り換える？`, choices, answer,
      stations: [a, b, transferAt], lineId: l1.line,
      explain: `${fullLineName(l1.line)}で${nm(l1.from)}→${nm(l1.to)}（${l1.stops}駅）\n${nm(l2.from)}で${fullLineName(l2.line)}に乗り換え→${nm(l2.to)}（${l2.stops}駅）`,
    }
  }
  return qNeighbor()
}

// 路線図の空欄を埋める
function qFill(): Question {
  const t = target()
  const lineId = pick(getStation(t).lines)
  const l = getLine(lineId)
  const i = l.stations.indexOf(t)
  const before = l.stations.slice(Math.max(0, i - 2), i).map(nm)
  const after = l.stations.slice(i + 1, i + 3).map(nm)
  const near = l.stations.filter((x) => x !== t).map(nm)
  const { choices, answer } = buildChoices(nm(t), shuffle(near).slice(0, 8))
  return {
    kind: 'choice', tag: '空欄', prompt: [...before, '？', ...after].join(' → '), sub: `${fullLineName(lineId)}の空欄は？`,
    choices, answer, stations: [t], lineId, explain: describe(t), strip: { lineId, focus: t },
  }
}

export const KANSAI_TYPES = [
  { id: 'neighbor', name: 'この駅の隣駅は？', gen: qNeighbor },
  { id: 'line', name: 'この駅は何線？', gen: qWhichLine },
  { id: 'transfer', name: '乗り換えできる路線は？', gen: qTransfer },
  { id: 'pref', name: 'この駅は何府県？', gen: qPref },
  { id: 'route', name: '目的地へ行くには？', gen: qRoute },
  { id: 'fill', name: '路線図の空欄を埋める', gen: qFill },
] as const

export function kansaiMixed(): Question {
  return pick(KANSAI_TYPES).gen()
}

export { fullLineName }

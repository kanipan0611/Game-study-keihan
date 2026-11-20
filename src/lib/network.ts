/**
 * 鉄道ネットワークの構築。
 * src/data/railways/*.json と src/data/transfers.json を読み込み、
 * 駅・路線・隣接関係・乗換関係を持つグラフを作る。
 * 駅や路線を追加するときは JSON を編集するだけでよい。
 */
import keihan from '../data/railways/keihan.json'
import hankyu from '../data/railways/hankyu.json'
import hanshin from '../data/railways/hanshin.json'
import jr from '../data/railways/jr.json'
import metro from '../data/railways/metro.json'
import kintetsu from '../data/railways/kintetsu.json'
import nankai from '../data/railways/nankai.json'
import kyotosubway from '../data/railways/kyotosubway.json'
import kobesubway from '../data/railways/kobesubway.json'
import transfersJson from '../data/transfers.json'

export type StationId = string
export type Pref = '大阪府' | '京都府' | '兵庫県' | '滋賀県' | '奈良県'

export interface Company {
  id: string
  name: string
  short: string
  color: string
  priority?: boolean
}

export interface Line {
  id: string
  name: string
  short: string
  color: string
  company: string
  origin: string
  stations: StationId[]
  loop?: boolean
  note?: string
  partial?: string
  group?: string
  minor?: boolean
}

export interface Station {
  id: StationId
  name: string
  company: string
  kana?: string
  code?: string
  pref: Pref
  lat: number
  lng: number
  x: number
  y: number
  lines: string[]
}

export interface TransferGroup {
  name: string
  stations: StationId[]
  walk?: boolean
}

export interface Edge {
  to: StationId
  line: string
}

interface RawStation {
  kana?: string
  code?: string
  pref: string
  pos: number[]
}
interface RawLine {
  id: string
  name: string
  short: string
  color: string
  origin: string
  stations: string[]
  loop?: boolean
  note?: string
  partial?: string
  group?: string
  minor?: boolean
}
interface RawCompanyFile {
  company: Company
  lines: RawLine[]
  stations: Record<string, RawStation>
}

const RAW: RawCompanyFile[] = [
  keihan, hankyu, hanshin, jr, metro, kintetsu, nankai, kyotosubway, kobesubway,
] as RawCompanyFile[]

/** 地図投影: 経度・緯度 → SVG座標（1度 ≒ 1000単位） */
export const PROJ = { lng0: 135.0, lat0: 35.09, k: 1000, cos: Math.cos((34.8 * Math.PI) / 180) }
export function project(lat: number, lng: number) {
  return { x: (lng - PROJ.lng0) * PROJ.k * PROJ.cos, y: (PROJ.lat0 - lat) * PROJ.k }
}

export const companies: Company[] = []
export const companyById = new Map<string, Company>()
export const lines: Line[] = []
export const lineById = new Map<string, Line>()
export const stations = new Map<StationId, Station>()
export const adjacency = new Map<StationId, Edge[]>()
export const transferGroups: TransferGroup[] = transfersJson.groups
const groupOf = new Map<StationId, TransferGroup>()

export const sid = (company: string, name: string) => `${company}:${name}`

for (const file of RAW) {
  const c = file.company
  companies.push(c)
  companyById.set(c.id, c)
  for (const [name, s] of Object.entries(file.stations)) {
    const id = sid(c.id, name)
    const [lat, lng] = s.pos
    const p = project(lat, lng)
    stations.set(id, {
      id, name, company: c.id, kana: s.kana, code: s.code, pref: s.pref as Pref,
      lat, lng, x: p.x, y: p.y, lines: [],
    })
    adjacency.set(id, [])
  }
  for (const rl of file.lines) {
    const ids = rl.stations.map((n) => {
      const id = sid(c.id, n)
      if (!stations.has(id)) throw new Error(`駅データがありません: ${id} (${rl.id})`)
      return id
    })
    const line: Line = { ...rl, company: c.id, stations: ids }
    lines.push(line)
    lineById.set(line.id, line)
    ids.forEach((id) => stations.get(id)!.lines.push(line.id))
    const n = ids.length
    const segs = line.loop ? n : n - 1
    for (let i = 0; i < segs; i++) {
      const a = ids[i]
      const b = ids[(i + 1) % n]
      adjacency.get(a)!.push({ to: b, line: line.id })
      adjacency.get(b)!.push({ to: a, line: line.id })
    }
  }
}

for (const g of transferGroups) {
  for (const id of g.stations) {
    if (!stations.has(id)) throw new Error(`乗換データの駅がありません: ${id}`)
    groupOf.set(id, g)
  }
}

export const allStations = [...stations.values()]
export const getStation = (id: StationId) => stations.get(id)!
export const getLine = (id: string) => lineById.get(id)!
export const transferGroupOf = (id: StationId) => groupOf.get(id)
/** 改札内外を問わず乗り換えできる他社駅 */
export const transferPartners = (id: StationId): StationId[] =>
  groupOf.get(id)?.stations.filter((s) => s !== id) ?? []

export const linesOfCompany = (companyId: string) => lines.filter((l) => l.company === companyId)
export const stationsOfCompany = (companyId: string) => allStations.filter((s) => s.company === companyId)

export const KEIHAN_LINES = linesOfCompany('keihan')
export const KEIHAN_STATIONS = stationsOfCompany('keihan')

/** 駅の表示名（会社名付き） */
export function stationLabel(id: StationId, withCompany = true) {
  const s = getStation(id)
  if (!withCompany) return s.name
  return `${companyById.get(s.company)!.short} ${s.name}`
}

/** その駅で利用できる全路線（乗換先を含む） */
export function linesAvailableAt(id: StationId): string[] {
  const ids = [id, ...transferPartners(id)]
  return [...new Set(ids.flatMap((x) => getStation(x).lines))]
}

export function isInterchange(id: StationId) {
  return getStation(id).lines.length > 1 || groupOf.has(id)
}

export function isTerminal(id: StationId) {
  const s = getStation(id)
  return s.lines.some((l) => {
    const line = getLine(l)
    return !line.loop && (line.stations[0] === id || line.stations[line.stations.length - 1] === id)
  })
}

/** 路線上の前後の駅 */
export function lineNeighbors(lineId: string, id: StationId) {
  const line = getLine(lineId)
  const i = line.stations.indexOf(id)
  const n = line.stations.length
  if (i < 0) return { prev: undefined, next: undefined }
  if (line.loop) return { prev: line.stations[(i - 1 + n) % n], next: line.stations[(i + 1) % n] }
  return { prev: i > 0 ? line.stations[i - 1] : undefined, next: i < n - 1 ? line.stations[i + 1] : undefined }
}

/** 京阪本線＋鴨東線を1本とみなした「淀屋橋〜出町柳」 */
export const KEIHAN_TRUNK: StationId[] = [
  ...getLine('keihan-main').stations,
  ...getLine('keihan-oto').stations.slice(1),
]

/**
 * 0-1 BFS による各駅までの距離（乗換は0歩、隣駅は1歩）。
 * すごろくのCPU思考や目的地までの距離計算に使う。
 */
export function distancesFrom(target: StationId): Map<StationId, number> {
  const dist = new Map<StationId, number>([[target, 0]])
  const dq: StationId[] = [target]
  while (dq.length) {
    const cur = dq.shift()!
    const d = dist.get(cur)!
    for (const t of transferPartners(cur)) {
      if ((dist.get(t) ?? Infinity) > d) {
        dist.set(t, d)
        dq.unshift(t)
      }
    }
    for (const e of adjacency.get(cur)!) {
      if ((dist.get(e.to) ?? Infinity) > d + 1) {
        dist.set(e.to, d + 1)
        dq.push(e.to)
      }
    }
  }
  return dist
}

export interface RouteLeg {
  line: string
  from: StationId
  to: StationId
  stops: number
}

/**
 * 乗換回数が最小（同数なら駅数が最小）の経路を求める。
 * 状態 = (駅, 乗車中の路線)。乗換1回 = コスト1000、1駅 = コスト1。
 */
export function bestRoute(from: StationId, to: StationId): RouteLeg[] | null {
  type St = { st: StationId; line: string | null }
  const key = (s: St) => `${s.st}|${s.line}`
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const node = new Map<string, St>()
  const start: St = { st: from, line: null }
  dist.set(key(start), 0)
  node.set(key(start), start)
  const open: [number, string][] = [[0, key(start)]]
  let goal: string | null = null
  while (open.length) {
    open.sort((a, b) => a[0] - b[0])
    const [d, k] = open.shift()!
    if (d > (dist.get(k) ?? Infinity)) continue
    const cur = node.get(k)!
    if (cur.st === to) {
      goal = k
      break
    }
    const relax = (nx: St, cost: number) => {
      const nk = key(nx)
      if (d + cost < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, d + cost)
        prev.set(nk, k)
        node.set(nk, nx)
        open.push([d + cost, nk])
      }
    }
    for (const e of adjacency.get(cur.st)!) {
      const cost = cur.line === null || cur.line === e.line ? 1 : 1001
      relax({ st: e.to, line: e.line }, cost)
    }
    for (const t of transferPartners(cur.st)) relax({ st: t, line: null }, cur.line === null ? 0 : 1000)
  }
  if (!goal) return null
  const seq: St[] = []
  for (let k: string | undefined = goal; k; k = prev.get(k)) seq.unshift(node.get(k)!)
  const legs: RouteLeg[] = []
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]
    const b = seq[i]
    if (!b.line) continue
    const last = legs[legs.length - 1]
    if (last && last.line === b.line && last.to === a.st) {
      last.to = b.st
      last.stops++
    } else legs.push({ line: b.line, from: a.st, to: b.st, stops: 1 })
  }
  return legs
}

export const PREFS: Pref[] = ['大阪府', '京都府', '兵庫県', '滋賀県', '奈良県']

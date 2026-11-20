/**
 * 関西全域の路線図（地理配置）。路線ごとに色分けし、乗換駅を白抜きで表示。
 * 路線図画面・すごろく盤面の両方で使う。
 */
import { useMemo, type ReactNode, type Ref } from 'react'
import {
  allStations, getStation, isInterchange, isTerminal, lines, transferGroups, type StationId,
} from '../lib/network'
import { PanZoomSvg, type PanZoomHandle, type View } from './PanZoomSvg'

const pad = 30
const xs = allStations.map((s) => s.x)
const ys = allStations.map((s) => s.y)
export const MAP_BOUNDS: View = {
  x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
  w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2,
}

function tier(id: StationId) {
  const s = getStation(id)
  const g = transferGroups.find((t) => t.stations.includes(id))
  if ((g && g.stations.length >= 3) || s.lines.length >= 3) return 0
  if (isInterchange(id) || isTerminal(id)) return 1
  return 2
}
const TIER = new Map(allStations.map((s) => [s.id, tier(s.id)]))

/** 乗換グループ内で同名の駅は駅名ラベルを1つだけ出す */
const DUP_LABEL = new Set<StationId>()
for (const g of transferGroups) {
  const seen = new Set<string>()
  for (const id of g.stations) {
    const n = getStation(id).name
    if (seen.has(n)) DUP_LABEL.add(id)
    seen.add(n)
  }
}

export interface RouteMapProps {
  companies?: string[]
  selected?: StationId | null
  onSelect?: (id: StationId) => void
  /** 駅マーカーの塗り色（すごろくのマス色など） */
  dotColor?: (id: StationId) => string | undefined
  highlight?: Set<StationId>
  overlay?: (unit: number) => ReactNode
  handle?: Ref<PanZoomHandle>
  initial?: View
  /** 一部の駅を強調（他を薄く） */
  focusLines?: string[]
  className?: string
}

export function RouteMap({
  companies, selected, onSelect, dotColor, highlight, overlay, handle, initial, focusLines, className,
}: RouteMapProps) {
  const visLines = useMemo(() => lines.filter((l) => !companies || companies.includes(l.company)), [companies])
  const visStations = useMemo(() => {
    const set = new Set(visLines.flatMap((l) => l.stations))
    return allStations.filter((s) => set.has(s.id))
  }, [visLines])
  const visSet = useMemo(() => new Set(visStations.map((s) => s.id)), [visStations])
  const focusSet = useMemo(() => (focusLines ? new Set(focusLines) : null), [focusLines])

  const onTap = (x: number, y: number, unit: number) => {
    if (!onSelect) return
    let best: StationId | null = null
    let bd = (22 * unit) ** 2
    for (const s of visStations) {
      const d = (s.x - x) ** 2 + (s.y - y) ** 2
      if (d < bd) {
        bd = d
        best = s.id
      }
    }
    if (best) onSelect(best)
  }

  return (
    <PanZoomSvg
      bounds={MAP_BOUNDS}
      minW={8}
      handle={handle}
      initial={initial}
      className={className}
      onTap={onTap}
    >
      {(unit, view) => {
        const inView = (x: number, y: number) =>
          x > view.x - 20 * unit && x < view.x + view.w + 20 * unit && y > view.y - 20 * unit && y < view.y + view.h + 20 * unit
        const labelTier = unit < 0.13 ? 2 : unit < 0.5 ? 1 : unit < 1.6 ? 0 : -1
        const fs = 11 * unit
        // 縮小時は線・駅を細くして路線の形を見やすくする
        const z = Math.min(unit, 0.75)
        return (
          <g>
            <rect x={MAP_BOUNDS.x - 2000} y={MAP_BOUNDS.y - 2000} width={MAP_BOUNDS.w + 4000} height={MAP_BOUNDS.h + 4000} fill="var(--map-bg)" />
            <MapDecor unit={unit} />
            {/* 乗換の連絡線 */}
            {transferGroups.map((g) => {
              const pts = g.stations.filter((id) => visSet.has(id)).map(getStation)
              if (pts.length < 2) return null
              return pts.slice(1).map((p, i) => (
                <line key={g.name + i} x1={pts[0].x} y1={pts[0].y} x2={p.x} y2={p.y}
                  stroke="var(--transfer)" strokeWidth={7 * z} strokeLinecap="round" strokeDasharray={g.walk ? `${2 * unit} ${3 * unit}` : undefined} />
              ))
            })}
            {/* 路線 */}
            {visLines.map((l) => {
              const pts = l.stations.map((id) => getStation(id))
              const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + (l.loop ? ' Z' : '')
              const dim = focusSet && !focusSet.has(l.id)
              const w = (l.company === 'keihan' ? 4.2 : 3.2) * z
              return (
                <g key={l.id} opacity={dim ? 0.18 : 1}>
                  <path d={d} fill="none" stroke="var(--line-casing)" strokeWidth={w + 2 * z} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={d} fill="none" stroke={l.color} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              )
            })}
            {/* 駅 */}
            {visStations.map((s) => {
              if (!inView(s.x, s.y)) return null
              const inter = isInterchange(s.id)
              const color = dotColor?.(s.id)
              const isSel = selected === s.id
              const hl = highlight?.has(s.id)
              const r = (color ? 4.2 : inter ? 3.6 : 2.4) * z
              return (
                <g key={s.id}>
                  {hl && <circle cx={s.x} cy={s.y} r={11 * unit} className="pulse" fill="none" stroke="#f59e0b" strokeWidth={2.5 * unit} />}
                  {isSel && <circle cx={s.x} cy={s.y} r={9 * unit} fill="none" stroke="var(--accent)" strokeWidth={2.5 * unit} />}
                  <circle cx={s.x} cy={s.y} r={r} fill={color ?? '#fff'} stroke={color ? '#fff' : '#333'} strokeWidth={(color ? 1.4 : inter ? 1.4 : 1) * z} />
                </g>
              )
            })}
            {/* 駅名 */}
            {visStations.map((s) => {
              const t = TIER.get(s.id)!
              const show = t <= labelTier || selected === s.id || highlight?.has(s.id)
              if (!show || !inView(s.x, s.y) || (DUP_LABEL.has(s.id) && selected !== s.id)) return null
              const kh = s.company === 'keihan'
              return (
                <text key={'t' + s.id} x={s.x + 5 * unit} y={s.y - 4 * unit} fontSize={fs * (t === 0 ? 1.1 : 1)}
                  className={`map-label ${kh ? 'kh' : ''}`} strokeWidth={3 * unit}>
                  {s.name}
                </text>
              )
            })}
            {overlay?.(unit)}
          </g>
        )
      }}
    </PanZoomSvg>
  )
}

/** 地域名の背景ラベル */
function MapDecor({ unit }: { unit: number }) {
  const areas = [
    { name: '大阪', x: 395, y: 430 }, { name: '京都', x: 615, y: 70 }, { name: '神戸', x: 160, y: 380 },
    { name: '大津', x: 720, y: 60 }, { name: '奈良', x: 690, y: 420 }, { name: '大阪湾', x: 300, y: 520 },
  ]
  return (
    <g pointerEvents="none">
      {areas.map((a) => (
        <text key={a.name} x={a.x} y={a.y} fontSize={Math.max(26, 30 * unit)} className="area-label">{a.name}</text>
      ))}
    </g>
  )
}

/**
 * 京阪線の模式路線図。学習（習熟度色分け）・位置当てクイズで使う。
 */
import { useMemo, type Ref } from 'react'
import { KEIHAN_LINES, getStation, type StationId } from '../lib/network'
import { SCHEMATIC_LANDMARKS, SCHEMATIC_LINKS, SCHEMATIC_SIZE, schematicPos } from '../lib/keihanSchematic'
import { PanZoomSvg, type PanZoomHandle } from './PanZoomSvg'

interface Props {
  /** all: 全駅名表示 / landmarks: 目印駅のみ / none: 駅名なし */
  labels: 'all' | 'landmarks' | 'none'
  stationColor?: (id: StationId) => string | undefined
  onSelect?: (id: StationId) => void
  selected?: StationId | null
  highlight?: StationId | null
  /** 正解表示（緑）と誤答（赤） */
  reveal?: { correct: StationId; wrong?: StationId | null }
  focusLines?: string[]
  handle?: Ref<PanZoomHandle>
  className?: string
  showCodes?: boolean
}

const BOUNDS = { x: -20, y: -30, w: SCHEMATIC_SIZE.w + 40, h: SCHEMATIC_SIZE.h + 30 }
const ALL = [...new Set(KEIHAN_LINES.flatMap((l) => l.stations))]

export function KeihanMap({ labels, stationColor, onSelect, selected, highlight, reveal, focusLines, handle, className, showCodes }: Props) {
  const focus = useMemo(() => (focusLines ? new Set(focusLines) : null), [focusLines])
  const onTap = (x: number, y: number, unit: number) => {
    if (!onSelect) return
    let best: StationId | null = null
    let bd = (24 * unit) ** 2
    for (const id of ALL) {
      const p = schematicPos(id)
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bd) {
        bd = d
        best = id
      }
    }
    if (best) onSelect(best)
  }
  return (
    <PanZoomSvg bounds={BOUNDS} minW={120} handle={handle} className={className} onTap={onTap}>
      {(unit) => {
        const fs = Math.min(12 * unit, 13)
        return (
          <g>
            <rect x={-3000} y={-3000} width={7000} height={7000} fill="var(--map-bg)" />
            <text x={150} y={560} className="area-label" fontSize={40}>大阪</text>
            <text x={420} y={130} className="area-label" fontSize={40}>京都</text>
            <text x={760} y={430} className="area-label" fontSize={40}>滋賀</text>
            {SCHEMATIC_LINKS.map((l) => {
              const a = schematicPos(l.a)
              const b = schematicPos(l.b)
              return (
                <g key={l.label}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9ca3af" strokeWidth={3 * unit} strokeDasharray={`${6 * unit} ${4 * unit}`} />
                  <text x={(a.x + b.x) / 2 + 10} y={(a.y + b.y) / 2} fontSize={Math.min(10 * unit, 12)} fill="#6b7280">{l.label}</text>
                </g>
              )
            })}
            {KEIHAN_LINES.map((l) => {
              const d = l.stations.map((id, i) => {
                const p = schematicPos(id)
                return `${i ? 'L' : 'M'}${p.x},${p.y}`
              }).join(' ')
              const dim = focus && !focus.has(l.id)
              return (
                <g key={l.id} opacity={dim ? 0.2 : 1}>
                  <path d={d} fill="none" stroke="var(--line-casing)" strokeWidth={Math.min(9 * unit, 10) + 2} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={d} fill="none" stroke={l.color} strokeWidth={Math.min(7 * unit, 8)} strokeLinejoin="round" strokeLinecap="round" />
                </g>
              )
            })}
            {ALL.map((id) => {
              const p = schematicPos(id)
              const s = getStation(id)
              const c = stationColor?.(id)
              const isHl = highlight === id
              const isSel = selected === id
              const inter = s.lines.length > 1
              let fill = c ?? '#fff'
              if (reveal?.correct === id) fill = '#22c55e'
              else if (reveal?.wrong === id) fill = '#ef4444'
              const r = Math.min((inter ? 6.5 : 5) * unit, inter ? 7.5 : 6)
              const showLabel =
                labels === 'all' || (labels === 'landmarks' && SCHEMATIC_LANDMARKS.has(id)) || reveal?.correct === id || reveal?.wrong === id
              return (
                <g key={id}>
                  {isHl && <circle cx={p.x} cy={p.y} r={r * 2.6} className="pulse" fill="none" stroke="#f59e0b" strokeWidth={3 * unit} />}
                  {isSel && <circle cx={p.x} cy={p.y} r={r * 2} fill="none" stroke="var(--accent)" strokeWidth={3 * unit} />}
                  <circle cx={p.x} cy={p.y} r={r} fill={isHl ? '#fbbf24' : fill} stroke="#1f2937" strokeWidth={Math.min(1.6 * unit, 1.8)} />
                  {showLabel && (
                    <text x={p.x + r + 3} y={p.y + fs * 0.35} fontSize={fs} className="map-label kh" strokeWidth={3 * unit}>
                      {s.name}
                      {showCodes && s.code ? ` ${s.code}` : ''}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      }}
    </PanZoomSvg>
  )
}

/** 路線の並びを横帯で見せる（解説・駅一覧用） */
import { useEffect, useRef } from 'react'
import { getLine, getStation, lineById, type StationId } from '../lib/network'
import { KEIHAN_SEQS } from '../lib/questions/keihan'

export function seqStations(id: string): { name: string; color: string; stations: StationId[] } {
  const seq = KEIHAN_SEQS.find((s) => s.id === id)
  if (seq) return { name: seq.name, color: getLine(seq.id === 'trunk' ? 'keihan-main' : seq.id).color, stations: seq.stations }
  const l = lineById.get(id)!
  return { name: l.name, color: l.color, stations: l.stations }
}

export function LineStrip({ lineId, focus, window = 3 }: { lineId: string; focus: StationId; window?: number }) {
  const { color, stations } = seqStations(lineId)
  const i = stations.indexOf(focus)
  const from = Math.max(0, i - window)
  const to = Math.min(stations.length, i + window + 1)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('.focus')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [focus])
  return (
    <div className="strip" ref={ref} style={{ ['--c' as string]: color }}>
      {from > 0 && <span className="strip-more">…</span>}
      {stations.slice(from, to).map((id) => {
        const s = getStation(id)
        return (
          <div key={id} className={`strip-st ${id === focus ? 'focus' : ''}`}>
            <div className="strip-dot" />
            <div className="strip-name">{s.name}</div>
            {s.code && <div className="strip-code">{s.code}</div>}
          </div>
        )
      })}
      {to < stations.length && <span className="strip-more">…</span>}
    </div>
  )
}

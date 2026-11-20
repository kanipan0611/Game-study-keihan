/** 駅詳細のボトムシート */
import { LEVEL_COLORS, LEVEL_NAMES, masteryLevel } from '../lib/mastery'
import { companyById, getLine, getStation, lineNeighbors, transferGroupOf, transferPartners, type StationId } from '../lib/network'
import { useProgress } from '../lib/progress'

export function StationSheet({ id, onClose, onJump, extra }: {
  id: StationId
  onClose: () => void
  onJump?: (id: StationId) => void
  extra?: React.ReactNode
}) {
  const p = useProgress()
  const s = getStation(id)
  const c = companyById.get(s.company)!
  const rec = p.records[id]
  const lv = masteryLevel(rec)
  const tr = transferPartners(id)
  const g = transferGroupOf(id)
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <span className="co-badge" style={{ background: c.color }}>{c.short}</span>
          {s.code && <span className="code-badge">{s.code}</span>}
          <button className="btn ghost small close" onClick={onClose}>✕</button>
        </div>
        <h2 className="sheet-name">{s.name}<small>{s.kana}</small></h2>
        <div className="muted">{s.pref}</div>
        <div className="sheet-lines">
          {s.lines.map((lid) => {
            const l = getLine(lid)
            const { prev, next } = lineNeighbors(lid, id)
            return (
              <div key={lid} className="sheet-line">
                <span className="line-chip" style={{ background: l.color }}>{l.name}</span>
                <div className="nb">
                  <button disabled={!prev} onClick={() => prev && onJump?.(prev)}>◀ {prev ? getStation(prev).name : '（起終点）'}</button>
                  <b>{s.name}</b>
                  <button disabled={!next} onClick={() => next && onJump?.(next)}>{next ? getStation(next).name : '（起終点）'} ▶</button>
                </div>
                {l.note && <div className="muted small">{l.note}</div>}
              </div>
            )
          })}
        </div>
        {tr.length > 0 && (
          <div className="sheet-tr">
            <b>🔁 乗り換え{g?.walk ? '（改札外・徒歩連絡を含む）' : ''}</b>
            <div className="tr-list">
              {tr.map((t) => {
                const ts = getStation(t)
                return (
                  <button key={t} className="tr-item" onClick={() => onJump?.(t)}>
                    <span className="co-badge" style={{ background: companyById.get(ts.company)!.color }}>{companyById.get(ts.company)!.short}</span>
                    {ts.name}
                    <small>{ts.lines.map((l) => getLine(l).name).join('・')}</small>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="sheet-mastery">
          <span className="lv-badge" style={{ background: LEVEL_COLORS[lv] }}>{LEVEL_NAMES[lv]}</span>
          {rec ? <span className="muted small">正解 {rec.correct}・不正解 {rec.wrong}・連続 {rec.streak}</span> : <span className="muted small">まだ出題されていません</span>}
        </div>
        {extra}
      </div>
    </div>
  )
}

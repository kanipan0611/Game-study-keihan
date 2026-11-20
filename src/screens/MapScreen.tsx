/** 路線図・駅一覧 */
import { useMemo, useRef, useState } from 'react'
import { RouteMap } from '../components/RouteMap'
import { StationSheet } from '../components/StationSheet'
import type { PanZoomHandle } from '../components/PanZoomSvg'
import { allStations, companies, companyById, getStation, linesOfCompany, type StationId } from '../lib/network'
import { KeihanMap } from '../components/KeihanMap'

export function MapScreen({ onExit }: { onExit: () => void }) {
  const [tab, setTab] = useState<'kansai' | 'keihan' | 'list'>('kansai')
  const [comps, setComps] = useState<string[]>(companies.map((c) => c.id))
  const [sel, setSel] = useState<StationId | null>(null)
  const [q, setQ] = useState('')
  const [lineSel, setLineSel] = useState<string | null>(null)
  const mapRef = useRef<PanZoomHandle>(null)

  const hits = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    return allStations.filter((s) => s.name.includes(t) || s.kana?.includes(t)).slice(0, 12)
  }, [q])

  const jump = (id: StationId) => {
    setSel(id)
    setTab((t) => (t === 'list' ? 'kansai' : t))
    const s = getStation(id)
    if (!comps.includes(s.company)) setComps([...comps, s.company])
    setTimeout(() => mapRef.current?.focus(s.x, s.y, 40), 30)
  }

  return (
    <div className="page map-page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>🗺️ 路線図</h2>
      </div>
      <div className="seg">
        <button className={tab === 'kansai' ? 'on' : ''} onClick={() => setTab('kansai')}>関西全域</button>
        <button className={tab === 'keihan' ? 'on' : ''} onClick={() => setTab('keihan')}>京阪路線図</button>
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>路線別 駅一覧</button>
      </div>
      <div className="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 駅名で検索" />
        {hits.length > 0 && (
          <div className="search-hits">
            {hits.map((s) => (
              <button key={s.id} onClick={() => { setQ(''); jump(s.id) }}>
                <span className="co-badge" style={{ background: companyById.get(s.company)!.color }}>{companyById.get(s.company)!.short}</span>
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'kansai' && (
        <>
          <div className="chips scroll">
            {companies.map((c) => {
              const on = comps.includes(c.id)
              return (
                <button key={c.id} className={`chip ${on ? 'on' : ''}`} style={on ? { background: c.color, color: '#fff' } : undefined}
                  onClick={() => setComps(on ? comps.filter((x) => x !== c.id) : [...comps, c.id])}>
                  {c.short}
                </button>
              )
            })}
          </div>
          <RouteMap companies={comps} selected={sel} onSelect={setSel} handle={mapRef} className="main-map" />
          <p className="muted small">ピンチ・ホイールで拡大すると駅名が増えます。白抜きの大きな丸は乗換駅、灰色の帯は乗換連絡（点線は改札外の徒歩連絡）。</p>
        </>
      )}
      {tab === 'keihan' && (
        <KeihanMap labels="all" showCodes onSelect={setSel} selected={sel} className="main-map" />
      )}
      {tab === 'list' && (
        <div className="line-list">
          {companies.map((c) => (
            <div key={c.id} className="card">
              <h3 style={{ color: c.color }}>{c.name}</h3>
              {linesOfCompany(c.id).map((l) => (
                <div key={l.id}>
                  <button className="line-row" onClick={() => setLineSel(lineSel === l.id ? null : l.id)}>
                    <span className="line-chip" style={{ background: l.color }}>{l.name}</span>
                    <span className="muted small">{l.stations.length}駅{l.partial ? `（${l.partial}）` : ''}{l.loop ? '・環状' : ''}</span>
                  </button>
                  {lineSel === l.id && (
                    <div className="vline" style={{ ['--c' as string]: l.color }}>
                      {l.note && <div className="muted small vnote">{l.note}</div>}
                      {l.stations.map((id) => {
                        const s = getStation(id)
                        const multi = s.lines.length > 1
                        return (
                          <button key={id} className={`vst ${multi ? 'multi' : ''}`} onClick={() => setSel(id)}>
                            <i />
                            <span className="sl-code">{s.code ?? ''}</span>
                            <b>{s.name}</b>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {sel && <StationSheet id={sel} onClose={() => setSel(null)} onJump={jump} />}
    </div>
  )
}

/** MODE 1: 京阪マスター */
import { useEffect, useMemo, useState } from 'react'
import { KEIHAN_SCOPES, KEIHAN_SEQS, KEIHAN_TYPES, mixedGenerator, reviewGenerator, scopeStations, type ScopeId } from '../lib/questions/keihan'
import { LEVEL_COLORS, LEVEL_NAMES, isWeak, masteryLevel, weakness } from '../lib/mastery'
import { useProgress } from '../lib/progress'
import { getStation, type StationId } from '../lib/network'
import { QuizSession } from './QuizSession'
import { FullTest } from './FullTest'
import { KeihanMap } from '../components/KeihanMap'
import { StationSheet } from '../components/StationSheet'
import type { Generator } from '../lib/questions/types'

type View =
  | { t: 'menu' }
  | { t: 'quiz'; title: string; gen: Generator; count: number; mode: string }
  | { t: 'fulltest' }
  | { t: 'map' }

export function KeihanMaster({ onExit }: { onExit: () => void }) {
  const p = useProgress()
  const [view, setView] = useState<View>({ t: 'menu' })
  const [scope, setScope] = useState<ScopeId>('all')
  const pool = useMemo(() => scopeStations(scope), [scope])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.t])
  const all = useMemo(() => scopeStations('all'), [])

  const levels = all.map((id) => masteryLevel(p.records[id]))
  const mastered = levels.filter((l) => l >= 4).length
  const weak = all.filter((id) => isWeak(p.records[id])).sort((a, b) => weakness(p.records[b]) - weakness(p.records[a]))

  if (view.t === 'quiz')
    return <QuizSession title={view.title} mode={view.mode} generator={view.gen} count={view.count} onExit={() => setView({ t: 'menu' })} />
  if (view.t === 'fulltest') return <FullTest onExit={() => setView({ t: 'menu' })} />
  if (view.t === 'map') return <LearnMap onExit={() => setView({ t: 'menu' })} />

  const scopeName = KEIHAN_SCOPES.find((s) => s.id === scope)!.name
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>🚃 京阪マスター</h2>
      </div>

      <div className="card hero-keihan">
        <div className="row-between">
          <div>
            <div className="muted small">京阪 全{all.length}駅の習得状況</div>
            <div className="big-num">{mastered}<small> / {all.length} 駅</small></div>
          </div>
          <div className="ring" style={{ ['--p' as string]: `${(mastered / all.length) * 100}%` }}>
            <span>{Math.round((mastered / all.length) * 100)}%</span>
          </div>
        </div>
        <div className="level-bar">
          {LEVEL_NAMES.map((n, lv) => {
            const c = levels.filter((l) => l === lv).length
            return c ? <div key={n} style={{ flex: c, background: LEVEL_COLORS[lv] }} title={`${n}: ${c}`} /> : null
          })}
        </div>
        <div className="legend">
          {LEVEL_NAMES.map((n, lv) => (
            <span key={n}><i style={{ background: LEVEL_COLORS[lv] }} />{n} {levels.filter((l) => l === lv).length}</span>
          ))}
        </div>
      </div>

      <div className="big-actions">
        <button className="big-btn red" onClick={() => setView({ t: 'quiz', title: `ミックス演習（${scopeName}）`, gen: mixedGenerator(pool), count: 10, mode: 'keihan' })}>
          <span className="ic">🎯</span>ミックス10問<small>苦手・未学習を優先</small>
        </button>
        <button className="big-btn orange" disabled={!weak.length}
          onClick={() => setView({ t: 'quiz', title: '苦手駅の復習', gen: reviewGenerator(weak.slice(0, 20)), count: Math.min(10, Math.max(5, weak.length)), mode: 'review' })}>
          <span className="ic">🔁</span>苦手駅を復習<small>{weak.length ? `${weak.length}駅が登録中` : '苦手駅なし'}</small>
        </button>
        <button className="big-btn blue" onClick={() => setView({ t: 'fulltest' })}>
          <span className="ic">⏱</span>全駅テスト<small>制限時間つき</small>
        </button>
        <button className="big-btn green" onClick={() => setView({ t: 'map' })}>
          <span className="ic">🗺️</span>学習マップ<small>習熟度で色分け</small>
        </button>
      </div>

      <h3 className="section">出題範囲</h3>
      <div className="seg">
        {KEIHAN_SCOPES.map((s) => (
          <button key={s.id} className={scope === s.id ? 'on' : ''} onClick={() => setScope(s.id)}>{s.name}</button>
        ))}
      </div>

      <h3 className="section">問題形式を選んで練習（各10問）</h3>
      <div className="type-grid">
        {KEIHAN_TYPES.map((t) => (
          <button key={t.id} className="type-card"
            onClick={() => setView({ t: 'quiz', title: `${t.name}（${scopeName}）`, gen: () => t.gen(pool), count: 10, mode: `keihan-${t.id}` })}>
            <span className="ic">{t.icon}</span>
            <b>{t.name}</b>
            <small>{t.desc}</small>
          </button>
        ))}
      </div>

      {weak.length > 0 && (
        <>
          <h3 className="section">苦手駅ランキング</h3>
          <div className="card">
            <ol className="weak-list">
              {weak.slice(0, 10).map((id) => {
                const r = p.records[id]!
                return (
                  <li key={id}>
                    <b>{getStation(id).name}</b>
                    <span className="muted small">{getStation(id).code} ✕{r.wrong} ○{r.correct}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        </>
      )}
    </div>
  )
}

/** 学習マップ：京阪の模式図を習熟度で色分け、駅一覧つき */
function LearnMap({ onExit }: { onExit: () => void }) {
  const p = useProgress()
  const [sel, setSel] = useState<StationId | null>(null)
  const [labels, setLabels] = useState(true)
  const [seq, setSeq] = useState(KEIHAN_SEQS[0].id)
  const color = (id: StationId) => LEVEL_COLORS[masteryLevel(p.records[id])]
  const st = KEIHAN_SEQS.find((s) => s.id === seq)!
  return (
    <div className="page map-page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>京阪 学習マップ</h2>
        <label className="toggle"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />駅名</label>
      </div>
      <KeihanMap labels={labels ? 'all' : 'landmarks'} stationColor={color} onSelect={setSel} selected={sel} className="learn-map" showCodes={labels} />
      <div className="legend">
        {LEVEL_NAMES.map((n, lv) => <span key={n}><i style={{ background: LEVEL_COLORS[lv] }} />{n}</span>)}
      </div>
      <div className="seg scroll">
        {KEIHAN_SEQS.map((s) => <button key={s.id} className={seq === s.id ? 'on' : ''} onClick={() => setSeq(s.id)}>{s.name}</button>)}
      </div>
      <div className="station-list">
        {st.stations.map((id, i) => {
          const s = getStation(id)
          return (
            <button key={id} className="sl-row" onClick={() => setSel(id)}>
              <span className="sl-i">{i}</span>
              <i className="sl-dot" style={{ background: color(id) }} />
              <span className="sl-code">{s.code ?? ''}</span>
              <b>{s.name}</b>
              <span className="muted small">{s.kana}</span>
            </button>
          )
        })}
      </div>
      {sel && <StationSheet id={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

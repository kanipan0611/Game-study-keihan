/** MODE 3: 関西鉄道クイズ */
import { useState } from 'react'
import { KANSAI_COMPANIES, KANSAI_TYPES, kansaiMixed, setCompanyFilter } from '../lib/questions/kansai'
import { companyById } from '../lib/network'
import { QuizSession } from './QuizSession'
import type { Generator } from '../lib/questions/types'

export function KansaiQuiz({ onExit }: { onExit: () => void }) {
  const [comps, setComps] = useState<string[]>(KANSAI_COMPANIES)
  const [run, setRun] = useState<{ title: string; gen: Generator } | null>(null)

  if (run) {
    return <QuizSession title={run.title} mode="kansai" generator={run.gen} count={10} kansai onExit={() => setRun(null)} />
  }
  const start = (title: string, gen: Generator) => {
    setCompanyFilter(comps)
    setRun({ title, gen })
  }
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>❓ 関西鉄道クイズ</h2>
      </div>
      <h3 className="section">出題する鉄道会社</h3>
      <div className="chips wrap">
        {KANSAI_COMPANIES.map((id) => {
          const c = companyById.get(id)!
          const on = comps.includes(id)
          return (
            <button key={id} className={`chip ${on ? 'on' : ''}`} style={on ? { background: c.color, color: '#fff' } : undefined}
              onClick={() => setComps(on ? comps.filter((x) => x !== id) : [...comps, id])}>
              {c.short}
            </button>
          )
        })}
      </div>
      <div className="big-actions one">
        <button className="big-btn purple" disabled={!comps.length} onClick={() => start('関西鉄道クイズ ミックス', kansaiMixed)}>
          <span className="ic">🎲</span>ミックス10問<small>全形式からランダム</small>
        </button>
      </div>
      <h3 className="section">形式を選ぶ</h3>
      <div className="type-grid">
        {KANSAI_TYPES.map((t) => (
          <button key={t.id} className="type-card" disabled={!comps.length} onClick={() => start(t.name, t.gen)}>
            <b>{t.name}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

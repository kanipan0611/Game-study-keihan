/** 育成・学習状況 */
import { useMemo } from 'react'
import { LEVEL_COLORS, masteryLevel, weakness } from '../lib/mastery'
import { allStations, companies, getLine, lines } from '../lib/network'
import { TITLES, levelOf, rankName, resetProgress, update, useProgress, xpForLevel } from '../lib/progress'

export function StatusScreen({ onExit }: { onExit: () => void }) {
  const p = useProgress()
  const lv = levelOf(p.xp)
  const cur = xpForLevel(lv)
  const nxt = xpForLevel(lv + 1)

  const companyRates = useMemo(
    () =>
      companies.map((c) => {
        const st = allStations.filter((s) => s.company === c.id)
        const m = st.filter((s) => masteryLevel(p.records[s.id]) >= 4).length
        const seen = st.filter((s) => (p.records[s.id]?.seen ?? 0) > 0).length
        return { c, total: st.length, m, seen }
      }),
    [p.records],
  )
  const weakTop = useMemo(
    () => allStations.filter((s) => weakness(p.records[s.id]) > 0).sort((a, b) => weakness(p.records[b.id]) - weakness(p.records[a.id])).slice(0, 15),
    [p.records],
  )
  const lineRows = lines.filter((l) => p.lineStats[l.id])

  return (
    <div className="page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>📊 成績・称号</h2>
      </div>
      <div className="card">
        <div className="row-between">
          <div>
            <div className="muted small">{rankName(lv)}</div>
            <div className="big-num">Lv.{lv}</div>
          </div>
          <div className="stat-mini">
            <div>総回答 <b>{p.answered}</b></div>
            <div>正答率 <b>{p.answered ? Math.round((p.correct / p.answered) * 100) : 0}%</b></div>
            <div>最高連続 <b>{p.bestStreak}</b></div>
          </div>
        </div>
        <div className="xpbar"><div style={{ width: `${((p.xp - cur) / (nxt - cur)) * 100}%` }} /></div>
        <div className="muted small">次のレベルまで {nxt - p.xp} XP（累計 {p.xp} XP）</div>
      </div>

      <h3 className="section">駅制覇率（「習得」以上）</h3>
      <div className="card">
        {companyRates.map(({ c, total, m, seen }) => (
          <div key={c.id} className="rate-row">
            <span className="co-badge" style={{ background: c.color }}>{c.short}</span>
            <div className="rate-bar">
              <div style={{ width: `${(seen / total) * 100}%`, background: '#e5e7eb' }} />
              <div style={{ width: `${(m / total) * 100}%`, background: c.color }} />
            </div>
            <span className="small">{m}/{total}</span>
          </div>
        ))}
      </div>

      <h3 className="section">路線別正答率</h3>
      <div className="card">
        {lineRows.length === 0 && <div className="muted">まだデータがありません</div>}
        {lineRows.map((l) => {
          const s = p.lineStats[l.id]
          const r = Math.round((s.correct / s.answered) * 100)
          return (
            <div key={l.id} className="rate-row">
              <span className="line-chip" style={{ background: l.color }}>{l.name}</span>
              <div className="rate-bar"><div style={{ width: `${r}%`, background: l.color }} /></div>
              <span className="small">{r}%（{s.answered}問）</span>
            </div>
          )
        })}
      </div>

      <h3 className="section">称号</h3>
      <div className="title-grid">
        {TITLES.map((t) => {
          const have = p.titles.includes(t.id)
          return (
            <div key={t.id} className={`title-card ${have ? 'have' : ''} ${t.id === 'keihan-master' ? 'special' : ''}`}>
              <b>{have ? '🏅' : '🔒'} {t.name}</b>
              <small>{t.desc}</small>
            </div>
          )
        })}
      </div>

      <h3 className="section">苦手駅ランキング（全社）</h3>
      <div className="card">
        {weakTop.length === 0 && <div className="muted">苦手駅はありません</div>}
        <ol className="weak-list">
          {weakTop.map((s) => {
            const r = p.records[s.id]!
            return (
              <li key={s.id}>
                <b>{s.name}</b>
                <span className="muted small">{getLine(s.lines[0]).name} ✕{r.wrong} ○{r.correct}</span>
                <i className="dot" style={{ background: LEVEL_COLORS[masteryLevel(r)] }} />
              </li>
            )
          })}
        </ol>
      </div>

      <h3 className="section">学習履歴</h3>
      <div className="card history">
        {p.history.length === 0 && <div className="muted">まだ履歴がありません</div>}
        {p.history.slice(0, 30).map((h, i) => (
          <div key={i} className="hist-row">
            <span className="muted small">{new Date(h.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="hist-title">{h.title}</span>
            <b>{h.correct}/{h.total}</b>
          </div>
        ))}
      </div>

      <h3 className="section">設定</h3>
      <div className="card">
        <label className="toggle">
          <input type="checkbox" checked={p.settings.sound} onChange={(e) => update((x) => ({ ...x, settings: { ...x.settings, sound: e.target.checked } }))} />
          効果音
        </label>
        <button className="btn danger small" onClick={() => { if (confirm('すべての進捗を消去しますか？')) resetProgress() }}>進捗をリセット</button>
      </div>
      <p className="muted small">習熟度は「連続正解数・累計正解数・正解した日数・最後に正解した日」から計算します。3連続正解かつ累計4回正解で「習得」、さらに別の日にも正解すると「マスター」。21日以上正解していない駅は1段階下がります。苦手駅 = 間違えた後にまだ2回連続で正解していない駅。</p>
    </div>
  )
}

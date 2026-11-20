/** 問題セッション（N問出題 → 結果）。京阪マスター・関西クイズ・デイリーで共用 */
import { useEffect, useRef, useState } from 'react'
import { QuestionView } from '../components/QuestionView'
import { Confetti, Stamp } from '../components/Effects'
import type { Generator, Question } from '../lib/questions/types'
import { addHistory, recordAnswer, useProgress } from '../lib/progress'
import { play } from '../lib/sound'
import { getStation } from '../lib/network'

export interface SessionResult {
  correct: number
  total: number
  xp: number
  misses: Question[]
}

interface Props {
  title: string
  mode: string
  generator: Generator
  count: number
  /** 1問あたりの制限時間（秒） */
  timeLimit?: number
  kansai?: boolean
  onExit: () => void
  onFinish?: (r: SessionResult) => void
}

export function QuizSession({ title, mode, generator, count, timeLimit, kansai, onExit, onFinish }: Props) {
  const p = useProgress()
  const [idx, setIdx] = useState(0)
  const [q, setQ] = useState<Question>(() => generator())
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [result, setResult] = useState<SessionResult>({ correct: 0, total: 0, xp: 0, misses: [] })
  const [done, setDone] = useState(false)
  const [fx, setFx] = useState(0)
  const [gain, setGain] = useState<{ xp: number; levelUp: boolean } | null>(null)
  const [left, setLeft] = useState(timeLimit ?? 0)
  const lastPrompt = useRef(q.prompt)

  const answer = (ok: boolean) => {
    if (answered !== null) return
    setAnswered(ok)
    play(ok ? 'correct' : 'wrong')
    if (ok) setFx((n) => n + 1)
    const r = recordAnswer({ stations: q.stations, lineId: q.lineId, correct: ok, kansai })
    setGain({ xp: r.xp, levelUp: r.levelUp })
    setResult((s) => ({
      correct: s.correct + (ok ? 1 : 0), total: s.total + 1, xp: s.xp + r.xp, misses: ok ? s.misses : [...s.misses, q],
    }))
  }

  // 制限時間
  useEffect(() => {
    if (!timeLimit || answered !== null || done) return
    if (left <= 0) {
      answer(false)
      return
    }
    const t = setTimeout(() => setLeft((x) => x - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, answered, timeLimit, done])

  const next = () => {
    if (idx + 1 >= count) {
      setDone(true)
      addHistory({ mode, title, correct: result.correct, total: result.total, xp: result.xp })
      onFinish?.(result)
      if (result.correct === result.total) play('fanfare')
      return
    }
    // 同じ問題が連続しないように
    let nq = generator()
    for (let i = 0; i < 5 && nq.prompt === lastPrompt.current; i++) nq = generator()
    lastPrompt.current = nq.prompt
    setQ(nq)
    setIdx(idx + 1)
    setAnswered(null)
    setGain(null)
    setLeft(timeLimit ?? 0)
  }

  if (done) return <ResultView title={title} r={result} onExit={onExit} />

  return (
    <div className="session">
      <div className="session-head">
        <button className="btn ghost small" onClick={onExit}>✕</button>
        <div className="session-title">{title}</div>
        <div className="session-count">{idx + 1}/{count}</div>
      </div>
      <div className="progressbar"><div style={{ width: `${(idx / count) * 100}%` }} /></div>
      <div className="session-meta">
        <span>🔥 連続 {p.streak}</span>
        {timeLimit ? <span className={`timer ${left <= 3 ? 'warn' : ''}`}>⏱ {left}秒</span> : null}
        {gain && <span className="gain">+{gain.xp} XP{gain.levelUp ? ' 🎉 レベルアップ！' : ''}</span>}
      </div>
      <QuestionView key={idx} q={q} answered={answered} onAnswer={answer} />
      {answered !== null && (
        <>
          <Stamp ok={answered} />
          {answered && <Confetti seed={fx} />}
          <button className="btn primary next-btn" onClick={next}>{idx + 1 >= count ? '結果を見る' : '次の問題 ▶'}</button>
        </>
      )}
    </div>
  )
}

export function ResultView({ title, r, onExit }: { title: string; r: SessionResult; onExit: () => void }) {
  const rate = r.total ? Math.round((r.correct / r.total) * 100) : 0
  const grade = rate === 100 ? 'S' : rate >= 80 ? 'A' : rate >= 60 ? 'B' : rate >= 40 ? 'C' : 'D'
  return (
    <div className="result">
      {rate === 100 && <Confetti seed={999} />}
      <div className="result-title">{title}</div>
      <div className={`grade g-${grade}`}>{grade}</div>
      <div className="result-score">{r.correct} / {r.total} 問正解（{rate}%）</div>
      <div className="result-xp">獲得 {r.xp} XP</div>
      {r.misses.length > 0 && (
        <div className="card">
          <h3>間違えた問題（苦手駅に自動登録）</h3>
          <ul className="miss-list">
            {r.misses.map((m, i) => (
              <li key={i}>
                <b>{m.prompt}</b>
                <span>{m.stations.map((s) => getStation(s).name).join('・')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn primary" onClick={onExit}>戻る</button>
    </div>
  )
}

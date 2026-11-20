/** 制限時間付き全駅テスト：起点から順に「次の駅」を答え続ける */
import { useEffect, useMemo, useState } from 'react'
import { KEIHAN_SEQS } from '../lib/questions/keihan'
import { getStation, getLine, type StationId } from '../lib/network'
import { addHistory, recordAnswer, update, useProgress } from '../lib/progress'
import { buildChoices } from '../lib/random'
import { normalizeName } from '../components/QuestionView'
import { play } from '../lib/sound'
import { Confetti } from '../components/Effects'

type Mode = 'input' | 'choice'
interface Item { seqId: string; seqName: string; idx: number; stations: StationId[] }

const TESTS = [
  { id: 'all', name: '京阪全線（全駅）', seqs: KEIHAN_SEQS.map((s) => s.id) },
  ...KEIHAN_SEQS.map((s) => ({ id: s.id, name: s.name, seqs: [s.id] })),
]

export function FullTest({ onExit }: { onExit: () => void }) {
  const p = useProgress()
  const [cfg, setCfg] = useState<{ test: string; mode: Mode } | null>(null)
  if (!cfg) {
    return (
      <div className="page">
        <div className="page-head">
          <button className="btn ghost small" onClick={onExit}>←</button>
          <h2>⏱ 制限時間付き全駅テスト</h2>
        </div>
        <p className="lead">起点から順番に「次の駅」を答えていきます。入力モードは本番対策に最適。時間切れになると残りは不正解です。</p>
        {TESTS.map((t) => {
          const best = p.fullTest[t.id]
          return (
            <div key={t.id} className="card row-between">
              <div>
                <b>{t.name}</b>
                <div className="muted small">
                  {countStations(t.seqs)}問
                  {best ? `｜ベスト ${best.correct}/${best.total}（${best.seconds}秒）` : ''}
                </div>
              </div>
              <div className="btn-col">
                <button className="btn primary small" onClick={() => setCfg({ test: t.id, mode: 'input' })}>入力</button>
                <button className="btn small" onClick={() => setCfg({ test: t.id, mode: 'choice' })}>4択</button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  return <Runner key={cfg.test + cfg.mode} testId={cfg.test} mode={cfg.mode} onExit={() => setCfg(null)} />
}

function countStations(seqIds: string[]) {
  return seqIds.reduce((n, id) => n + KEIHAN_SEQS.find((s) => s.id === id)!.stations.length - 1, 0)
}

function Runner({ testId, mode, onExit }: { testId: string; mode: Mode; onExit: () => void }) {
  const test = TESTS.find((t) => t.id === testId)!
  const items: Item[] = useMemo(
    () =>
      test.seqs.flatMap((sid) => {
        const s = KEIHAN_SEQS.find((x) => x.id === sid)!
        return s.stations.slice(1).map((_, k) => ({ seqId: s.id, seqName: s.name, idx: k + 1, stations: s.stations }))
      }),
    [test],
  )
  const perItem = mode === 'input' ? 12 : 6
  const total = items.length * perItem
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(total)
  const [text, setText] = useState('')
  const [results, setResults] = useState<boolean[]>([])
  const [flash, setFlash] = useState<null | { ok: boolean; ans: string }>(null)
  const done = i >= items.length || left <= 0

  useEffect(() => {
    if (done) return
    const t = setTimeout(() => setLeft((x) => x - 1), 1000)
    return () => clearTimeout(t)
  }, [left, done])

  // 終了処理
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!done || saved) return
    setSaved(true)
    const correct = results.filter(Boolean).length
    // 時間切れで未回答の駅は不正解として記録
    for (let k = results.length; k < items.length; k++) {
      recordAnswer({ stations: [items[k].stations[items[k].idx]], correct: false })
    }
    const seconds = total - Math.max(0, left)
    update((pr) => {
      const prev = pr.fullTest[testId]
      const better = !prev || correct > prev.correct || (correct === prev.correct && seconds < prev.seconds)
      return better ? { ...pr, fullTest: { ...pr.fullTest, [testId]: { correct, total: items.length, seconds, at: Date.now() } } } : pr
    })
    addHistory({ mode: 'fulltest', title: `全駅テスト：${test.name}`, correct, total: items.length, xp: correct * 10 })
    if (correct === items.length) play('fanfare')
  }, [done, saved, results, items, total, left, testId, test.name])

  if (done) {
    const correct = results.filter(Boolean).length
    return (
      <div className="result">
        {correct === items.length && <Confetti seed={1} />}
        <div className="result-title">全駅テスト：{test.name}</div>
        <div className="result-score">{correct} / {items.length} 駅</div>
        <div className="muted">所要 {total - Math.max(0, left)} 秒{left <= 0 ? '（時間切れ）' : ''}</div>
        <div className="card fulltest-list">
          {items.map((it, k) => {
            const id = it.stations[it.idx]
            const r = results[k]
            return (
              <span key={k} className={`ft-st ${r === true ? 'ok' : 'ng'}`} title={getStation(id).code}>
                {getStation(id).name}
              </span>
            )
          })}
        </div>
        <button className="btn primary" onClick={onExit}>戻る</button>
      </div>
    )
  }

  const it = items[i]
  const ansId = it.stations[it.idx]
  const ans = getStation(ansId)
  const prev = it.stations.slice(Math.max(0, it.idx - 3), it.idx).map((x) => getStation(x).name)
  const lineColor = getLine(getStation(ansId).lines[0]).color

  const submit = (v: string) => {
    if (flash) return
    const ok = [ans.name, ans.kana ?? ''].filter(Boolean).map(normalizeName).includes(normalizeName(v))
    play(ok ? 'correct' : 'wrong')
    recordAnswer({ stations: [ansId], lineId: ans.lines[0], correct: ok })
    setResults((r) => [...r, ok])
    setFlash({ ok, ans: ans.name })
    setTimeout(() => {
      setFlash(null)
      setText('')
      setI((x) => x + 1)
    }, ok ? 350 : 1100)
  }

  return (
    <div className="session">
      <div className="session-head">
        <button className="btn ghost small" onClick={onExit}>✕</button>
        <div className="session-title">{it.seqName}</div>
        <div className={`timer big ${left <= 10 ? 'warn' : ''}`}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>
      </div>
      <div className="progressbar"><div style={{ width: `${(i / items.length) * 100}%` }} /></div>
      <div className="ft-flow" style={{ ['--c' as string]: lineColor }}>
        {prev.map((n, k) => <div key={k} className="ft-prev">{n}</div>)}
        <div className={`ft-q ${flash ? (flash.ok ? 'ok' : 'ng') : ''}`}>{flash ? flash.ans : '？'}</div>
      </div>
      <div className="q-sub">次の駅は？（{i + 1} / {items.length}）</div>
      {mode === 'input' ? (
        <form className="input-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) submit(text) }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="駅名（漢字 or ひらがな）" enterKeyHint="next" />
          <button className="btn primary" type="submit">決定</button>
          <button className="btn ghost small" type="button" onClick={() => submit('')}>パス</button>
        </form>
      ) : (
        <ChoiceRow key={i} answer={ans.name} stations={it.stations} idx={it.idx} onPick={submit} />
      )}
    </div>
  )
}

function ChoiceRow({ answer, stations, idx, onPick }: { answer: string; stations: StationId[]; idx: number; onPick: (v: string) => void }) {
  const { choices } = useMemo(() => {
    const near = stations.filter((_, k) => k !== idx && Math.abs(k - idx) <= 5).map((x) => getStation(x).name)
    return buildChoices(answer, near)
  }, [answer, stations, idx])
  return (
    <div className="choices grid2">
      {choices.map((c) => <button key={c} className="choice" onClick={() => onPick(c)}>{c}</button>)}
    </div>
  )
}

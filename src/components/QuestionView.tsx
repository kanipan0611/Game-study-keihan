/** 1問ぶんの表示と回答処理（選択・並べ替え・地図タップ・入力） */
import { useMemo, useState } from 'react'
import type { Question } from '../lib/questions/types'
import { shuffle } from '../lib/random'
import { KeihanMap } from './KeihanMap'
import { LineStrip } from './LineStrip'
import { getStation, type StationId } from '../lib/network'

interface Props {
  q: Question
  /** 回答済みなら結果 */
  answered: boolean | null
  onAnswer: (correct: boolean) => void
}

export function normalizeName(s: string) {
  return s
    .trim()
    .replace(/[\s　]/g, '')
    .replace(/駅$/, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/ケ/g, 'ヶ')
}

export function QuestionView({ q, answered, onAnswer }: Props) {
  return (
    <div className="question">
      <div className="q-tag">{q.tag}</div>
      <h2 className="q-prompt">{q.prompt}</h2>
      {q.sub && <div className="q-sub">{q.sub}</div>}
      {q.kind === 'choice' && <ChoiceBody q={q} answered={answered} onAnswer={onAnswer} />}
      {q.kind === 'order' && <OrderBody q={q} answered={answered} onAnswer={onAnswer} />}
      {q.kind === 'mapPick' && <MapPickBody q={q} answered={answered} onAnswer={onAnswer} />}
      {q.kind === 'input' && <InputBody q={q} answered={answered} onAnswer={onAnswer} />}
      {answered !== null && (
        <div className={`explain ${answered ? 'ok' : 'ng'}`}>
          {q.strip && <LineStrip lineId={q.strip.lineId} focus={q.strip.focus} />}
          <pre>{q.explain}</pre>
        </div>
      )}
    </div>
  )
}

function ChoiceBody({ q, answered, onAnswer }: Props & { q: Extract<Question, { kind: 'choice' }> }) {
  const [picked, setPicked] = useState<number | null>(null)
  return (
    <>
      {q.mapHighlight && (
        <KeihanMap labels="landmarks" highlight={answered === null ? q.mapHighlight : null}
          reveal={answered !== null ? { correct: q.mapHighlight } : undefined} className="q-map" />
      )}
      <div className={`choices ${q.choices.every((c) => c.length <= 6) ? 'grid2' : ''}`}>
        {q.choices.map((c, i) => {
          let cls = 'choice'
          if (answered !== null) {
            if (i === q.answer) cls += ' correct'
            else if (i === picked) cls += ' wrong'
            else cls += ' dim'
          }
          return (
            <button key={i} className={cls} disabled={answered !== null}
              onClick={() => { setPicked(i); onAnswer(i === q.answer) }}>
              {c}
            </button>
          )
        })}
      </div>
    </>
  )
}

function OrderBody({ q, answered, onAnswer }: Props & { q: Extract<Question, { kind: 'order' }> }) {
  const pool = useMemo(() => {
    let s = shuffle(q.items)
    while (s.join() === q.items.join() && q.items.length > 1) s = shuffle(q.items)
    return s
  }, [q])
  const [seq, setSeq] = useState<number[]>([])
  const tap = (i: number) => {
    if (answered !== null || seq.includes(i)) return
    const next = [...seq, i]
    setSeq(next)
    if (next.length === pool.length) onAnswer(next.map((k) => pool[k]).join() === q.items.join())
  }
  return (
    <div className="order">
      <div className="order-slots">
        {q.items.map((correct, k) => {
          const v = seq[k] !== undefined ? pool[seq[k]] : null
          const st = answered === null ? '' : v === correct ? 'correct' : 'wrong'
          return (
            <div key={k} className={`slot ${st}`} onClick={() => answered === null && k === seq.length - 1 && setSeq(seq.slice(0, -1))}>
              <span className="slot-n">{k + 1}</span>
              {v ?? <span className="slot-empty">？</span>}
              {answered === false && v !== correct && <span className="slot-fix">→ {correct}</span>}
            </div>
          )
        })}
      </div>
      <div className="order-pool">
        {pool.map((n, i) => (
          <button key={i} className="chip" disabled={seq.includes(i) || answered !== null} onClick={() => tap(i)}>
            {n}
          </button>
        ))}
      </div>
      {answered === null && seq.length > 0 && (
        <button className="btn ghost small" onClick={() => setSeq([])}>やり直す</button>
      )}
    </div>
  )
}

function MapPickBody({ q, answered, onAnswer }: Props & { q: Extract<Question, { kind: 'mapPick' }> }) {
  const [sel, setSel] = useState<StationId | null>(null)
  return (
    <div className="mappick">
      <KeihanMap labels="landmarks" selected={answered === null ? sel : null}
        onSelect={(id) => answered === null && setSel(id)}
        reveal={answered !== null ? { correct: q.target, wrong: sel !== q.target ? sel : null } : undefined}
        className="q-map tall" />
      {answered === null && (
        <button className="btn primary" disabled={!sel} onClick={() => onAnswer(sel === q.target)}>
          {sel ? 'ここに決定！' : '駅をタップして選択'}
        </button>
      )}
      {answered === false && sel && <div className="q-sub">選んだ駅: {getStation(sel).name}</div>}
    </div>
  )
}

function InputBody({ q, answered, onAnswer }: Props & { q: Extract<Question, { kind: 'input' }> }) {
  const [text, setText] = useState('')
  const [hint, setHint] = useState(false)
  const accept = useMemo(() => new Set(q.accept.map(normalizeName)), [q])
  const submit = (v: string) => onAnswer(accept.has(normalizeName(v)))
  if (hint) {
    return (
      <div className="choices grid2">
        {q.fallbackChoices.map((c) => {
          const ok = accept.has(normalizeName(c))
          return (
            <button key={c} className={`choice ${answered !== null ? (ok ? 'correct' : 'dim') : ''}`} disabled={answered !== null} onClick={() => submit(c)}>
              {c}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <form className="input-row" onSubmit={(e) => { e.preventDefault(); if (text.trim() && answered === null) submit(text) }}>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} disabled={answered !== null}
        placeholder="駅名（漢字 or ひらがな）" enterKeyHint="done" />
      {answered === null ? (
        <>
          <button className="btn primary" type="submit">決定</button>
          <button className="btn ghost small" type="button" onClick={() => setHint(true)}>選択肢</button>
        </>
      ) : (
        <div className={`input-answer ${answered ? 'ok' : 'ng'}`}>正解: {q.answerLabel}</div>
      )}
    </form>
  )
}

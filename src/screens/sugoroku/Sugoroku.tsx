/** MODE 2: 関西鉄道すごろく */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RouteMap } from '../../components/RouteMap'
import type { PanZoomHandle } from '../../components/PanZoomSvg'
import { QuestionView } from '../../components/QuestionView'
import { Confetti } from '../../components/Effects'
import { bestRoute, getLine, getStation, stationLabel, type StationId } from '../../lib/network'
import { kansaiMixed, setCompanyFilter, KANSAI_COMPANIES } from '../../lib/questions/kansai'
import { genNeighbor, genFill } from '../../lib/questions/keihan'
import type { Question } from '../../lib/questions/types'
import { addXp, recordAnswer, update } from '../../lib/progress'
import { play } from '../../lib/sound'
import {
  CARDS, EVENTS, SQUARE_INFO, arrivalBonus, chooseDestination, cpuChoose, moveOptions, newGame, newlyCompletedLines,
  randomCard, rollDice, squareOf, totalAssets, type CardId, type GameState, type MoveOption,
} from './engine'

type Phase =
  | { t: 'start' }
  | { t: 'rolling'; dice: number[]; bonus: number }
  | { t: 'choose'; total: number; options: MoveOption[] }
  | { t: 'moving'; path: StationId[]; step: number }
  | { t: 'message'; title: string; body: string; tone?: 'good' | 'bad' | 'info' }
  | { t: 'quiz'; q: Question; answered: boolean | null }
  | { t: 'end' }
  /** モーダルを閉じた直後など、次の処理待ち */
  | { t: 'idle' }

const START_OPTIONS = [
  { id: 'keihan:淀屋橋', label: '京阪 淀屋橋' },
  { id: 'keihan:三条', label: '京阪 三条' },
  { id: 'keihan:枚方市', label: '京阪 枚方市' },
  { id: 'jr:大阪', label: 'JR 大阪' },
  { id: 'hankyu:神戸三宮', label: '阪急 神戸三宮' },
]

export function Sugoroku({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<GameState | null>(null)
  if (!game) return <Setup onExit={onExit} onStart={setGame} />
  return <Board initial={game} onExit={onExit} />
}

function Setup({ onExit, onStart }: { onExit: () => void; onStart: (g: GameState) => void }) {
  const [name, setName] = useState('あなた')
  const [cpus, setCpus] = useState(2)
  const [rounds, setRounds] = useState(15)
  const [level, setLevel] = useState<1 | 2 | 3>(2)
  const [start, setStart] = useState(START_OPTIONS[0].id)
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn ghost small" onClick={onExit}>←</button>
        <h2>🎲 関西鉄道すごろく</h2>
      </div>
      <div className="card setup">
        <p className="lead">サイコロをふって関西の鉄道網を進み、目的地を目指そう！ 実在の路線と乗換駅だけを使って移動します。</p>
        <label>プレイヤー名<input value={name} onChange={(e) => setName(e.target.value)} maxLength={8} /></label>
        <div className="setup-row"><span>CPUの数</span>
          <div className="seg">{[1, 2, 3].map((n) => <button key={n} className={cpus === n ? 'on' : ''} onClick={() => setCpus(n)}>{n}人</button>)}</div>
        </div>
        <div className="setup-row"><span>CPUの強さ</span>
          <div className="seg">{([1, 2, 3] as const).map((n) => <button key={n} className={level === n ? 'on' : ''} onClick={() => setLevel(n)}>{['よわい', 'ふつう', 'つよい'][n - 1]}</button>)}</div>
        </div>
        <div className="setup-row"><span>ターン数</span>
          <div className="seg">{[10, 15, 25].map((n) => <button key={n} className={rounds === n ? 'on' : ''} onClick={() => setRounds(n)}>{n}</button>)}</div>
        </div>
        <div className="setup-row"><span>スタート駅</span>
          <select value={start} onChange={(e) => setStart(e.target.value)}>
            {START_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="legend squares">
          {Object.values(SQUARE_INFO).map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}：{s.desc}</span>)}
        </div>
        <button className="btn primary" onClick={() => onStart(newGame({
          names: [name || 'あなた', ...['CPU けいはん', 'CPU はんきゅう', 'CPU きんてつ'].slice(0, cpus)],
          cpu: [false, true, true, true].slice(0, cpus + 1), maxRounds: rounds, cpuLevel: level, start,
        }))}>出発進行！</button>
      </div>
    </div>
  )
}

function Board({ initial, onExit }: { initial: GameState; onExit: () => void }) {
  const [g, setG] = useState<GameState>(initial)
  const [phase, setPhase] = useState<Phase>({ t: 'start' })
  const [usingCard, setUsingCard] = useState<CardId | null>(null)
  const [tokenPos, setTokenPos] = useState<StationId | null>(null)
  const [fx, setFx] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const mapRef = useRef<PanZoomHandle>(null)
  const afterMessage = useRef<() => void>(() => {})

  const cur = g.players[g.current]
  const dest = getStation(g.destination)

  const focus = useCallback((id: StationId, w = 70) => {
    const s = getStation(id)
    mapRef.current?.focus(s.x, s.y, w)
  }, [])

  const log = (msg: string) => setG((x) => ({ ...x, log: [msg, ...x.log].slice(0, 60) }))

  /** モーダルのOK：二度押しで処理が重複しないよう、先に閉じてから続きを実行 */
  const closeModal = (then: () => void) => {
    if (phase.t !== 'message' && phase.t !== 'quiz') return
    afterMessage.current = () => {}
    setPhase({ t: 'idle' })
    then()
  }

  const showMessage = (title: string, body: string, tone: 'good' | 'bad' | 'info', then: () => void) => {
    afterMessage.current = then
    setPhase({ t: 'message', title, body, tone })
    if (tone === 'good') play('fanfare')
    else if (tone === 'bad') play('bad')
  }

  // ---- ターン開始 ----
  useEffect(() => {
    if (phase.t !== 'start') return
    focus(cur.pos)
    if (cur.skip > 0) {
      const t = setTimeout(() => {
        setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, skip: p.skip - 1 } : p)) }))
        showMessage(`${cur.name}は1回休み`, '運転再開まで待機中…', 'info', endTurn)
      }, 400)
      return () => clearTimeout(t)
    }
    if (cur.cpu) {
      const t = setTimeout(() => {
        // CPU: 目的地まで遠ければ移動カードを使う
        const d = bestRoute(cur.pos, g.destination)?.reduce((a, l) => a + l.stops, 0) ?? 0
        const card = cur.cards.find((c) => c === 'teiki') ?? (d > 7 ? cur.cards.find((c) => c === 'kaisoku' || c === 'tokkyu') : cur.cards.find((c) => c === 'kyuko'))
        startRoll(card ?? null)
      }, 900)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, g.current])

  const startRoll = (card: CardId | null) => {
    if (card === 'teiki') {
      setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, money: p.money + 100, cards: removeOne(p.cards, card) } : p)) }))
      log(`${cur.name}は定期券カードで100万円を得た`)
      setUsingCard(null)
      if (cur.cpu) setTimeout(() => startRoll(null), 600)
      return
    }
    const def = card ? CARDS[card] : null
    if (card) {
      setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, cards: removeOne(p.cards, card) } : p)) }))
      log(`${cur.name}は${CARDS[card].name}を使った！`)
    }
    setUsingCard(null)
    const dice = rollDice(def?.dice ?? 1)
    play('dice')
    setPhase({ t: 'rolling', dice, bonus: def?.bonus ?? 0 })
  }

  // ---- サイコロ → 行き先候補 ----
  useEffect(() => {
    if (phase.t !== 'rolling') return
    const t = setTimeout(() => {
      const total = phase.dice.reduce((a, b) => a + b, 0) + phase.bonus
      const options = moveOptions(cur.pos, total, g.destination)
      setPhase({ t: 'choose', total, options })
      if (cur.cpu) {
        setTimeout(() => {
          const o = cpuChoose(options, g.destination, g.cpuLevel)
          beginMove(o)
        }, 900)
      }
    }, 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const beginMove = (o: MoveOption) => {
    setTokenPos(o.path[0])
    setPhase({ t: 'moving', path: o.path, step: 0 })
  }

  // ---- 1駅ずつ移動アニメーション ----
  useEffect(() => {
    if (phase.t !== 'moving') return
    if (phase.step >= phase.path.length - 1) {
      arrive(phase.path)
      return
    }
    const t = setTimeout(() => {
      const nx = phase.path[phase.step + 1]
      setTokenPos(nx)
      play('step')
      const s = getStation(nx)
      mapRef.current?.focus(s.x, s.y, 70)
      setPhase({ ...phase, step: phase.step + 1 })
    }, 260)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ---- 到着処理 ----
  const arrive = (path: StationId[]) => {
    const to = path[path.length - 1]
    setTokenPos(null)
    const visited = [...new Set([...cur.visited, ...path])]
    const completed = newlyCompletedLines({ ...cur, visited })
    setG((x) => ({
      ...x,
      players: x.players.map((p) =>
        p.id !== cur.id ? p : {
          ...p, pos: to, visited,
          completedLines: [...p.completedLines, ...completed], money: p.money + completed.length * 300,
        }),
    }))
    if (completed.length) log(`🎉 ${cur.name}が${completed.map((l) => getLine(l).name).join('・')}を全駅制覇！`)
    const lineMsg = () => completed.map((l) => `${getLine(l).name}を全駅制覇！ +300万円`).join('\n')

    // 目的地
    if (to === g.destination) {
      const bonus = arrivalBonus(g.round)
      const nd = chooseDestination(g.players.map((p) => (p.id === cur.id ? { ...p, pos: to } : p)), to)
      setG((x) => ({
        ...x, destination: nd,
        players: x.players.map((p) => (p.id === cur.id ? { ...p, money: p.money + bonus, arrivals: p.arrivals + 1 } : p)),
      }))
      log(`🏁 ${cur.name}が目的地 ${stationLabel(to)} に一番乗り！ +${bonus}万円`)
      setFx((n) => n + 1)
      showMessage('🏁 目的地に到着！', `${cur.name}が ${stationLabel(to)} に一番乗り！\n+${bonus}万円\n${lineMsg()}\n\n次の目的地は「${stationLabel(nd)}」`, 'good', () => {
        focus(nd, 120)
        setTimeout(endTurn, 300)
      })
      return
    }
    setTimeout(() => resolveSquare(to, lineMsg()), 150)
  }

  const removeOne = (cards: CardId[], c: CardId) => {
    const i = cards.indexOf(c)
    return i < 0 ? cards : [...cards.slice(0, i), ...cards.slice(i + 1)]
  }

  const addMoney = (pid: number, m: number) =>
    setG((x) => ({ ...x, players: x.players.map((p) => (p.id === pid ? { ...p, money: Math.max(0, p.money + m) } : p)) }))

  const resolveSquare = (to: StationId, extra: string) => {
    const type = squareOf(to)
    const sname = stationLabel(to)
    // 駅長就任（最初に止まった人）
    let ownMsg = ''
    if (g.owner[to] === undefined) {
      setG((x) => ({ ...x, owner: { ...x.owner, [to]: cur.id }, players: x.players.map((p) => (p.id === cur.id ? { ...p, owned: [...p.owned, to] } : p)) }))
      ownMsg = `\n🚩 ${sname}の駅長に就任！（決算で収入）`
    }
    const tail = `${ownMsg}${extra ? `\n${extra}` : ''}`
    const mult = 1 + Math.floor(g.round / 5) * 0.5
    switch (type) {
      case 'blue':
      case 'station': {
        const m = Math.round((type === 'station' ? 120 : 50 + Math.random() * 100) * mult)
        addMoney(cur.id, m)
        log(`${cur.name}: ${sname}（${SQUARE_INFO[type].name}） +${m}万円`)
        return showMessage(`${SQUARE_INFO[type].name}`, `${sname}\n+${m}万円${tail}`, 'info', endTurn)
      }
      case 'red': {
        const m = Math.round((40 + Math.random() * 90) * mult)
        addMoney(cur.id, -m)
        log(`${cur.name}: ${sname}（赤マス） -${m}万円`)
        return showMessage('赤マス…', `${sname}\n-${m}万円${tail}`, 'bad', endTurn)
      }
      case 'green': {
        const c = randomCard()
        setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, cards: [...p.cards, c].slice(-5) } : p)) }))
        log(`${cur.name}: ${CARDS[c].name}を手に入れた`)
        return showMessage('カードマス', `${sname}\n${CARDS[c].icon} ${CARDS[c].name}を手に入れた！\n（${CARDS[c].desc}）${tail}`, 'good', endTurn)
      }
      case 'purple': {
        const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)]
        const r = ev.apply(cur, g)
        if (r.money) addMoney(cur.id, r.money)
        if (r.skip) setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, skip: p.skip + r.skip! } : p)) }))
        if (r.card) setG((x) => ({ ...x, players: x.players.map((p) => (p.id === cur.id ? { ...p, cards: [...p.cards, r.card!].slice(-5) } : p)) }))
        log(`${cur.name}: ${ev.text}`)
        const good = (r.money ?? 0) > 0 || !!r.card || !!r.again
        return showMessage('イベント発生！', `${sname}\n${ev.text}${tail}`, good ? 'good' : 'bad', r.again ? () => setPhase({ t: 'start' }) : endTurn)
      }
      case 'yellow': {
        if (cur.cpu) {
          const ok = Math.random() < [0.45, 0.65, 0.85][g.cpuLevel - 1]
          if (ok) addMoney(cur.id, 200)
          log(`${cur.name}: クイズに${ok ? '正解 +200万円' : '不正解'}`)
          return showMessage('クイズマス', `${sname}\n${cur.name}はクイズに${ok ? '正解！ +200万円' : '不正解…'}${tail}`, ok ? 'good' : 'info', endTurn)
        }
        afterMessage.current = () => {}
        if (tail.trim()) log(tail.trim())
        return setPhase({ t: 'quiz', q: quizFor(to), answered: null })
      }
    }
  }

  const quizFor = (at: StationId): Question => {
    if (at.startsWith('keihan:') && Math.random() < 0.7) return Math.random() < 0.5 ? genNeighbor([at]) : genFill([at])
    setCompanyFilter(KANSAI_COMPANIES)
    return kansaiMixed()
  }

  const answerQuiz = (ok: boolean) => {
    if (phase.t !== 'quiz') return
    play(ok ? 'correct' : 'wrong')
    recordAnswer({ stations: phase.q.stations, lineId: phase.q.lineId, correct: ok, kansai: true })
    if (ok) {
      addMoney(cur.id, 200)
      setFx((n) => n + 1)
    }
    log(`${cur.name}: クイズに${ok ? '正解 +200万円' : '不正解'}`)
    setPhase({ ...phase, answered: ok })
  }

  // ---- ターン終了・決算・ゲーム終了 ----
  const endTurn = () => {
    setG((x) => {
      const nextIdx = (x.current + 1) % x.players.length
      const newRound = nextIdx === 0 ? x.round + 1 : x.round
      let players = x.players
      const logs: string[] = []
      if (nextIdx === 0 && x.round % 5 === 0) {
        players = players.map((p) => ({ ...p, money: p.money + p.owned.length * 20 }))
        logs.push(`💰 決算！ 駅長収入（1駅20万円）: ${players.map((p) => `${p.name} +${p.owned.length * 20}`).join('、')}`)
      }
      return { ...x, players, current: nextIdx, round: newRound, turn: x.turn + 1, log: [...logs, ...x.log] }
    })
    setPhase({ t: 'start' })
  }

  // ゲーム終了判定
  useEffect(() => {
    if (g.round > g.maxRounds && phase.t !== 'end') {
      setPhase({ t: 'end' })
      const ranking = [...g.players].sort((a, b) => totalAssets(b) - totalAssets(a))
      const me = g.players.find((p) => !p.cpu)!
      const won = ranking[0].id === me.id
      update((p) => ({
        ...p,
        sugoroku: { played: p.sugoroku.played + 1, won: p.sugoroku.won + (won ? 1 : 0), bestMoney: Math.max(p.sugoroku.bestMoney, totalAssets(me)) },
      }))
      addXp(won ? 200 : 80)
      play(won ? 'fanfare' : 'bad')
    }
  }, [g.round, g.maxRounds, g.players, phase.t])

  // ---- 描画 ----
  const optionSet = useMemo(() => new Set(phase.t === 'choose' ? phase.options.map((o) => o.to) : []), [phase])
  const overlay = (unit: number) => (
    <g pointerEvents="none">
      <g transform={`translate(${dest.x},${dest.y})`}>
        <circle r={13 * unit} fill="#fde047" stroke="#b45309" strokeWidth={2 * unit} className="pulse-soft" />
        <text y={5 * unit} textAnchor="middle" fontSize={15 * unit}>🏁</text>
      </g>
      {g.players.map((p, i) => {
        const at = p.id === cur.id && tokenPos ? tokenPos : p.pos
        const s = getStation(at)
        const off = (i - (g.players.length - 1) / 2) * 7 * unit
        return (
          <g key={p.id} transform={`translate(${s.x + off},${s.y - 12 * unit})`} className="token">
            <path d={`M0,${10 * unit} L${-6 * unit},0 A${6.5 * unit},${6.5 * unit} 0 1 1 ${6 * unit},0 Z`} fill={p.color} stroke="#fff" strokeWidth={1.5 * unit} />
            <text y={2.5 * unit} textAnchor="middle" fontSize={8 * unit} fill="#fff" fontWeight="bold">{i + 1}</text>
          </g>
        )
      })}
    </g>
  )

  const onTapStation = (id: StationId) => {
    if (phase.t !== 'choose' || cur.cpu) return
    const o = phase.options.find((x) => x.to === id)
    if (o) beginMove(o)
  }

  const routeHint = useMemo(() => {
    const r = bestRoute(cur.pos, g.destination)
    if (!r || !r.length) return ''
    return r.map((l) => `${getLine(l.line).name}（${l.stops}駅）`).join(' → ')
  }, [cur.pos, g.destination])

  if (phase.t === 'end') return <EndScreen g={g} onExit={onExit} />

  return (
    <div className="sugoroku">
      <div className="sg-top">
        <button className="btn ghost small" onClick={() => { if (confirm('ゲームを終了しますか？')) onExit() }}>✕</button>
        <div className="sg-round">ターン {Math.min(g.round, g.maxRounds)}/{g.maxRounds}</div>
        <button className="sg-dest" onClick={() => focus(g.destination, 100)}>🏁 目的地 <b>{stationLabel(g.destination)}</b></button>
        <button className="btn ghost small" onClick={() => setShowLog(!showLog)}>📜</button>
      </div>
      <div className="sg-players">
        {g.players.map((p) => (
          <div key={p.id} className={`sg-p ${p.id === cur.id ? 'cur' : ''}`} style={{ ['--pc' as string]: p.color }} onClick={() => focus(p.pos)}>
            <b>{p.name}</b>
            <span>{p.money.toLocaleString()}万円</span>
            <small>🚩{p.owned.length} 👣{p.visited.length}駅{p.skip ? ' 💤' : ''}</small>
          </div>
        ))}
      </div>
      <div className="sg-map">
        <RouteMap
          handle={mapRef}
          dotColor={(id) => SQUARE_INFO[squareOf(id)].color}
          highlight={optionSet}
          overlay={overlay}
          onSelect={onTapStation}
          className="board-map"
        />
        {showLog && (
          <div className="sg-log" onClick={() => setShowLog(false)}>
            {g.log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
      <div className="sg-panel">
        <div className="sg-now" style={{ ['--pc' as string]: cur.color }}>
          <b>{cur.name}</b>の番 ｜ 現在地 {stationLabel(cur.pos)}
          <div className="muted small">目的地まで: {routeHint}</div>
        </div>
        {phase.t === 'start' && !cur.cpu && cur.skip === 0 && (
          <div className="sg-actions">
            <div className="cards">
              {cur.cards.map((c, i) => (
                <button key={i} className={`card-btn ${usingCard === c ? 'on' : ''}`} onClick={() => setUsingCard(usingCard === c ? null : c)}>
                  {CARDS[c].icon} {CARDS[c].name}
                </button>
              ))}
              {cur.cards.length === 0 && <span className="muted small">カードなし</span>}
            </div>
            <button className="btn primary dice-btn" onClick={() => startRoll(usingCard)}>
              🎲 {usingCard ? `${CARDS[usingCard].name}を使う` : 'サイコロをふる'}
            </button>
          </div>
        )}
        {phase.t === 'start' && cur.cpu && <div className="sg-wait">🤖 {cur.name} 思考中…</div>}
        {phase.t === 'rolling' && (
          <div className="dice-row">
            {phase.dice.map((d, i) => <Die key={i} value={d} />)}
            {phase.bonus ? <span className="dice-bonus">＋{phase.bonus}</span> : null}
          </div>
        )}
        {phase.t === 'choose' && (
          <div className="sg-choose">
            <div><b className="big">{phase.total}</b> 駅すすむ！ {cur.cpu ? '' : '光っている駅をタップ'}</div>
            {!cur.cpu && (
              <div className="opt-list">
                {phase.options.map((o) => (
                  <button key={o.to} className="opt" onClick={() => beginMove(o)} style={{ borderColor: SQUARE_INFO[squareOf(o.to)].color }}>
                    {o.to === g.destination ? '🏁 ' : ''}{stationLabel(o.to)}
                    <small>{SQUARE_INFO[squareOf(o.to)].name}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {phase.t === 'moving' && <div className="sg-wait">🚃 {stationLabel(phase.path[phase.step])} 通過中…</div>}
      </div>

      {phase.t === 'message' && (
        <div className="modal-backdrop">
          {phase.tone === 'good' && <Confetti seed={fx} />}
          <div className={`modal ${phase.tone}`}>
            <h3>{phase.title}</h3>
            <pre>{phase.body}</pre>
            <button className="btn primary" autoFocus onClick={() => closeModal(afterMessage.current)}>OK</button>
          </div>
        </div>
      )}
      {phase.t === 'quiz' && (
        <div className="modal-backdrop">
          {phase.answered && <Confetti seed={fx} />}
          <div className="modal quiz-modal">
            <h3>🟨 クイズマス（正解で +200万円）</h3>
            <QuestionView q={phase.q} answered={phase.answered} onAnswer={answerQuiz} />
            {phase.answered !== null && <button className="btn primary" onClick={() => closeModal(endTurn)}>OK</button>}
          </div>
        </div>
      )}
    </div>
  )
}

function Die({ value }: { value: number }) {
  const [v, setV] = useState(1)
  const [rolling, setRolling] = useState(true)
  useEffect(() => {
    const iv = setInterval(() => setV(Math.floor(Math.random() * 6) + 1), 70)
    const t = setTimeout(() => { clearInterval(iv); setV(value); setRolling(false) }, 800)
    return () => { clearInterval(iv); clearTimeout(t) }
  }, [value])
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
  return (
    <div className={`die ${rolling ? 'rolling' : ''}`}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={pips[v].includes(i) ? 'pip' : ''} />)}
    </div>
  )
}

function EndScreen({ g, onExit }: { g: GameState; onExit: () => void }) {
  const ranking = [...g.players].sort((a, b) => totalAssets(b) - totalAssets(a))
  const me = g.players.find((p) => !p.cpu)!
  const won = ranking[0].id === me.id
  return (
    <div className="result">
      {won && <Confetti seed={7} />}
      <div className="result-title">🏆 最終結果</div>
      <div className="result-score">{won ? '優勝おめでとう！' : '次は優勝を目指そう！'}</div>
      <div className="card ranking">
        {ranking.map((p, i) => (
          <div key={p.id} className="rank-row" style={{ ['--pc' as string]: p.color }}>
            <span className="rank-n">{i + 1}位</span>
            <b>{p.name}</b>
            <span>{totalAssets(p).toLocaleString()}万円</span>
            <small className="muted">駅長{p.owned.length}駅・訪問{p.visited.length}駅・目的地{p.arrivals}回</small>
          </div>
        ))}
      </div>
      <p className="muted small">総資産 = 所持金 + 駅長を務める駅 × 50万円。獲得 {won ? 200 : 80} XP</p>
      <button className="btn primary" onClick={onExit}>メニューへ</button>
    </div>
  )
}

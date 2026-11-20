import { useEffect, useMemo, useRef, useState } from 'react'
import { Home, type Screen } from './screens/Home'
import { KeihanMaster } from './screens/KeihanMaster'
import { KansaiQuiz } from './screens/KansaiQuiz'
import { MapScreen } from './screens/MapScreen'
import { StatusScreen } from './screens/StatusScreen'
import { Sugoroku } from './screens/sugoroku/Sugoroku'
import { QuizSession } from './screens/QuizSession'
import { Toast } from './components/Effects'
import { completeDaily, titleName, useProgress } from './lib/progress'
import { mixedGenerator, scopeStations } from './lib/questions/keihan'
import { KANSAI_COMPANIES, kansaiMixed, setCompanyFilter } from './lib/questions/kansai'
import { play } from './lib/sound'

/** デイリー：最初の7問は京阪、残り3問は関西 */
function dailyGenerator() {
  let n = 0
  const keihan = mixedGenerator(scopeStations('all'))
  setCompanyFilter(KANSAI_COMPANIES)
  return () => (n++ < 7 ? keihan() : kansaiMixed())
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const p = useProgress()
  const [toasts, setToasts] = useState<string[]>([])
  const prevTitles = useRef(p.titles)
  const dailyGen = useMemo(() => (screen === 'daily' ? dailyGenerator() : null), [screen])

  // 新しい称号を獲得したら通知
  useEffect(() => {
    const added = p.titles.filter((t) => !prevTitles.current.includes(t))
    prevTitles.current = p.titles
    if (added.length) {
      play('fanfare')
      setToasts((t) => [...t, ...added.map((a) => `🏅 称号「${titleName(a)}」を獲得！`)])
    }
  }, [p.titles])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  const home = () => setScreen('home')
  return (
    <div className="app">
      {screen === 'home' && <Home go={setScreen} />}
      {screen === 'keihan' && <KeihanMaster onExit={home} />}
      {screen === 'quiz' && <KansaiQuiz onExit={home} />}
      {screen === 'map' && <MapScreen onExit={home} />}
      {screen === 'status' && <StatusScreen onExit={home} />}
      {screen === 'sugoroku' && <Sugoroku onExit={home} />}
      {screen === 'daily' && dailyGen && (
        <QuizSession title="デイリーチャレンジ" mode="daily" generator={dailyGen} count={10} onExit={home}
          onFinish={(r) => completeDaily(r.correct, r.total)} />
      )}
      <div className="toasts">
        {toasts.slice(0, 1).map((t) => <Toast key={t} text={t} onDone={() => setToasts((x) => x.slice(1))} />)}
      </div>
    </div>
  )
}

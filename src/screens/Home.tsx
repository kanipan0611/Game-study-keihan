import { useMemo } from 'react'
import { masteryLevel } from '../lib/mastery'
import { KEIHAN_STATIONS } from '../lib/network'
import { levelOf, rankName, titleName, useProgress, xpForLevel } from '../lib/progress'
import { todayKey } from '../lib/random'

export type Screen = 'home' | 'keihan' | 'sugoroku' | 'quiz' | 'map' | 'status' | 'daily'

export function Home({ go }: { go: (s: Screen) => void }) {
  const p = useProgress()
  const lv = levelOf(p.xp)
  const cur = xpForLevel(lv)
  const nxt = xpForLevel(lv + 1)
  const mastered = useMemo(() => KEIHAN_STATIONS.filter((s) => masteryLevel(p.records[s.id]) >= 4).length, [p.records])
  const dailyDone = p.daily.lastDone === todayKey()
  const latestTitle = p.titles[p.titles.length - 1]

  return (
    <div className="home">
      <header className="home-hero">
        <div className="logo">
          <span className="logo-sub">RAILWAY QUEST</span>
          <span className="logo-main">KANSAI</span>
          <span className="logo-train">🚃💨</span>
        </div>
        <div className="player-card" onClick={() => go('status')}>
          <div className="pc-lv">Lv.{lv}</div>
          <div className="pc-body">
            <div className="pc-rank">{rankName(lv)}<small>「{titleName(latestTitle)}」</small></div>
            <div className="xpbar"><div style={{ width: `${((p.xp - cur) / (nxt - cur)) * 100}%` }} /></div>
          </div>
          <div className="pc-streak">🔥{p.streak}</div>
        </div>
      </header>

      <button className={`daily ${dailyDone ? 'done' : ''}`} onClick={() => go('daily')}>
        <div className="daily-ic">📅</div>
        <div>
          <b>デイリーチャレンジ</b>
          <small>{dailyDone ? `本日クリア済み（${p.daily.streakDays}日連続）・何度でも挑戦OK` : '京阪7問＋関西3問。クリアで ボーナスXP！'}</small>
        </div>
        <span className="daily-go">{dailyDone ? '✓' : 'GO'}</span>
      </button>

      <button className="mode-tile mt-keihan" onClick={() => go('keihan')}>
        <div className="mt-badge">最重要</div>
        <div className="mt-title">MODE 1 京阪マスター</div>
        <div className="mt-desc">全{KEIHAN_STATIONS.length}駅・駅順・位置関係を完全暗記</div>
        <div className="mt-progress">
          <div className="xpbar light"><div style={{ width: `${(mastered / KEIHAN_STATIONS.length) * 100}%` }} /></div>
          <span>習得 {mastered}/{KEIHAN_STATIONS.length}</span>
        </div>
      </button>
      <div className="mode-row">
        <button className="mode-tile mt-sugoroku" onClick={() => go('sugoroku')}>
          <div className="mt-title">MODE 2<br />関西鉄道すごろく</div>
          <div className="mt-desc">CPUと目的地レース</div>
          <div className="mt-ic">🎲</div>
        </button>
        <button className="mode-tile mt-quiz" onClick={() => go('quiz')}>
          <div className="mt-title">MODE 3<br />関西鉄道クイズ</div>
          <div className="mt-desc">9社の鉄道知識</div>
          <div className="mt-ic">❓</div>
        </button>
      </div>
      <div className="mode-row">
        <button className="mode-tile small mt-map" onClick={() => go('map')}>🗺️ 路線図</button>
        <button className="mode-tile small mt-status" onClick={() => go('status')}>📊 成績・称号</button>
      </div>
      <p className="footnote">駅データは公式の駅名・駅順に基づいて収録しています（地図上の位置は概略）。誤りに気づいたら src/data のJSONを修正してください。</p>
    </div>
  )
}

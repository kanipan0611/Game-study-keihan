import { describe, expect, it } from 'vitest'
import {
  KEIHAN_LINES, KEIHAN_STATIONS, KEIHAN_TRUNK, allStations, bestRoute, distancesFrom, getStation, lines, transferGroups,
} from '../src/lib/network'
import { KEIHAN_TYPES, scopeStations } from '../src/lib/questions/keihan'
import { KANSAI_TYPES } from '../src/lib/questions/kansai'
import { moveOptions } from '../src/screens/sugoroku/engine'
import { masteryLevel, applyAnswer, emptyRecord } from '../src/lib/mastery'

describe('京阪データ', () => {
  it('京阪は鋼索線を含めて89駅', () => {
    expect(KEIHAN_STATIONS.length).toBe(89)
  })
  it('京阪本線は淀屋橋〜三条の40駅、KH01〜KH40が連番', () => {
    const main = KEIHAN_LINES.find((l) => l.id === 'keihan-main')!
    expect(main.stations.length).toBe(40)
    main.stations.forEach((id, i) => expect(getStation(id).code).toBe(`KH${String(i + 1).padStart(2, '0')}`))
  })
  it('淀屋橋〜出町柳は42駅', () => {
    expect(KEIHAN_TRUNK.length).toBe(42)
    expect(getStation(KEIHAN_TRUNK[41]).name).toBe('出町柳')
  })
  it('駅ナンバーは重複しない', () => {
    const codes = KEIHAN_STATIONS.map((s) => s.code).filter(Boolean)
    expect(new Set(codes).size).toBe(codes.length)
  })
  it('京阪の駅にはすべて読みがある', () => {
    KEIHAN_STATIONS.forEach((s) => expect(s.kana, s.name).toBeTruthy())
  })
})

describe('ネットワーク', () => {
  it('すべての駅が少なくとも1路線に属する', () => {
    allStations.forEach((s) => expect(s.lines.length, s.id).toBeGreaterThan(0))
  })
  it('乗換グループは2駅以上', () => {
    transferGroups.forEach((g) => expect(g.stations.length).toBeGreaterThanOrEqual(2))
  })
  it('全駅が淀屋橋からつながっている', () => {
    const d = distancesFrom('keihan:淀屋橋')
    const unreachable = allStations.filter((s) => !d.has(s.id)).map((s) => s.id)
    expect(unreachable).toEqual([])
  })
  it('淀屋橋→神戸三宮の経路が見つかる', () => {
    const r = bestRoute('keihan:淀屋橋', 'hankyu:神戸三宮')
    expect(r).not.toBeNull()
    expect(r!.length).toBeGreaterThan(0)
  })
  it('同一路線内で駅が重複しない', () => {
    lines.forEach((l) => expect(new Set(l.stations).size, l.id).toBe(l.stations.length))
  })
})

describe('問題生成', () => {
  const check = (q: ReturnType<(typeof KEIHAN_TYPES)[number]['gen']>) => {
    expect(q.prompt).toBeTruthy()
    expect(q.stations.length).toBeGreaterThan(0)
    if (q.kind === 'choice') {
      expect(new Set(q.choices).size).toBe(q.choices.length)
      expect(q.choices.length).toBeGreaterThanOrEqual(2)
      expect(q.answer).toBeGreaterThanOrEqual(0)
      expect(q.answer).toBeLessThan(q.choices.length)
    }
    if (q.kind === 'order') expect(q.items.length).toBeGreaterThanOrEqual(2)
  }
  it('京阪マスターの全形式', () => {
    for (const scope of ['all', 'main', 'branch', 'otsu'] as const) {
      const pool = scopeStations(scope)
      for (const t of KEIHAN_TYPES) for (let i = 0; i < 60; i++) check(t.gen(pool))
    }
  })
  it('関西クイズの全形式', () => {
    for (const t of KANSAI_TYPES) for (let i = 0; i < 60; i++) check(t.gen())
  })
})

describe('すごろく移動', () => {
  it('全駅から1〜12の目で移動先がある', () => {
    for (const s of allStations) for (const n of [1, 6, 12]) expect(moveOptions(s.id, n, 'jr:大阪').length, s.id).toBeGreaterThan(0)
  })
  it('移動経路は実在の隣接・乗換のみ', () => {
    const opts = moveOptions('keihan:淀屋橋', 6, 'hankyu:神戸三宮')
    for (const o of opts) expect(o.path[0]).toBe('keihan:淀屋橋')
  })
})

describe('習熟度', () => {
  it('1回の正解では習得にならない', () => {
    const r = applyAnswer(emptyRecord(), true, Date.now(), '2026-01-01')
    expect(masteryLevel(r)).toBeLessThan(4)
  })
  it('3連続・累計4回で習得、間違えるとリセット', () => {
    let r = emptyRecord()
    for (let i = 0; i < 4; i++) r = applyAnswer(r, true, Date.now(), '2026-01-01')
    expect(masteryLevel(r)).toBe(4)
    r = applyAnswer(r, false, Date.now(), '2026-01-01')
    expect(masteryLevel(r)).toBe(1)
  })
})

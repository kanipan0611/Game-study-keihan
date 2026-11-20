/**
 * 京阪線の模式図（路線図）レイアウト。
 * 駅の並び順は network の路線データから取り、座標だけをここで計算する。
 * 実際の地理的な向き（大阪＝左下、京都＝右上、大津＝右）を保っている。
 */
import { getLine, type StationId } from './network'

export interface Pt { x: number; y: number }

export const SCHEMATIC_SIZE = { w: 1000, h: 800 }

const pos = new Map<StationId, Pt>()

function place(lineId: string, start: Pt, step: Pt, from = 0) {
  const st = getLine(lineId).stations
  for (let i = from; i < st.length; i++) {
    const k = i - from
    if (!pos.has(st[i])) pos.set(st[i], { x: start.x + step.x * k, y: start.y + step.y * k })
  }
}

// 本線: 淀屋橋〜京橋は水平、京橋〜中書島は斜め、中書島〜三条は垂直
{
  const main = getLine('keihan-main').stations
  const ox = 110, oy = 720
  main.forEach((id, i) => {
    let p: Pt
    if (i <= 3) p = { x: ox + i * 42, y: oy }
    else if (i <= 27) {
      const k = i - 3
      p = { x: ox + 3 * 42 + k * 15.5, y: oy - k * 15.5 }
    } else {
      const k = i - 27
      p = { x: ox + 3 * 42 + 24 * 15.5, y: oy - 24 * 15.5 - k * 24 }
    }
    pos.set(id, p)
  })
}
const p = (name: string) => pos.get(`keihan:${name}`)!

// 鴨東線: 三条から真上へ
place('keihan-oto', p('三条'), { x: 0, y: -26 })
// 中之島線: 天満橋から左下へ
{
  const st = getLine('keihan-nakanoshima').stations
  const t = p('天満橋')
  st.slice(1).forEach((id, i) => pos.set(id, { x: t.x - 36 - i * 40, y: t.y + 44 }))
}
// 交野線: 枚方市から右下へ
place('keihan-katano', p('枚方市'), { x: 30, y: 20 })
// 宇治線: 中書島から右下へ
place('keihan-uji', p('中書島'), { x: 30, y: 22 })
// ケーブル: 石清水八幡宮の近くから左上（男山）へ
{
  const b = p('石清水八幡宮')
  pos.set('keihan:ケーブル八幡宮口', { x: b.x - 40, y: b.y - 14 })
  pos.set('keihan:ケーブル八幡宮山上', { x: b.x - 82, y: b.y - 30 })
}
// 大津線: 京津線は横、石山坂本線は縦
{
  const hama: Pt = { x: 900, y: 250 }
  const ks = getLine('keihan-keishin').stations
  ks.forEach((id, i) => pos.set(id, { x: hama.x - (ks.length - 1 - i) * 34, y: hama.y }))
  const is = getLine('keihan-ishiyama').stations
  const hi = is.indexOf('keihan:びわ湖浜大津')
  is.forEach((id, i) => {
    if (i === hi) return
    pos.set(id, { x: hama.x, y: i < hi ? hama.y + (hi - i) * 25 : hama.y - (i - hi) * 22 })
  })
}

export const schematicPos = (id: StationId): Pt => pos.get(id) ?? { x: 0, y: 0 }

/** 三条〜御陵の地下鉄東西線（京津線直通）を示す補助線 */
export const SCHEMATIC_LINKS: { a: StationId; b: StationId; label: string }[] = [
  { a: 'keihan:三条', b: 'keihan:御陵', label: '地下鉄東西線（京津線が直通）' },
]

/** 地図上で常に駅名を出す目印駅 */
export const SCHEMATIC_LANDMARKS = new Set<StationId>(
  ['淀屋橋', '中之島', '京橋', '枚方市', '中書島', '三条', '出町柳', '宇治', '私市', '御陵', 'びわ湖浜大津', '石山寺', '坂本比叡山口'].map(
    (n) => `keihan:${n}`,
  ),
)

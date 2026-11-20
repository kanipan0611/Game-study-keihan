export type Rng = () => number

/** 再現可能な乱数（デイリーチャレンジ用） */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export const randInt = (n: number, rng: Rng = Math.random) => Math.floor(rng() * n)
export const pick = <T,>(arr: readonly T[], rng: Rng = Math.random): T => arr[randInt(arr.length, rng)]

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1, rng)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 重み付き抽選 */
export function weightedPick<T>(items: readonly T[], weight: (t: T) => number, rng: Rng = Math.random): T {
  const ws = items.map((t) => Math.max(0, weight(t)))
  const total = ws.reduce((a, b) => a + b, 0)
  if (total <= 0) return pick(items, rng)
  let r = rng() * total
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

/** 正解 + 不正解候補から重複なしの選択肢を作る */
export function buildChoices(answer: string, pool: readonly string[], n = 4, rng: Rng = Math.random) {
  const others = shuffle([...new Set(pool)].filter((x) => x !== answer), rng).slice(0, n - 1)
  const choices = shuffle([answer, ...others], rng)
  return { choices, answer: choices.indexOf(answer) }
}

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

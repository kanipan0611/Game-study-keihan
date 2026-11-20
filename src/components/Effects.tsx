/** 正解時の紙吹雪・スタンプ演出 */
import { useMemo } from 'react'

export function Confetti({ seed }: { seed: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.2,
        dur: 0.9 + Math.random() * 0.8,
        color: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6],
        rot: Math.random() * 360,
        dx: (Math.random() - 0.5) * 120,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  )
  return (
    <div className="confetti" key={seed} aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
            ['--rot' as string]: `${p.rot}deg`, ['--dx' as string]: `${p.dx}px`,
          }}
        />
      ))}
    </div>
  )
}

export function Stamp({ ok }: { ok: boolean }) {
  return <div className={`stamp ${ok ? 'ok' : 'ng'}`}>{ok ? '正解！' : '残念…'}</div>
}

export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  return (
    <div className="toast" onAnimationEnd={onDone}>
      {text}
    </div>
  )
}

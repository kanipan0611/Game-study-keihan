import { getProgress } from './progress'

let ctx: AudioContext | null = null

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(vol, ctx.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + dur + 0.02)
}

const SOUNDS = {
  correct: () => { tone(880, 0, 0.12, 'triangle'); tone(1320, 0.1, 0.25, 'triangle') },
  wrong: () => { tone(220, 0, 0.18, 'square', 0.08); tone(180, 0.15, 0.3, 'square', 0.08) },
  tap: () => tone(660, 0, 0.05, 'sine', 0.08),
  dice: () => { for (let i = 0; i < 6; i++) tone(300 + i * 60, i * 0.06, 0.05, 'square', 0.05) },
  step: () => tone(520, 0, 0.06, 'triangle', 0.08),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.12)),
  bad: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.15, 0.3, 'sawtooth', 0.05)),
}

export function play(name: keyof typeof SOUNDS) {
  if (!getProgress().settings.sound) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    SOUNDS[name]()
  } catch {
    /* 音が鳴らせない環境では無視 */
  }
}

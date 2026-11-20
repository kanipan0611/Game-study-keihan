import type { StationId } from '../network'

interface Base {
  /** 問題の種類ラベル（例: 隣接駅当て） */
  tag: string
  prompt: string
  sub?: string
  /** 習熟度を更新する駅 */
  stations: StationId[]
  lineId?: string
  /** 解説 */
  explain: string
  /** 解説時に路線の並びを見せる */
  strip?: { lineId: string; focus: StationId }
}

export interface ChoiceQuestion extends Base {
  kind: 'choice'
  choices: string[]
  answer: number
  /** 模式図上の駅をハイライトして見せる（位置当て・逆） */
  mapHighlight?: StationId
}

export interface OrderQuestion extends Base {
  kind: 'order'
  /** 正しい順の駅名 */
  items: string[]
}

export interface MapPickQuestion extends Base {
  kind: 'mapPick'
  target: StationId
}

export interface InputQuestion extends Base {
  kind: 'input'
  accept: string[]
  answerLabel: string
  /** 入力が難しいときの選択肢（ヒントモード） */
  fallbackChoices: string[]
}

export type Question = ChoiceQuestion | OrderQuestion | MapPickQuestion | InputQuestion

export type Generator = () => Question

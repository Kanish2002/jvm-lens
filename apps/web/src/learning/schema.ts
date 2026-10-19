/** Stable IDs describe identity; array position never does. Every step is a complete snapshot. */
export type MemoryValue =
  | { kind: 'primitive'; type: string; value: string | number | boolean }
  | { kind: 'reference'; type: string; target: string | null }
export interface Local {
  id: string
  name: string
  value: MemoryValue
}
export interface Frame {
  id: string
  method: string
  args: string
  locals: Local[]
}
export interface HeapNode {
  id: string
  type: string
  zone: 'strings' | 'objects' | 'arrays'
  fields: Local[]
  label?: string
  unreachable?: boolean
  root?: boolean
  captureMissing?: boolean
}
export interface Thread {
  id: string
  name: string
  line: number
  state: 'running' | 'waiting' | 'done'
  /** Pedagogical read observations, NOT literal CPU caches or a complete JMM model. */
  observations: Local[]
  stale?: string[]
}
export interface Prediction {
  id: string
  question: string
  options: [string, string, string]
  correct: number
  why: string
}
export interface StepDiff {
  added: string[]
  changed: string[]
  removed: string[]
}
export interface Step {
  id: string
  line: number
  stack: Frame[]
  heap: HeapNode[]
  statics: Local[]
  threads: Thread[]
  event:
    | 'start'
    | 'assign'
    | 'allocate'
    | 'call'
    | 'return'
    | 'unreachable'
    | 'gc'
    | 'read'
    | 'write'
    | 'happens-before'
    | 'error'
  explanation: string
  output?: string
  prediction?: Prediction
  diff: StepDiff
  shared?: Local[]
  happensBefore?: { from: string; to: string; reason: string }
  error?: string
}
export interface Trace {
  id: string
  title: string
  subtitle: string
  misconception: string
  code: string
  steps: Step[]
  mode: 'memory' | 'jmm'
  evidence: 'curated' | 'observed'
  note?: string
  alternatives?: { label: string; steps: Step[] }[]
  compare?: { title: string; code: string; steps: Step[] }
}

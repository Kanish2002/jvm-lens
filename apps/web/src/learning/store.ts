import { create } from 'zustand'
import { getTrace } from './library'
import type { Trace } from './schema'
export interface LearningState {
  motionOff: boolean
  trace: Trace
  index: number
  playing: boolean
  speed: number
  predict: boolean
  pending: number | null
  answered: Record<string, boolean>
  mistakes: Record<string, boolean>
  feedback: string
  wrong: number | null
  focus: { kind: 'variable' | 'object'; id: string } | null
  roots: boolean
  theme: 'dark' | 'light'
  size: number
  mobilePane: 'Stack' | 'Heap' | 'Both'
  compare: boolean
  interleaving: number
  draft: string
  sourceChanged: boolean
  load: (trace: Trace, index?: number) => void
  seek: (index: number) => void
  next: () => void
  previous: () => void
  answer: (choice: number) => void
  setPredict: () => void
  setPlaying: (on: boolean) => void
  setSpeed: (n: number) => void
  setFocus: (focus: LearningState['focus']) => void
  toggleRoots: () => void
  toggleTheme: () => void
  setSize: (size: number) => void
  setMobilePane: (pane: LearningState['mobilePane']) => void
  toggleCompare: () => void
  anotherInterleaving: () => void
  edit: (source: string) => void
}
export const useLearning = create<LearningState>((set, get) => ({
  motionOff: false,
  trace: getTrace('aliasing'),
  index: 0,
  playing: false,
  speed: 1,
  predict: false,
  pending: null,
  answered: {},
  mistakes: {},
  feedback: '',
  wrong: null,
  focus: null,
  roots: false,
  theme: 'dark',
  size: 1,
  mobilePane: 'Both',
  compare: false,
  interleaving: 0,
  draft: getTrace('aliasing').code,
  sourceChanged: false,
  load: (trace, index = 0) =>
    set({
      trace,
      index: Math.min(Math.max(index, 0), trace.steps.length - 1),
      draft: trace.code,
      sourceChanged: false,
      playing: false,
      pending: null,
      answered: {},
      mistakes: {},
      feedback: '',
      wrong: null,
      focus: null,
      compare: false,
      interleaving: 0
    }),
  seek: (target) => {
    const state = get(),
      max = state.trace.steps.length - 1,
      index = Math.min(Math.max(Math.round(target), 0), max)
    if (state.sourceChanged) return
    if (index > state.index && state.predict) {
      const stop = state.trace.steps.findIndex(
        (s, i) => i > state.index && i <= index && s.prediction && !state.answered[s.prediction.id]
      )
      if (stop >= 0) {
        set({
          pending: stop,
          playing: false,
          feedback: '',
          wrong: null,
          index: Math.max(state.index, stop - 1),
          focus: null
        })
        return
      }
    }
    set({
      index,
      pending: null,
      feedback: '',
      wrong: null,
      focus: null,
      playing: index === max ? false : state.playing
    })
  },
  next: () => get().seek(get().index + 1),
  previous: () => {
    set({ playing: false })
    get().seek(get().index - 1)
  },
  answer: (choice) => {
    const state = get(),
      q = state.pending === null ? undefined : state.trace.steps[state.pending].prediction
    if (!q) return
    if (choice !== q.correct) {
      set({ wrong: choice, feedback: q.why, mistakes: { ...state.mistakes, [q.id]: true } })
      return
    }
    set({
      answered: { ...state.answered, [q.id]: !state.mistakes[q.id] },
      index: state.pending!,
      pending: null,
      feedback: q.why,
      wrong: null
    })
  },
  setPredict: () =>
    set((s) => ({ predict: !s.predict, pending: null, playing: false, feedback: '', wrong: null })),
  setPlaying: (on) => {
    const state = get()
    if (
      on &&
      (state.pending !== null ||
        state.sourceChanged ||
        state.index === state.trace.steps.length - 1)
    )
      return
    set({ playing: on })
  },
  setSpeed: (speed) => set({ speed }),
  setFocus: (focus) => set({ focus }),
  toggleRoots: () => set((s) => ({ roots: !s.roots })),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setSize: (size) => set({ size }),
  setMobilePane: (mobilePane) => set({ mobilePane }),
  toggleCompare: () => set((s) => ({ compare: !s.compare })),
  anotherInterleaving: () => {
    const state = get()
    const options = [
      getTrace(state.trace.id).steps,
      ...(getTrace(state.trace.id).alternatives?.map((x) => x.steps) ?? [])
    ]
    const interleaving = (state.interleaving + 1) % options.length
    set({
      trace: { ...state.trace, steps: options[interleaving] },
      index: 0,
      playing: false,
      pending: null,
      answered: {},
      mistakes: {},
      interleaving,
      feedback: '',
      focus: null
    })
  },
  edit: (draft) =>
    set((s) => ({ draft, sourceChanged: draft !== s.trace.code, playing: false, pending: null }))
}))

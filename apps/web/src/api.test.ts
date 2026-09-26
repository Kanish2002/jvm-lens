import { describe, expect, it } from 'vitest'
import { mergeSession } from './api'
import type { Session, TraceStep } from './types'

const step = (sequence: number) => ({ sequence }) as TraceStep
const session = (trace: TraceStep[], latestSequence: number, reset = false, historyStartSequence = trace[0]?.sequence ?? 1): Session => ({
  sessionId: 'session-1', status: 'PAUSED', complete: false, autoPlay: false,
  historyStartSequence, latestSequence, reset, trace
})

describe('mergeSession', () => {
  it('appends delta steps without duplicating existing history', () => {
    const merged = mergeSession(session([step(1), step(2)], 2), session([step(2), step(3)], 3, false, 1))
    expect(merged.trace.map(item => item.sequence)).toEqual([1, 2, 3])
  })

  it('replaces local history when the bounded server window has moved', () => {
    const merged = mergeSession(session([step(1), step(2)], 2), session([step(10), step(11)], 11, true))
    expect(merged.trace.map(item => item.sequence)).toEqual([10, 11])
  })
})

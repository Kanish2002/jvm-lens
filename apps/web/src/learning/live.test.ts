import { describe, expect, it } from 'vitest'
import type { TraceStep } from '../types'
import { liveValue, observedTrace } from './live'
const observed = (sequence: number, withObject: boolean): TraceStep =>
  ({
    sequence,
    event: 'STEP',
    location: { line: sequence, methodName: 'main' },
    stackFrames: [{ className: 'Main', methodName: 'main', locals: [] }],
    heap: withObject
      ? [{ id: 'A1', runtimeType: 'Person', fields: [], elements: [], reachable: true }]
      : [],
    staticFields: [],
    stdout: '',
    diff: { explanation: 'An observed source step.' }
  }) as unknown as TraceStep
describe('observed trace adapter', () => {
  it('preserves missing identities instead of pretending they were collected', () => {
    const trace = observedTrace('class Main {}', [observed(1, true), observed(2, false)])
    expect(trace.evidence).toBe('observed')
    expect(trace.steps[1].heap[0].captureMissing).toBe(true)
    expect(trace.steps[1].event).not.toBe('gc')
  })
  it('distinguishes object IDs, primitives and null without content-based identity', () => {
    expect(
      liveValue({
        kind: 'reference',
        type: 'String',
        value: 'hello',
        objectId: '7',
        evidence: 'OBSERVED'
      })
    ).toEqual({ kind: 'reference', type: 'String', target: '7' })
    expect(liveValue({ kind: 'primitive', type: 'int', value: '7', evidence: 'OBSERVED' })).toEqual(
      { kind: 'primitive', type: 'int', value: '7' }
    )
    expect(liveValue({ kind: 'null', type: 'Person', value: null, evidence: 'OBSERVED' })).toEqual({
      kind: 'reference',
      type: 'Person',
      target: null
    })
  })
})

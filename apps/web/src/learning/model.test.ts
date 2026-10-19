import { describe, expect, it } from 'vitest'
import { getTrace } from './library'
import { diffSteps, reachability, references } from './model'
describe('aliasing Step → UI contract', () => {
  const trace = getTrace('aliasing')
  it('copies a reference without allocating a second Person', () => {
    const step = trace.steps[3]
    expect(step.heap.filter((o) => o.type === 'Person')).toHaveLength(1)
    expect(
      references(step)
        .filter((r) => r.target === 'A1')
        .map((r) => r.source)
    ).toEqual(['p1', 'p2'])
    expect(diffSteps(trace.steps[2], step).added).toEqual(['p2'])
  })
  it('mutates shared identity, preserves garbage until an explicit GC step, and restores history', () => {
    expect(trace.steps[4].heap.find((o) => o.id === 'A1')?.fields[0].value).toEqual({
      kind: 'reference',
      type: 'String',
      target: 'S2'
    })
    expect(reachability(trace.steps[6]).has('A1')).toBe(true)
    expect(reachability(trace.steps[7]).has('A1')).toBe(false)
    expect(trace.steps[7].heap.find((o) => o.id === 'A1')?.unreachable).toBe(true)
    expect(trace.steps[8].event).toBe('gc')
    expect(trace.steps[8].heap.some((o) => o.id === 'A1')).toBe(false)
    expect(trace.steps[3].heap.find((o) => o.id === 'A1')?.fields[0].value).toEqual({
      kind: 'reference',
      type: 'String',
      target: 'S1'
    })
  })
})

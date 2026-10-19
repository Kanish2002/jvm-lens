import { describe, expect, it } from 'vitest'
import { traces, misconceptionTraces } from './library'
import { diffSteps, entities, reachability, references } from './model'
import type { Step } from './schema'
import alias from './traces/aliasing.json'
import cache from './traces/integer-cache.json'
import volatile from './traces/volatile-visibility.json'
describe('curated trace invariants', () => {
  it('offers exactly ten misconceptions in addition to the starting lesson and JMM labs', () => {
    expect(misconceptionTraces).toHaveLength(10)
  })
  for (const trace of traces)
    it(`${trace.id}: valid lines, IDs, references, captions and explicit GC`, () => {
      const versions = [
        trace.steps,
        ...(trace.compare ? [trace.compare.steps] : []),
        ...(trace.alternatives?.map((a) => a.steps) ?? [])
      ]
      for (const steps of versions)
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i],
            ids = [
              ...step.stack.map((f) => f.id),
              ...step.stack.flatMap((f) => f.locals.map((v) => v.id)),
              ...step.heap.flatMap((o) => [o.id, ...o.fields.map((v) => v.id)]),
              ...step.statics.map((v) => v.id),
              ...step.threads.flatMap((t) => [t.id, ...t.observations.map((v) => v.id)]),
              ...(step.shared?.map((v) => v.id) ?? [])
            ]
          expect(new Set(ids).size, step.id + ' IDs').toBe(ids.length)
          expect(step.line).toBeGreaterThan(0)
          expect(step.explanation.trim().split(/\s+/).length, step.explanation).toBeLessThanOrEqual(
            20
          )
          const objects = new Set(step.heap.map((o) => o.id))
          references(step).forEach((r) => expect(objects.has(r.target), r.target).toBe(true))
          step.heap
            .filter((o) => o.unreachable)
            .forEach((o) => expect(reachability(step).has(o.id), o.id).toBe(false))
          const oldHeap = steps[i - 1]?.heap ?? []
          if (oldHeap.some((o) => !objects.has(o.id))) expect(step.event).toBe('gc')
          const current = entities(step),
            old = entities(steps[i - 1])
          step.diff.added.forEach((id) => {
            expect(current.has(id)).toBe(true)
            expect(old.has(id)).toBe(false)
          })
          if (step.prediction)
            expect(step.prediction.correct).toBeLessThan(step.prediction.options.length)
        }
    })
  it('ships actual diffs in all three JSON fixtures', () => {
    for (const trace of [alias, cache, volatile])
      trace.steps.forEach((step, i) =>
        expect(step.diff).toEqual(diffSteps(trace.steps[i - 1] as Step | undefined, step as Step))
      )
  })
  it('models initial observations and three distinct happens-before mechanisms', () => {
    expect(
      traces.find((t) => t.id === 'volatile-visibility')?.steps[0].threads[0].observations[0].value
    ).toEqual({ kind: 'primitive', type: 'int', value: 0 })
    for (const id of ['volatile-visibility', 'synchronized-publication', 'join-publication'])
      expect(traces.find((t) => t.id === id)?.steps.some((s) => s.happensBefore)).toBe(true)
  })
})

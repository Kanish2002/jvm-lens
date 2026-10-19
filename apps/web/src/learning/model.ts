import type { Frame, HeapNode, Local, MemoryValue, Step, StepDiff } from './schema'
export const primitive = (type: string, value: string | number | boolean): MemoryValue => ({
  kind: 'primitive',
  type,
  value
})
export const reference = (type: string, target: string | null): MemoryValue => ({
  kind: 'reference',
  type,
  target
})
export const local = (id: string, name: string, value: MemoryValue): Local => ({ id, name, value })
export const frame = (
  locals: Local[],
  method = 'main',
  id = 'main',
  args = 'String[] args'
): Frame => ({ id, method, args, locals })
export function entities(step?: Step): Map<string, unknown> {
  const entries = new Map<string, unknown>()
  if (!step) return entries
  step.stack.forEach((f) => {
    entries.set(f.id, { method: f.method, args: f.args })
    f.locals.forEach((v) => entries.set(v.id, v))
  })
  step.heap.forEach((o) => {
    entries.set(o.id, o)
    o.fields.forEach((v) => entries.set(v.id, v))
  })
  step.statics.forEach((v) => entries.set(v.id, v))
  step.shared?.forEach((v) => entries.set(v.id, v))
  step.threads.forEach((t) => {
    entries.set(t.id, t)
    t.observations.forEach((v) => entries.set(v.id, v))
  })
  return entries
}
export function diffSteps(previous: Step | undefined, current: Step): StepDiff {
  const a = entities(previous),
    b = entities(current)
  return {
    added: [...b.keys()].filter((id) => !a.has(id)),
    removed: [...a.keys()].filter((id) => !b.has(id)),
    changed: [...b.keys()].filter(
      (id) => a.has(id) && JSON.stringify(a.get(id)) !== JSON.stringify(b.get(id))
    )
  }
}
export function withDiffs(steps: Step[]): Step[] {
  return steps.map((s, i) => ({ ...s, diff: diffSteps(steps[i - 1], s) }))
}
export function snapshot(
  id: string,
  line: number,
  explanation: string,
  stack: Frame[],
  heap: HeapNode[],
  event: Step['event'] = 'assign',
  extra: Partial<Step> = {}
): Step {
  return structuredClone({
    id,
    line,
    explanation,
    stack,
    heap,
    event,
    statics: [],
    threads: [],
    diff: { added: [], changed: [], removed: [] },
    ...extra
  })
}
export function references(step: Step): { source: string; target: string }[] {
  return [
    ...step.stack.flatMap((f) => f.locals),
    ...step.statics,
    ...step.heap.flatMap((o) => o.fields)
  ].flatMap((v) =>
    v.value.kind === 'reference' && v.value.target ? [{ source: v.id, target: v.value.target }] : []
  )
}
export function reachability(step: Step): Set<string> {
  const roots = [...step.stack.flatMap((f) => f.locals), ...step.statics]
  const live = new Set(step.heap.filter((o) => o.root).map((o) => o.id))
  roots.forEach((v) => {
    if (v.value.kind === 'reference' && v.value.target) live.add(v.value.target)
  })
  const queue = [...live]
  for (let i = 0; i < queue.length; i++)
    step.heap
      .find((o) => o.id === queue[i])
      ?.fields.forEach((v) => {
        if (v.value.kind === 'reference' && v.value.target && !live.has(v.value.target)) {
          live.add(v.value.target)
          queue.push(v.value.target)
        }
      })
  return live
}

/** Edges actually on root-to-object paths; an edge from garbage is never a root path. */
export function reachableReferenceSources(step: Step): Set<string> {
  const live = reachability(step)
  return new Set(
    [
      ...step.stack.flatMap((f) => f.locals),
      ...step.statics,
      ...step.heap.filter((o) => live.has(o.id)).flatMap((o) => o.fields)
    ]
      .filter((v) => v.value.kind === 'reference' && v.value.target && live.has(v.value.target))
      .map((v) => v.id)
  )
}

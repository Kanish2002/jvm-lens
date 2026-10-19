import type { TraceStep, Value } from '../types'
import type { HeapNode, Local, MemoryValue, Step, Trace } from './schema'
import { withDiffs } from './model'
export function liveValue(v: Value): MemoryValue {
  if (v.objectId) return { kind: 'reference', type: v.type, target: v.objectId }
  if (v.kind === 'NULL' || v.kind === 'null' || v.value === null)
    return { kind: 'reference', type: v.type, target: null }
  return {
    kind: 'primitive',
    type: v.type,
    value: typeof v.value === 'number' || typeof v.value === 'boolean' ? v.value : String(v.value)
  }
}
export function observedTrace(source: string, steps: TraceStep[]): Trace {
  const mapped: Step[] = steps.map((s) => {
    const locals = (vars: TraceStep['stackFrames'][number]['locals'], prefix: string): Local[] =>
      vars.map((v) => ({ id: prefix + '.' + v.name, name: v.name, value: liveValue(v.value) }))
    const frames = s.stackFrames
      .map((f, i) => ({
        id: `${f.className}.${f.methodName}.${s.stackFrames.length - i}`,
        method: f.methodName,
        args: f.className,
        locals: locals(f.locals, `${f.className}.${f.methodName}.${s.stackFrames.length - i}`)
      }))
      .reverse()
    return {
      id: String(s.sequence),
      line: Math.max(1, s.location.line),
      stack: frames,
      heap: s.heap.map((o) => ({
        id: o.id,
        type: o.runtimeType,
        zone: o.elements.length || o.runtimeType.endsWith('[]') ? 'arrays' : 'objects',
        label: o.displayValue,
        unreachable: !o.reachable,
        fields: [
          ...o.fields.map((f) => ({
            id: o.id + '.' + f.name,
            name: f.name,
            value: liveValue(f.value)
          })),
          ...o.elements.map((v, i) => ({ id: o.id + '.' + i, name: `[${i}]`, value: liveValue(v) }))
        ]
      })),
      statics: s.staticFields.flatMap((c) =>
        c.fields.map((f) => ({
          id: c.className + '.' + f.name,
          name: c.className + '.' + f.name,
          value: liveValue(f.value)
        }))
      ),
      threads: [],
      event: s.event === 'METHOD_ENTRY' ? 'call' : s.event === 'METHOD_EXIT' ? 'return' : 'assign',
      explanation: (
        s.diff.explanation || `${s.location.methodName} is paused at line ${s.location.line}.`
      )
        .split(/\s+/)
        .slice(0, 20)
        .join(' '),
      output: s.stdout,
      diff: { added: [], changed: [], removed: [] }
    }
  })
  // Absence in a bounded JDI snapshot is not evidence of collection. Retain the identity
  // with an explicit missing-capture label instead of silently treating it as reclaimed.
  const captured = new Map<string, HeapNode>()
  mapped.forEach((step) => {
    const present = new Set(step.heap.map((o) => o.id))
    for (const [id, node] of captured)
      if (!present.has(id)) step.heap.push({ ...node, captureMissing: true })
    step.heap.forEach((node) => {
      if (!node.captureMissing) captured.set(node.id, node)
    })
  })
  return {
    id: 'live',
    title: 'Your Java, step by step.',
    subtitle: 'Observed JVM trace',
    misconception:
      'Observed snapshots show this execution; they do not prove every legal thread interleaving.',
    code: source,
    steps: withDiffs(mapped),
    mode: 'memory',
    evidence: 'observed',
    note: 'Captured through the existing Java backend. Reachability is derived from captured roots; missing internals may limit the graph. GC and memory ordering are not inferred from missing snapshots.'
  }
}
export function explainDiagnostic(message: string): string {
  if (message.includes("';' expected"))
    return 'A semicolon is missing. Add ; at the end of this statement.'
  if (message.includes('cannot find symbol'))
    return 'Java cannot find this name. Check its spelling, declaration, or import.'
  if (message.includes('incompatible types'))
    return 'This value has a different type from the variable. Check the assignment or conversion.'
  if (message.includes('reached end of file'))
    return 'A closing brace is missing. Check that each { has a matching }.'
  return 'Java could not compile this line: ' + message.split('\n')[0]
}

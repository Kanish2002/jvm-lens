import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryWorkspace } from './MemoryWorkspace'
import type { TraceStep } from './types'

const value = { kind: 'reference', type: 'Person', value: null, objectId: '@obj1', evidence: 'OBSERVED' as const }
const step: TraceStep = {
  sequence: 1,
  event: 'BREAKPOINT',
  location: { className: 'Main', methodName: 'main', file: 'Main.java', line: 8, bytecodeOffset: 0 },
  thread: { id: 1, name: 'main', state: 'RUNNABLE' },
  stackFrames: [{ className: 'Main', methodName: 'main', line: 8, locals: [{ name: 'person', value }] }],
  threads: [{ thread: { id: 1, name: 'main', state: 'RUNNABLE' }, eventThread: true,
    stackFrames: [{ className: 'Main', methodName: 'main', line: 8, locals: [{ name: 'person', value }] }] }],
  heap: [{ id: '@obj1', runtimeType: 'Person', fields: [], elements: [], reachable: true,
    reachabilityEvidence: 'DERIVED', simulatedGeneration: 'Tracked', truncated: false }],
  staticFields: [{ className: 'Main', fields: [] }],
  bytecode: [{ methodName: 'main', offset: 0, mnemonic: 'new', detail: '#2', sourceLine: 8 }],
  memory: { heapUsed: 1024, heapCommitted: 2048, heapMax: 4096, nonHeapUsed: 512,
    metaspaceUsed: 256, threadCount: 1, loadedClasses: 10, evidence: 'OBSERVED' },
  gcEvents: [], jmmEvents: [], stdout: '', stderr: '',
  diff: { localsAdded: [], localsRemoved: [], localsChanged: [], objectsCreated: ['@obj1'],
    objectsChanged: [], referencesChanged: [], objectsBecameUnreachable: [], framesAdded: [], framesRemoved: [],
    stdoutAdded: '', stderrAdded: '', explanation: 'Object became visible.' }
}

describe('MemoryWorkspace', () => {
  afterEach(() => cleanup())

  it('renders stack, method area, heap, and the reference relationship together', () => {
    render(<MemoryWorkspace step={step} selectedObject={null} onSelectObject={vi.fn()} mode="Intermediate" />)
    expect(screen.getByRole('region', { name: 'Thread stacks' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Classes and method area' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Reference index' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Heap objects' })).toBeInTheDocument()
    expect(screen.getByText('1 reference')).toBeInTheDocument()
    expect(screen.getByText('Focused path')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspect @obj1 Person' })).toBeInTheDocument()
  })

  it('groups aliases and focuses a single mapping instead of drawing duplicate paths', () => {
    const aliasStep: TraceStep = {
      ...step,
      stackFrames: [{ ...step.stackFrames[0], locals: [
        { name: 'person', value }, { name: 'alias', value }
      ] }],
      threads: [{ ...step.threads![0], stackFrames: [{ ...step.stackFrames[0], locals: [
        { name: 'person', value }, { name: 'alias', value }
      ] }] }]
    }
    const { container } = render(<MemoryWorkspace step={aliasStep} selectedObject={null} onSelectObject={vi.fn()} mode="Intermediate" />)

    const groupedMapping = screen.getByRole('button', { name: 'Focus person, alias to @obj1' })
    fireEvent.click(groupedMapping)

    expect(screen.getByText('2 aliases share this object')).toBeInTheDocument()
    expect(screen.getByText('Aliases')).toBeInTheDocument()
    expect(container.querySelectorAll('.reference-path').length).toBeLessThanOrEqual(1)
  })

  it('keeps the string subgroup collapsed until the learner opens it', () => {
    const stringValue = { ...value, type: 'java.lang.String', objectId: '@obj2' }
    const stringStep: TraceStep = {
      ...step,
      stackFrames: [{ ...step.stackFrames[0], locals: [
        ...step.stackFrames[0].locals, { name: 'text', value: stringValue }
      ] }],
      threads: [{ ...step.threads![0], stackFrames: [{ ...step.stackFrames[0], locals: [
        ...step.stackFrames[0].locals, { name: 'text', value: stringValue }
      ] }] }],
      heap: [...step.heap, { id: '@obj2', runtimeType: 'java.lang.String', displayValue: 'hello', fields: [], elements: [], reachable: true,
        reachabilityEvidence: 'DERIVED', simulatedGeneration: 'Tracked', truncated: false }]
    }
    render(<MemoryWorkspace step={stringStep} selectedObject={null} onSelectObject={vi.fn()} mode="Intermediate" />)

    const strings = screen.getByRole('button', { name: /String objects/ })
    expect(strings).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Inspect @obj2 String' })).not.toBeInTheDocument()
    fireEvent.click(strings)
    expect(screen.getByRole('button', { name: 'Inspect @obj2 String' })).toBeInTheDocument()
  })
})

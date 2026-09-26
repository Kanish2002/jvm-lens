import { cleanup, render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('region', { name: 'Heap objects' })).toBeInTheDocument()
    expect(screen.getByText('1 reference')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inspect @obj1 Person' })).toBeInTheDocument()
  })
})

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Box, Braces, CircleDot, Cpu, Database, Network, Route, Type } from 'lucide-react'
import type { Evidence, HeapObject, ReferenceEdge, StackFrame, ThreadSnapshot, TraceStep, Value } from './types'

interface Props {
  step: TraceStep | null
  selectedObject: string | null
  onSelectObject: (id: string | null) => void
  mode: 'Beginner' | 'Intermediate' | 'JVM Internals'
}

export function MemoryWorkspace({ step, selectedObject, onSelectObject, mode }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [showAllEdges, setShowAllEdges] = useState(false)
  const edges = useMemo(() => step ? collectEdges(step) : [], [step])
  const visibleEdges = useMemo(() => {
    if (showAllEdges || edges.length <= 18) return edges
    if (selectedObject) return edges.filter(edge => edge.targetId === selectedObject || edge.id.includes(selectedObject))
    return edges.filter(edge => edge.kind !== 'field').slice(0, 14)
  }, [edges, selectedObject, showAllEdges])

  if (!step) return <EmptyMemoryWorkspace />
  const threads = normalizedThreads(step)
  const stringObjects = step.heap.filter(object => object.runtimeType === 'java.lang.String')
  const regularObjects = step.heap.filter(object => object.runtimeType !== 'java.lang.String')

  return <div className={`memory-board mode-${mode.toLowerCase().replace(' ', '-')}`} ref={boardRef}>
    <div className="board-toolbar">
      <div><Network size={14} /><span>{edges.length} reference{edges.length === 1 ? '' : 's'}</span></div>
      {edges.length > 18 && <button onClick={() => setShowAllEdges(value => !value)}>
        {showAllEdges ? 'Show selected paths' : 'Show all paths'}
      </button>}
      <span className="board-evidence"><EvidenceBadge value="OBSERVED" /> values <EvidenceBadge value="DERIVED" /> graph</span>
    </div>

    <ClassArea step={step} mode={mode} onSelectObject={onSelectObject} />
    <div className="memory-columns">
      <section className="memory-zone stack-zone" aria-label="Thread stacks">
        <ZoneHeading icon={<Cpu size={15} />} title="Thread stacks" count={`${threads.length} thread${threads.length === 1 ? '' : 's'}`} />
        <div className="zone-scroll">
          {threads.map(thread => <ThreadStack key={thread.thread.id} snapshot={thread} onSelectObject={onSelectObject} />)}
        </div>
      </section>

      <section className="memory-zone heap-zone" aria-label="Heap objects">
        <ZoneHeading icon={<Database size={15} />} title="Heap objects" count={`${step.heap.length} tracked`} />
        <div className="zone-scroll heap-scroll">
          {regularObjects.length > 0 && <ObjectGrid objects={regularObjects} selectedObject={selectedObject} onSelectObject={onSelectObject} />}
          {stringObjects.length > 0 && <div className="string-heap-group">
            <div className="string-group-title"><Type size={14} /><strong>String objects</strong><span>Heap subgroup · intern status not inferred</span></div>
            <ObjectGrid objects={stringObjects} selectedObject={selectedObject} onSelectObject={onSelectObject} />
          </div>}
          {step.heap.length === 0 && <div className="zone-empty">No objects are reachable from the tracked roots at this step.</div>}
        </div>
      </section>
    </div>
    <ReferenceOverlay boardRef={boardRef} edges={visibleEdges} selectedObject={selectedObject} sequence={step.sequence} />
  </div>
}

function EmptyMemoryWorkspace() {
  return <div className="memory-empty">
    <div className="memory-empty-visual"><div className="mini-stack" /><Route size={35} /><div className="mini-heap" /></div>
    <h2>Run Java to see one connected memory model</h2>
    <p>Frames, objects, strings, statics, and reference arrows will appear together here.</p>
    <div><EvidenceBadge value="OBSERVED" /><EvidenceBadge value="DERIVED" /><EvidenceBadge value="SIMULATED" /></div>
  </div>
}

function ClassArea({ step, mode, onSelectObject }: { step: TraceStep; mode: Props['mode']; onSelectObject: (id: string | null) => void }) {
  const methods = [...new Set(step.bytecode.map(instruction => instruction.methodName).filter(Boolean))]
  const activeInstructions = step.bytecode.filter(instruction =>
    (!instruction.methodName || instruction.methodName === step.location.methodName) &&
    (instruction.sourceLine == null || Math.abs(instruction.sourceLine - step.location.line) <= 1))
  return <section className="class-area memory-zone" aria-label="Classes and method area">
    <ZoneHeading icon={<Braces size={15} />} title="Classes & method area" count={`${step.staticFields.length} loaded user class${step.staticFields.length === 1 ? '' : 'es'}`} />
    <div className="class-area-content">
      <div className="class-static-strip">
        {step.staticFields.map((state, classIndex) => <article className="class-chip" key={state.className}>
          <header><strong>{shortType(state.className)}</strong><EvidenceBadge value="OBSERVED" /></header>
          {state.fields.length === 0 && <span className="quiet">No static fields</span>}
          {state.fields.map((field, fieldIndex) => <ValueRow key={field.name} name={field.name} value={field.value}
            edgeId={`static-${classIndex}-${fieldIndex}`} onSelectObject={onSelectObject} />)}
        </article>)}
        {step.staticFields.length === 0 && <span className="quiet">Classes are tracked as they load and enter user-code frames.</span>}
      </div>
      {mode !== 'Beginner' && <div className="method-strip">
        <div className="method-summary"><span>Methods</span><strong>{methods.length || 1}</strong><small>{methods.slice(0, 4).join(' · ') || step.location.methodName}</small></div>
        <div className="bytecode-peek"><span>Active bytecode</span>{activeInstructions.slice(0, 5).map(instruction =>
          <code className={instruction.offset === step.location.bytecodeOffset ? 'active' : ''}
            key={`${instruction.methodName}-${instruction.offset}`}>{instruction.offset}: {instruction.mnemonic}</code>)}</div>
        <div className="metaspace-peek"><span>Metaspace</span><strong>{bytes(step.memory.metaspaceUsed)}</strong><small>Aggregate HotSpot metric</small></div>
      </div>}
    </div>
  </section>
}

function ThreadStack({ snapshot, onSelectObject }: { snapshot: ThreadSnapshot; onSelectObject: (id: string | null) => void }) {
  return <article className={`thread-stack ${snapshot.eventThread ? 'active' : ''}`}>
    <header><CircleDot size={13} /><strong>{snapshot.thread.name}</strong><span>{snapshot.thread.state}</span>{snapshot.eventThread && <em>event thread</em>}</header>
    {snapshot.stackFrames.map((frame, frameIndex) => <FrameCard key={`${frame.className}-${frame.methodName}-${frameIndex}`}
      frame={frame} threadId={snapshot.thread.id} frameIndex={frameIndex} onSelectObject={onSelectObject} />)}
    {snapshot.stackFrames.length === 0 && <div className="quiet thread-no-user-frame">No suspended user-code frame</div>}
  </article>
}

function FrameCard({ frame, threadId, frameIndex, onSelectObject }: { frame: StackFrame; threadId: number; frameIndex: number; onSelectObject: (id: string | null) => void }) {
  return <div className="frame-card">
    <div className="frame-heading"><span>{frameIndex}</span><strong>{shortType(frame.className)}.{frame.methodName}()</strong><small>line {frame.line}</small></div>
    {frame.thisObjectId && <ValueRow name="this" value={{ kind: 'reference', type: frame.className, value: null, objectId: frame.thisObjectId, evidence: 'OBSERVED' }}
      edgeId={`stack-${threadId}-${frameIndex}-this`} onSelectObject={onSelectObject} />}
    {frame.locals.map((variable, variableIndex) => <ValueRow key={`${variable.name}-${variableIndex}`} name={variable.name} value={variable.value}
      edgeId={`stack-${threadId}-${frameIndex}-${variableIndex}`} onSelectObject={onSelectObject} />)}
  </div>
}

function ObjectGrid({ objects, selectedObject, onSelectObject }: { objects: HeapObject[]; selectedObject: string | null; onSelectObject: (id: string | null) => void }) {
  return <div className="object-grid">{objects.map(object => <article key={object.id}
    data-object-target={object.id}
    role="button"
    tabIndex={0}
    aria-label={`Inspect ${object.id} ${shortType(object.runtimeType)}`}
    className={`object-card ${selectedObject === object.id ? 'selected' : ''}`}
    onClick={() => onSelectObject(selectedObject === object.id ? null : object.id)}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); onSelectObject(selectedObject === object.id ? null : object.id)
      }
    }}>
    <header><Box size={13} /><span>{object.id}</span><strong>{shortType(object.runtimeType)}</strong></header>
    {object.displayValue != null && <div className="string-value">“{object.displayValue}”</div>}
    {object.fields.map((field, fieldIndex) => <ValueRow key={`${field.declaringType}-${field.name}`} name={field.name} value={field.value}
      edgeId={`heap-${object.id}-${fieldIndex}`} onSelectObject={onSelectObject} />)}
    {object.elements.map((value, elementIndex) => <ValueRow key={elementIndex} name={`[${elementIndex}]`} value={value}
      edgeId={`heap-${object.id}-element-${elementIndex}`} onSelectObject={onSelectObject} />)}
    {object.truncated && <div className="truncated">Object graph truncated at the configured limit</div>}
    <footer><span className="reachable">● reachable</span><EvidenceBadge value={object.reachabilityEvidence} /></footer>
  </article>)}</div>
}

function ValueRow({ name, value, edgeId, onSelectObject }: { name: string; value: Value; edgeId: string; onSelectObject: (id: string | null) => void }) {
  return <div className="value-row">
    <span className="value-name">{name}</span>
    <span className="value-type">{shortType(value.type)}</span>
    {value.objectId ? <button data-edge-source={edgeId} className="reference-chip" onClick={event => {
      event.stopPropagation(); onSelectObject(value.objectId ?? null)
    }}>{value.objectId}<i>↗</i></button> : <span className={value.kind === 'null' ? 'null-value' : 'primitive-value'}>{formatValue(value)}</span>}
  </div>
}

function ReferenceOverlay({ boardRef, edges, selectedObject, sequence }: {
  boardRef: RefObject<HTMLDivElement | null>; edges: ReferenceEdge[]; selectedObject: string | null; sequence: number
}) {
  const [paths, setPaths] = useState<Array<ReferenceEdge & { path: string }>>([])

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const boardRect = board.getBoundingClientRect()
        const sources = new Map([...board.querySelectorAll<HTMLElement>('[data-edge-source]')]
          .map(element => [element.dataset.edgeSource, element]))
        const targets = new Map([...board.querySelectorAll<HTMLElement>('[data-object-target]')]
          .map(element => [element.dataset.objectTarget, element]))
        const next = edges.flatMap(edge => {
          const source = sources.get(edge.id)
          const target = targets.get(edge.targetId)
          if (!source || !target) return []
          const sourceRect = source.getBoundingClientRect()
          const targetRect = target.getBoundingClientRect()
          const x1 = sourceRect.right - boardRect.left + board.scrollLeft
          const y1 = sourceRect.top + sourceRect.height / 2 - boardRect.top + board.scrollTop
          const x2 = targetRect.left - boardRect.left + board.scrollLeft
          const y2 = targetRect.top + Math.min(30, targetRect.height / 2) - boardRect.top + board.scrollTop
          const bend = Math.max(36, Math.abs(x2 - x1) * .45)
          return [{ ...edge, path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }]
        })
        setPaths(next)
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    board.querySelectorAll<HTMLElement>('[data-edge-source], [data-object-target]').forEach(element => observer.observe(element))
    board.addEventListener('scroll', measure, true)
    measure()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); board.removeEventListener('scroll', measure, true) }
  }, [boardRef, edges, selectedObject, sequence])

  return <svg className="reference-overlay" aria-hidden="true">
    <defs>
      <marker id="arrow-stack" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker>
      <marker id="arrow-field" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker>
      <marker id="arrow-static" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker>
    </defs>
    {paths.map(edge => <path key={edge.id} d={edge.path} className={`reference-path ${edge.kind} ${selectedObject === edge.targetId ? 'selected' : ''}`}
      markerEnd={`url(#arrow-${edge.kind})`} />)}
  </svg>
}

function ZoneHeading({ icon, title, count }: { icon: React.ReactNode; title: string; count: string }) {
  return <header className="zone-heading"><span>{icon}{title}</span><small>{count}</small></header>
}

function EvidenceBadge({ value }: { value: Evidence }) { return <span className={`evidence ${value.toLowerCase()}`}>{value}</span> }

function normalizedThreads(step: TraceStep): ThreadSnapshot[] {
  return step.threads?.length ? step.threads : [{ thread: step.thread, stackFrames: step.stackFrames, eventThread: true }]
}

function collectEdges(step: TraceStep): ReferenceEdge[] {
  const edges: ReferenceEdge[] = []
  normalizedThreads(step).forEach(snapshot => snapshot.stackFrames.forEach((frame, frameIndex) => {
    if (frame.thisObjectId) edges.push({ id: `stack-${snapshot.thread.id}-${frameIndex}-this`, sourceLabel: 'this', targetId: frame.thisObjectId, kind: 'stack' })
    frame.locals.forEach((variable, variableIndex) => {
      if (variable.value.objectId) edges.push({ id: `stack-${snapshot.thread.id}-${frameIndex}-${variableIndex}`, sourceLabel: variable.name, targetId: variable.value.objectId, kind: 'stack' })
    })
  }))
  step.staticFields.forEach((state, classIndex) => state.fields.forEach((field, fieldIndex) => {
    if (field.value.objectId) edges.push({ id: `static-${classIndex}-${fieldIndex}`, sourceLabel: field.name, targetId: field.value.objectId, kind: 'static' })
  }))
  step.heap.forEach(object => {
    object.fields.forEach((field, fieldIndex) => {
      if (field.value.objectId) edges.push({ id: `heap-${object.id}-${fieldIndex}`, sourceLabel: field.name, targetId: field.value.objectId, kind: 'field' })
    })
    object.elements.forEach((value, elementIndex) => {
      if (value.objectId) edges.push({ id: `heap-${object.id}-element-${elementIndex}`, sourceLabel: `[${elementIndex}]`, targetId: value.objectId, kind: 'field' })
    })
  })
  return edges
}

function shortType(type: string) { return type?.split('.').pop() ?? type }
function formatValue(value: Value) {
  if (value.value === null || value.value === undefined) return value.kind === 'null' ? 'null' : '—'
  const raw = String(value.value)
  return value.type === 'char' ? `'${raw.replaceAll("'", '')}'` : raw
}
function bytes(value: number) {
  if (value < 0) return 'Unavailable'
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB']; let size = value / 1024; let index = 0
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index++ }
  return `${size.toFixed(1)} ${units[index]}`
}

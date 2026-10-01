import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  Box, Braces, ChevronDown, ChevronRight, CircleDot, Cpu, Database,
  Eye, EyeOff, ListTree, Network, Route, Type
} from 'lucide-react'
import type { Evidence, HeapObject, StackFrame, ThreadSnapshot, TraceStep, Value } from './types'

interface Props {
  step: TraceStep | null
  selectedObject: string | null
  onSelectObject: (id: string | null) => void
  mode: 'Beginner' | 'Intermediate' | 'JVM Internals'
}

interface WorkspaceEdge {
  id: string
  sourceLabel: string
  sourceContext: string
  targetId: string
  valueType: string
  kind: 'stack' | 'field' | 'static'
}

interface ReferenceGroup {
  key: string
  labels: string[]
  sourceContext: string
  targetId: string
  targetType: string
  kind: WorkspaceEdge['kind']
  edges: WorkspaceEdge[]
}

export function MemoryWorkspace({ step, selectedObject, onSelectObject, mode }: Props) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null)
  const [showConnector, setShowConnector] = useState(true)
  const [classAreaOpen, setClassAreaOpen] = useState(true)
  const [stringsOpen, setStringsOpen] = useState(false)
  const edges = useMemo(() => step ? collectEdges(step) : [], [step])
  const groups = useMemo(() => groupEdges(edges, step?.heap ?? []), [edges, step?.heap])
  const visibleGroups = useMemo(() => mode === 'Beginner'
    ? groups.filter(group => group.kind === 'stack')
    : groups, [groups, mode])
  const preferredGroupKey = useMemo(() => {
    const preferred = visibleGroups.find(group => group.kind === 'stack' &&
      !group.labels.every(label => label === 'args') && group.targetType !== 'java.lang.String' && !group.targetType.endsWith('[]'))
      ?? visibleGroups.find(group => group.kind === 'stack' && !group.labels.every(label => label === 'args'))
    return preferred?.key ?? visibleGroups[0]?.key ?? null
  }, [visibleGroups])
  const activeGroup = visibleGroups.find(group => group.key === activeGroupKey) ?? null
  const activeTargetId = activeGroup?.targetId ?? null

  useEffect(() => {
    setActiveGroupKey(current => visibleGroups.some(group => group.key === current) ? current : preferredGroupKey)
  }, [preferredGroupKey, step?.sequence, visibleGroups])

  useEffect(() => {
    if (!selectedObject) return
    const incoming = visibleGroups.find(group => group.targetId === selectedObject)
    if (incoming) setActiveGroupKey(incoming.key)
  }, [selectedObject, visibleGroups])

  useEffect(() => {
    if (!activeTargetId || !step) return
    if (step.heap.find(object => object.id === activeTargetId)?.runtimeType === 'java.lang.String') setStringsOpen(true)
  }, [activeTargetId, step])

  if (!step) return <EmptyMemoryWorkspace />
  const threads = normalizedThreads(step)
  const stringObjects = step.heap.filter(object => object.runtimeType === 'java.lang.String')
  const regularObjects = prioritizeObjects(step.heap.filter(object => object.runtimeType !== 'java.lang.String'), activeTargetId)
  const orderedStrings = prioritizeObjects(stringObjects, activeTargetId)
  const aliases = stackAliases(edges)
  const focusedObject = activeTargetId ? step.heap.find(object => object.id === activeTargetId) : null
  const focusedType = activeGroup ? shortType(activeGroup.targetType) : null
  const activateEdge = (edgeId: string) => {
    const group = visibleGroups.find(candidate => candidate.edges.some(edge => edge.id === edgeId))
    if (group) {
      setActiveGroupKey(group.key)
      if (selectedObject) onSelectObject(null)
    }
  }
  const activateGroup = (key: string) => {
    setActiveGroupKey(key)
    if (selectedObject) onSelectObject(null)
  }

  return <div className={`memory-board mode-${mode.toLowerCase().replace(' ', '-')}`} ref={boardRef}>
    <div className="board-toolbar">
      <div><Network size={14} /><span>{edges.length} reference{edges.length === 1 ? '' : 's'}</span></div>
      <button className={showConnector ? 'selected' : ''} onClick={() => setShowConnector(value => !value)}>
        {showConnector ? <Eye size={13} /> : <EyeOff size={13} />}
        Selected connection
      </button>
      <span className="board-hint">Choose a variable or mapping to focus one path.</span>
      <span className="board-evidence"><EvidenceBadge value="OBSERVED" /> values <EvidenceBadge value="DERIVED" /> graph</span>
    </div>

    <ClassArea step={step} mode={mode} open={classAreaOpen} onToggle={() => setClassAreaOpen(value => !value)}
      onActivateReference={activateEdge} activeTargetId={activeTargetId} />

    <div className="focused-path" aria-live="polite">
      <span><Route size={14} />Focused path</span>
      {activeGroup ? <div>
        <code>{activeGroup.sourceContext}</code><ChevronRight size={13} />
        <code>{activeGroup.labels.join(', ')}</code><ChevronRight size={13} />
        <strong>{focusedType} <b>{activeGroup.targetId}</b></strong>
        {activeGroup.labels.length > 1 && <em>{activeGroup.labels.length} aliases share this object</em>}
      </div> : <small>No object reference is available at this step.</small>}
    </div>

    <div className="memory-columns">
      <section className="memory-zone stack-zone" aria-label="Thread stacks">
        <ZoneHeading icon={<Cpu size={15} />} title="Thread stacks" count={`${threads.length} thread${threads.length === 1 ? '' : 's'}`} />
        <div className="zone-scroll">
          {threads.map(thread => <ThreadStack key={thread.thread.id} snapshot={thread} onActivateReference={activateEdge}
            activeGroup={activeGroup} />)}
        </div>
      </section>

      <ReferenceIndex groups={visibleGroups} activeGroupKey={activeGroupKey} onActivate={activateGroup} mode={mode} />

      <section className="memory-zone heap-zone" aria-label="Heap objects">
        <ZoneHeading icon={<Database size={15} />} title="Heap objects" count={`${step.heap.length} tracked`} />
        <div className="zone-scroll heap-scroll">
          {activeGroup && focusedObject?.runtimeType !== 'java.lang.String' && <div className="focused-object-label"><span>Focused object</span><small>Click the card for full details</small></div>}
          {regularObjects.length > 0 && <ObjectGrid objects={regularObjects} focusedObject={activeTargetId} inspectedObject={selectedObject}
            aliases={aliases} onSelectObject={onSelectObject} onActivateReference={activateEdge} />}
          {stringObjects.length > 0 && <section className={`string-heap-group ${stringsOpen ? 'open' : ''}`}>
            <button className="string-group-title" onClick={() => setStringsOpen(value => !value)} aria-expanded={stringsOpen}>
              {stringsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Type size={14} />
              <strong>String objects</strong><span>{stringObjects.length} tracked · intern status not inferred</span>
            </button>
            {stringsOpen && focusedObject?.runtimeType === 'java.lang.String' && <div className="focused-object-label"><span>Focused string</span><small>Heap object · pool status unknown</small></div>}
            {stringsOpen && <ObjectGrid objects={orderedStrings} focusedObject={activeTargetId} inspectedObject={selectedObject}
              aliases={aliases} onSelectObject={onSelectObject} onActivateReference={activateEdge} />}
          </section>}
          {step.heap.length === 0 && <div className="zone-empty">No objects are reachable from the tracked roots at this step.</div>}
        </div>
      </section>
    </div>

    {showConnector && activeGroup && <ReferenceOverlay boardRef={boardRef} group={activeGroup} sequence={step.sequence} />}
  </div>
}

function EmptyMemoryWorkspace() {
  return <div className="memory-empty">
    <div className="memory-empty-visual"><div className="mini-stack" /><Route size={35} /><div className="mini-heap" /></div>
    <h2>Run Java to see one connected memory model</h2>
    <p>Frames, objects, strings and statics appear together. Select one reference to reveal its path without a web of crossing arrows.</p>
    <div><EvidenceBadge value="OBSERVED" /><EvidenceBadge value="DERIVED" /><EvidenceBadge value="SIMULATED" /></div>
  </div>
}

function ClassArea({ step, mode, open, onToggle, onActivateReference, activeTargetId }: {
  step: TraceStep
  mode: Props['mode']
  open: boolean
  onToggle: () => void
  onActivateReference: (edgeId: string) => void
  activeTargetId: string | null
}) {
  const methods = [...new Set(step.bytecode.map(instruction => instruction.methodName).filter(Boolean))]
  const activeInstructions = step.bytecode.filter(instruction =>
    (!instruction.methodName || instruction.methodName === step.location.methodName) &&
    (instruction.sourceLine == null || Math.abs(instruction.sourceLine - step.location.line) <= 1))
  return <section className={`class-area memory-zone ${open ? 'open' : 'collapsed'}`} aria-label="Classes and method area">
    <ZoneHeading icon={<Braces size={15} />} title="Classes & method area" count={`${step.staticFields.length} loaded user class${step.staticFields.length === 1 ? '' : 'es'}`}
      action={<button className="zone-toggle" onClick={onToggle} aria-label={open ? 'Collapse class area' : 'Expand class area'}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>} />
    {open && <div className="class-area-content">
      <div className="class-static-strip">
        {step.staticFields.map((state, classIndex) => <article className="class-chip" key={state.className}>
          <header><strong>{shortType(state.className)}</strong><EvidenceBadge value="OBSERVED" /></header>
          {state.fields.length === 0 && <span className="quiet">No static fields</span>}
          {state.fields.map((field, fieldIndex) => <ValueRow key={field.name} name={field.name} value={field.value}
            edgeId={`static-${classIndex}-${fieldIndex}`} onActivateReference={onActivateReference} activeTargetId={activeTargetId} />)}
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
    </div>}
  </section>
}

function ThreadStack({ snapshot, onActivateReference, activeGroup }: {
  snapshot: ThreadSnapshot
  onActivateReference: (edgeId: string) => void
  activeGroup: ReferenceGroup | null
}) {
  return <article className={`thread-stack ${snapshot.eventThread ? 'active' : ''}`}>
    <header><CircleDot size={13} /><strong>{snapshot.thread.name}</strong><span>{snapshot.thread.state}</span>{snapshot.eventThread && <em>event thread</em>}</header>
    {snapshot.stackFrames.map((frame, frameIndex) => <FrameCard key={`${frame.className}-${frame.methodName}-${frameIndex}`}
      frame={frame} threadId={snapshot.thread.id} frameIndex={frameIndex} onActivateReference={onActivateReference} activeGroup={activeGroup} />)}
    {snapshot.stackFrames.length === 0 && <div className="quiet thread-no-user-frame">No suspended user-code frame</div>}
  </article>
}

function FrameCard({ frame, threadId, frameIndex, onActivateReference, activeGroup }: {
  frame: StackFrame
  threadId: number
  frameIndex: number
  onActivateReference: (edgeId: string) => void
  activeGroup: ReferenceGroup | null
}) {
  return <div className="frame-card">
    <div className="frame-heading"><span>{frameIndex}</span><strong>{shortType(frame.className)}.{frame.methodName}()</strong><small>line {frame.line}</small></div>
    {frame.thisObjectId && <ValueRow name="this" value={{ kind: 'reference', type: frame.className, value: null, objectId: frame.thisObjectId, evidence: 'OBSERVED' }}
      edgeId={`stack-${threadId}-${frameIndex}-this`} onActivateReference={onActivateReference} activeTargetId={activeGroup?.targetId ?? null} />}
    {frame.locals.map((variable, variableIndex) => <ValueRow key={`${variable.name}-${variableIndex}`} name={variable.name} value={variable.value}
      edgeId={`stack-${threadId}-${frameIndex}-${variableIndex}`} onActivateReference={onActivateReference} activeTargetId={activeGroup?.targetId ?? null} />)}
  </div>
}

function ReferenceIndex({ groups, activeGroupKey, onActivate, mode }: {
  groups: ReferenceGroup[]
  activeGroupKey: string | null
  onActivate: (key: string) => void
  mode: Props['mode']
}) {
  return <section className="memory-zone reference-index" aria-label="Reference index">
    <ZoneHeading icon={<ListTree size={15} />} title="Reference index" count={`${groups.length} mapping${groups.length === 1 ? '' : 's'}`} />
    <div className="reference-index-head"><span>Source</span><span>Refers to</span>{mode !== 'Beginner' && <span>Origin</span>}</div>
    <div className="reference-index-list">
      {groups.map(group => <button key={group.key} data-map-source={group.key} className={activeGroupKey === group.key ? 'active' : ''}
        onClick={() => onActivate(group.key)} aria-label={`Focus ${group.labels.join(', ')} to ${group.targetId}`}>
        <span><strong>{group.labels.join(', ')}</strong>{group.labels.length > 1 && <em>aliases</em>}</span>
        <code>{group.targetId}<small>{shortType(group.targetType)}</small></code>
        {mode !== 'Beginner' && <i>{group.kind}</i>}
      </button>)}
      {groups.length === 0 && <div className="zone-empty">No object references are visible in this mode at the current step.</div>}
    </div>
  </section>
}

function ObjectGrid({ objects, focusedObject, inspectedObject, aliases, onSelectObject, onActivateReference }: {
  objects: HeapObject[]
  focusedObject: string | null
  inspectedObject: string | null
  aliases: Map<string, string[]>
  onSelectObject: (id: string | null) => void
  onActivateReference: (edgeId: string) => void
}) {
  return <div className="object-grid">{objects.map(object => <ObjectCard key={object.id} object={object}
    focused={focusedObject === object.id} inspected={inspectedObject === object.id} aliases={aliases.get(object.id) ?? []}
    onSelectObject={onSelectObject} onActivateReference={onActivateReference} />)}</div>
}

function ObjectCard({ object, focused, inspected, aliases, onSelectObject, onActivateReference }: {
  object: HeapObject
  focused: boolean
  inspected: boolean
  aliases: string[]
  onSelectObject: (id: string | null) => void
  onActivateReference: (edgeId: string) => void
}) {
  return <article data-object-target={object.id} className={`object-card ${focused ? 'focused' : ''} ${inspected ? 'selected' : ''}`}>
    <header><Box size={13} /><span>{object.id}</span><strong>{shortType(object.runtimeType)}</strong>
      <button className="object-inspect-button" aria-label={`Inspect ${object.id} ${shortType(object.runtimeType)}`}
        onClick={() => onSelectObject(inspected ? null : object.id)}><Eye size={12} /></button></header>
    {aliases.length > 0 && <div className="alias-strip"><span>{aliases.length > 1 ? 'Aliases' : 'Stack root'}</span>{aliases.map(alias => <code key={alias}>{alias}</code>)}</div>}
    {object.displayValue != null && <div className="string-value">“{object.displayValue}”</div>}
    {object.fields.map((field, fieldIndex) => <ValueRow key={`${field.declaringType}-${field.name}`} name={field.name} value={field.value}
      edgeId={`heap-${object.id}-${fieldIndex}`} onActivateReference={onActivateReference} activeTargetId={focused ? object.id : null} />)}
    {object.elements.map((value, elementIndex) => <ValueRow key={elementIndex} name={`[${elementIndex}]`} value={value}
      edgeId={`heap-${object.id}-element-${elementIndex}`} onActivateReference={onActivateReference} activeTargetId={focused ? object.id : null} />)}
    {object.truncated && <div className="truncated">Object graph truncated at the configured limit</div>}
    <footer><span className="reachable">● reachable</span><EvidenceBadge value={object.reachabilityEvidence} /></footer>
  </article>
}

function ValueRow({ name, value, edgeId, onActivateReference, activeTargetId }: {
  name: string
  value: Value
  edgeId: string
  onActivateReference: (edgeId: string) => void
  activeTargetId: string | null
}) {
  return <div className={`value-row ${value.objectId && activeTargetId === value.objectId ? 'active-reference' : ''}`}>
    <span className="value-name">{name}</span>
    <span className="value-type">{shortType(value.type)}</span>
    {value.objectId ? <button className="reference-chip" onClick={event => {
      event.stopPropagation(); onActivateReference(edgeId)
    }}>{value.objectId}<i>focus</i></button> : <span className={value.kind === 'null' ? 'null-value' : 'primitive-value'}>{formatValue(value)}</span>}
  </div>
}

function ReferenceOverlay({ boardRef, group, sequence }: {
  boardRef: RefObject<HTMLDivElement | null>
  group: ReferenceGroup
  sequence: number
}) {
  const [path, setPath] = useState('')

  useLayoutEffect(() => {
    const board = boardRef.current
    if (!board) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const source = [...board.querySelectorAll<HTMLElement>('[data-map-source]')]
          .find(element => element.dataset.mapSource === group.key)
        const target = [...board.querySelectorAll<HTMLElement>('[data-object-target]')]
          .find(element => element.dataset.objectTarget === group.targetId)
        if (!source || !target) { setPath(''); return }
        const boardRect = board.getBoundingClientRect()
        const sourceRect = source.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const x1 = sourceRect.right - boardRect.left
        const y1 = sourceRect.top + sourceRect.height / 2 - boardRect.top
        const x2 = targetRect.left - boardRect.left
        const y2 = targetRect.top + Math.min(30, targetRect.height / 2) - boardRect.top
        const lane = x1 + Math.max(12, (x2 - x1) / 2)
        setPath(`M ${x1} ${y1} H ${lane} V ${y2} H ${x2}`)
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    board.querySelectorAll<HTMLElement>('[data-map-source], [data-object-target]').forEach(element => observer.observe(element))
    board.addEventListener('scroll', measure, true)
    measure()
    return () => { cancelAnimationFrame(frame); observer.disconnect(); board.removeEventListener('scroll', measure, true) }
  }, [boardRef, group.key, group.targetId, sequence])

  return <svg className="reference-overlay" aria-hidden="true">
    <defs><marker id="arrow-focus" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
    {path && <path d={path} className={`reference-path ${group.kind} selected`} markerEnd="url(#arrow-focus)" />}
  </svg>
}

function ZoneHeading({ icon, title, count, action }: { icon: React.ReactNode; title: string; count: string; action?: React.ReactNode }) {
  return <header className="zone-heading"><span>{icon}{title}</span><div><small>{count}</small>{action}</div></header>
}

function EvidenceBadge({ value }: { value: Evidence }) { return <span className={`evidence ${value.toLowerCase()}`}>{value}</span> }

function normalizedThreads(step: TraceStep): ThreadSnapshot[] {
  return step.threads?.length ? step.threads : [{ thread: step.thread, stackFrames: step.stackFrames, eventThread: true }]
}

function collectEdges(step: TraceStep): WorkspaceEdge[] {
  const edges: WorkspaceEdge[] = []
  normalizedThreads(step).forEach(snapshot => snapshot.stackFrames.forEach((frame, frameIndex) => {
    const context = `${snapshot.thread.name} · ${shortType(frame.className)}.${frame.methodName}()`
    if (frame.thisObjectId) edges.push({ id: `stack-${snapshot.thread.id}-${frameIndex}-this`, sourceLabel: 'this', sourceContext: context,
      targetId: frame.thisObjectId, valueType: frame.className, kind: 'stack' })
    frame.locals.forEach((variable, variableIndex) => {
      if (variable.value.objectId) edges.push({ id: `stack-${snapshot.thread.id}-${frameIndex}-${variableIndex}`, sourceLabel: variable.name,
        sourceContext: context, targetId: variable.value.objectId, valueType: variable.value.type, kind: 'stack' })
    })
  }))
  step.staticFields.forEach((state, classIndex) => state.fields.forEach((field, fieldIndex) => {
    if (field.value.objectId) edges.push({ id: `static-${classIndex}-${fieldIndex}`, sourceLabel: field.name,
      sourceContext: `${shortType(state.className)} static`, targetId: field.value.objectId, valueType: field.value.type, kind: 'static' })
  }))
  step.heap.forEach(object => {
    object.fields.forEach((field, fieldIndex) => {
      if (field.value.objectId) edges.push({ id: `heap-${object.id}-${fieldIndex}`, sourceLabel: field.name,
        sourceContext: `${shortType(object.runtimeType)} ${object.id}`, targetId: field.value.objectId, valueType: field.value.type, kind: 'field' })
    })
    object.elements.forEach((value, elementIndex) => {
      if (value.objectId) edges.push({ id: `heap-${object.id}-element-${elementIndex}`, sourceLabel: `[${elementIndex}]`,
        sourceContext: `${shortType(object.runtimeType)} ${object.id}`, targetId: value.objectId, valueType: value.type, kind: 'field' })
    })
  })
  return edges
}

function groupEdges(edges: WorkspaceEdge[], heap: HeapObject[]): ReferenceGroup[] {
  const grouped = new Map<string, WorkspaceEdge[]>()
  edges.forEach(edge => {
    const key = `${edge.kind}:${edge.sourceContext}:${edge.targetId}`
    grouped.set(key, [...(grouped.get(key) ?? []), edge])
  })
  return [...grouped.entries()].map(([key, items]) => {
    const first = items[0]
    const heapType = heap.find(object => object.id === first.targetId)?.runtimeType
    return { key, labels: [...new Set(items.map(item => item.sourceLabel))], sourceContext: first.sourceContext, targetId: first.targetId,
      targetType: heapType ?? first.valueType, kind: first.kind, edges: items }
  })
}

function stackAliases(edges: WorkspaceEdge[]) {
  const aliases = new Map<string, string[]>()
  edges.filter(edge => edge.kind === 'stack' && edge.sourceLabel !== 'args').forEach(edge => {
    const current = aliases.get(edge.targetId) ?? []
    if (!current.includes(edge.sourceLabel)) aliases.set(edge.targetId, [...current, edge.sourceLabel])
  })
  return aliases
}

function prioritizeObjects(objects: HeapObject[], focusedId: string | null) {
  if (!focusedId) return objects
  return [...objects].sort((left, right) => Number(right.id === focusedId) - Number(left.id === focusedId))
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

import { useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { Activity, Braces, ChevronLeft, ChevronRight, CircleStop, Code2, Cpu, Database, Gauge, Layers3, Play, RotateCcw, StepForward, TerminalSquare, Zap } from 'lucide-react'
import { examples, acceptanceExample } from './examples'
import type { Diagnostic, Evidence, HeapObject, Session, TraceStep, Value } from './types'

type MainTab = 'Stack' | 'Heap' | 'Strings' | 'Classes' | 'Bytecode' | 'Memory' | 'GC' | 'Threads' | 'Object Layout'
type BottomTab = 'Timeline' | 'Console' | 'Bytecode'
type ViewMode = 'Beginner' | 'Intermediate' | 'JVM Internals'
const mainTabs: MainTab[] = ['Stack', 'Heap', 'Strings', 'Classes', 'Bytecode', 'Memory', 'GC', 'Threads', 'Object Layout']

export function App() {
  const [source, setSource] = useState(acceptanceExample)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState<MainTab>('Heap')
  const [bottomTab, setBottomTab] = useState<BottomTab>('Timeline')
  const [mode, setMode] = useState<ViewMode>('Intermediate')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [starting, setStarting] = useState(false)
  const [selectedObject, setSelectedObject] = useState<string | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const step = session?.trace[selected] ?? null
  const liveIndex = Math.max(0, (session?.trace.length ?? 1) - 1)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const poll = async () => {
      try {
        const response = await fetch(`/api/executions/${sessionId}`)
        const next: Session = await response.json()
        if (cancelled) return
        setSession(current => {
          if (!current || selected >= current.trace.length - 1) setSelected(Math.max(0, next.trace.length - 1))
          return next
        })
      } catch { /* backend may still be starting */ }
    }
    poll()
    const timer = window.setInterval(poll, 350)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [sessionId, selected])

  useEffect(() => {
    if (!editorRef.current || !step) return
    editorRef.current.revealLineInCenter(step.location.line)
    const ids = editorRef.current.deltaDecorations([], [{
      range: { startLineNumber: step.location.line, startColumn: 1, endLineNumber: step.location.line, endColumn: 1 },
      options: { isWholeLine: true, className: 'executing-line', glyphMarginClassName: 'executing-glyph' }
    }])
    return () => { editorRef.current?.deltaDecorations(ids, []) }
  }, [step])

  const mountEditor: OnMount = (instance, monaco) => {
    editorRef.current = instance
    monaco.editor.defineTheme('jvm-lens', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: { 'editor.background': '#0b0d12', 'editorLineNumber.foreground': '#4b5263', 'editorLineNumber.activeForeground': '#f4b942', 'editor.selectionBackground': '#364b6b88' }
    })
    monaco.editor.setTheme('jvm-lens')
  }

  const run = async () => {
    setStarting(true); setDiagnostics([]); setSession(null); setSelected(0); setSelectedObject(null)
    try {
      const response = await fetch('/api/executions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sources: { 'Main.java': source }, mainClass: 'Main' }) })
      const result = await response.json()
      setDiagnostics(result.diagnostics ?? [])
      if (result.compiled) setSessionId(result.sessionId)
    } catch {
      setDiagnostics([{ file: 'Main.java', line: 1, column: 1, kind: 'ERROR', message: 'Could not reach the JVM Lens backend.' }])
    } finally { setStarting(false) }
  }

  const command = async (name: string) => {
    if (!sessionId) return
    await fetch(`/api/executions/${sessionId}/commands/${name}`, { method: 'POST' })
  }

  const reset = () => { if (sessionId && !session?.complete) command('stop'); setSessionId(null); setSession(null); setSelected(0); setDiagnostics([]) }
  const pickExample = (name: string) => { reset(); setSource(examples[name as keyof typeof examples]) }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Braces size={20} /></div><div><strong>JVM Lens</strong><span>Real Java execution, made visible</span></div></div>
      <div className="run-controls">
        <button className="primary" onClick={run} disabled={starting || (!!sessionId && !session?.complete)}><Play size={15} fill="currentColor" />{starting ? 'Compiling…' : 'Run'}</button>
        <button onClick={reset}><RotateCcw size={15} />Reset</button>
        <span className="divider" />
        <button aria-label="Previous snapshot" onClick={() => setSelected(i => Math.max(0, i - 1))} disabled={!step || selected === 0}><ChevronLeft size={17} /></button>
        <button onClick={() => selected < liveIndex ? setSelected(i => i + 1) : command('over')} disabled={!sessionId || (!!session?.complete && selected >= liveIndex)}><StepForward size={16} />Next</button>
        <button onClick={() => command('into')} disabled={!sessionId || session?.complete}>Into</button>
        <button onClick={() => command('over')} disabled={!sessionId || session?.complete}>Over</button>
        <button onClick={() => command('out')} disabled={!sessionId || session?.complete}>Out</button>
        <button className={session?.autoPlay ? 'active' : ''} onClick={() => command('auto')} disabled={!sessionId || session?.complete}><Zap size={15} />Auto</button>
      </div>
      <div className="view-switch" role="group" aria-label="View mode">{(['Beginner', 'Intermediate', 'JVM Internals'] as ViewMode[]).map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div>
    </header>

    <main className="workspace">
      <section className="editor-pane panel">
        <div className="pane-title"><span><Code2 size={15} />SOURCE</span><select aria-label="Example" onChange={e => pickExample(e.target.value)} defaultValue="Objects & aliases">{Object.keys(examples).map(name => <option key={name}>{name}</option>)}</select></div>
        <div className="file-tab"><span className="java-icon">J</span>Main.java <span className="file-status">●</span></div>
        <Editor height="100%" defaultLanguage="java" value={source} onChange={value => setSource(value ?? '')} onMount={mountEditor} options={{ fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fontLigatures: true, minimap: { enabled: false }, glyphMargin: true, lineHeight: 22, padding: { top: 12 }, scrollBeyondLastLine: false, automaticLayout: true }} />
        {diagnostics.length > 0 && <div className="diagnostics">{diagnostics.map((d, i) => <div key={i}><CircleStop size={14} /> <b>{d.file}:{d.line}:{d.column}</b> {d.message}</div>)}</div>}
      </section>

      <section className="visualizer-pane panel">
        <nav className="tabs">{mainTabs.filter(item => mode !== 'Beginner' || !['Bytecode', 'GC', 'Threads', 'Object Layout'].includes(item)).map(item => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
        <div className="visualizer-content"><MainView tab={tab} step={step} selectedObject={selectedObject} onSelectObject={setSelectedObject} /></div>
      </section>

      <aside className="inspector-pane panel">
        <div className="pane-title"><span><Gauge size={15} />INSPECTOR</span>{step && <EvidenceBadge value="OBSERVED" />}</div>
        <Inspector step={step} selectedObject={selectedObject} />
      </aside>

      <section className="bottom-pane panel">
        <nav className="bottom-tabs">{(['Timeline', 'Console', 'Bytecode'] as BottomTab[]).map(item => <button key={item} className={bottomTab === item ? 'active' : ''} onClick={() => setBottomTab(item)}>{item}</button>)}<div className="execution-state">{session?.error ? <span className="error-dot">Error</span> : session?.complete ? <span>● Finished</span> : step ? <span className="paused">● Paused at line {step.location.line}</span> : <span>Ready</span>}</div></nav>
        <BottomView tab={bottomTab} session={session} selected={selected} setSelected={setSelected} step={step} />
      </section>
    </main>
  </div>
}

function MainView({ tab, step, selectedObject, onSelectObject }: { tab: MainTab; step: TraceStep | null; selectedObject: string | null; onSelectObject: (id: string) => void }) {
  if (!step) return <EmptyState />
  if (tab === 'Stack') return <StackView step={step} onSelectObject={onSelectObject} />
  if (tab === 'Heap') return <HeapView objects={step.heap} selectedObject={selectedObject} onSelectObject={onSelectObject} />
  if (tab === 'Strings') return <StringView step={step} onSelectObject={onSelectObject} />
  if (tab === 'Classes') return <ClassView step={step} />
  if (tab === 'Bytecode') return <BytecodeView step={step} />
  if (tab === 'Memory') return <MemoryView step={step} />
  if (tab === 'GC') return <GcView step={step} />
  if (tab === 'Threads') return <ThreadView step={step} />
  return <ObjectLayoutView step={step} selectedObject={selectedObject} />
}

function EmptyState() { return <div className="empty-state"><div className="empty-orbit"><Cpu size={30} /></div><h2>Ready to inspect the JVM</h2><p>Run the sample, then step through real Java execution. The first snapshot will pause at <code>Main.main</code>.</p><div className="evidence-legend"><EvidenceBadge value="OBSERVED" /><EvidenceBadge value="DERIVED" /><EvidenceBadge value="SIMULATED" /></div></div> }

function StackView({ step, onSelectObject }: { step: TraceStep; onSelectObject: (id: string) => void }) { return <div className="stack-list"><div className="section-label">THREAD “{step.thread.name}” · {step.stackFrames.length} FRAME{step.stackFrames.length === 1 ? '' : 'S'}</div>{step.stackFrames.map((frame, index) => <article className="frame-card" key={`${frame.methodName}-${index}`}><header><span className="frame-index">{index}</span><strong>{frame.className}.{frame.methodName}()</strong><span>line {frame.line}</span></header>{frame.thisObjectId && <VariableRow name="this" value={{ kind: 'reference', type: frame.className, value: null, objectId: frame.thisObjectId, evidence: 'OBSERVED' }} onSelect={onSelectObject} />}{frame.locals.map(variable => <VariableRow key={variable.name} name={variable.name} value={variable.value} onSelect={onSelectObject} />)}</article>)}</div> }

function VariableRow({ name, value, onSelect }: { name: string; value: Value; onSelect: (id: string) => void }) { return <div className="variable-row"><span className="variable-name">{name}</span><span className="variable-type">{shortType(value.type)}</span><ValueDisplay value={value} onSelect={onSelect} /></div> }

function ValueDisplay({ value, onSelect }: { value: Value; onSelect: (id: string) => void }) {
  if (value.kind === 'null') return <span className="null-value">null</span>
  if (value.objectId) return <button className="object-link" onClick={() => onSelect(value.objectId!)}><span>→</span>{value.objectId}{value.value != null && <em> “{String(value.value)}”</em>}</button>
  return <span className="primitive-value">{formatValue(value)}</span>
}

function HeapView({ objects, selectedObject, onSelectObject }: { objects: HeapObject[]; selectedObject: string | null; onSelectObject: (id: string) => void }) { return <div className="heap-surface"><div className="section-label">TRACKED OBJECT GRAPH <EvidenceBadge value="DERIVED" /></div>{objects.length === 0 ? <div className="minor-empty">No heap objects are reachable from visible roots at this step.</div> : <div className="object-grid">{objects.map((object, index) => <article className={`object-card ${selectedObject === object.id ? 'selected' : ''} ${index === 0 ? 'fresh' : ''}`} key={object.id} onClick={() => onSelectObject(object.id)}><header><span className="object-id">{object.id}</span><strong>{shortType(object.runtimeType)}</strong>{index === 0 && stepLikeNew(object) && <span className="new-pill">tracked</span>}</header>{object.displayValue != null && <div className="string-value">“{object.displayValue}”</div>}{object.fields.map(field => <div className="field-row" key={`${field.declaringType}.${field.name}`}><span>{field.name}</span><ValueDisplay value={field.value} onSelect={onSelectObject} /></div>)}{object.elements.map((value, i) => <div className="field-row" key={i}><span>[{i}]</span><ValueDisplay value={value} onSelect={onSelectObject} /></div>)}{object.truncated && <div className="truncated">Graph truncated at configured limit</div>}<footer><span className={object.reachable ? 'reachable' : 'unreachable'}>{object.reachable ? '● Reachable' : '○ Unreachable'}</span><EvidenceBadge value={object.reachabilityEvidence} /></footer></article>)}</div>}</div> }

function StringView({ step, onSelectObject }: { step: TraceStep; onSelectObject: (id: string) => void }) {
  const strings = step.heap.filter(object => object.runtimeType === 'java.lang.String')
  const aliases = new Map<string, string[]>()
  step.stackFrames.flatMap(frame => frame.locals).forEach(variable => { if (variable.value.type === 'java.lang.String' && variable.value.objectId) aliases.set(variable.value.objectId, [...(aliases.get(variable.value.objectId) ?? []), variable.name]) })
  return <div className="string-panel"><div className="notice"><Activity size={16} /><span>Runtime String objects are separate from class-file <code>CONSTANT_String</code> entries.</span><EvidenceBadge value="OBSERVED" /></div>{strings.map(string => <article className="string-row" key={string.id}><div className="string-bubble">“{string.displayValue}”</div><button className="object-link" onClick={() => onSelectObject(string.id)}>{string.id}</button><div className="alias-list">{(aliases.get(string.id) ?? []).map(name => <span key={name}>{name}</span>)}</div></article>)}{strings.length === 0 && <div className="minor-empty">No String is visible from tracked roots.</div>}<p className="technical-note">Intern-pool membership is not inferred from equal text. Aliasing is shown only when JDI reports the same object identity.</p></div>
}

function ClassView({ step }: { step: TraceStep }) { return <div className="class-list"><div className="notice"><Layers3 size={16} /><span>Method Area is a JVM specification concept. Metaspace is a HotSpot implementation mechanism.</span></div>{step.staticFields.map(state => <article className="class-card" key={state.className}><header><strong>{state.className}</strong><EvidenceBadge value="OBSERVED" /></header><div className="section-label">STATIC FIELDS</div>{state.fields.map(field => <div className="field-row" key={field.name}><span>{field.name}</span><span>{field.value.objectId ?? formatValue(field.value)}</span></div>)}</article>)}{step.staticFields.length === 0 && <div className="minor-empty">No static fields are visible for loaded user classes.</div>}</div> }

function BytecodeView({ step }: { step: TraceStep }) { const nearby = step.bytecode.filter(i => !i.sourceLine || Math.abs((i.sourceLine ?? 0) - step.location.line) <= 1); return <div className="bytecode-list"><div className="bytecode-header"><span>Source line {step.location.line}</span><span>BCI {step.location.bytecodeOffset}</span><EvidenceBadge value="OBSERVED" /></div>{(nearby.length ? nearby : step.bytecode).slice(0, 80).map(instruction => <div className={`instruction ${instruction.offset === step.location.bytecodeOffset ? 'current' : ''}`} key={`${instruction.offset}-${instruction.mnemonic}`}><span>{instruction.offset}</span><strong>{instruction.mnemonic}</strong><code>{instruction.detail}</code></div>)}{step.bytecode.length === 0 && <div className="minor-empty">Bytecode is not available for this frame.</div>}<div className="notice subdued">The source line can map to multiple JVM instructions. Operand-stack simulation is not fabricated in this milestone.</div></div> }

function MemoryView({ step }: { step: TraceStep }) { const m = step.memory; const metrics = [['Heap used', m.heapUsed], ['Heap committed', m.heapCommitted], ['Heap maximum', m.heapMax], ['Non-heap used', m.nonHeapUsed], ['Metaspace', m.metaspaceUsed]] as const; return <div className="memory-view"><div className="metric-grid">{metrics.map(([name, value]) => <article className="metric" key={name}><span>{name}</span><strong>{bytes(value)}</strong><EvidenceBadge value="OBSERVED" /></article>)}</div><div className="runtime-counts"><div><Cpu size={18} /><strong>{m.threadCount < 0 ? '—' : m.threadCount}</strong><span>Threads</span></div><div><Database size={18} /><strong>{m.loadedClasses < 0 ? '—' : m.loadedClasses}</strong><span>Loaded classes</span></div></div><p className="technical-note">Values show aggregate child-JVM telemetry. They are not per-object physical locations.</p></div> }

function GcView({ step }: { step: TraceStep }) { return <div className="gc-view"><div className="generation-track"><section><span>YOUNG</span><div className="generation-box"><strong>Eden</strong><small>newly tracked</small>{step.heap.slice(0, 6).map(o => <span className="object-token" key={o.id}>{o.id}</span>)}</div><div className="generation-box muted"><strong>Survivor</strong><small>educational model</small></div></section><div className="promotion-arrow">→</div><section><span>OLD</span><div className="generation-box muted"><strong>Tenured</strong><small>educational model</small></div></section></div><div className="notice warning"><Zap size={16} /><span>Per-object generation placement is educational. JVM Lens does not claim the exact G1 region for any object.</span><EvidenceBadge value="SIMULATED" /></div></div> }

function ThreadView({ step }: { step: TraceStep }) { return <div className="thread-view"><article className="thread-card"><div className="thread-icon"><Cpu size={22} /></div><div><strong>{step.thread.name}</strong><span>ID {step.thread.id}</span></div><span className="thread-state">{step.thread.state}</span></article><p className="technical-note">The active event thread is observed. Deterministic thread scheduling is not provided.</p></div> }

function ObjectLayoutView({ step, selectedObject }: { step: TraceStep; selectedObject: string | null }) { const object = step.heap.find(item => item.id === selectedObject); return <div className="class-list">{object ? <><article className="class-card"><header><strong>{object.id} · {shortType(object.runtimeType)}</strong></header><div className="field-row"><span>Runtime type</span><span>{object.runtimeType}</span></div><div className="field-row"><span>Logical identity</span><span>{object.id}</span></div></article><div className="notice warning"><Database size={16} /><span>Live debuggee-object offsets, headers, padding, and size are not available in this execution mode. JVM Lens will not substitute a host-JVM class layout.</span></div><p className="technical-note">The backend contains the JOL integration boundary. A child-side probe is required before these values can be labeled as a layout for this runtime object.</p></> : <div className="minor-empty">Select a heap object, then return here to inspect its available layout evidence.</div>}</div> }

function Inspector({ step, selectedObject }: { step: TraceStep | null; selectedObject: string | null }) {
  if (!step) return <div className="inspector-empty">Select an object or run the program to inspect evidence and changes.</div>
  const object = step.heap.find(item => item.id === selectedObject)
  if (object) return <div className="inspector-body"><div className="inspector-object"><span>{object.id}</span><h3>{shortType(object.runtimeType)}</h3><p>Logical JVM Lens Object ID</p></div><dl><dt>Runtime type</dt><dd>{object.runtimeType}</dd><dt>Reachability</dt><dd>{object.reachable ? 'Reachable from tracked roots' : 'Not reachable from tracked roots'} <EvidenceBadge value="DERIVED" /></dd><dt>Generation</dt><dd>{object.simulatedGeneration} <EvidenceBadge value="SIMULATED" /></dd><dt>Physical address</dt><dd>Not exposed</dd></dl><div className="inspector-section"><span>FIELDS</span>{object.fields.map(field => <div key={field.name}><b>{field.name}</b><code>{field.value.objectId ?? formatValue(field.value)}</code></div>)}</div><div className="notice subdued">Object layout requires a runtime JOL query. No offsets are invented here.</div></div>
  return <div className="inspector-body"><div className="current-location"><span>JUST EXECUTED</span><strong>Line {step.location.line}</strong><code>{step.location.className}.{step.location.methodName}()</code></div><div className="change-summary"><h3>What changed</h3><p>{step.diff.explanation}</p>{step.diff.localsChanged.length > 0 && <Change kind="Local changed" values={step.diff.localsChanged} />}{step.diff.objectsCreated.length > 0 && <Change kind="Object visible" values={step.diff.objectsCreated} />}{step.diff.objectsChanged.length > 0 && <Change kind="Field changed" values={step.diff.objectsChanged} />}{step.diff.objectsBecameUnreachable.length > 0 && <Change kind="Tracked reachability lost" values={step.diff.objectsBecameUnreachable} />}</div><div className="inspector-section"><span>EVIDENCE</span><div><b>Location</b><EvidenceBadge value="OBSERVED" /></div><div><b>Object graph</b><EvidenceBadge value="DERIVED" /></div></div></div>
}

function Change({ kind, values }: { kind: string; values: string[] }) { return <div className="change"><span>{kind}</span><strong>{values.join(', ')}</strong></div> }

function BottomView({ tab, session, selected, setSelected, step }: { tab: BottomTab; session: Session | null; selected: number; setSelected: (value: number) => void; step: TraceStep | null }) {
  if (tab === 'Console') return <pre className="console"><span className="prompt">stdout ›</span> {step?.stdout || 'No output yet.'}{step?.stderr && <><br/><span className="stderr">stderr › {step.stderr}</span></>}</pre>
  if (tab === 'Bytecode') return <div className="bottom-bytecode">{step?.bytecode.slice(0, 24).map(i => <code className={i.offset === step.location.bytecodeOffset ? 'active' : ''} key={i.offset}>{i.offset}: {i.mnemonic}</code>) ?? <span>Run to inspect bytecode.</span>}</div>
  return <div className="timeline">{session?.trace.map((item, i) => <button key={item.sequence} className={selected === i ? 'active' : ''} onClick={() => setSelected(i)}><span className="timeline-dot" /><b>{item.sequence}</b><span>Line {item.location.line}</span><small>{item.event.replace('_', ' ')}</small></button>)}{!session?.trace.length && <div className="timeline-empty"><Activity size={16} />Execution snapshots will appear here.</div>}</div>
}

function EvidenceBadge({ value }: { value: Evidence }) { return <span className={`evidence ${value.toLowerCase()}`}>{value}</span> }
function shortType(type: string) { return type?.split('.').pop() ?? type }
function stepLikeNew(object: HeapObject) { return object.reachable }
function formatValue(value: Value) { if (value.value === null || value.value === undefined) return value.kind === 'null' ? 'null' : '—'; const raw = String(value.value); return value.type === 'char' ? `'${raw.replaceAll("'", '')}'` : raw }
function bytes(value: number) { if (value < 0) return 'Unavailable'; if (value < 1024) return `${value} B`; const units = ['KB', 'MB', 'GB']; let size = value / 1024; let i = 0; while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ } return `${size.toFixed(1)} ${units[i]}` }

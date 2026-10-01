import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import {
  Activity, Braces, ChevronDown, ChevronLeft, ChevronUp, CircleStop,
  Code2, Gauge, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Play,
  RotateCcw, StepForward, Type, X, Zap
} from 'lucide-react'
import { ApiError, fetchSession, mergeSession, sendCommand, startExecution } from './api'
import { examples, acceptanceExample } from './examples'
import { MemoryWorkspace } from './MemoryWorkspace'
import { ExecutionSocket } from './executionSocket'
import type { Diagnostic, Evidence, Session, SessionStatus, TraceStep } from './types'

type BottomTab = 'Timeline' | 'Console' | 'Changes' | 'Bytecode' | 'JMM Explorer'
type ViewMode = 'Beginner' | 'Intermediate' | 'JVM Internals'
type UiTextSize = 'standard' | 'large' | 'extra-large'
const POLL_INTERVAL_MS = 1000
const UI_TEXT_SIZE_STORAGE_KEY = 'jvm-lens-ui-text-size'

function initialUiTextSize(): UiTextSize {
  try {
    const saved = window.localStorage.getItem(UI_TEXT_SIZE_STORAGE_KEY)
    if (saved === 'standard' || saved === 'large' || saved === 'extra-large') return saved
  } catch { /* storage can be unavailable in privacy-restricted browsers */ }
  return 'large'
}

export function App() {
  const [source, setSource] = useState(acceptanceExample)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null)
  const [bottomTab, setBottomTab] = useState<BottomTab>('Timeline')
  const [bottomOpen, setBottomOpen] = useState(true)
  const [mode, setMode] = useState<ViewMode>('Intermediate')
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [starting, setStarting] = useState(false)
  const [startStatus, setStartStatus] = useState<SessionStatus | null>(null)
  const [selectedObject, setSelectedObject] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(true)
  const [focusMode, setFocusMode] = useState(false)
  const [uiTextSize, setUiTextSize] = useState<UiTextSize>(initialUiTextSize)
  const [transport, setTransport] = useState<'socket' | 'poll' | null>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const latestSequenceRef = useRef(0)
  const followLiveRef = useRef(true)
  const socketRef = useRef<ExecutionSocket | null>(null)

  const selectedIndex = useMemo(() => {
    if (!session?.trace.length) return -1
    if (selectedSequence == null) return session.trace.length - 1
    const exact = session.trace.findIndex(item => item.sequence === selectedSequence)
    return exact >= 0 ? exact : session.trace.length - 1
  }, [session?.trace, selectedSequence])
  const step = selectedIndex >= 0 ? session?.trace[selectedIndex] ?? null : null
  const liveIndex = Math.max(0, (session?.trace.length ?? 1) - 1)
  const status = session?.status ?? startStatus

  const pullSession = useCallback(async (id: string, signal?: AbortSignal) => {
    const incoming = await fetchSession(id, latestSequenceRef.current, signal)
    if (followLiveRef.current && incoming.trace.length) {
      setSelectedSequence(incoming.trace[incoming.trace.length - 1].sequence)
    }
    setSession(current => {
      const merged = mergeSession(current, incoming)
      latestSequenceRef.current = merged.latestSequence
      return merged
    })
    setStartStatus(incoming.status)
    setConnectionError(null)
    return incoming
  }, [])

  useEffect(() => {
    if (!sessionId || transport !== 'poll') return
    const controller = new AbortController()
    let timer = 0
    const poll = async () => {
      try {
        const incoming = await pullSession(sessionId, controller.signal)
        if (!incoming.complete) timer = window.setTimeout(poll, POLL_INTERVAL_MS)
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError && error.status === 404
          ? 'This execution session expired or moved to another backend instance. Run the code again to create a fresh session.'
          : error instanceof Error ? error.message : 'Could not refresh the execution.'
        setConnectionError(message)
        timer = window.setTimeout(poll, 3000)
      }
    }
    void poll()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [sessionId, pullSession, transport])

  useEffect(() => {
    if (!editorRef.current || !step || step.location.line < 1) return
    editorRef.current.revealLineInCenter(step.location.line)
    const ids = editorRef.current.deltaDecorations([], [{
      range: { startLineNumber: step.location.line, startColumn: 1, endLineNumber: step.location.line, endColumn: 1 },
      options: { isWholeLine: true, className: 'executing-line', glyphMarginClassName: 'executing-glyph' }
    }])
    return () => { editorRef.current?.deltaDecorations(ids, []) }
  }, [step])

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setFocusMode(false) }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(UI_TEXT_SIZE_STORAGE_KEY, uiTextSize) } catch { /* keep the in-memory preference */ }
  }, [uiTextSize])

  useEffect(() => () => socketRef.current?.close(), [])

  const mountEditor: OnMount = (instance, monaco) => {
    editorRef.current = instance
    monaco.editor.defineTheme('jvm-lens', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: { 'editor.background': '#0a0d12', 'editorLineNumber.foreground': '#4b5263', 'editorLineNumber.activeForeground': '#f4b942', 'editor.selectionBackground': '#364b6b88' }
    })
    monaco.editor.setTheme('jvm-lens')
  }

  const run = async () => {
    setStarting(true)
    setDiagnostics([])
    setSession(null)
    setSessionId(null)
    setSelectedSequence(null)
    setSelectedObject(null)
    setConnectionError(null)
    latestSequenceRef.current = 0
    followLiveRef.current = true
    setStartStatus('COMPILING')
    try {
      socketRef.current?.close()
      let result
      if (typeof WebSocket !== 'undefined') {
        const live = new ExecutionSocket({
          onStep: (id, nextStatus, latestSequence, nextStep) => {
            latestSequenceRef.current = latestSequence
            setStartStatus(nextStatus)
            if (followLiveRef.current) setSelectedSequence(nextStep.sequence)
            setSession(current => {
              const base: Session = current ?? { sessionId: id, status: nextStatus, complete: false, autoPlay: false,
                historyStartSequence: nextStep.sequence, latestSequence, reset: false, trace: [] }
              const merged = mergeSession(base, { ...base, status: nextStatus, latestSequence, trace: [nextStep], reset: false })
              return merged
            })
          },
          onComplete: (id, nextStatus, latestSequence, error) => {
            setStartStatus(nextStatus)
            setSession(current => current
              ? { ...current, sessionId: id, status: nextStatus, latestSequence, complete: true, error }
              : { sessionId: id, status: nextStatus, latestSequence, complete: true, error, autoPlay: false,
                historyStartSequence: 1, reset: false, trace: [] })
            if (error) setConnectionError(error)
          },
          onError: message => setConnectionError(message),
          onAutoPlay: enabled => setSession(current => current ? { ...current, autoPlay: enabled } : current),
          onUnexpectedClose: () => {
            setTransport('poll')
            setConnectionError('The live connection was interrupted. Continuing with resilient polling…')
          }
        })
        socketRef.current = live
        try {
          result = await live.start(source)
          setTransport('socket')
        } catch {
          live.close()
          socketRef.current = null
          result = await startExecution(source)
          setTransport('poll')
        }
      } else {
        result = await startExecution(source)
        setTransport('poll')
      }
      setDiagnostics(result.diagnostics ?? [])
      setStartStatus(result.status)
      if (result.compiled && result.sessionId) {
        setSessionId(result.sessionId)
        setSession(current => current ?? { sessionId: result.sessionId, status: result.status, complete: false,
          autoPlay: false, historyStartSequence: 1, latestSequence: 0, reset: false, trace: [] })
      } else {
        socketRef.current?.close(); socketRef.current = null; setTransport(null)
        if (result.error) setConnectionError(result.error)
      }
    } catch (error) {
      setStartStatus('FAILED')
      setConnectionError(error instanceof Error ? error.message : 'Could not reach the JVM Lens backend.')
    } finally {
      setStarting(false)
    }
  }

  const command = async (name: string) => {
    if (!sessionId) return
    try {
      setConnectionError(null)
      followLiveRef.current = true
      if (transport === 'socket' && socketRef.current?.isOpen()) {
        try {
          socketRef.current.command(name)
          return
        } catch {
          setTransport('poll')
        }
      }
      await sendCommand(sessionId, name)
      window.setTimeout(() => void pullSession(sessionId).catch(() => undefined), 100)
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : `Could not send ${name}.`)
    }
  }

  const reset = () => {
    if (sessionId && !session?.complete) {
      if (transport === 'socket' && socketRef.current?.isOpen()) {
        try { socketRef.current.command('stop') } catch { /* connection already closed */ }
      } else void sendCommand(sessionId, 'stop').catch(() => undefined)
    }
    socketRef.current?.close(); socketRef.current = null
    setSessionId(null); setSession(null); setSelectedSequence(null); setDiagnostics([])
    setSelectedObject(null); setConnectionError(null); setStartStatus(null)
    latestSequenceRef.current = 0; followLiveRef.current = true; setTransport(null)
  }
  const pickExample = (name: string) => { reset(); setSource(examples[name as keyof typeof examples]) }
  const selectTimeline = (sequence: number) => {
    followLiveRef.current = sequence === session?.latestSequence
    setSelectedSequence(sequence)
    setSelectedObject(null)
  }
  const previous = () => {
    if (!session || selectedIndex <= 0) return
    followLiveRef.current = false
    setSelectedSequence(session.trace[selectedIndex - 1].sequence)
  }
  const next = () => {
    if (session && selectedIndex < liveIndex) {
      const nextStep = session.trace[selectedIndex + 1]
      followLiveRef.current = nextStep.sequence === session.latestSequence
      setSelectedSequence(nextStep.sequence)
    } else void command('over')
  }
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); setFocusMode(true) }
      else { await document.exitFullscreen(); setFocusMode(false) }
    } catch { setFocusMode(value => !value) }
  }

  return <div data-ui-text-size={uiTextSize} className={`app-shell ${focusMode ? 'focus-mode' : ''} ${editorOpen ? '' : 'editor-closed'} ${bottomOpen ? '' : 'bottom-closed'}`}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Braces size={19} /></div><div><strong>JVM Lens</strong><span>Java memory, connected</span></div></div>
      <div className="run-controls">
        <button className="primary" onClick={run} disabled={starting || (!!sessionId && !session?.complete)}><Play size={14} fill="currentColor" />{starting ? 'Compiling…' : 'Run'}</button>
        <button onClick={reset}><RotateCcw size={14} />Reset</button>
        <span className="divider" />
        <button aria-label="Previous snapshot" onClick={previous} disabled={!step || selectedIndex <= 0}><ChevronLeft size={16} /></button>
        <button onClick={next} disabled={!sessionId || (!!session?.complete && selectedIndex >= liveIndex)}><StepForward size={15} />Next</button>
        <button onClick={() => void command('into')} disabled={!sessionId || session?.complete}>Into</button>
        <button onClick={() => void command('over')} disabled={!sessionId || session?.complete}>Over</button>
        <button onClick={() => void command('out')} disabled={!sessionId || session?.complete}>Out</button>
        <button className={session?.autoPlay ? 'active' : ''} onClick={() => void command('auto')} disabled={!sessionId || session?.complete}><Zap size={14} />Auto</button>
      </div>
      <div className="header-actions">
        <label className="ui-text-size" title="Interface text size">
          <Type size={15} aria-hidden="true" />
          <select aria-label="Interface text size" value={uiTextSize} onChange={event => setUiTextSize(event.target.value as UiTextSize)}>
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="extra-large">Extra large</option>
          </select>
        </label>
        <div className="view-switch" role="group" aria-label="View mode">{(['Beginner', 'Intermediate', 'JVM Internals'] as ViewMode[]).map(item => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => setMode(item)}>{item}</button>)}</div>
        <button className="icon-button" aria-label={editorOpen ? 'Hide editor' : 'Show editor'} onClick={() => setEditorOpen(value => !value)}>{editorOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}</button>
        <button className="icon-button" aria-label="Toggle full screen" onClick={() => void toggleFullscreen()}>{focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
    </header>

    {connectionError && <div className="connection-alert" role="alert"><CircleStop size={15} /><span>{connectionError}</span><button onClick={() => setConnectionError(null)} aria-label="Dismiss error"><X size={14} /></button></div>}

    <main className="workspace">
      {editorOpen && !focusMode && <section className="editor-pane panel">
        <div className="pane-title"><span><Code2 size={14} />SOURCE</span><select aria-label="Example" onChange={event => pickExample(event.target.value)} defaultValue="Objects & aliases">{Object.keys(examples).map(name => <option key={name}>{name}</option>)}</select></div>
        <div className="file-tab"><span className="java-icon">J</span>Main.java <span className="file-status">●</span></div>
        <Editor height="100%" defaultLanguage="java" value={source} onChange={value => setSource(value ?? '')} onMount={mountEditor}
          options={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontLigatures: true, minimap: { enabled: false }, glyphMargin: true, lineHeight: 21, padding: { top: 12 }, scrollBeyondLastLine: false, automaticLayout: true }} />
        {diagnostics.length > 0 && <div className="diagnostics">{diagnostics.map((diagnostic, index) => <div key={`${diagnostic.line}-${index}`}><CircleStop size={13} /><b>{diagnostic.file}:{diagnostic.line}:{diagnostic.column}</b>{diagnostic.message}</div>)}</div>}
      </section>}

      <section className="visualizer-pane panel">
        <div className="visualizer-heading">
          <div><Gauge size={15} /><strong>Memory workspace</strong>{step && <span>line {step.location.line} · {step.location.className}.{step.location.methodName}()</span>}</div>
          <ExecutionStatus status={status} step={step} error={session?.error} />
        </div>
        <div className="visualizer-content"><MemoryWorkspace step={step} selectedObject={selectedObject} onSelectObject={setSelectedObject} mode={mode} /></div>
        {selectedObject && step && <ObjectInspector step={step} objectId={selectedObject} onClose={() => setSelectedObject(null)} />}
      </section>

      <section className="bottom-pane panel">
        <nav className="bottom-tabs">
          {(['Timeline', 'Console', 'Changes', 'Bytecode', 'JMM Explorer'] as BottomTab[]).map(item => <button key={item} className={bottomTab === item ? 'active' : ''} onClick={() => { setBottomTab(item); setBottomOpen(true) }}>{item}</button>)}
          <div className="execution-state">{step ? `Step ${step.sequence} of ${session?.latestSequence ?? step.sequence}` : statusLabel(status)}</div>
          <button className="collapse-bottom" aria-label={bottomOpen ? 'Collapse details' : 'Expand details'} onClick={() => setBottomOpen(value => !value)}>{bottomOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        </nav>
        {bottomOpen && <BottomView tab={bottomTab} session={session} selectedSequence={selectedSequence} onSelect={selectTimeline} step={step} />}
      </section>
    </main>
  </div>
}

function ExecutionStatus({ status, step, error }: { status: SessionStatus | null; step: TraceStep | null; error?: string }) {
  const value = error ? 'FAILED' : status ?? 'READY'
  return <div className={`status-pill status-${value.toLowerCase()}`}><span />{value === 'PAUSED' && step ? `Paused · line ${step.location.line}` : statusLabel(status, error)}</div>
}

function ObjectInspector({ step, objectId, onClose }: { step: TraceStep; objectId: string; onClose: () => void }) {
  const object = step.heap.find(item => item.id === objectId)
  if (!object) return null
  return <aside className="object-inspector">
    <header><div><span>{object.id}</span><strong>{shortType(object.runtimeType)}</strong></div><button onClick={onClose} aria-label="Close object inspector"><X size={15} /></button></header>
    {object.displayValue != null && <div className="inspector-string">“{object.displayValue}”</div>}
    <dl><dt>Runtime type</dt><dd>{object.runtimeType}</dd><dt>Reachability</dt><dd>Tracked root path <EvidenceBadge value="DERIVED" /></dd><dt>Generation</dt><dd>Not observed</dd><dt>Logical identity</dt><dd>{object.id}</dd></dl>
    <div className="inspector-fields"><span>FIELDS</span>{object.fields.map(field => <div key={`${field.declaringType}-${field.name}`}><b>{field.name}</b><code>{field.value.objectId ?? formatUnknown(field.value.value)}</code></div>)}</div>
    <p>Physical addresses and exact GC regions are intentionally not inferred.</p>
  </aside>
}

function BottomView({ tab, session, selectedSequence, onSelect, step }: { tab: BottomTab; session: Session | null; selectedSequence: number | null; onSelect: (sequence: number) => void; step: TraceStep | null }) {
  if (tab === 'Console') return <pre className="console"><span className="prompt">stdout ›</span> {step?.stdout || 'No output yet.'}{step?.stderr && <><br /><span className="stderr">stderr › {step.stderr}</span></>}</pre>
  if (tab === 'Changes') return <ChangesView step={step} />
  if (tab === 'Bytecode') return <BytecodeView step={step} />
  if (tab === 'JMM Explorer') return <JmmExplorer step={step} />
  return <div className="timeline">{session?.trace.map(item => <button key={item.sequence} className={selectedSequence === item.sequence ? 'active' : ''} onClick={() => onSelect(item.sequence)}><span className="timeline-dot" /><b>{item.sequence}</b><span>Line {item.location.line}</span><small>{item.event.replace('_', ' ')}</small></button>)}{!session?.trace.length && <div className="timeline-empty"><Activity size={15} />Execution snapshots will appear here.</div>}</div>
}

function ChangesView({ step }: { step: TraceStep | null }) {
  if (!step) return <div className="bottom-empty">Run the program to see changes between snapshots.</div>
  const groups = [
    ['Locals changed', step.diff.localsChanged], ['Objects created', step.diff.objectsCreated],
    ['Objects changed', step.diff.objectsChanged], ['References changed', step.diff.referencesChanged],
    ['No longer reachable', step.diff.objectsBecameUnreachable]
  ] as const
  return <div className="changes-view"><div className="change-explanation"><strong>What changed</strong><p>{step.diff.explanation}</p></div>{groups.filter(([, values]) => values.length).map(([label, values]) => <div className="change-card" key={label}><span>{label}</span><code>{values.join(', ')}</code></div>)}</div>
}

function BytecodeView({ step }: { step: TraceStep | null }) {
  if (!step) return <div className="bottom-empty">Run the program to inspect method-scoped bytecode.</div>
  const instructions = step.bytecode.filter(instruction => !instruction.methodName || instruction.methodName === step.location.methodName)
  return <div className="bytecode-view"><div className="bytecode-context"><strong>{step.location.methodName}()</strong><span>BCI {step.location.bytecodeOffset}</span><EvidenceBadge value="OBSERVED" /></div><div>{instructions.slice(0, 100).map(instruction => <code className={instruction.offset === step.location.bytecodeOffset ? 'active' : ''} key={`${instruction.methodName}-${instruction.offset}`}><span>{instruction.offset}</span><b>{instruction.mnemonic}</b>{instruction.detail}</code>)}</div></div>
}

function JmmExplorer({ step }: { step: TraceStep | null }) {
  if (!step) return <div className="bottom-empty">Run a threaded example to inspect Java Memory Model evidence.</div>
  const events = step.jmmEvents ?? []
  const threads = step.threads?.length ?? 1
  return <div className="jmm-explorer">
    <div className="jmm-summary"><div><strong>{threads}</strong><span>visible user thread{threads === 1 ? '' : 's'}</span></div><p>Debugger evidence shows observed frames and derived bytecode events. CPU/JIT reordering is not claimed as directly observed.</p></div>
    <div className="jmm-events">{events.map((event, index) => <article className={`jmm-event event-${event.type.toLowerCase()}`} key={`${event.type}-${index}`}><header><strong>{event.type.replaceAll('_', ' ')}</strong><EvidenceBadge value={event.evidence} /></header><span>{event.threadName}{event.variable ? ` · ${event.variable}` : ''}</span><p>{event.detail}</p></article>)}{events.length === 0 && <div className="bottom-empty">No field, monitor, volatile, or cross-thread ordering evidence at this source location.</div>}</div>
  </div>
}

function EvidenceBadge({ value }: { value: Evidence }) { return <span className={`evidence ${value.toLowerCase()}`}>{value}</span> }
function statusLabel(status: SessionStatus | null, error?: string) {
  if (error) return error
  if (!status) return 'Ready'
  return ({ COMPILING: 'Compiling', STARTING: 'Starting JVM', RUNNING: 'Running', PAUSED: 'Paused', COMPLETED: 'Finished', FAILED: 'Failed', STOPPED: 'Stopped' } as const)[status]
}
function shortType(type: string) { return type?.split('.').pop() ?? type }
function formatUnknown(value: unknown) { return value == null ? 'null' : String(value) }

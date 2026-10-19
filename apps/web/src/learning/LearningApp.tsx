import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { MotionConfig } from 'framer-motion'
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronDown,
  Code2,
  Download,
  Focus,
  GitBranch,
  Keyboard,
  Lightbulb,
  Moon,
  RotateCcw,
  Share2,
  Sun,
  X
} from 'lucide-react'
import { startExecution, fetchSession, mergeSession, sendCommand } from '../api'
import type { Session } from '../types'
import { traces, misconceptionTraces } from './library'
import { useLearning } from './store'
import { tokens, tokenStyles } from './tokens'
import { readShare, shareUrl } from './share'
import { observedTrace, explainDiagnostic } from './live'
import { CodePane } from './components/CodePane'
import { MemoryBoard } from './components/MemoryBoard'
import { ThreadLanes } from './components/ThreadLanes'
import { TransportBar } from './components/TransportBar'
import './learning.css'
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer)
      reject(new DOMException('Cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', stop)
      resolve()
    }, ms)
    signal.addEventListener('abort', stop, { once: true })
  })
export function LearningApp() {
  const state = useLearning(),
    {
      trace,
      index,
      predict,
      pending,
      roots,
      theme,
      size,
      compare,
      draft,
      sourceChanged,
      load,
      seek,
      next,
      previous,
      setPredict,
      setPlaying
    } = state
  const step = trace.steps[index],
    shell = useRef<HTMLDivElement>(null),
    initialized = useRef(false),
    sharedStep = useRef<number | undefined>(undefined)
  const [shortcuts, setShortcuts] = useState(false),
    [banner, setBanner] = useState(true),
    [message, setMessage] = useState(''),
    [shared, setShared] = useState(''),
    [running, setRunning] = useState(false),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState<{ line: number; message: string }>(),
    controller = useRef<AbortController | null>(null),
    sessionId = useRef<string | null>(null)
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const shared = readShare(window.location.search)
    load(shared.trace, shared.index)
    sharedStep.current = shared.sharedStep
    if (shared.code && shared.code !== shared.trace.code) useLearning.getState().edit(shared.code)
    if (shared.error) setMessage(shared.error)
    try {
      const theme = localStorage.getItem('jvm-lens-learning-theme'),
        size = Number(localStorage.getItem('jvm-lens-learning-size'))
      if (theme === 'dark' || theme === 'light') useLearning.setState({ theme })
      if ([1, 1.15, 1.3].includes(size)) useLearning.setState({ size })
    } catch {
      /* The view also works without persistent storage. */
    }
  }, [load])
  useEffect(() => {
    try {
      localStorage.setItem('jvm-lens-learning-theme', theme)
      localStorage.setItem('jvm-lens-learning-size', String(size))
    } catch {
      /* Keep session preferences. */
    }
  }, [theme, size])
  useEffect(() => {
    if (!state.playing) return
    const timer = setInterval(
      () => useLearning.getState().next(),
      tokens.playback.interval / state.speed
    )
    return () => clearInterval(timer)
  }, [state.playing, state.speed])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return
      if (e.altKey || e.ctrlKey || e.metaKey || running || exporting) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        previous()
      }
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying(!useLearning.getState().playing)
      }
      if (e.key.toLowerCase() === 'p') setPredict()
      if (e.key.toLowerCase() === 'g') {
        const s = useLearning.getState(),
          i = s.trace.steps.findIndex((t, i) => i > s.index && t.event === 'gc')
        if (i >= 0) seek(i)
        else setMessage('There are no later GC steps in this trace.')
      }
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector<HTMLElement>('.lens-code .cm-content')?.focus()
      }
      if (e.key === '?') setShortcuts((s) => !s)
      if (e.key === 'Escape') {
        setShortcuts(false)
        setShared('')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [next, previous, setPlaying, setPredict, seek, running, exporting])
  useEffect(
    () => () => {
      controller.current?.abort()
      const id = sessionId.current
      if (id) void sendCommand(id, 'stop').catch(() => undefined)
    },
    []
  )
  const cancelRun = useCallback(() => {
    controller.current?.abort()
    const id = sessionId.current
    if (id) void sendCommand(id, 'stop').catch(() => undefined)
    sessionId.current = null
    setRunning(false)
    setMessage('Execution stopped. Your last trace is still available.')
  }, [])
  const run = async () => {
    if (draft === trace.code && trace.evidence === 'curated') {
      seek(0)
      setPlaying(true)
      setBanner(false)
      return
    }
    setPlaying(false)
    setRunning(true)
    setError(undefined)
    setMessage('Compiling your Java with the existing JVM backend…')
    controller.current?.abort()
    const control = new AbortController()
    controller.current = control
    let execution: string | null = null
    let completed = false
    const timeout = setTimeout(() => control.abort(), tokens.playback.timeout)
    try {
      const result = await startExecution(draft, control.signal)
      execution = result.sessionId
      sessionId.current = execution
      if (control.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      if (!result.compiled) {
        const d = result.diagnostics[0]
        setError({
          line: d?.line ?? 1,
          message: explainDiagnostic(
            d?.message ?? result.error ?? 'Check your class and main method.'
          )
        })
        setMessage('Fix the highlighted line, then run again.')
        return
      }
      await sendCommand(execution, 'auto')
      let session: Session | null = null
      while (!control.signal.aborted) {
        const incoming = await fetchSession(execution, session?.latestSequence ?? 0, control.signal)
        session = mergeSession(session, incoming)
        if (session.complete) {
          completed = true
          break
        }
        setMessage(`Capturing Java execution · ${session.trace.length} steps`)
        await wait(tokens.playback.poll, control.signal)
      }
      if (!session?.trace.length)
        throw new Error(
          session?.error ??
            'Java finished without a captured step. Make sure Main has an executable main method.'
        )
      load(observedTrace(draft, session.trace), sharedStep.current ?? 0)
      sharedStep.current = undefined
      setBanner(false)
      setMessage(session.error ?? 'Java execution captured. Step through the observed snapshots.')
    } catch (e) {
      if (controller.current === control)
        setMessage(
          control.signal.aborted
            ? 'Execution stopped or timed out. Try a smaller Java example.'
            : `Could not run Java: ${e instanceof Error ? e.message : 'Backend unavailable'}. Curated examples work offline.`
        )
    } finally {
      clearTimeout(timeout)
      if (execution && !completed) void sendCommand(execution, 'stop').catch(() => undefined)
      if (controller.current === control) {
        sessionId.current = null
        setRunning(false)
      }
    }
  }
  const pick = (id: string) => {
    if (running) cancelRun()
    load(traces.find((t) => t.id === id) ?? traces[0])
    setBanner(true)
    setError(undefined)
    setMessage('')
    setShared('')
    sharedStep.current = undefined
  }
  const share = async () => {
    try {
      const url = shareUrl(trace, index, draft)
      setShared(url)
      await navigator.clipboard?.writeText(url)
      setMessage(navigator.clipboard ? 'Share link copied.' : 'Copy the share link below.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Copy the link below to share this step.')
    }
  }
  const exportFile = async (format: 'png' | 'gif') => {
    if (!shell.current) return
    setExporting(true)
    setPlaying(false)
    try {
      const { exportWorkspace } = await import('./export')
      await exportWorkspace(shell.current, format, setMessage)
      setMessage(`${format.toUpperCase()} exported.`)
    } catch (e) {
      setMessage(`Export failed: ${e instanceof Error ? e.message : 'Try again.'}`)
    } finally {
      setExporting(false)
    }
  }
  const correct = Object.values(state.answered).filter(Boolean).length,
    attempted = Object.keys(state.answered).length
  const compared = trace.compare?.steps[Math.min(index, trace.compare.steps.length - 1)]
  return (
    <MotionConfig reducedMotion={exporting ? 'always' : 'user'}>
      <style>{tokenStyles}</style>
      <div
        ref={shell}
        className="lens"
        data-theme={theme}
        data-exporting={exporting}
        style={{ '--lens-size': size } as CSSProperties}
      >
        <header className="lens-header">
          <div className="lens-brand">
            <span className="lens-brand-mark">
              <Focus />
            </span>
            <div>
              <strong>JVM Lens</strong>
              <span>See what your code does.</span>
            </div>
          </div>
          <div className="lens-example-picker">
            <BookOpen />
            <select
              aria-label="Learning example"
              value={trace.id}
              disabled={running || exporting}
              onChange={(e) => pick(e.target.value)}
            >
              {trace.evidence === 'observed' && <option value="live">Your Java</option>}
              <optgroup label="Start here">
                <option value="aliasing">References & aliasing</option>
              </optgroup>
              <optgroup label="Misconception Library · 10 examples">
                {misconceptionTraces.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.subtitle}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Concurrency">
                {traces
                  .filter((t) => t.mode === 'jmm')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.subtitle}
                    </option>
                  ))}
              </optgroup>
            </select>
            <ChevronDown />
          </div>
          <div className="lens-header-actions">
            <button
              className={`lens-button ${predict ? 'is-active' : ''}`}
              aria-pressed={predict}
              onClick={setPredict}
            >
              <Lightbulb />
              <span>Predict</span>
              {predict && (
                <small>
                  {correct}/{attempted}
                </small>
              )}
            </button>
            <button
              className="lens-icon-button"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              onClick={state.toggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </button>
            <button
              className="lens-icon-button lens-shortcuts-toggle"
              aria-label="Keyboard shortcuts"
              onClick={() => setShortcuts((s) => !s)}
            >
              <Keyboard />
            </button>
            <a className="lens-live-link" href="?view=live">
              <Code2 />
              <span>Live JVM</span>
            </a>
          </div>
        </header>
        <div className="lens-workspace-header">
          <div>
            <div className="lens-eyebrow">
              {trace.mode === 'jmm' ? 'CONCURRENCY LAB' : 'MEMORY LAB'} <span>·</span>{' '}
              {trace.evidence === 'curated' ? 'CURATED TRACE' : 'OBSERVED TRACE'}
            </div>
            <h1>{trace.title}</h1>
          </div>
          <div className="lens-tools">
            <label className="lens-size-control">
              Text
              <select
                aria-label="Interface text size"
                value={size}
                onChange={(e) => state.setSize(Number(e.target.value))}
              >
                <option value={1}>100%</option>
                <option value={1.15}>115%</option>
                <option value={1.3}>130%</option>
              </select>
            </label>
            {trace.mode === 'memory' && (
              <button
                className={`lens-button ${roots ? 'is-active' : ''}`}
                aria-pressed={roots}
                onClick={state.toggleRoots}
              >
                <GitBranch />
                <span>GC roots</span>
              </button>
            )}
            {trace.compare && (
              <button
                className={`lens-button ${compare ? 'is-active' : ''}`}
                aria-pressed={compare}
                onClick={state.toggleCompare}
              >
                <ArrowLeftRight />
                <span>Compare</span>
              </button>
            )}
            <button
              className="lens-icon-button"
              aria-label="Reset trace"
              onClick={() => {
                load(trace)
                setBanner(true)
                setError(undefined)
              }}
            >
              <RotateCcw />
            </button>
          </div>
        </div>
        {banner && (
          <aside className="lens-misconception">
            <span>COMMON WRONG BELIEF</span>
            <p>“{trace.misconception}”</p>
            <button
              className="lens-icon-button"
              aria-label="Dismiss misconception"
              onClick={() => setBanner(false)}
            >
              <X />
            </button>
          </aside>
        )}
        <main
          className={`lens-workspace ${compare ? 'is-compare' : ''}`}
          aria-label="Step visualization"
          inert={running || exporting ? true : undefined}
        >
          <div className="lens-primary-code">
            <CodePane
              code={draft}
              step={step}
              onChange={state.edit}
              error={error}
              onRun={() => void run()}
              running={running}
              prediction
              notice={
                sourceChanged
                  ? 'Source edited. Run Java to capture a matching memory trace.'
                  : undefined
              }
            />
          </div>
          {trace.mode === 'memory' && (
            <nav className="lens-mobile-segments" aria-label="Memory pane">
              {(['Stack', 'Heap', 'Both'] as const).map((p) => (
                <button
                  key={p}
                  aria-pressed={state.mobilePane === p}
                  onClick={() => state.setMobilePane(p)}
                >
                  {p}
                </button>
              ))}
            </nav>
          )}
          {trace.mode === 'jmm' ? <ThreadLanes step={step} /> : <MemoryBoard step={step} />}
          {compare && trace.compare && compared && (
            <section className="lens-compare-version" aria-label="Comparison version">
              <div className="lens-compare-title">{trace.compare.title}</div>
              <CodePane
                code={trace.compare.code}
                step={compared}
                readOnly
                title="Main.java · plain"
              />
              <ThreadLanes step={compared} />
            </section>
          )}
          {sourceChanged && (
            <div className="lens-stale-trace-notice">
              Memory shows the last captured trace. Run the edited source to update it.
            </div>
          )}
        </main>
        {step.error && (
          <div className="lens-runtime-error" role="alert">
            {step.error}
          </div>
        )}
        {state.feedback && pending === null && (
          <p className="lens-answer-confirmed" role="status">
            <Check />
            {state.feedback}
          </p>
        )}
        <div className="lens-workspace-footer">
          <div className="lens-legend">
            <span className="lens-primitive">● Primitive</span>
            <span className="lens-reference">◆ Reference</span>
            <span className="lens-object-color">■ Object</span>
            <span className="lens-string">■ String</span>
          </div>
          <div className="lens-export-controls">
            {trace.alternatives && (
              <button onClick={state.anotherInterleaving} disabled={exporting || running}>
                <GitBranch />
                Another interleaving · {state.interleaving + 1}
              </button>
            )}
            <button onClick={() => void share()} disabled={exporting || running}>
              <Share2 />
              Share
            </button>
            <button onClick={() => void exportFile('png')} disabled={exporting || running}>
              <Download />
              PNG
            </button>
            <button onClick={() => void exportFile('gif')} disabled={exporting || running}>
              <Download />
              GIF
            </button>
          </div>
        </div>
        <div className="lens-evidence-note">{trace.note}</div>
        {message && (
          <div className="lens-status" role="status">
            {message}
            {running && (
              <button className="lens-button" onClick={cancelRun}>
                Stop execution
              </button>
            )}
            <button
              className="lens-icon-button"
              aria-label="Dismiss status"
              onClick={() => setMessage('')}
            >
              <X />
            </button>
          </div>
        )}
        {shared && (
          <div className="lens-share-link">
            <label>
              Share this code and step
              <input value={shared} readOnly onFocus={(e) => e.target.select()} />
            </label>
            <button
              className="lens-icon-button"
              aria-label="Close share link"
              onClick={() => setShared('')}
            >
              <X />
            </button>
          </div>
        )}
        {shortcuts && (
          <aside className="lens-shortcuts" aria-label="Keyboard shortcuts">
            <header>
              <strong>Keyboard shortcuts</strong>
              <button
                className="lens-icon-button"
                aria-label="Close shortcuts"
                onClick={() => setShortcuts(false)}
              >
                <X />
              </button>
            </header>
            {[
              ['← / →', 'Step backward / forward'],
              ['Space', 'Play / pause'],
              ['P', 'Toggle predict'],
              ['G', 'Jump to next GC'],
              ['/', 'Focus code'],
              ['?', 'Toggle this sheet'],
              ['Esc', 'Close helpers']
            ].map(([key, text]) => (
              <div key={key}>
                <kbd>{key}</kbd>
                <span>{text}</span>
              </div>
            ))}
          </aside>
        )}
        <div inert={running || exporting ? true : undefined}>
          <TransportBar />
        </div>
      </div>
    </MotionConfig>
  )
}

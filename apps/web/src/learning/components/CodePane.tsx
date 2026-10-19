import { tokens } from '../tokens'
import { useEffect, useRef } from 'react'
import { EditorState, StateEffect, StateField } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  WidgetType,
  gutter,
  highlightActiveLineGutter,
  lineNumbers,
  keymap,
  type DecorationSet
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { java } from '@codemirror/lang-java'
import { Braces, Play } from 'lucide-react'
import type { Step } from '../schema'
import { PredictCard } from './PredictCard'
const syntax = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.string, color: 'var(--lens-string)' },
    { tag: [tags.number, tags.bool], color: 'var(--lens-primitive)' },
    { tag: tags.keyword, color: 'var(--lens-text)', fontWeight: tokens.typography.keywordWeight },
    { tag: tags.comment, color: 'var(--lens-muted)' }
  ])
)
const highlight = StateEffect.define<{ line: number; error?: string }>()
class InlineError extends WidgetType {
  constructor(readonly message: string) {
    super()
  }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'lens-code-error'
    el.textContent = this.message
    el.setAttribute('role', 'alert')
    return el
  }
}
const lineState = StateField.define<{ line: number; error?: string }>({
  create: () => ({ line: 1 }),
  update: (state, tr) => tr.effects.reduce((s, e) => (e.is(highlight) ? e.value : s), state)
})
const decorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (old, tr) => {
    if (!tr.effects.some((e) => e.is(highlight)) && !tr.docChanged) return old
    const { line, error } = tr.state.field(lineState),
      pos = tr.state.doc.line(Math.max(1, Math.min(line, tr.state.doc.lines))).from
    return Decoration.set(
      [
        Decoration.line({ class: error ? 'lens-execution-error' : 'lens-execution-line' }).range(
          pos
        ),
        ...(error
          ? [
              Decoration.widget({ widget: new InlineError(error), block: true, side: 1 }).range(
                tr.state.doc.line(Math.max(1, Math.min(line, tr.state.doc.lines))).to
              )
            ]
          : [])
      ],
      true
    )
  },
  provide: (f) => EditorView.decorations.from(f)
})
class ArrowMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span')
    el.textContent = '→'
    el.className = 'lens-gutter-arrow'
    return el
  }
}
const arrow = new ArrowMarker()
export interface CodePaneProps {
  code: string
  step: Step
  onChange?: (code: string) => void
  readOnly?: boolean
  error?: { line: number; message: string }
  onRun?: () => void
  running?: boolean
  title?: string
  prediction?: boolean
  notice?: string
}
export function CodePane({
  code,
  step,
  onChange,
  readOnly = false,
  error,
  onRun,
  running,
  title = 'Main.java',
  prediction = false,
  notice
}: CodePaneProps) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    change = useRef(onChange)
  change.current = onChange
  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          java(),
          syntax,
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          gutter({
            class: 'lens-execution-gutter',
            lineMarker: (v, l) =>
              v.state.doc.lineAt(l.from).number === v.state.field(lineState).line ? arrow : null,
            markers: () => [],
            lineMarkerChange: (update) =>
              update.transactions.some((t) => t.effects.some((e) => e.is(highlight)))
          }),
          lineState,
          decorations,
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
          EditorView.contentAttributes.of({
            'aria-label': readOnly ? 'Comparison Java source' : 'Java source editor',
            spellcheck: 'false'
          }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) change.current?.(u.state.doc.toString())
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: 'var(--lens-value-size)',
              fontFamily: 'var(--lens-mono-font)',
              backgroundColor: 'var(--lens-surface)',
              color: 'var(--lens-text)'
            },
            '.cm-scroller': {
              fontFamily: 'inherit',
              lineHeight: 'var(--lens-line-height)',
              overflow: 'auto'
            },
            '.cm-gutters': {
              backgroundColor: 'var(--lens-surface)',
              color: 'var(--lens-muted)',
              border: 'none'
            },
            '.cm-content': { padding: 'var(--lens-s4) var(--lens-s2)' },
            '.cm-line': { paddingLeft: 'var(--lens-s2)' },
            '.cm-cursor': { borderLeftColor: 'var(--lens-text)' },
            '&.cm-focused': { outline: 'none' },
            '.cm-activeLineGutter': {
              color: 'var(--lens-reference)',
              backgroundColor: 'transparent'
            },
            '.cm-selectionBackground': { backgroundColor: 'var(--lens-raised) !important' }
          })
        ]
      })
    })
    view.current = editor
    return () => {
      view.current = null
      editor.destroy()
    }
  }, [readOnly]) // External doc changes are synchronized below without recreating selection/history.
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== code)
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } })
  }, [code])
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const line = Math.max(1, Math.min(error?.line ?? step.line, editor.state.doc.lines))
    editor.dispatch({
      effects: [
        highlight.of({ line, error: error?.message }),
        EditorView.scrollIntoView(editor.state.doc.line(line).from, { y: 'nearest' })
      ]
    })
  }, [step.id, step.line, error, code])
  return (
    <section className="lens-pane lens-code flex min-h-0 flex-col" aria-label="Java code">
      <div className="lens-pane-heading">
        <span>
          <Braces />
          {title}
        </span>
        {onRun && (
          <button className="lens-button lens-run" onClick={onRun} disabled={running}>
            <Play />
            {running ? 'Compiling…' : 'Run Java'}
          </button>
        )}
      </div>
      <div ref={host} className="lens-editor" />
      {notice && (
        <p className="lens-editor-notice" role="status">
          {notice}
        </p>
      )}
      {prediction && <PredictCard />}
      <div className="lens-caption">
        <span>WHAT JUST HAPPENED</span>
        <p aria-live="polite" aria-atomic="true">
          {step.explanation}
        </p>
        {step.output !== undefined && (
          <div className="lens-output">
            <span>Output</span>
            <pre>{step.output || '(none)'}</pre>
          </div>
        )}
      </div>
    </section>
  )
}

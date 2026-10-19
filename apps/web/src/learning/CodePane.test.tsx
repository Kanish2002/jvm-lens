import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CodePane } from './components/CodePane'
import { getTrace } from './library'
beforeAll(() => {
  // jsdom has no layout engine. Supply only the Range geometry API CodeMirror measures.
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect()
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
describe('local CodeMirror editor', () => {
  it('loads Java, highlights the executing line, and synchronizes replacement source', () => {
    const trace = getTrace('aliasing'),
      change = vi.fn()
    const { container, rerender } = render(
      <CodePane code={trace.code} step={trace.steps[0]} onChange={change} />
    )
    const content = screen.getByLabelText('Java source editor')
    expect(content).toHaveTextContent('public class Main')
    expect(container.querySelector('.lens-execution-line')).toHaveTextContent('// Start here')
    rerender(
      <CodePane
        code={'public class Main {\n  int n = 1;\n}'}
        step={{ ...trace.steps[0], line: 2 }}
        onChange={change}
      />
    )
    expect(EditorView.findFromDOM(content)?.state.doc.toString()).toBe(
      'public class Main {\n  int n = 1;\n}'
    )
    expect(container.querySelector('.lens-execution-line')).toHaveTextContent('int n = 1')
  })
  it('places a human explanation inline and updates gutter position', async () => {
    const trace = getTrace('aliasing')
    const { container } = render(
      <CodePane
        code={trace.code}
        step={trace.steps[0]}
        error={{ line: 5, message: 'A semicolon is missing.' }}
      />
    )
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A semicolon is missing.')
    )
    expect(container.querySelector('.lens-execution-error')).toHaveTextContent('int n = 7')
    expect(container.querySelector('.lens-gutter-arrow')).toBeInTheDocument()
  })
})

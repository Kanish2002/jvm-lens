import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LearningApp } from './LearningApp'
import { getTrace } from './library'
import { useLearning } from './store'
// CodeMirror owns DOM outside React; test the real editor separately.
vi.mock('./components/CodePane', async () => {
  const { PredictCard } = await import('./components/PredictCard')
  return {
    CodePane: ({ code, step, onChange, onRun, error, prediction }: any) => (
      <section>
        <textarea
          aria-label="Java source editor"
          value={code}
          readOnly={!onChange}
          onChange={(e) => onChange?.(e.target.value)}
        />
        {onRun && <button onClick={onRun}>Run Java</button>}
        <p aria-live="polite">{step.explanation}</p>
        {prediction && <PredictCard />}
        {error && <p role="alert">{error.message}</p>}
      </section>
    )
  }
})
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  window.localStorage.clear()
  useLearning.getState().load(getTrace('aliasing'))
  useLearning.setState({ predict: false, theme: 'dark', size: 1, motionOff: true })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
describe('learning workspace', () => {
  it('opens on a populated first step, predicts with a locked next button, and scrubs backward', () => {
    render(<LearningApp />)
    expect(screen.getByText('Two names. One object.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Predict/ }))
    fireEvent.change(screen.getByLabelText('Execution step'), { target: { value: '9' } })
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled()
    expect(screen.getByText('After p2.name = "Bo", what does p1.name print?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'B Bo' }))
    expect(screen.getByRole('button', { name: 'Next step' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(useLearning.getState().index).toBe(3)
  })
  it('compares volatile and plain executions in sync and selects another interleaving', () => {
    render(<LearningApp />)
    fireEvent.change(screen.getByLabelText('Learning example'), {
      target: { value: 'volatile-visibility' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(screen.getByLabelText('Comparison version')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Interleaving step'), { target: { value: '4' } })
    expect(screen.getByText('× Stale read')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Another interleaving/ }))
    expect(useLearning.getState().index).toBe(0)
    expect(useLearning.getState().interleaving).toBe(1)
  })
  it('uses keyboard shortcuts and preserves custom source on a recoverable backend error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Backend unavailable' }), { status: 503 })
    )
    render(<LearningApp />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(useLearning.getState().index).toBe(1)
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('complementary', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Java source editor'), {
      target: { value: 'class Main {}' }
    })
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Run Java' }))
    await waitFor(() =>
      expect(screen.getByText(/Could not run Java: Backend unavailable/)).toBeInTheDocument()
    )
    expect(screen.getByLabelText('Java source editor')).toHaveValue('class Main {}')
  })
  it('turns compile diagnostics into inline human explanations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: 'bad',
          compiled: false,
          status: 'FAILED',
          diagnostics: [{ line: 2, message: "';' expected" }]
        }),
        { status: 200 }
      )
    )
    render(<LearningApp />)
    fireEvent.change(screen.getByLabelText('Java source editor'), {
      target: { value: 'class Main { int n = 1 }' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run Java' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('A semicolon is missing')
    )
  })
  it('persists theme and text preferences and restores Unicode shared code', () => {
    render(<LearningApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(window.localStorage.getItem('jvm-lens-learning-theme')).toBe('light')
    fireEvent.change(screen.getByLabelText('Interface text size'), { target: { value: '1.3' } })
    expect(window.localStorage.getItem('jvm-lens-learning-size')).toBe('1.3')
    act(() => useLearning.getState().load(getTrace('join-publication')))
    expect(screen.getByText('Wait for completion. See the writes.')).toBeInTheDocument()
  })
})

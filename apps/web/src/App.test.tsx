import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="editor" /> }))

describe('JVM Lens workspace', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  it('opens directly on the execution workspace', () => {
    render(<App />)
    expect(screen.getByText('JVM Lens')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument()
    expect(screen.getByText('Run Java to see one connected memory model')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JMM Explorer' })).toBeInTheDocument()
  })

  it('shows a recoverable API error instead of crashing the page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Backend unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Backend unavailable'))
    expect(screen.getByText('Run Java to see one connected memory model')).toBeInTheDocument()
  })
})

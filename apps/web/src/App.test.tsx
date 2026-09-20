import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="editor" /> }))

describe('JVM Lens workspace', () => {
  it('opens directly on the execution workspace', () => {
    render(<App />)
    expect(screen.getByText('JVM Lens')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument()
    expect(screen.getByText('Ready to inspect the JVM')).toBeInTheDocument()
  })
})


import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryBoard } from './components/MemoryBoard'
import { getTrace } from './library'
import { useLearning } from './store'
afterEach(cleanup)
describe('aliasing renderer proof', () => {
  it('renders primitive cells, two reference ports, one shared object and reversible GC', () => {
    const trace = getTrace('aliasing')
    useLearning.getState().load(trace)
    const { container, rerender } = render(<MemoryBoard step={trace.steps[3]} />)
    expect(screen.getByLabelText('n, primitive, 7')).toBeInTheDocument()
    expect(container.querySelector('[data-source="p1"]')).toBeInTheDocument()
    expect(container.querySelector('[data-source="p2"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-target="A1"]')).toHaveLength(1)
    expect(screen.getByText('2 refs')).toBeInTheDocument()
    rerender(<MemoryBoard step={trace.steps[7]} />)
    expect(container.querySelector('[data-target="A1"]')).toHaveClass('is-garbage')
    rerender(<MemoryBoard step={trace.steps[8]} />)
    // Exit motion retains the node briefly, so verify the deterministic source snapshot too.
    expect(trace.steps[8].heap.some((o) => o.id === 'A1')).toBe(false)
    rerender(<MemoryBoard step={trace.steps[3]} />)
    expect(screen.getByLabelText('Person object A1, 2 references')).toBeInTheDocument()
  })
})

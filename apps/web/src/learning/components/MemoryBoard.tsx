import { useRef } from 'react'
import type { Step } from '../schema'
import { useLearning } from '../store'
import { tokens } from '../tokens'
import { StackPane } from './StackPane'
import { HeapPane } from './HeapPane'
import { ArrowLayer } from './ArrowLayer'
export function MemoryBoard({ step }: { step: Step }) {
  const board = useRef<HTMLDivElement>(null),
    touch = useRef<number | null>(null),
    { mobilePane, setMobilePane } = useLearning()
  return (
    <div
      ref={board}
      className="lens-memory-board"
      data-mobile-pane={mobilePane}
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touch.current === null) return
        const delta = e.changedTouches[0].clientX - touch.current
        if (Math.abs(delta) > tokens.geometry.swipe) {
          const panes = ['Stack', 'Heap', 'Both'] as const
          setMobilePane(panes[(panes.indexOf(mobilePane) + (delta < 0 ? 1 : 2)) % 3])
        }
        touch.current = null
      }}
    >
      <StackPane step={step} />
      <HeapPane step={step} />
      <ArrowLayer step={step} board={board} />
    </div>
  )
}

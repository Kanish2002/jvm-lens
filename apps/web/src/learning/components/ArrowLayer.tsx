import { useMotionDuration } from '../useMotionDuration'
import { useEffect, useId, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Step } from '../schema'
import { reachableReferenceSources, references } from '../model'
import { tokens } from '../tokens'
import { useLearning } from '../store'
interface Arrow {
  source: string
  target: string
  d: string
}
export function ArrowLayer({
  step,
  board
}: {
  step: Step
  board: RefObject<HTMLDivElement | null>
}) {
  const duration = useMotionDuration()
  const [arrows, setArrows] = useState<Arrow[]>([]),
    marker = useId().replace(/:/g, ''),
    { focus, roots, mobilePane } = useLearning()
  const rootEdges = reachableReferenceSources(step)
  useEffect(() => {
    const root = board.current
    if (!root) return
    let raf = 0,
      animation = 0
    const started = performance.now()
    const measure = () => {
      const bounds = root.getBoundingClientRect(),
        sources = new Map<string, HTMLElement>(),
        targets = new Map<string, HTMLElement>()
      root.querySelectorAll<HTMLElement>('[data-source]').forEach((el) => {
        if (el.dataset.source) sources.set(el.dataset.source, el)
      })
      root.querySelectorAll<HTMLElement>('[data-target]').forEach((el) => {
        if (el.dataset.target) targets.set(el.dataset.target, el)
      })
      const paths = references(step).flatMap(({ source, target }) => {
        const from = sources.get(source),
          to = targets.get(target)
        if (!from || !to) return []
        const a = from.getBoundingClientRect(),
          b = to.getBoundingClientRect()
        if (!a.width || !b.width) return []
        const x1 = a.left + a.width / 2 - bounds.left,
          y1 = a.top + a.height / 2 - bounds.top,
          x2 = b.left - bounds.left,
          y2 = b.top + Math.min(b.height / 2, tokens.geometry.bend / 2) - bounds.top
        const bend = Math.max(tokens.geometry.bend, Math.abs(x2 - x1) / 2)
        return [
          {
            source,
            target,
            d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
          }
        ]
      })
      setArrows(paths)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    const animate = () => {
      measure()
      if (performance.now() - started <= Number.parseInt(tokens.css.slow))
        animation = requestAnimationFrame(animate)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    root.querySelectorAll('[data-target],[data-source]').forEach((el) => observer.observe(el))
    root.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    animation = requestAnimationFrame(animate)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
      cancelAnimationFrame(animation)
      root.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [step, board, mobilePane])
  return (
    <svg className="lens-arrow-layer" aria-hidden="true">
      <defs>
        <marker
          id={marker}
          viewBox={`0 0 ${tokens.geometry.arrowHead} ${tokens.geometry.arrowHead}`}
          markerWidth={tokens.geometry.arrowHead}
          markerHeight={tokens.geometry.arrowHead}
          refX={tokens.geometry.arrowHead}
          refY={tokens.geometry.arrowHead / 2}
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d={`M0,0 L${tokens.geometry.arrowHead},${tokens.geometry.arrowHead / 2} L0,${tokens.geometry.arrowHead} Z`}
            fill="context-stroke"
          />
        </marker>
      </defs>
      <AnimatePresence>
        {arrows.map((a) => {
          const active =
            !focus || (focus.kind === 'variable' ? focus.id === a.source : focus.id === a.target)
          return (
            <motion.path
              key={`${a.source}-${a.target}`}
              d={a.d}
              fill="none"
              stroke={
                roots && rootEdges.has(a.source) ? 'var(--lens-object)' : 'var(--lens-reference)'
              }
              strokeWidth={tokens.geometry.arrowWidth}
              markerEnd={`url(#${marker})`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: active ? 1 : Number(tokens.css.dimOpacity) }}
              exit={{ pathLength: 0, opacity: 0 }}
              transition={{ duration: duration(tokens.motion.arrow), ease: tokens.motion.ease }}
            />
          )
        })}
      </AnimatePresence>
    </svg>
  )
}

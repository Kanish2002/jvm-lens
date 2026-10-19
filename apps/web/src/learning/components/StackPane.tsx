import { useMotionDuration } from '../useMotionDuration'
import { AnimatePresence, motion } from 'framer-motion'
import { Layers } from 'lucide-react'
import type { Step } from '../schema'
import { tokens } from '../tokens'
import { ValueCell } from './ValueCell'
export function StackPane({ step }: { step: Step }) {
  const duration = useMotionDuration()
  return (
    <section className="lens-pane lens-stack" aria-label="Stack memory">
      <div className="lens-pane-heading">
        <span>
          <Layers />
          Stack
        </span>
        <small>Per method call</small>
      </div>
      <div className="lens-pane-hint">
        <span className="lens-primitive">● Values</span> stay here.{' '}
        <span className="lens-reference">◆ References</span> point out.
      </div>
      <div className="lens-frames">
        <AnimatePresence initial={false}>
          {step.stack.map((f) => (
            <motion.article
              className="lens-frame"
              key={f.id}
              layout
              initial={{ opacity: 0, y: tokens.geometry.bend }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, scaleY: tokens.geometry.enterScale }}
              transition={{ duration: duration(tokens.motion.frame), ease: tokens.motion.ease }}
            >
              <header>
                <span>
                  {f.method}
                  <span className="lens-muted">()</span>
                </span>
                <small>{f.args}</small>
              </header>
              {f.locals.length ? (
                f.locals.map((v) => <ValueCell key={v.id} variable={v} step={step} />)
              ) : (
                <p className="lens-empty">No local variables yet</p>
              )}
            </motion.article>
          ))}
        </AnimatePresence>
        {!step.stack.length && <p className="lens-empty">No active frames</p>}
      </div>
      <div className="lens-stack-base">
        STACK BASE <span>Calls grow upward ↑</span>
      </div>
    </section>
  )
}

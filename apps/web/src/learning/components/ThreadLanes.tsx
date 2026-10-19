import { useMotionDuration } from '../useMotionDuration'
import { GitBranch } from 'lucide-react'
import { motion } from 'framer-motion'
import { tokens } from '../tokens'
import type { Step } from '../schema'
import { ValueCell } from './ValueCell'
export function ThreadLanes({ step }: { step: Step }) {
  const duration = useMotionDuration()
  return (
    <section className="lens-jmm-board" aria-label="Thread observations and main memory">
      <div className="lens-pane-heading">
        <span>
          <GitBranch />
          Thread lanes
        </span>
        <small>Read observations</small>
      </div>
      <p className="lens-pane-hint">
        Each lane shows what that thread has observed. These are illustrative reads, not literal
        hardware caches.
      </p>
      <div className="lens-thread-columns">
        {step.threads.slice(0, 1).map((t) => (
          <Lane key={t.id} thread={t} step={step} />
        ))}
        <section className="lens-main-memory">
          <h3>Main Memory</h3>
          <small>Shared writes</small>
          {step.shared?.map((v) => (
            <ValueCell key={v.id} variable={v} step={step} readOnly />
          ))}
        </section>
        {step.threads.slice(1).map((t) => (
          <Lane key={t.id} thread={t} step={step} />
        ))}
      </div>
      {step.happensBefore && (
        <motion.div
          className="lens-happens-before"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration(tokens.motion.arrow) }}
        >
          <svg
            viewBox={tokens.diagram.viewBox}
            role="img"
            aria-label={`Happens-before from ${step.happensBefore.from} to ${step.happensBefore.to}`}
          >
            <motion.path
              d={tokens.diagram.curve}
              stroke="var(--lens-object)"
              fill="none"
              strokeWidth={tokens.geometry.arrowWidth}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: duration(tokens.motion.arrow) }}
            />
            <path d={tokens.diagram.head} stroke="var(--lens-object)" fill="none" />
          </svg>
          <strong>
            {step.happensBefore.from} → {step.happensBefore.to}
          </strong>
          <span>{step.happensBefore.reason}</span>
        </motion.div>
      )}
      {step.output !== undefined && (
        <div className="lens-thread-result">
          Output <code>{step.output}</code>
        </div>
      )}
      <div className="lens-jmm-footnote">
        {step.happensBefore
          ? '✓ Earlier writes are published through this edge.'
          : 'No happens-before edge is established at this step.'}
      </div>
    </section>
  )
}
function Lane({ thread, step }: { thread: Step['threads'][number]; step: Step }) {
  return (
    <section className="lens-thread-lane">
      <h3>{thread.name}</h3>
      <small>
        {thread.state} · line {thread.line}
      </small>
      {thread.observations.map((v) => (
        <div key={v.id} className={thread.stale?.includes(v.id) ? 'lens-stale' : ''}>
          <ValueCell variable={v} step={step} readOnly />
          {thread.stale?.includes(v.id) && <span className="lens-stale-label">× Stale read</span>}
        </div>
      ))}
    </section>
  )
}

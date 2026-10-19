import { useMotionDuration } from '../useMotionDuration'
import { ChangeRing } from './ChangeRing'
import { AnimatePresence, motion } from 'framer-motion'
import { Box } from 'lucide-react'
import type { Step } from '../schema'
import { reachability, references } from '../model'
import { tokens } from '../tokens'
import { useLearning } from '../store'
import { ValueCell } from './ValueCell'
const zones = [
  ['strings', 'String Pool'],
  ['objects', 'Objects'],
  ['arrays', 'Arrays']
] as const
export function HeapPane({ step }: { step: Step }) {
  const duration = useMotionDuration()
  const { focus, setFocus, roots } = useLearning(),
    refs = references(step),
    live = reachability(step)
  const selectedTarget =
    focus?.kind === 'variable' ? refs.find((r) => r.source === focus.id)?.target : focus?.id
  return (
    <section className="lens-pane lens-heap" aria-label="Heap memory">
      <div className="lens-pane-heading">
        <span>
          <Box />
          Heap
        </span>
        <small>Shared objects</small>
      </div>
      <div className="lens-static-strip">
        <span className="lens-zone-label">STATIC ROOTS</span>
        {step.statics.length ? (
          step.statics.map((v) => <ValueCell key={v.id} variable={v} step={step} />)
        ) : (
          <span className="lens-muted">No static fields</span>
        )}
      </div>
      <div className="lens-heap-scroll">
        {zones.map(([zone, title]) => (
          <div className={`lens-heap-zone ${zone}`} key={zone}>
            <div className="lens-zone-title">
              <span>{title}</span>
              <small>{step.heap.filter((o) => o.zone === zone).length}</small>
            </div>
            <div className="lens-object-flow">
              <AnimatePresence initial={false}>
                {step.heap
                  .filter((o) => o.zone === zone)
                  .map((o) => {
                    const count = refs.filter((r) => r.target === o.id).length,
                      dim = focus && selectedTarget !== o.id,
                      changed = step.diff.changed.includes(o.id),
                      added = step.diff.added.includes(o.id)
                    return (
                      <motion.article
                        tabIndex={0}
                        data-target={o.id}
                        aria-label={`${o.type} object ${o.id}, ${count} references${o.unreachable ? ', unreachable' : ''}`}
                        className={`lens-object ${o.zone === 'strings' ? 'is-string' : ''} ${o.unreachable ? 'is-garbage' : ''} ${changed ? 'is-changed' : ''} ${added ? 'is-new' : ''} ${roots && live.has(o.id) && !o.captureMissing ? 'is-rooted' : ''} ${dim ? 'is-dim' : ''}`}
                        key={o.id}
                        layout
                        initial={{ opacity: 0, scale: tokens.geometry.enterScale }}
                        animate={{
                          opacity: dim
                            ? Number(tokens.css.dimOpacity)
                            : o.unreachable
                              ? Number(tokens.css.garbageOpacity)
                              : 1,
                          scale: 1
                        }}
                        exit={{ opacity: 0, scale: tokens.geometry.enterScale }}
                        transition={{
                          duration: duration(tokens.motion.object),
                          ease: tokens.motion.ease
                        }}
                        onPointerEnter={() => setFocus({ kind: 'object', id: o.id })}
                        onPointerLeave={() => setFocus(null)}
                        onFocus={(e) => {
                          if (e.target === e.currentTarget) setFocus({ kind: 'object', id: o.id })
                        }}
                        onBlur={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(null)
                        }}
                      >
                        {changed && <ChangeRing key={step.id} />}
                        <header>
                          <span>
                            <span aria-hidden="true">■</span> {o.type}
                          </span>
                          <code>#{o.id}</code>
                        </header>
                        {o.label && <p className="lens-object-label">{o.label}</p>}
                        {o.fields.map((v) => (
                          <ValueCell key={v.id} variable={v} step={step} />
                        ))}
                        {!o.fields.length && !o.label && (
                          <p className="lens-empty">No instance fields</p>
                        )}
                        <footer>
                          <span>
                            {o.captureMissing
                              ? '? Not captured this step'
                              : o.unreachable
                                ? '⊘ Unreachable'
                                : roots && live.has(o.id) && !o.captureMissing
                                  ? '✓ Reachable from a root'
                                  : o.root
                                    ? '◆ Modeled root'
                                    : '■ Heap object'}
                          </span>
                          <span className="lens-ref-count">
                            {count} {count === 1 ? 'ref' : 'refs'}
                          </span>
                        </footer>
                      </motion.article>
                    )
                  })}
              </AnimatePresence>
            </div>
            {!step.heap.some((o) => o.zone === zone) && (
              <p className="lens-zone-empty">
                {zone === 'objects' ? 'Objects appear here when allocated' : 'None in this step'}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

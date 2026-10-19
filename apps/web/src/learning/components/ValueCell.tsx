import { useMotionDuration } from '../useMotionDuration'
import { ChangeRing } from './ChangeRing'
import { AnimatePresence, motion } from 'framer-motion'
import type { Local, Step } from '../schema'
import { references } from '../model'
import { tokens } from '../tokens'
import { useLearning } from '../store'
export function ValueCell({
  variable,
  step,
  readOnly = false
}: {
  variable: Local
  step: Step
  readOnly?: boolean
}) {
  const duration = useMotionDuration()
  const { focus, setFocus, setMobilePane, roots } = useLearning()
  const incoming =
    focus?.kind === 'object'
      ? references(step)
          .filter((r) => r.target === focus.id)
          .map((r) => r.source)
      : []
  const dim =
    focus &&
    (focus.kind === 'variable' ? focus.id !== variable.id : !incoming.includes(variable.id))
  const changed = step.diff.changed.includes(variable.id),
    added = step.diff.added.includes(variable.id)
  const isRoot =
    roots &&
    variable.value.kind === 'reference' &&
    variable.value.target !== null &&
    [...step.stack.flatMap((f) => f.locals), ...step.statics].some((v) => v.id === variable.id)
  const signature = JSON.stringify(variable.value)
  const jump = () => {
    if (variable.value.kind !== 'reference' || !variable.value.target) return
    const id = variable.value.target
    setMobilePane('Heap')
    setFocus({ kind: 'object', id })
    requestAnimationFrame(() =>
      document.querySelectorAll<HTMLElement>('[data-target]').forEach((el) => {
        if (el.dataset.target === id) {
          el.scrollIntoView?.({
            behavior: duration(tokens.motion.arrow) === 0 ? 'auto' : 'smooth',
            block: 'center'
          })
          el.focus({ preventScroll: true })
        }
      })
    )
  }
  return (
    <motion.div
      className={`lens-variable ${dim ? 'is-dim' : ''} ${changed ? 'is-changed' : ''} ${isRoot ? 'is-gc-root' : ''}`}
      layout
      initial={added ? { opacity: 0, x: -tokens.geometry.arrowHead } : false}
      animate={{ opacity: dim ? Number(tokens.css.dimOpacity) : 1, x: 0 }}
      transition={{ duration: duration(tokens.motion.variable), ease: tokens.motion.ease }}
      onPointerEnter={() => !readOnly && setFocus({ kind: 'variable', id: variable.id })}
      onPointerLeave={() => !readOnly && setFocus(null)}
    >
      <span className="lens-variable-name">
        {variable.name}
        <small>{variable.value.type}</small>
      </span>
      <div
        className={`lens-value-cell ${variable.value.kind}`}
        tabIndex={readOnly ? undefined : 0}
        aria-label={`${variable.name}, ${variable.value.kind}, ${variable.value.kind === 'primitive' ? variable.value.value : (variable.value.target ?? 'null')}`}
        onFocus={() => !readOnly && setFocus({ kind: 'variable', id: variable.id })}
        onBlur={() => !readOnly && setFocus(null)}
      >
        {changed && <ChangeRing key={step.id} />}
        <AnimatePresence initial={false}>
          <motion.span
            className="lens-value-content"
            key={signature}
            initial={{ opacity: 0, y: tokens.geometry.arrowHead }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -tokens.geometry.arrowHead, textDecoration: 'line-through' }}
            transition={{ duration: duration(tokens.motion.value), ease: tokens.motion.ease }}
          >
            {variable.value.kind === 'primitive' ? (
              <>
                <span className="lens-semantic-symbol" aria-hidden="true">
                  ●
                </span>
                {String(variable.value.value)}
              </>
            ) : (
              <>
                <span
                  className={`lens-reference-port ${variable.value.target === null ? 'is-null' : ''}`}
                  data-source={variable.id}
                  aria-hidden="true"
                />
                {variable.value.target === null ? (
                  <span className="lens-null">null</span>
                ) : (
                  <>
                    <span className="lens-desktop-reference">#{variable.value.target}</span>
                    <button
                      className="lens-reference-chip"
                      onClick={jump}
                      aria-label={`Go to object ${variable.value.target}`}
                    >
                      → #{variable.value.target}
                    </button>
                  </>
                )}
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

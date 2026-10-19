import { useMotionDuration } from '../useMotionDuration'
import { useState, useEffect, useRef } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Lightbulb } from 'lucide-react'
import { useLearning } from '../store'
import { tokens } from '../tokens'
export function PredictCard() {
  const duration = useMotionDuration()
  const controls = useAnimationControls(),
    hadQuestion = useRef(false)
  const card = useRef<HTMLElement>(null)
  const { trace, pending, answer, wrong, feedback } = useLearning(),
    [attempt, setAttempt] = useState(0)
  const question = pending === null ? undefined : trace.steps[pending].prediction
  const shakeDuration = duration(tokens.motion.object)
  useEffect(() => {
    if (question) {
      hadQuestion.current = true
      card.current?.querySelector('button')?.focus({ preventScroll: true })
      card.current?.scrollIntoView?.({ block: 'nearest' })
    } else if (hadQuestion.current) {
      document.querySelector<HTMLButtonElement>('[aria-label="Next step"]')?.focus()
      hadQuestion.current = false
    }
  }, [question?.id])
  useEffect(() => {
    if (wrong !== null)
      void controls.start({
        x: [
          0,
          -tokens.geometry.arrowHead,
          tokens.geometry.arrowHead,
          -tokens.geometry.arrowHead,
          0
        ],
        transition: { duration: shakeDuration, ease: tokens.motion.ease }
      })
  }, [attempt, wrong, shakeDuration, controls])
  if (!question) return null
  return (
    <motion.section
      ref={card}
      className="lens-predict-card"
      aria-label="Predict the next step"
      key={question.id}
      initial={false}
      animate={controls}
      transition={{ duration: duration(tokens.motion.object), ease: tokens.motion.ease }}
    >
      <h3>
        <Lightbulb />
        Pause & predict
      </h3>
      <p>{question.question}</p>
      <div className="lens-predict-options">
        {question.options.map((option, i) => (
          <button
            key={option}
            onClick={() => {
              setAttempt((n) => n + 1)
              answer(i)
            }}
            className={wrong === i ? 'is-wrong' : ''}
          >
            <span>{String.fromCharCode(65 + i)}</span>
            {option}
            {wrong === i && <span aria-label="Incorrect">×</span>}
          </button>
        ))}
      </div>
      {feedback && (
        <p className="lens-prediction-feedback" role="alert">
          {feedback} Try another answer.
        </p>
      )}
    </motion.section>
  )
}

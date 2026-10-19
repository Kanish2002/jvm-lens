import { useReducedMotion } from 'framer-motion'
import { useLearning } from './store'
/** Framer's built-in reduced mode disables transforms but preserves fades; suppress both here. */
export function useMotionDuration() {
  const reduced = useReducedMotion(),
    off = useLearning((s) => s.motionOff)
  return (seconds: number) => (reduced || off ? 0 : seconds)
}

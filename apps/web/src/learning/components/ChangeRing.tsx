import { useMotionDuration } from '../useMotionDuration'
import { motion } from 'framer-motion'
import { tokens } from '../tokens'
/** Key this by step ID so consecutive changes to the same entity pulse separately. */
export function ChangeRing() {
  const duration = useMotionDuration()
  return (
    <motion.span
      className="lens-change-ring"
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: duration(tokens.motion.frame), ease: tokens.motion.ease }}
    />
  )
}

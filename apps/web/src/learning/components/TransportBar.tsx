import { Pause, Play, SkipBack, SkipForward, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLearning } from '../store'
export function TransportBar() {
  const {
    trace,
    index,
    playing,
    speed,
    pending,
    sourceChanged,
    seek,
    next,
    previous,
    setPlaying,
    setSpeed
  } = useLearning()
  const last = index === trace.steps.length - 1,
    locked = pending !== null || sourceChanged
  return (
    <footer className="lens-transport" aria-label="Execution playback">
      <div className="lens-transport-buttons">
        <button
          aria-label="First step"
          title="First step"
          onClick={() => {
            setPlaying(false)
            seek(0)
          }}
          disabled={index === 0}
        >
          <SkipBack />
        </button>
        <button
          aria-label="Previous step"
          title="Previous step (←)"
          onClick={previous}
          disabled={index === 0}
        >
          <ChevronLeft />
        </button>
        <button
          className="lens-play"
          aria-label={playing ? 'Pause' : 'Play'}
          title="Play / pause (Space)"
          onClick={() => setPlaying(!playing)}
          disabled={locked || last}
        >
          {playing ? <Pause /> : <Play />}
        </button>
        <button
          aria-label="Next step"
          title={pending !== null ? 'Answer the prediction first' : 'Next step (→)'}
          onClick={next}
          disabled={last || locked}
        >
          <ChevronRight />
        </button>
        <button
          aria-label="Last step"
          title="Last step"
          onClick={() => {
            setPlaying(false)
            seek(trace.steps.length - 1)
          }}
          disabled={last || locked}
        >
          <SkipForward />
        </button>
      </div>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="Playback speed"
      >
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
      <div className="lens-scrubber">
        <input
          aria-label={trace.mode === 'jmm' ? 'Interleaving step' : 'Execution step'}
          type="range"
          min={0}
          max={trace.steps.length - 1}
          value={index}
          disabled={sourceChanged}
          onChange={(e) => {
            setPlaying(false)
            seek(Number(e.target.value))
          }}
          aria-valuetext={`Step ${index + 1} of ${trace.steps.length}: ${trace.steps[index].explanation}`}
        />
        <div className="lens-ticks" aria-hidden="true">
          {trace.steps.map((step) => (
            <span
              key={step.id}
              className={step.event === 'gc' ? 'is-gc' : step.prediction ? 'is-question' : ''}
            />
          ))}
        </div>
      </div>
      <output className="lens-step-counter" aria-live="off">
        {index + 1} <span>/ {trace.steps.length}</span>
      </output>
    </footer>
  )
}

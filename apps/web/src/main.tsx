import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { tokenStyles } from './learning/tokens'
import { LearningApp } from './learning/LearningApp'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'
const style = document.createElement('style')
style.textContent = tokenStyles
document.head.append(style)
const LiveApp = lazy(() => import('./App').then((m) => ({ default: m.App })))
const live = new URLSearchParams(window.location.search).get('view') === 'live'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {live ? (
        <>
          <a className="live-learning-return" href="?">
            ← Learning workspace
          </a>
          <Suspense fallback={<p role="status">Opening live JVM tools…</p>}>
            <LiveApp />
          </Suspense>
        </>
      ) : (
        <LearningApp />
      )}
    </ErrorBoundary>
  </StrictMode>
)

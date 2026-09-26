import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('JVM Lens render failure', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-error" role="alert">
      <div>
        <span>JVM LENS RECOVERY</span>
        <h1>The visualizer hit an unexpected UI error.</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => window.location.reload()}>Reload workspace</button>
      </div>
    </main>
  }
}

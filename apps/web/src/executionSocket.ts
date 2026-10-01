import type { SessionStatus, StartResponse, TraceStep } from './types'

export interface ExecutionSocketHandlers {
  onStep: (sessionId: string, status: SessionStatus, latestSequence: number, step: TraceStep) => void
  onComplete: (sessionId: string, status: SessionStatus, latestSequence: number, error?: string) => void
  onError: (message: string) => void
  onAutoPlay: (enabled: boolean) => void
  onUnexpectedClose: () => void
}

export class ExecutionSocket {
  private socket?: WebSocket
  private manuallyClosed = false

  constructor(private readonly handlers: ExecutionSocketHandlers) { }

  start(source: string): Promise<StartResponse> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws/execution`)
      this.socket = socket
      let started = false
      const timeout = window.setTimeout(() => {
        this.manuallyClosed = true
        socket.close()
        reject(new Error('The live debugger connection timed out.'))
      }, 30_000)

      socket.onopen = () => socket.send(JSON.stringify({
        type: 'start', sources: { 'Main.java': source }, mainClass: 'Main'
      }))
      socket.onmessage = event => {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>
        const type = String(message.type ?? '')
        if (type === 'started') {
          window.clearTimeout(timeout)
          started = true
          resolve(message as unknown as StartResponse)
        } else if (type === 'step') {
          this.handlers.onStep(String(message.sessionId), message.status as SessionStatus,
            Number(message.latestSequence), message.step as TraceStep)
        } else if (type === 'complete') {
          this.handlers.onComplete(String(message.sessionId), message.status as SessionStatus,
            Number(message.latestSequence), typeof message.error === 'string' ? message.error : undefined)
        } else if (type === 'command-accepted') {
          this.handlers.onAutoPlay(Boolean(message.autoPlay))
        } else if (type === 'error') {
          const error = String(message.message ?? 'Live debugger error')
          this.handlers.onError(error)
          if (!started) { window.clearTimeout(timeout); reject(new Error(error)) }
        }
      }
      socket.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('Live debugger connection is unavailable.'))
      }
      socket.onclose = () => {
        window.clearTimeout(timeout)
        if (!started && !this.manuallyClosed) reject(new Error('The live debugger connection closed before execution started.'))
        else if (!this.manuallyClosed) this.handlers.onUnexpectedClose()
      }
    })
  }

  command(command: string) {
    if (!this.isOpen()) throw new Error('The live debugger connection is closed.')
    this.socket?.send(JSON.stringify({ type: 'command', command }))
  }

  isOpen() { return this.socket?.readyState === WebSocket.OPEN }

  close() {
    this.manuallyClosed = true
    this.socket?.close()
  }
}

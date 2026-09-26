import type { Session, StartResponse, TraceStep } from './types'

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) { super(message) }
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null
  if (!response.ok) throw new ApiError(body?.error ?? body?.message ?? `Request failed (${response.status})`, response.status)
  if (!body || typeof body !== 'object') throw new ApiError('The JVM Lens backend returned an invalid response.')
  return body as T
}

export async function startExecution(source: string): Promise<StartResponse> {
  const result = await json<StartResponse>(await fetch('/api/executions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources: { 'Main.java': source }, mainClass: 'Main' })
  }))
  if (typeof result.compiled !== 'boolean' || !Array.isArray(result.diagnostics)) {
    throw new ApiError('The backend returned an incomplete start response.')
  }
  return result
}

export async function fetchSession(sessionId: string, after: number, signal?: AbortSignal): Promise<Session> {
  const result = await json<Session>(await fetch(`/api/executions/${sessionId}?after=${after}`, { signal }))
  if (result.sessionId !== sessionId || !Array.isArray(result.trace) || typeof result.complete !== 'boolean') {
    throw new ApiError('The backend returned an invalid execution snapshot.')
  }
  return result
}

export async function sendCommand(sessionId: string, command: string): Promise<void> {
  await json(await fetch(`/api/executions/${sessionId}/commands/${command}`, { method: 'POST' }))
}

export function mergeSession(current: Session | null, incoming: Session): Session {
  if (!current || incoming.reset) return incoming
  const steps = new Map<number, TraceStep>(current.trace.map(step => [step.sequence, step]))
  incoming.trace.forEach(step => steps.set(step.sequence, step))
  const trace = [...steps.values()].sort((a, b) => a.sequence - b.sequence)
    .filter(step => step.sequence >= incoming.historyStartSequence)
  return { ...incoming, trace }
}

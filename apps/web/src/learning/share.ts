import { getTrace, traces } from './library'
import type { Trace } from './schema'
const maxCodeBytes = 32000
export function shareUrl(trace: Trace, index: number, code: string): string {
  const bytes = new TextEncoder().encode(code)
  if (bytes.length > maxCodeBytes)
    throw new Error(
      'Share links support up to 32 KB of Java. Export this source as a file instead.'
    )
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.searchParams.set('example', trace.id)
  url.searchParams.set('step', String(index + 1))
  url.searchParams.set(
    'code',
    btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
  )
  return url.toString()
}
export function readShare(search: string): {
  trace: Trace
  index: number
  code?: string
  error?: string
  sharedStep?: number
} {
  const params = new URLSearchParams(search),
    id = params.get('example') ?? 'aliasing',
    trace = getTrace(id),
    step = Number(params.get('step') ?? 1)
  const safeIndex = Number.isSafeInteger(step) ? Math.max(step - 1, 0) : 0
  const index = Math.min(safeIndex, trace.steps.length - 1)
  const encoded = params.get('code')
  if (!encoded) return { trace, index }
  try {
    if (encoded.length > maxCodeBytes * 2) throw new Error('too long')
    const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/')),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    if (bytes.length > maxCodeBytes) throw new Error('too long')
    const code = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return {
      trace,
      index,
      code,
      sharedStep: traces.some((t) => t.id === id) && code === trace.code ? undefined : safeIndex
    }
  } catch {
    return {
      trace,
      index: 0,
      error: 'This share link has invalid Java source. The aliasing example is ready to use.'
    }
  }
}

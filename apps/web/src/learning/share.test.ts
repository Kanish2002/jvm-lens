import { describe, expect, it } from 'vitest'
import { readShare, shareUrl } from './share'
import { getTrace } from './library'
describe('share links', () => {
  it('roundtrips Unicode Java source and a selected step', () => {
    const trace = getTrace('aliasing'),
      code = trace.code + '\n// தமிழ்'
    const shared = readShare(new URL(shareUrl(trace, 3, code)).search)
    expect(shared.code).toBe(code)
    expect(shared.index).toBe(3)
  })
  it('contains malformed payloads and invalid indices', () => {
    expect(readShare('?code=%%%').error).toContain('invalid')
    expect(readShare('?step=NaN').index).toBe(0)
    expect(readShare('?step=-40').index).toBe(0)
    expect(readShare('?step=99999').index).toBe(getTrace('aliasing').steps.length - 1)
    const link = new URL(shareUrl(getTrace('aliasing'), 0, 'class Main {}'))
    link.searchParams.set('step', 'NaN')
    expect(readShare(link.search).sharedStep).toBe(0)
  })
})

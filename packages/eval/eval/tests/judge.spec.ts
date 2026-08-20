import { describe, expect, it } from 'vitest'
import {
  AuthenticationAbort,
  BACKOFF_MS,
  classifyError,
  JUDGE_MAX_RETRIES,
  JUDGE_PASS_THRESHOLD,
  judgeWithProvider,
} from '../src/judge.ts'
import { INSTANT_JUDGE, makeStubJudge } from './helpers.ts'

describe('classifyError (rbi judge.py mirror; P11 code-review fix — do not regress)', () => {
  it('an AuthenticationAbort is auth', () => {
    expect(classifyError(new AuthenticationAbort('x'))).toBe('auth')
  })
  it('auth phrases (unauthorized / invalid api key / signature does not match)', () => {
    expect(classifyError(new Error('401 unauthorized: bad key'))).toBe('auth')
    expect(classifyError(new Error('invalid api key'))).toBe('auth')
    expect(classifyError(new Error('signaturedoesnotmatch'))).toBe('auth')
    expect(classifyError('authentication failed')).toBe('auth')
  })
  it('a cued 401 status is auth (http / status / code / error prefix)', () => {
    expect(classifyError(new Error('http 401 returned'))).toBe('auth')
    expect(classifyError(new Error('error code 401'))).toBe('auth')
  })
  it('a bare 401 at start-of-string IS auth (start-of-string is a cue)', () => {
    expect(classifyError(new Error('401'))).toBe('auth')
  })
  it('forbidden / 403 / permission denied are deliberately NOT auth (per-case, not run-ending)', () => {
    expect(classifyError(new Error('403 forbidden'))).toBe('unclassified')
    expect(classifyError(new Error('permission denied'))).toBe('unclassified')
    expect(classifyError(new Error('authorization failed'))).toBe('unclassified')
  })
  it('retryable types (TimeoutError / ConnectionError / ECONNRESET / ECONNREFUSED / ENOTFOUND)', () => {
    const timeout = new Error('x'); timeout.name = 'TimeoutError'
    expect(classifyError(timeout)).toBe('retryable')
    const conn = new Error('x'); conn.name = 'ConnectionError'
    expect(classifyError(conn)).toBe('retryable')
    expect(classifyError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe('retryable')
    expect(classifyError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe('retryable')
    expect(classifyError(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe('retryable')
  })
  it('retryable phrases (timeout / rate limit / connection reset)', () => {
    expect(classifyError(new Error('request timeout'))).toBe('retryable')
    expect(classifyError(new Error('rate limit exceeded'))).toBe('retryable')
    expect(classifyError(new Error('connection reset by peer'))).toBe('retryable')
  })
  it('a cued 429/500/502/503/504 status is retryable', () => {
    expect(classifyError(new Error('http 500'))).toBe('retryable')
    expect(classifyError(new Error('error 429'))).toBe('retryable')
  })
  it('an unrecognized error is unclassified', () => {
    expect(classifyError(new Error('something totally weird'))).toBe('unclassified')
  })
  it('an object (non-Error) with a message is read by messageOf (covers the object-with-message branch)', () => {
    expect(classifyError({ message: '401 unauthorized' })).toBe('auth')
  })
  it('a string (non-Error) retryable is classified via the non-Error path (covers the err instanceof Error false-branch at the retryable-TYPES block)', () => {
    expect(classifyError('timeout')).toBe('retryable')
  })
  it('rbi RETRYABLE_PHRASES: service unavailable / internal server error / bad gateway / gateway timeout / rate_limit', () => {
    expect(classifyError(new Error('service unavailable'))).toBe('retryable')
    expect(classifyError(new Error('internal server error'))).toBe('retryable')
    expect(classifyError(new Error('bad gateway'))).toBe('retryable')
    expect(classifyError(new Error('gateway timeout'))).toBe('retryable')
    expect(classifyError(new Error('rate_limit exceeded'))).toBe('retryable')
  })
})

describe('judgeWithProvider (retry/backoff + classifyError + AuthenticationAbort)', () => {
  it('succeeds on the first attempt (no retries)', async () => {
    const { provider, calls } = makeStubJudge([{ score: 0.9, rationale: 'good' }])
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, INSTANT_JUDGE)
    expect(v.score).toBe(0.9)
    expect(calls.length).toBe(1)
  })

  it('retries a retryable failure then succeeds (backoff + JUDGE_MAX_RETRIES)', async () => {
    const { provider, calls } = makeStubJudge([
      { throw: 'retryable' },
      { throw: 'retryable' },
      { score: 0.85, rationale: 'ok on 3rd' },
    ])
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, INSTANT_JUDGE)
    expect(v.score).toBe(0.85)
    expect(calls.length).toBe(3) // 1 initial + 2 retries = JUDGE_MAX_RETRIES
    expect(JUDGE_MAX_RETRIES).toBe(2)
    expect(BACKOFF_MS).toEqual([1000, 2000, 4000])
  })

  it('exhausts retries on a persistent retryable failure (judgeError: exhausted)', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'retryable' }, { throw: 'retryable' }, { throw: 'retryable' }])
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, INSTANT_JUDGE)
    expect(v.score).toBe(0)
    expect(v.judgeError).toBe('exhausted')
    expect(calls.length).toBe(3)
  })

  it('returns immediately on an unclassified failure (no backoff; judgeError: unclassified)', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'unclassified' }])
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, INSTANT_JUDGE)
    expect(v.score).toBe(0)
    expect(v.judgeError).toBe('unclassified')
    expect(calls.length).toBe(1)
  })

  it('raises AuthenticationAbort on an auth failure (the whole run is over, SPEC §5.5)', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'auth' }])
    await expect(
      judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, INSTANT_JUDGE),
    ).rejects.toBeInstanceOf(AuthenticationAbort)
    expect(calls.length).toBe(1)
  })

  it('respects a custom maxRetries (exhaustion boundary)', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'retryable' }, { throw: 'retryable' }])
    const v = await judgeWithProvider(
      provider,
      { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' },
      { ...INSTANT_JUDGE, maxRetries: 1 },
    )
    expect(v.judgeError).toBe('exhausted')
    expect(calls.length).toBe(2) // 1 initial + 1 retry
  })

  it('default threshold is 0.6', () => {
    expect(JUDGE_PASS_THRESHOLD).toBe(0.6)
  })
  it('uses the default sleep + the backoff[attempt] ?? 1000 fallback when opts.sleep is omitted + backoff is shorter than attempts', async () => {
    const { provider, calls } = makeStubJudge([{ throw: 'retryable' }, { throw: 'retryable' }, { score: 0.9, rationale: 'ok' }])
    // No opts.sleep ⇒ default (ms) => new Promise(r => setTimeout(r, ms)); backoff [0] shorter than the
    // 2 retries ⇒ attempt 1 hits backoff[1] ?? 1000 (default sleep(0) + sleep(1000)).
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' }, { backoff: [0] })
    expect(v.score).toBe(0.9)
    expect(calls.length).toBe(3)
  })
  it('no opts ⇒ all defaults (?? JUDGE_MAX_RETRIES / ?? BACKOFF_MS / ?? defaultSleep); success-first never calls sleep', async () => {
    const { provider, calls } = makeStubJudge([{ score: 0.9, rationale: 'ok' }])
    const v = await judgeWithProvider(provider, { question: 'q', agentAnswer: 'a', expectedAnswer: 'e' })
    expect(v.score).toBe(0.9)
    expect(calls.length).toBe(1)
  })
})

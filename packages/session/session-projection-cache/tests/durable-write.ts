/**
 * Attribution for the projection cache's fail-soft durable writes.
 *
 * Every checkpoint write is fire-and-forget: `flushSoft` and the cold-read
 * write-back catch the storage error and report it once through
 * `ctx.logger.warn`. `LoggerService` registers only its ring-buffer exporter
 * and these compositions add none, so that warning reaches no test output. A
 * read-back poll alone therefore cannot separate "the write threw" from "the
 * write has not landed yet" — both leave the previous document on disk — and
 * on the failing branch it burns its whole budget before reporting a
 * stale-value diff that names neither the errno nor the failing step. Racing
 * the report against the poll names which state was actually reached.
 * @module
 */

import { vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

/**
 * Settle one read-back poll against the first reported durable-write failure.
 * @param poll - the read-back poll naming the state under test.
 * @returns resolution once the poll observes that state.
 * @throws the reported durable-write failure, as soon as it is logged.
 */
export type ReadBack = (poll: Promise<void>) => Promise<void>

/**
 * Watch one composition's durable-write failure reports without silencing them.
 * @param ctx - composition whose logger the projection cache writes through.
 * @returns the read-back racer bound to this composition's first report.
 */
export function watchDurableWrites(ctx: Context): ReadBack {
  let report!: (message: string) => void
  const failed = new Promise<never>((_, reject) => {
    report = (message) => {
      reject(new Error(`durable write failed instead of landing: ${message}`))
    }
  })
  // A report that arrives after the poll already settled has no racer left.
  void failed.catch(() => {})
  const passThrough = ctx.logger.warn.bind(ctx.logger)
  vi.spyOn(ctx.logger, 'warn').mockImplementation((...args: Parameters<typeof passThrough>) => {
    report(String(args[0]))
    passThrough(...args)
  })
  return async (poll) => {
    // The losing side keeps polling; its later timeout is not a second failure.
    void poll.catch(() => {})
    await Promise.race([poll, failed])
  }
}

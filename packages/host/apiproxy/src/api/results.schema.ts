/**
 * results domain zod schemas (names derived from the map key:
 * resultGetRequestSchema / resultGetValueSchema). The result_id is an opaque
 * lookup token — a non-empty floor rejects only clearly-malformed ids; the
 * host's `ctx.resultCache.get` is the authority on what exists.
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** result.get request payload: one result_id to resolve. */
export const resultGetRequestSchema = z.object({
  resultId: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'result.get'>>>

/** result.get response value: the cached entry (columns/rows/metadata). */
export const resultGetValueSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  metadata: z.object({
    sql: z.string().optional(),
    truncated: z.boolean().optional(),
    row_count: z.number().optional(),
  }).optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'result.get'>>>

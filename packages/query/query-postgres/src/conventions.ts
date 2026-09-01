/**
 * Postgres engine conventions loader — GA-GT2-D4 second-engine stub. Mirrors
 * the MaxCompute `loadConventions` seam (`@deepseek-ai/dsh-query-maxcompute/
 * src/conventions.ts`) but for a Postgres dialect. The loader reads the
 * canonical sibling `./conventions.yaml` once (cached) so callers get the
 * source of truth, not a TS mirror that can drift.
 *
 * `import.meta.url` resolves the YAML next to this module in the workspace
 * (vitest, `.ts`). Multi-consumer: the nl2sql-engine prompt dialect grounding
 * (key_differences/functions/cast_map/sql_templates) + the future query
 * guard/cost/dialect consumer. Single-engine (postgres) here; an unknown
 * engine yields an empty convention set so callers fail-open.
 *
 * D1 (GA-GT2-impl): the four convention *types* live in the abstract
 * `@deepseek-ai/dsh-query` package (`src/conventions.ts`) so consumers import
 * engine convention types from the abstract package, not a concrete provider.
 * This file re-exports them for backward compatibility with any consumer
 * importing from `@deepseek-ai/dsh-query-postgres/src/conventions`; the
 * YAML-loading *runtime* (`loadConventions` below) stays the Postgres
 * provider's concern.
 *
 * @module @deepseek-ai/dsh-query-postgres/src/conventions
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { load as yamlLoad } from 'js-yaml'

import type { EngineConventions, ConventionFunction, ConventionCast, ConventionTemplate } from '@deepseek-ai/dsh-query'
export type { EngineConventions, ConventionFunction, ConventionCast, ConventionTemplate }

const yamlPath = resolve(dirname(fileURLToPath(import.meta.url)), 'conventions.yaml')
let cached: EngineConventions | undefined

/**
 * Load the per-engine conventions (RBI `conventions.py:32` semantics). Returns
 * an empty shape for an unknown engine so callers fail-open rather than throw.
 *
 * @param engine The engine name to load conventions for (default `'postgres'`); any other name yields an empty convention set.
 * @returns The cached `EngineConventions` for the requested engine (all arrays empty for unknown engines).
 */
export function loadConventions(engine = 'postgres'): EngineConventions {
  if (engine !== 'postgres') {
    return { engine, key_differences: [], functions: [], cast_map: [], sql_templates: [] }
  }
  if (cached === undefined) {
    cached = yamlLoad(readFileSync(yamlPath, 'utf8')) as EngineConventions
  }
  return cached
}

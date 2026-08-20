/**
 * MaxCompute engine conventions loader — the P4 per-engine `conventions.yaml`
 * seam (mirror RBI `conventions.py:32` `load_conventions(engine_name)`).
 *
 * Multi-consumer: the nl2sql-engine prompt dialect grounding
 * (`key_differences`/`functions`/`cast_map`/`sql_templates`) + the future query
 * guard/cost/dialect consumer (P4b engine-wrapper, Not-yet-specified). The
 * loader reads the canonical sibling `../conventions.yaml` once (cached) so
 * callers get the source of truth, not a TS mirror that can drift.
 *
 * `import.meta.url` resolves the YAML next to this module in both the
 * workspace (vitest, `.ts`) and the built package (`lib/`, `.js`);
 * `conventions.yaml` is shipped in `files`. Single-engine (maxcompute) today;
 * a second engine routes by name (the shared query-package loader ideal is
 * deferred until a second consumer/engine arrives — P13b grilling Q1/Q3).
 *
 * @module @deepseek-ai/dsh-query-maxcompute/src/conventions
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { load as yamlLoad } from 'js-yaml'

export interface ConventionFunction {
  readonly name: string
  readonly signature: string
}
export interface ConventionCast {
  readonly logical: string
  readonly meaning: string
  readonly cast: string
}
export interface ConventionTemplate {
  readonly name: string
  readonly sql: string
}
export interface EngineConventions {
  readonly engine: string
  readonly key_differences: readonly string[]
  readonly functions: readonly ConventionFunction[]
  readonly cast_map: readonly ConventionCast[]
  readonly sql_templates: readonly ConventionTemplate[]
}

const yamlPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'conventions.yaml')
let cached: EngineConventions | undefined

/**
 * Load the per-engine conventions (RBI `conventions.py:32` semantics). Returns
 * an empty shape for an unknown engine so callers fail-open rather than throw.
 */
export function loadConventions(engine = 'maxcompute'): EngineConventions {
  if (engine !== 'maxcompute') {
    return { engine, key_differences: [], functions: [], cast_map: [], sql_templates: [] }
  }
  if (cached === undefined) {
    cached = yamlLoad(readFileSync(yamlPath, 'utf8')) as EngineConventions
  }
  return cached
}

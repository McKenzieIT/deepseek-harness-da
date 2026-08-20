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

/**
 * A single MaxCompute SQL function exposed for the nl2sql prompt dialect
 * grounding (mirror RBI `conventions.yaml` function entries). Carries the
 * function name plus its SQL signature string for prompt injection.
 */
export interface ConventionFunction {
  readonly name: string
  readonly signature: string
}
/**
 * A logical-to-physical type cast mapping for the prompt dialect. Pairs a
 * logical type name and its human-readable meaning with the concrete MaxCompute
 * `CAST(...)` expression used in generated SQL (mirror RBI `cast_map` entries).
 */
export interface ConventionCast {
  readonly logical: string
  readonly meaning: string
  readonly cast: string
}
/**
 * A reusable MaxCompute SQL template referenced by name in generated SQL. The
 * `name` keys the template in the prompt dialect's `sql_templates` map; `sql`
 * is the parameterized template body (mirror RBI `conventions.yaml` entries).
 */
export interface ConventionTemplate {
  readonly name: string
  readonly sql: string
}
/**
 * The resolved per-engine convention set loaded from `conventions.yaml`. Bundles
 * the prompt-dialect grounding (engine name, key differences vs. other engines,
 * function list, cast map, SQL templates) for the nl2sql-engine and future
 * query-guard consumers. The loader returns this shape (empty arrays for an
 * unknown engine) as the single cached source of truth.
 */
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
 *
 * @param engine The engine name to load conventions for (default `'maxcompute'`); any other name yields an empty convention set.
 * @returns The cached `EngineConventions` for the requested engine (all arrays empty for unknown engines).
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

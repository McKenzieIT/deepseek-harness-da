/**
 * Vocabulary for the result-cache Service Definition.
 *
 * @module @deepseek-ai/dsh-result-cache/types
 */

/** One cached query or compute result. */
export interface ResultEntry {
  readonly columns: string[]
  readonly rows: unknown[][]
  readonly metadata?: ResultMetadata
}

/** Optional metadata stored alongside a cached result. */
export interface ResultMetadata {
  readonly sql?: string
  readonly truncated?: boolean
  readonly row_count?: number
}

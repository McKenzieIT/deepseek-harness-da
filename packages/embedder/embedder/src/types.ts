/**
 * Shared types for the embedder seam.
 * @module @deepseek-ai/dsh-embedder/src/types
 */

/** A single embedding vector (L2-normalized by the provider). */
export type Embedding = readonly number[]

/** The batched embed result, aligned to the input texts' order. */
export type EmbedResult = readonly Embedding[]

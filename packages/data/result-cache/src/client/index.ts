/**
 * Client-namespace projection of the result-cache Remote domain: a pure
 * re-export of the package's types outlet. Client code imports ONLY the client
 * namespace (repo discipline), so `./client` projects the same single-source
 * content `./types` serves to host consumers — zero duplication, and the
 * `ResultsRemote` call signature travels with its `ResultEntry`/`ResultId`
 * vocabulary. Type-only: the Host-half `ResultsRemoteGateway` runtime value
 * stays behind the `./remote` module edge and never reaches a browser bundle.
 *
 * @module @deepseek-ai/dsh-result-cache/client
 */

export type { ResultsRemote } from '../remote.ts'
export type * from '../types.ts'

/**
 * Shared browser platform modules. Seeding, bundling externals, and Vite
 * aliases consume this list so their module identities cannot drift.
 * @module @deepseek-ai/dsh-client-web/src/platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  // CB-4: zod is shared into the module table because plugin client bundles
  // inline the typert-generated /remote contributions, whose wire schemas
  // reference zod.z. Rolldown's ESM→CJS interop emits require("zod"), which
  // the browser shell must answer from its frozen module table. zod carries
  // runtime identity (schema instances, the _zod property), so one shared
  // instance is correct rather than one inlined per bundle — removing this
  // makes every plugin bundle's wire schemas throw "require("zod") missed
  // the module table" at boot and the whole plugin group fails to load.
  'zod',
] as const

/** Client-bundle specifiers whose factories the parser preloads before the shell starts. */
export const PRELOADED_CLIENT_EXTERNALS = [
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/** One platform module specifier (a seed-table key). */
export type PlatformModule = (typeof PLATFORM_MODULES)[number]

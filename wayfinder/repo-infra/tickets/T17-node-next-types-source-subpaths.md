# T17 — NodeNext consumer loads source-only package subpaths from published declarations

**Type**: bug
**Phase**: post-discovery
**Status**: resolved (2026-09-15)
**Assignee**: agent-session-2026-09-15
**Related**: [T10](T10-publint.md) exposed this check after publint stopped fail-fast masking it

## Question

Why does `pnpm run verify-node-next-types` fail after a complete build with TS5097 errors inside `embedder` and `semantic-layer`, plus a duplicate `ctx.schema` augmentation?

## Resolution

Twenty-four built declaration imports referenced `@deepseek-ai/dsh-*/src/*.ts`. A standard external NodeNext consumer follows those declarations into workspace TypeScript sources; the source files retain `.ts` relative specifiers and load a second semantic-layer type identity. Public declarations must depend on package roots, while `./src/*` remains a workspace source-execution facility.

The affected semantic-layer, nl2sql-engine, embedder, and retrieval consumers now import root exports. Semantic-layer exports `RelationGraph` and `NodeAliasData` from its root. `verify-node-next-types` explicitly rejects source-plane package specifiers in built declarations before running the external consumer compile.

After a complete build, `pnpm run verify-node-next-types` reports 343 workspace package declaration APIs compiling under NodeNext. The decision is recorded in [source-plane exports and publint](../../../.agents/notes/implemented/process/2026-09-15-source-plane-exports-and-publint.md).
# @deepseek-ai/dsh-tool-compute — compute tool package

> Spawned from [present-delivery-tools](present-delivery-tools.md) Decision #3 + #6 (2026-08-26): compute's form is "LLM-generated code + safe sandbox execution against data" (not hardcoded operation templates). All infra shipped: [result-cache-service](result-cache-service.md) ✅, [code-runtime-data-python](code-runtime-data-python.md) ✅, [safe-compute-architecture-decisions](safe-compute-architecture-decisions.md) ✅.

**Type**: task (AFK)
**Phase**: misc
**Assignee**: claude (claimed 2026-08-26)
**Blocked by**: none (all infra resolved 2026-08-26)
**Blocks**: G1b DELIVERY scoring (execution-match needs compute path)

## Question

Ship `@deepseek-ai/dsh-tool-compute` — the model-facing `compute` tool that lets the agent run LLM-generated pandas code against query results in the INTERPRETATION phase.

## Scope

### Package: `packages/data/tool-compute/`

Three-piece shape mirroring `tool-present-table`:
- `src/index.ts` — plugin entry (defineTool + execute)
- `tests/compute.spec.ts` — unit tests
- `package.json` + `tsconfig.json` + `README.md`

### Tool shape (model-facing)

```
compute(result_id: string, code: string, description: string) → {computed, result_id, description, row_count}
```

- **result_id** (required): Source data to compute against (from `query_data` execution, `qr_*` or prior `cr_*`)
- **code** (required): Python/pandas code to execute. Runs as async function body with `pandas` and `numpy` available. Access data via `await data.load_result({"result_id": "..."})`.
- **description** (required): Human-readable description of what this computation does (for audit trail + present_table title suggestion)

### Execution flow

1. Validate inputs (non-empty result_id, code, description)
2. Verify `ctx.resultCache.has(result_id)` — fail explicitly if source data not found
3. Build `data` binding namespace with `load_result({result_id}) → {columns, rows}`
4. `ctx.codeRuntime.run({program: code, bindings: [{global: 'data', functions: {load_result}}], signal})`
5. Parse completion value — expect `{columns: string[], rows: unknown[][]}`
6. Generate `cr_<sha256(code + result_id)[0:12]>` deterministic result_id
7. `ctx.resultCache.put(newResultId, {columns, rows})`
8. Return `{computed: true, result_id: newResultId, description, row_count: rows.length}`

### Inject

`['tools', 'codeRuntime', 'resultCache']`

### Architecture decisions (from grilling, locked)

- D1: `load_result` binding = thin facade over `ctx.resultCache.get(rid)`
- D2: In-memory Map storage (session-scoped)
- D4: `cr_` prefix for compute-derived results
- D5: Containment, not security boundary (bash-equivalent trust)
- D6: pandas + numpy (pre-installed in data-python Provider venv)

## Acceptance criteria

- [x] `compute` tool registers via `ctx.tools.register(defineTool(...))`
- [x] Model-generated pandas code executes against loaded result data
- [x] `load_result` binding returns `{columns, rows}` from resultCache
- [x] Missing result_id → explicit error (not silent undefined)
- [x] Code runtime failure → error propagated to model (self-correction possible)
- [x] Computed result stored via `ctx.resultCache.put()` with `cr_` prefix
- [x] Deterministic result_id for same code+input (idempotent cache)
- [x] Abort signal propagated to code runtime
- [x] Unit tests cover: success path, binding calls, missing data, runtime failure, abort, output validation

## Resolution (2026-08-26, task AFK)

Shipped as `packages/data/tool-compute/` — `@deepseek-ai/dsh-tool-compute`.

### Package structure

- `src/index.ts` — plugin entry: `defineTool` with `inject: ['tools', 'codeRuntime', 'resultCache']`
- `tests/compute.spec.ts` — 22 tests covering all acceptance criteria
- Standard three-piece shape (package.json + tsconfig.json + README.md)

### Execution flow

1. Validate inputs (non-empty result_id, code, description)
2. `ctx.resultCache.has(result_id)` — fail explicitly if source not found
3. Build `data` binding namespace: `load_result({result_id}) → {columns, rows}` (thin facade over `ctx.resultCache.get`)
4. `ctx.codeRuntime.run({program: code, bindings: [{global: 'data', functions: {load_result}}], signal})`
5. Validate output shape: `{columns: string[], rows: unknown[][]}`
6. Store via `ctx.resultCache.put('cr_<sha256(code+result_id)[0:12]>', entry)`
7. Return `{computed: true, result_id, description, row_count}`

### Bundle wiring

- `cordis.patch.yml`: added `result-cache` row (`@deepseek-ai/dsh-result-cache-memory`)
- Agent preset `agent.cordis.yml`: added `tool-compute` row (`@deepseek-ai/dsh-tool-compute`)
- Bundle `package.json`: added deps (`dsh-code-runtime-data-python`, `dsh-result-cache-memory`, `dsh-tool-compute`)
- `tsconfig.host.json`: added project reference

### Verification

- tsc -b: clean
- oxlint: 0 errors
- vitest: 22/22 passing
- verify-cordis-config: no new failures

### Bonus fix

Fixed pre-existing TS2304 in `packages/data/result-cache/src/index.ts` — added missing local `import type { ResultEntry }` (the `export type` re-export didn't bring the name into local scope).

## 关联

- [present-delivery-tools](present-delivery-tools.md) (parent decision, resolved 2026-08-26)
- [safe-compute-architecture-decisions](safe-compute-architecture-decisions.md) (6 architecture decisions, resolved 2026-08-26)
- [result-cache-service](result-cache-service.md) (prerequisite, resolved 2026-08-26)
- [code-runtime-data-python](code-runtime-data-python.md) (prerequisite, resolved 2026-08-26)
- `packages/data/tool-present-table/` (sibling tool, pattern reference)
- `packages/code-runtime/code-runtime/src/types.ts` (CodeRunRequest/CodeRunResult contract)
- `packages/data/phase-gate/src/types.ts:211` (INTERPRETATION_TOOLS already includes 'compute')

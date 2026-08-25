# Plan: Table Qualification + Self-Evolution

## Context

dsh-data-agent generates SQL with bare table names (`dws_10000251_univ_acc_act_di`) but MaxCompute needs fully-qualified names (`game_10000251.dws_10000251_univ_acc_act_di`). This blocks all DWS table queries. The fix has two phases: (1) automatic qualification from existing config, (2) self-evolution when project info is missing.

**Key discovery**: `examples/k11-semantic-layer/config.yaml` already has `project.name: game_10000251`. The data exists — it's just unused for table qualification.

**Key discovery**: `query-tool` already returns `failureKind` in its result (line 145, `packages/query/query-tool/src/index.ts`). The phase-gate just doesn't read it yet.

---

## Phase 1: Qualify Table Names (unblock current queries)

### Step 1.1 — `qualifyTableName()` on SemanticLayerService

**File**: `packages/data/semantic-layer/src/index.ts`

Add method:
```typescript
qualifyTableName(tableName: string): string {
  const override = this.getTableProject(tableName)  // per-table YAML `project` field
  const defaultProject = this.getDefaultProject()   // config.yaml → project.name
  const project = override ?? defaultProject
  return project ? `${project}.${tableName}` : tableName
}
```

- `getDefaultProject()`: lazy-read `config.yaml → project.name`, cached, invalidated on `invalidateCaches()`
- `getTableProject(name)`: scan raw tables for extra `project` field (`.loose()` passthrough, no schema change)
- Graceful degradation: no config → return bare name unchanged

### Step 1.2 — `search_data_sources` returns qualified ids

**File**: `packages/data/tool-search-data-sources/src/index.ts`

After building candidate list, qualify each table-kind `id`:
```typescript
const schema = ctx.get('schema')
id: schema?.qualifyTableName?.(hit.id) ?? hit.id
```

Only qualifies table-kind hits (not events). Corpus BM25 index keeps bare names. Qualification is output-only.

### Step 1.3 — `load_table_definition` includes `qualified_name`

**File**: `packages/data/tool-load-table-definition/src/index.ts`

Add `qualified_name` to `TableModel` and response projection.

### Step 1.4 — phase-gate `collectTableNames` both forms

**File**: `packages/data/phase-gate/src/phase-gate.ts`

Add both qualified and stripped forms to candidate set:
```typescript
out.add(id.toLowerCase())
out.add(id.toLowerCase().replace(/^.*\./, ''))
```

---

## Phase 2: Self-Evolution (handle unknown/wrong project)

### Step 2.1 — Phase-gate captures `failureKind` from query_data

**File**: `packages/data/phase-gate/src/phase-gate.ts`, `types.ts`

Read `failureKind` and `error` from query_data result. Add to `PhaseGateState`.

### Step 2.2 — Targeted TABLE_NOT_FOUND fallback

In `executionDecision`, when `failureKind === 'not_found'`:
- Fallback to GENERATION with targeted inject message
- Guide agent to ask user for correct project, then call `update_table_config`

### Step 2.3 — New tool `update_table_config`

**New package**: `packages/data/tool-update-table-config/`

Parameters: `{ table_name, project? }`
Behavior: validate → merge project into YAML → invalidateCaches → return qualified_name
Permission: admin-only (full RBAC follow-up)

### Step 2.4 — Whitelist + preset registration

Add to GENERATION phase whitelist + `agent.cordis.yml`

---

## What NOT to change

- Critic: already strips `.` prefix
- BM25 corpus: keeps bare names (better tokenization)
- NL2SQL prompt: no engine instructions needed
- TableDefinitionSchema: `.loose()` already passes through `project`

---

## Test Strategy

| Test | Verifies |
|------|----------|
| `qualifyTableName` unit (new) | default project, override, no-config fallback |
| K11 integration | real config → `game_10000251.dws_xxx` |
| search qualified output (extend) | candidates have qualified ids |
| phase-gate TABLE_NOT_FOUND (extend) | targeted fallback + inject |
| update_table_config (new) | write, permission, validation |
| Manual E2E | bare name → fail → ask → update → retry → success |

---

## Verification

1. `pnpm vitest run packages/data/semantic-layer/tests/`
2. `pnpm vitest run packages/data/tool-search-data-sources/tests/`
3. `pnpm vitest run packages/data/phase-gate/tests/`
4. `pnpm tsc -b` on affected packages
5. `pnpm run verify-cordis-config`
6. Manual E2E: `pnpm dsh web` → "查询K11过去一周的DAU" → qualified SQL → success

# P6 semantic-layer substrate — PROTOTYPE (throwaway)

> ⚠️ **THROWAWAY PROTOTYPE.** Not a shipped package. Not production code. The validated shape will be reimplemented as real `packages/semantic/{semantic, semantic-tool}` Cordis packages (TS, Schemastery, real harness `defineTool`) — that is a **production step**, not this prototype. This dir is the primary-source artifact for wayfinder ticket **P6**; do not promote it. See `/wayfinder/data-agent/tickets/phase-2/P6-semantic-layer.md`.

## The question it answers

Does the **semantic-layer substrate** state model feel right? — `EventDefinition`(埋点) + `TableDefinition`(表) as zod schemas mirroring RBI pydantic (`extra=allow`→`.passthrough`, `model_validator`→`.refine`/`.superRefine`, `canonicalize_type`→`.transform`); per-scope YAML storage with atomic-write + ADR-0011 cache-invalidate; the **ODPS-decoupled sync** (semantic layer receives `TableMeta[]` via a `ctx.schema` seam, never touches pyodps); and the **write-tiers** discipline (Tier-1 `suggest→pending→approve` protects the source-of-truth from agent self-pollution; Tier-2 per-scope audit-logged). NL→SQL engine itself is a **separate graduated ticket** (see research/p6-nl2sql-feasibility.md).

## Locked decisions (see ticket P6 + research notes)

- **D6 范围**: P6 = substrate + ODPS 解耦 seam; NL→SQL (B) 引擎毕业成新 ticket（Text2DSL 雾已清：无 canonical IR，本质 prompt+feedback+guards）。`research/p6-nl2sql-feasibility.md`
- **D3 核心边界**: P6 core = types/reader/writer/sync-write/**BasicIndex**(dep-free)/terminology/accumulated + substrate 工具；deferred P5 = HybridRetriever/UnifiedSearchIndex(BM25+sqlite-vec+cross-encoder bge-m3)；deferred 引擎 ticket = sql_evaluator/sql_critic/prompt/self-correction/regex-guards/eval/**`search_data_sources`**；**dropped** = plan_query/planner（LATENT，研究证）。
- **D4 schema seam**: sibling `ctx.schema` seam（`discover`/`describe`/`sample`；`probe_pk_uniqueness` 走 `ctx.query.execute`；MaxCompute sidecar 同实现两 seam；P4 `ctx.query` 保窄）。
- **D5 write-tiers**: P6 实现 Tier-1 suggest→pending→approve（守事实来源）+ Tier-2 留痕；approve 侧注册受 P9 admin 门控（`disable_admin` 可整层关）；sync-write = ops/admin Tier-2。
- **D2 数据模型**: zod 镜像 RBI pydantic + 逐字镜像 RBI YAML 格式 → 与 RBI 531 表/事件/terminology 现存 curated 目录**交叉兼容**；substrate deps = zod + yaml only（sqlglot 归引擎 ticket）。
- **D1 包**: `packages/semantic/{semantic, semantic-tool}` 镜像 P4 `packages/query/{query,query-tool}`（无 maxcompute pkg——schema 读取经 `ctx.schema` 在 P4 sidecar）。

## Run

```
node run.mjs            # interactive menu
node run.mjs --demo     # auto-run all 4 scenarios, print state after each, exit
```

## Assumptions (react to these)

1. **`.mjs`, not TS.** Throwaway; no build step. Real impl is TS (zod + Schemastery `defineTool`).
2. **`ctx.schema` is a STAND-IN.** `schema-stub.mjs` returns hardcoded fake `TableMeta[]`. Real impl is in the P4 MaxCompute sidecar (`ctx.schema` seam — same sidecar as `ctx.query.execute`, per-scope ODPS connection cache + `credentials/updated→invalidate`). The prototype demos the *decoupling point* (semantic layer receives schema dicts, doesn't touch ODPS), not the sidecar.
3. **Atomic write, no flock.** `io.atomicWrite` does temp+fsync+rename (the atomic-swap pattern). `fcntl.flock` is skipped (Node has no built-in fcntl; production uses a lock lib like `proper-lockfile`).
4. **YAML style is js-yaml's, not pyyaml's.** The DATA round-trips (parse→dump→reparse→deep-equal); exact byte-fidelity to pyyaml's `_LiteralDumper` is NOT claimed. Real impl would use a TS yaml lib + match RBI's literal-block style if byte-compat matters.
5. **Audit log is a flat JSON file stub.** Tier-2 `recordTier2Write` appends to `var/audit.json`. Real impl uses `ctx.storage` (SQLite, P8 audit's seam).
6. **Real RBI YAML fixtures** (scenario 1) are read directly from `/Users/mckenzie/workspace/reverse-bi/resources/semantic-layer/{10000147,10000251}/` — this is the cross-compat validation (zod parses real curated RBI YAML). If that path is absent, scenario 1 skips.
7. **No `search_data_sources` tool.** Per D3, the substrate ships `BasicIndex` (internal lookup) only; `search_data_sources` (UNDERSTANDING-phase engine tool) is deferred to the graduated NL→SQL engine ticket.

## Surfaced findings (the prototype's main findings)

- **zod faithfully mirrors RBI pydantic for the substrate.** Real RBI fixtures (event `role.online` with 25+ `params_fields`, DWS `pay_order_di` with role-tagged columns + metrics, DIM `charm_info` with `kind/pk/label_columns`) all parse; `canonicalize_type` collapses physical→logical; the malformed-DIM case (empty pk+label) is rejected by `.superRefine` (mirrors `_kind_constraints`); round-trip parse→dump→reparse is deep-equal. → D2 validated.
- **ODPS decoupling is clean.** The sync flow never imports/touches pyodps — it receives `TableMeta[]` from `ctx.schema` and writes YAML. `merge_changed_yaml` preserves analyst role corrections (the `pay_amt` 'attribute' override survives a type change; new columns get inferred roles). → D4 validated (the seam shape; sidecar is stubbed).
- **write-tiers protects source-of-truth.** `suggest_event_yaml` lands in the pending queue WITHOUT touching the source-of-truth (lookup returns null); only `approve` writes + consumes the queue. Tier-2 `update_table_meta` writes directly + audit-logs (sha256 hash). → D5 validated.
- **ADR-0011 invalidate works.** A `BasicIndex` write fires the invalidation hook → `_dirty` → next lookup rebuilds from disk (new table appears). → substrate cache discipline validated.

## Files

- `types.mjs` — zod schemas mirroring `rbi_core/models/semantic.py` (+ `canonicalizeType`).
- `io.mjs` — reader/writer/sync (mirrors `rbi_semantic/{reader,writer,sync}.py`); atomic write + cache-invalidate.
- `index.mjs` — `BasicIndex` (mirrors `rbi_semantic/index.py:BasicIndex`); dep-free, ADR-0011 hook.
- `pending.mjs` — Tier-1 pending queue + Tier-2 audit (mirrors `rbi_mcp/{pending_writes,write_tiers}.py`).
- `schema-stub.mjs` — `ctx.schema` seam stand-in (real impl = P4 MaxCompute sidecar).
- `run.mjs` — demo driver (4 scenarios, `--demo`, interactive).

# P4e — per-scope ODPS data-source resolution（query engine 按活跃 scope 解析数据源）

**Type**: prototype
**Phase**: 2/生产
**Status**: Resolved (2026-08-25)
**Depends on**: P9（2026-08-25 revision: per-scope data-source design + option (ii) per-scope creds）+ P4c（query-maxcompute Provider 存在，单-config 假设被本票修正）+ P12（per-scope creds via `{scopeId}` keychain dimension）
**Feeds**: X63（overseas `hdyl_data_sg`）+ 任意非-`ieu_cdm` scope 的 query execution；多 region/project 部署无需改源码

## Question

query-maxcompute Provider 按**活跃 scope** 解析其 ODPS data-source（endpoint/project/creds，任意——不绑 `domestic`/`overseas` region 名、不绑 singleton、不绑共享-cred），per-call 传 sidecar（`set_credentials` per scope）；creds per-scope 经 P12 `{scopeId}`（option (ii)）。加新 project/region = 注册 scope（config），不改源码。

## From

- **P9 2026-08-25 revision**: `OdpsConfig` 从 RBI 单例+两-region+共享-cred **泛化为 per-scope data-source**；per-scope 凭证 **改荐 option (ii)**（(i) 共享+两-region = RBI 业务定制，superseded）。
- **P4c「单 config 覆盖全 scope」假设被推翻**: 5 RBI *eval* scope 恰在 `ieu_cdm`（domestic），但 scope 可在不同 region/project——X63/10000334 declares `environment: overseas-prod` + `workspace: hdyl_data_sg`，非 `ieu_cdm`。P4c 的单一 maxc-config（`config_ieu_cdm.yaml.bak`）到不了 overseas。

## Design (from P9 revision — not re-decided here)

- **per-scope data-source**: scope 携带任意 ODPS endpoint/project/creds（**不**绑 region 名、**不**绑 singleton、**不**绑共享-cred）。query engine `resolve(scopeId) → {endpoint, project, creds}` → sidecar `set_credentials` per call。scope 即数据源选择单元（一个 scope = 一份 data-source 配置）；连 RBI 的 `region` 中间层都可不要（region 只是 scope 的一个 config 值，不是架构轴）。
- **creds**: option (ii) per-scope 4-ref（`ODPS_ACCESS_ID/KEY/PROJECT/ENDPOINT` per scope）经 P12 `{scopeId}` keychain；admin 预解析入 keychain by scopeId。**不**取 option (i)（共享 access_id/key + per-scope project/endpoint by region）——那是 RBI 业务定制版（共享账号 + 两 region），superseded。
- **加 project/region**: scope config（`~/.dsh/data/scopes.yaml` 的 metadata + scope `config.yaml` maxcompute section，或 per-scope data-source 配置）—— 源码不动（open-closed）。

## Scope boundary (P9 revision principle)

本票实现**取数核心**（per-scope data-source 解析 + query engine 接线 + sidecar set_credentials per scope）。**不**实现业务定制：具体 region 名（`domestic`/`overseas`）、project 名（`ieu_cdm`/`hdyl_data_sg`）、game scope id 都是 **per-scope config 值**，不 bake 进源码。

## Unblocks

- X63 query execution（overseas ODPS `hdyl_data_sg`，短期 P1 只修了语义层/理解阶段，执行阶段需本票）。
- 任意多 region/project 部署的 query execution（加 scope 即配置）。

## Deferred / surfaced

- per-user PAT self-service set 接 P12 keychain = P9b 范畴（非本票）。
- per-scope cred 的 admin 颁发/吊销 UI = P9b 范畴（非本票）。
- per-scope data-source 配置的具体 schema（是 scope config.yaml 的 maxcompute section 扩展，还是 scopes.yaml metadata 字段）= 本票设计时钉。

## Resolution (2026-08-25)

**Implemented** per-scope ODPS data-source resolution in `packages/query/query-maxcompute/src/index.ts`. The prior `pushCredentials` resolved refs globally (no `{scopeId}` dimension) — a dormant cross-scope leak under `sidecar-self`, a live leak under `push` mode. Now:

1. **`resolveDataSource(scopeId)`** (protected): resolves the 4-key data-source per-scope:
   - endpoint/project (non-secret) from `ctx.get('scopes').get(scopeId).metadata.maxcompute`
   - access_id/key (secrets) from `ctx.credentials.resolve(ref, { scopeId })` (P12 `{scopeId}` dimension)
2. **`sendCredentials(scopeId, creds)`** (protected seam): the sidecar `set_credentials` call; overridden in tests by a recorder (no sidecar spawn needed).
3. **`pushCredentials(scopeId)`** (public): composes resolveDataSource + sendCredentials per call. `credMode: 'sidecar-self'` skips entirely.
4. **`qualifyTable`** now resolves the active scope's `metadata.maxcompute.project` (fallback: static `defaultProject`; final fallback: bare table name).
5. **Fail-closed**: unknown scope → throw; missing endpoint/project → throw; missing cred → throw. No silent global fallback.

**Config schema decision** (钉): per-scope ODPS data-source lives in `scopes.yaml` as `metadata.maxcompute.{endpoint, project}` (nested under each scope's metadata, alongside the existing `engine`/`project` game-name fields). Not a separate file, not the scope's `config.yaml` — the registry IS the data-source config for the query engine. `~/.dsh/data/scopes.yaml` seeded with real endpoints (K11: `service-corp.odps.aliyun-inc.com/api` + `ieu_cdm`; X63: `service-all.ali-sg-lazada.odps.aliyun-inc.com/api` + `hdyl_data_sg`).

**Tests** (`per-scope-data-source.spec.ts`, 13 tests): per-scope push (K11 vs X63 different on every key), cross-scope leak proof, sidecar-self skip, fail-closed (unknown scope / missing endpoint / missing project / unprovisioned cred), qualifyTable per-scope, scope-boundary (config-driven with non-real project value).

**Principles verified**: additive-only (query-maxcompute internal); no business region/project baked in source (scope-boundary test); open-closed (add scope = config not code); intranet-security-first (fail-closed + PAT-not-in-env + per-scope isolation); scope_id server-authoritative (request.scopeId per P9).

**Leak-closure layer ②/③ complete**: ① semantic-layer (P1 ✓) → ② data/query execution (P4e ✓, this ticket) → ③ multi-tenant access (P9b, deferred — designed+locked, blocked by G3c+P10).

# B-DA5 — Per-scope maxc config routing under credMode=sidecar-self (K11 DAU "Table not found")

**Type**: bugfix
**Phase**: misc
**Status**: resolved (2026-08-31)
**Assignee**: claude-code (subagent-driven)
**Verified**: 70/70 vitest (16 new: maxc-args 4 + per-scope-maxc-config 12) + spec ✅ + quality ✅ (4 Minor, non-blocking) + live K11 7-day DAU via `~/.maxc/config_ieu_cdm.yaml` returns 7 rows, `project: ieu_cdm`, `tables_used: [ieu_cdm.dws_10000251_univ_acc_act_di]`, `error: null` (was `ODPS-0130131 Table not found` pre-fix). Runtime config applied: scopes.yaml K11 `metadata.maxcompute.config_file` + `~/.maxc/config_ieu_cdm.yaml` (active copy of `.bak`).
**Blocked by**: —
**Related**: [P4e](../phase-2/P4e-per-scope-odps-data-source-resolution.md)（per-scope data-source resolution, dormant under sidecar-self）, [S1](./S1-decouple-maxcompute-from-bundle.md)（maxcConfigPath decouple）, [B-DA3](./B-DA3-k11-wrong-project-override.md)（per-table override, different layer）, [M2](./M2-self-evolution-architecture.md)（not_found → ask-user-for-project flow that produced the false decline）, `packages/query/query-maxcompute/src/index.ts`, `packages/query/query-maxcompute/dev/maxc-sidecar.mjs`, `packages/bundle/data-agent/cordis.patch.yml`

## Problem

查询 "K11 过去七天 DAU" 返回 `【route:decline】`，称「语义层表名与 ODPS ieu_cdm 物理表不一致／表不存在或被重命名」。**与事实不符**：`dws_10000251_univ_acc_act_di` 确实存在于 `ieu_cdm`（2026-07-30 实测 DAU=4520，定义 `confirmation.status: analyst_confirmed`，`project: ieu_cdm`，`metrics.dau: SUM(act)`）。

session-31bd30c9 实际 ODPS 报错（审计原话）：
- `ODPS-0130131:[1,33] Table not found - table hdyl_data_sg_dev.dws_10000251_univ_acc_act_di cannot be resolved`（裸名 → sidecar 默认 project）
- `ODPS-0130131:[1,33] Table not found - table ieu_cdm.dws_10000251_univ_acc_act_di cannot be resolved`（**正确限定的 `ieu_cdm.dws_…` 也失败**）

## Root Cause

live maxc sidecar 用 `~/.maxc/config.yaml`，其 `default_project: hdyl_data_sg_dev`、endpoint=`service-all.ali-sg-lazada`（X63/SG 环境），而非 active K11 scope 的 `ieu_cdm`/`service-corp`（domestic）。

`credMode: sidecar-self`（bundle 配置）使 `MaxComputeQueryEngine.pushCredentials()` 直接 `return`（no-op），maxc sidecar 的 `set_credentials` 也是 no-op（"maxc self-manages auth in its config file"）。于是 P4e 已正确解析的 per-scope endpoint/project（`~/.dsh/data/scopes.yaml`：K11→ieu_cdm/corp、X63→hdyl_data_sg/SG）**从未应用到 sidecar**——sidecar 永远跑在单一静态 `~/.maxc/config.yaml`（此处恰好钉在 X63/SG）。

后果：裸名解析到 `hdyl_data_sg_dev`（错 project）→ not found；`ieu_cdm.dws_…` 在 SG endpoint 上解析不到 `ieu_cdm`（国内 corp project）→ 仍 not found。两种写法都挂，**证明不是 prompt 限定问题**，是 per-scope 数据源路由在 sidecar-self 模式下被整体旁路。

`classifyMaxcError` 正确分类 `ODPS-0130131`→`not_found`，触发 M2 的 ask-user-for-project 流程；LLM 误诊为「表不存在／元数据过期」，而非「sidecar 连错 scope 环境」。

## Fix（per-scope maxc config 路由，sidecar-self 模式下）

sidecar-self 模式下 sidecar 从自有 config 自鉴权——故 per-scope 路由 = 按 active scope 选 maxc config 文件（即 `dev/maxc-sidecar.mjs` 注释标 deferred 的 "per-scope config mapping (production per-game isolation)"）。

**Repo changes（implementer subagent）**：
1. **Provider (`packages/query/query-maxcompute/src/index.ts`)**：
   - 新增 `resolveScopeMaxcConfig(scopeId)`：读 active scope 的 `metadata.maxcompute.config_file`；fallback `cfg.maxcConfigPath`。
   - `execute`：解析 per-call config path，作为 `config_path` 传入 sidecar `execute` tool args（`callTool(TOOLS.execute, { scope_id, sql, mode, config_path })`）。`config_path` 可能为 undefined（fallback spawn-time config）——保持向后兼容。
2. **Sidecar (`packages/query/query-maxcompute/dev/maxc-sidecar.mjs`)**：
   - `executeOp({ sql, config_path })`：`runMaxc(['query','run','--wait','60'], sql, config_path ?? MAXC_CONFIG)`。
   - `runMaxc(subArgs, sql, config)`：`--config <config>` arg 用 per-call `config`（替换模块级 `MAXC_CONFIG`）。
3. **Tests**：
   - Provider 单测：`execute` 为 K11 scope 传 `config_path=<domestic>`、为 X63 传 `config_path=<sg>`（用 RecordingEngine 模式捕获 callTool args，镜像 `per-scope-data-source.spec.ts` 的 `sendCredentials` recorder）；无 `config_file` 时 fallback `cfg.maxcConfigPath`；无 scope-registry 时 fallback `cfg.maxcConfigPath`。
   - Sidecar 单测/场景：`executeOp` 用 per-call `config_path`，fallback spawn-time `MAXC_CONFIG`。

**Runtime config（controller，非 repo）**：
4. `~/.dsh/data/scopes.yaml`：K11/X63 `metadata.maxcompute` 加 `config_file`。K11 → `~/.maxc/config_ieu_cdm.yaml`（ieu_cdm/corp）；X63 → `~/.maxc/config.yaml`（SG）。
5. 保证 `~/.maxc/config_ieu_cdm.yaml` 存在（现仅有 `.bak`；拷贝/重命名 `.bak` → `.yaml`）。

注：目标态 = credMode `push` + 真 pyodps sidecar honor `set_credentials`（P4e 设计、A1-split deferred）；sidecar-self + per-scope config_file 是当前 prototype 阶段的正确路由机制，非过渡方案——真 sidecar 落地后该路径与 push 并存/被取代。

## Evidence

- `~/.maxc/config.yaml`：`default_project: hdyl_data_sg_dev`、endpoint `service-all.ali-sg-lazada`。
- `~/.dsh/data/scopes.yaml`：K11 `metadata.maxcompute.{endpoint: service-corp, project: ieu_cdm}`；X63 `{service-all.ali-sg-lazada, hdyl_data_sg}`。
- `query-maxcompute/src/index.ts`：`pushCredentials` 中 `if (this.cfg.credMode === 'sidecar-self') return`；`execute` 不调 `qualifyTable`，`callTool(TOOLS.execute, { scope_id, sql, mode })`。
- `dev/maxc-sidecar.mjs`：`set_credentials` NO-OP；注释 "all 5 scopes live in ieu_cdm... ONE config covers the whole eval set. Per-scope config mapping (production per-game isolation) is deferred."
- `per-scope-data-source.spec.ts`：显式测 `credMode=sidecar-self skips the push entirely`。
- session-31bd30c9 ODPS 报错（见 Problem）。

## Risks

- per-call `config_path` 经 stdio 传 sidecar，路径需可信（同 machine；不跨 host）。sidecar-self 已是单机假设。
- K11/X63 的 `config_file` 指向的 YAML 需部署侧保证存在且有 `default_project`+endpoint（K11 现有 `config_ieu_cdm.yaml.bak` 有 `default_project: ieu_cdm`）。
- 真实 ODPS 回归依赖 `maxc` CLI + 网络可达 corp endpoint（live 测试标 live，单测用 stub/Recorder）。

## Acceptance criteria

- Provider 单测：`execute` 为 K11 传 `config_path=<domestic>`、为 X63 传 `<sg>`；无 `config_file` fallback `cfg.maxcConfigPath`；无 cross-scope 泄漏。
- Sidecar 单测：`executeOp` 用 per-call `config_path`，fallback spawn-time `MAXC_CONFIG`。
- `~/.dsh/data/scopes.yaml` K11/X63 加 `config_file`；`~/.maxc/config_ieu_cdm.yaml` 存在。
- **live 回归**：K11 scope 下查 "过去七天 DAU" 返回 DAU≈4520（`dws_10000251_univ_acc_act_di`，近 7 天 `SUM(act)`），不再 `route:decline`。
- `pnpm vitest run packages/query/query-maxcompute` + `tsc -b packages/query/query-maxcompute/tsconfig.json` 全绿。

## Files

- `packages/query/query-maxcompute/src/index.ts`
- `packages/query/query-maxcompute/dev/maxc-sidecar.mjs`
- `packages/query/query-maxcompute/tests/`（新 per-scope config 路由测）
- `~/.dsh/data/scopes.yaml`（runtime，controller）
- `~/.maxc/config_ieu_cdm.yaml`（runtime，controller）

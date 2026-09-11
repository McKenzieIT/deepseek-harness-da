# T1 — Execution grader 实现

**Type**: task  ·  **Status**: open
**Part of**: [dsh-data-agent evaluation map](../map.md)
**Blocked by**: [G1](G1-exec-grader-seam.md)（resolved 2026-09-08，v1 六条 + v3 D1–D6 已合并）、[T11](T11-loader-provenance-strip.md)（同批前置，须先全部验收）
**软前置**（未解也可开工，见 §前置）: [G1b](G1b-ground-truth-lifecycle.md)、[G10](G10-harness-bhe-split.md)、GA-EVAL-CASESET-EVENT-ANCHOR
**Blocks**: [R23](R23-comparator-policy-mutation-baseline.md) → GA-EVAL-EXPAND → {R12 / R17 / G9}
**Mode**: AFK（后端方向，**本地直接做**，不走另环境/rubric；与 T11 同批，T11 先验收再起 T1；见 [playbook](../playbook.md) §1.1）
**Branch**: `feat/T1-exec-grader-impl`

## Question

按合并后的 [G1](G1-exec-grader-seam.md) 实现 execution grader：单一 executor 端口、结局五分、归一与评分为两个纯函数、artifact 即证据、一能力一实现。

## 实现契约（合并后的 G1，不重开）

### v1 锁定的六条（架构无关；第 4 条按合并裁定改写）

1. **三事实分离** —— 模型错 / 仓库没答 / judge 意见，各自独立记录，任一不得覆盖另一。
2. **execution 是主裁决** —— LLM judge 单独报告，永不覆盖 execution mismatch。
3. **gold/reference SQL 执行失败 = benchmark 基础设施失败** —— 不给候选模型记 0 分。
4. **端口交 capability 不交 verdict** —— `{ execute(sql, signal?), attach?(instanceId) }`，返回 provider 的**原始 `QueryOutcome`**；归一在 evaluation 内做（合并裁定：v1 原让 host 先调 `mapQueryOutcome` 再交出，而"让 host 归一"正是两份 adapter 分叉的成因）。`attach?` 保留，使"遇非终态 `pending` 判 environment-blocked"是策略选择而非写死的结构。不直接依赖 `MaxComputeQueryEngine`，不经 `query_data` rendering 层评分。
5. **provenance 由 grader 装配** —— executor 只交它真观测到的（rows / columns / rowCount / 截断信号 / 实际执行的 SQL / provider `failureKind` / 耗时）；snapshot 相关字段、comparator policy id+version、raw/normalized digest 由 grader 从 run config + case 组装成独立 evidence 记录。
6. **截断与耗时自己观测** —— 不透传 provider 的 `truncated`（恒 `false`）与 `durationMs`（恒 `0`，`packages/query/query-maxcompute/dev/maxc-sidecar.mjs:101`、`:103`）；耗时由 adapter 在调用两端量 wall-clock。

### v3 新增的五条

7. **结局是五成员封闭联合** —— `pass` / `fail` / `environment-blocked` / `case-defect` / `not-measured`。`environment-blocked` 覆盖连不上、凭证、限流、超时、仓库返回非终态 `pending`；`case-defect` 覆盖未知或拼错的 `match_mode`、expected 缺失或不自洽、reference SQL 不可执行。二者分开的理由是行动不同（重跑 vs 修语料）且趋势意义相反。
8. **`not-measured` 是显式成员，不是缺失值** —— judge 分数永不写入 execution 维度（删除 `packages/eval/eval-runner/src/runner.ts:286` 的顶替）；25 个 DELIVERY-only case 记 `not-measured`，不再继承 `:248` 的初值 `true`。
9. **模式与 policy version 随 run 落盘** —— 缺任一的结果文件在 `compare.ts` 侧**拒渲染**（同"缺 n_d/p 拒渲染"原则）。报告层不得把不同执行模式的 run 混算成一个 pass 率。
10. **归一与评分是两个纯函数** —— `normalizeOutcome(outcome): ExecutionArtifact` 与 `gradeExecution(artifact, expected, policy): ExecutionVerdict`；`ExecutionArtifact` **即落盘对象**，带完整 raw 与 normalized 结果的 digest 加**配置化的行数上限**（超限只存 digest 与截断行）。拆分是承重的：[R23](R23-comparator-policy-mutation-baseline.md) 须对已存 artifact 离线重打分，且要 raw/normalized 两种 digest。
11. **一能力一实现（D2 去分叉）** —— 下列每项收敛到一份，验收信号是"该符号在仓内只剩一个定义"：两份 `runBatch`（`eval/src/runner.ts:99` 与 `eval-runner/src/runner.ts:49`）、两份 health gate（`eval/src/health-gate.ts` 与 `eval-runner/src/health_gate.ts`）、两份结果比较器（库实现与 `eval-runner/src/runner.ts:358` 私有包装器）、两套 adapter（`eval-cli/src/context.ts` 与 `eval-runner-service/src/index.ts`，保留 eval-cli 侧的 reasoning 提取、event-def 预取、query expansion）。失败分类（`eval/src/classify_failure.ts` 的 `infrastructure`/`timeout`/`patience`）真接入判分路径以服务第 7 条。`eval-cli` 去掉对 `@deepseek-ai/dsh-query-maxcompute` 的直接依赖，改由外部注入。**被删实现的测试必须迁移**，不得跟着实现一起消失。

### executor 的实际接线（核实于 2026-09-09；不要重新实现执行能力）

evaluation **没有**自建 SQL 执行引擎，执行能力一律来自 dsh-data-agent 的 query capability：四个 adapter 类（`packages/eval/eval-cli/src/context.ts:203`、`:227`，`packages/eval/eval-runner-service/src/index.ts:128`、`:184`）全部只是转调 `ctx.get('query').execute(...)`。所以第 11 条「去分叉」收敛的是这层 adapter，**不是**执行引擎。

但**执行器接口有三种形状**并存，「单一端口」指的是收敛它们，须知道各自归属：

| 形状 | 位置 | 归属 |
|---|---|---|
| `CaseSqlExecutor = (sql) => Promise<ExecutionResult>` | `packages/eval/eval/src/types.ts:141` | dsh-eval 库 |
| `interface QueryExecutor` | `packages/eval/eval-runner/src/types.ts:225` | eval-runner |
| `interface OdpsExecutor` | `packages/data/nl2sql-engine/src/stand-in-odps.ts:39` | **engine 侧（非 eval）** |

两处偏离在本票收口：`eval-cli` 自己动态 import 并挂载 `MaxComputeQueryEngine`（`context.ts:750`），即包依赖里直连具体 provider——改为外部注入；audit 脚本 `spawn maxc`（`case-expected-value-audit.mjs:55`）是仓内唯一真正绕过 query capability 的执行路径。

### 执行器身份必须落盘（D4 的扩展，2026-09-09 新增）

`--with-query` 的默认 sidecar 是 `packages/query/query-maxcompute/dev/standin-sidecar.mjs`，其文件头自称 **throwaway / fake / owns no real ODPS**；真连数仓须显式 `--sidecar` 指向 `maxc-sidecar.mjs`。而 `RunConfig` 目前**不记 sidecar 路径**（核实：`eventdef-realexec.json` 的 config 无 sidecar 字段），所以历史那条 5.1% 「真执行」基线从记录上无法判定跑的是真 maxc 还是 stand-in。**验收要求：run 记录须落盘执行器身份（sidecar 路径或等价标识），使「真执行」与「stand-in」可事后分辨。** 这属于第 9 条「模式随 run 落盘」——模式不只是 `with_query` 布尔，还包括用了哪个执行器。

### 代码落在哪（由 D2 推出，非新决策）

两个纯函数落在 `dsh-eval`（被单测覆盖的比较器已在此），`eval-runner` 消费；**包名与 `exports` 一律不动**（`dsh-eval-runner` 在仓外有 4 处消费者，`dsh-eval-runner-service` 另有 1 处）。若 [G10](G10-harness-bhe-split.md) 之后重切包边界，这些代码随 [T12](T12-eval-package-consolidation.md) 一起搬。**T1 不得为放置花力气，也不得自行决定包边界。**

## 验收面

- 单一 executor 端口；`QueryResult` 与两份 adapter fork 退役（退役已由 [promote-eval-cli-adapters](../../../.agents/notes/proposed/simplification/2026-09-03-promote-eval-cli-adapters-to-eval-runner.md) 独立提出）。
- 落盘中五种结局可分辨；**`environment-blocked` 与 `case-defect` 不进 `wrong` 分母**。
- 未知 `match_mode` 归 `case-defect`（现 `packages/eval/eval/src/match_modes.ts:62` 返回 `{status:'fail'}`，即拼错模式名被记成模型答错）。
- 比较失败原因不再压成 boolean —— 现 `runner.ts:368-369` 丢掉核心比较器返回的 `AssertionResult.detail`。
- **一次评分可重放**：记录实际执行的 SQL、case 自带的 provenance（原样记录，不解释）、policy version、raw/normalized digest。现 `runner.ts:257` 把证据截到 5 行；对 86 个 `row_count_range` case 而言判定依据是 `rows.length`，存 5 行**无法重算该判定**。
- **离线重打分可用**：换 comparator policy 不回数仓即可重打分，且同一 artifact + 同一 policy version 重打分结果稳定。这是 R23 的前置。
- **截断信号实测，不是假设** —— 用已知超大结果集实测 `rowCount`（取自 maxc 自报的 `row_count`，`maxc-sidecar.mjs:100`）是否与 `rows.length` 分叉。分叉则成立；不分叉则 eval 无截断信号，回落「透传 + 开 provider 缺陷票」。
- **audit 脚本的第三条执行路径收口** —— `packages/eval/eval-cli/dev/case-expected-value-audit.mjs:55` 现在直接 `spawn maxc`；改走同一 executor 端口（T11 已明确把这项移交 T1）。
- 回归集覆盖 R1 §6 清单：重复行、NULL vs 0、浮点边界、字符串数字、列排列、额外列、有/无 `ORDER BY`、多个 accepted result、超时、gold failure、单快照假阳性。
- 按 [playbook](../playbook.md) 的 T-伴随-eval 规则跑一次 eval 并记入 [`../research/experiment-audit-log.md`](../research/experiment-audit-log.md)。**第一批用 T11 的 39-case 对账重跑**（须复现 event MATCH=2/STALE=16 + DWS 13/0），不是 k11-v2 全量 pass_rate。

## 覆盖面得失（须写进结论，不得含糊）

T1 上线后真执行判分覆盖 **57 个 `scalar_exact` case**（它们至少断言一个真实值）；**86 个 `row_count_range` 仍只查行数**，要等 [G1b](G1b-ground-truth-lifecycle.md) 的语料重建才能纳入；25 个 DELIVERY-only case 记 `not-measured`。**不得把"143 个 case 已被执行级评分"写进任何结论或提交说明。**

## 两处行为变化，不是纯重构 —— 必须带 re-baseline

1. **列语义冲突** —— `mapQueryOutcome` 的 `zipRow` 按**列名** key（`packages/eval/eval/src/classify_failure.ts:115-124`），而 runner 私有比较器按**位置** key `col${i}`（`runner.ts:360-367`，注释理由是 aliases 因模型/方言而异）。二者直接矛盾；凡模型用了不同别名的 case 都可能翻面。取值由 [R23](R23-comparator-policy-mutation-baseline.md) 定；T1 须记录**哪些 case 因此翻面**，不得当作回归失败掩掉。
2. **pending → 不计分，分母会变** —— `MAXC_WAIT_SECONDS`（默认 `60`）**同时**控制 sidecar 的 `maxc query run --wait <N>` 窗口（`maxc-sidecar.mjs:44`、`:141`）与 eval-cli 派生的工具调用超时（`packages/eval/eval-cli/src/context.ts:778-779`，`(wait + 60) * 1000`）。event-view 查询实测 68s，故默认 60 会把 event case 推成 pending → 按第 7 条落 `environment-blocked`，从 `wrong` 分母中移出。audit 脚本自己用 `--wait 300`。**开工前须固定一个值并写进 run 记录**：取 ≥300 让 event 查询同步完成，或保留 60 并接受 event case 落 `environment-blocked` —— 两种选择产出的分母不同，**同一批内不得中途更换**。

## 合并 adapter 时两个容易踩的坑（2026-09-09）

1. **`'done'` 白名单不得静默丢失** —— `eval-cli` 侧接受 `state === 'done' || 'completed'`（`context.ts:239`），`eval-runner-service` 侧只接受 `'completed'`（`index.ts:200`），而 `QueryOutcome` 类型只有 `completed`/`pending`/`failed`。合并四个 adapter 时必须**显式定义 state 白名单**，否则某个返回 `'done'` 的路径会从“成功”静默变成 `environment-blocked`。
2. **默认 sidecar 是假的** —— 见上「执行器身份必须落盘」：不显式 `--sidecar` 指向 `maxc-sidecar.mjs`，`--with-query` 跑的是 throwaway stand-in。验收的 39-case 对账必须用真 maxc，否则 MATCH/STALE 计数不可信。

## 前置（开工前需就位）

- **[T11](T11-loader-provenance-strip.md) 全部验收通过**，含 39-case 对账复现。T1 读 reference SQL 与模板解析都依赖它。
- **warehouse 凭证与真 sidecar 可用**：`MAXC_CONFIG`（`context.ts:767`，默认 `~/.maxc/config.yaml`）；`--with-query` 时还需 `ODPS_ACCESS_ID`/`ODPS_ACCESS_KEY`/`ODPS_PROJECT`/`ODPS_ENDPOINT`（`main.ts:190-193`）；且必须 `--sidecar` 指向真 `maxc-sidecar.mjs`（默认是 throwaway stand-in）。
- **LLM 侧凭证**：`DASHSCOPE_API_KEY`（走 credential seam / `~/.dsh/.credentials.yaml`，非 process.env）、`EVAL_LLM_PROVIDER`、`EVAL_LLM_MODEL`（三者必须显式设，无静默 fallback；既有基线用 `qwen3.7-max`，换模型即换基线）。
- **`MAXC_WAIT_SECONDS` 取值已定**（见上一节），并作为 run config 的一部分落盘。
- **一个已知超大结果集**：截断信号实测的物料，须事先备好能触发截断的查询或表；备不出来就按"回落透传 + 开 provider 缺陷票"走，并在票里写明原因。
- **eval run 的命令面**：`--with-query`（真执行，缺它按第 8 条只会得到 `not-measured`）、case 目录指向 `rbi-10000251-exec`、`pass_k=3`、必要时 `--sidecar`。
- **软前置的边界**：
  - [G1b](G1b-ground-truth-lifecycle.md) 未解可开工 —— T1 只把 case 自带的 provenance **原样记录**，不判断 `anchor_ds` 是否有效锚点、不回填 expected。一旦要解释 provenance 或派生 expected，就越界。
  - [G10](G10-harness-bhe-split.md) 未解可开工 —— 包边界不动（见上）。
  - GA-EVAL-CASESET-EVENT-ANCHOR 未解可开工 —— 但它 blocks 任何用 real-exec `execution_match` 衡量 event case 正确性的**解读**：本批的 39-case 重跑以"复现 MATCH/STALE 计数"为验收，任何 pass 率解读须标注"event 口径未定"。

## 不在本票范围

- case migration 与 expected 值重新派生（[G1b](G1b-ground-truth-lifecycle.md)）。
- 目标 Evaluation foundations 与包边界重切（[G10](G10-harness-bhe-split.md) → [T9](T9-evaluation-foundations.md)；本批不动包边界，最终 cutover 见 [T12](T12-eval-package-consolidation.md)）。
- comparator 默认值与容差（[R23](R23-comparator-policy-mutation-baseline.md) 提供 mutation 证据后再定）。
- loader 保住 provenance 与模板解析（[T11](T11-loader-provenance-strip.md)，同批但独立验收）。
- judge 侧的任何改动（方向 2/3/8）—— 本票只切断 judge 对 execution 维度的写入，不动 judge 自身。

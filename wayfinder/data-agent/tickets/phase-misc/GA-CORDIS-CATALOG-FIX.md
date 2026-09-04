# GA-CORDIS-CATALOG-FIX — typert unknown + 6 道 masked catalog gates + result-cache-memory 测试 + suite green

**Type**: task（test-failure triage + fix；subagent 并行 review/test）
**Phase**: misc
**Assignee**: claude-code · 2026-09-04（this session）
**Status**: ✅ resolved 2026-09-04（full suite 0 failures：998 files / 16118 pass / 123 skipped，251s）
**Surfaced by**: `.tmp/test-final.txt`（上一 session test 结果：11 failed files / 20 failed tests / 16031 passed）。上一 session 只诊断到 typert 这一层（"cordis-catalog typert 拒 `metadata: Record<string,unknown>`"），未察觉 typert abort 掩盖的下游 gate 栈。
**Scope**: 把 test-final.txt 的 20 个失败分类 + 修掉所有 fork 自有失败 + subagent 并行 code review/test 验证 suite 全绿。
**Related**: [result-cache-service](result-cache-service.md)、[PB-deferred-eval-runner-fail-loud-runbatch](PB-deferred-eval-runner-fail-loud-runbatch.md)、[GA-AUDIT1-followup-findings](GA-AUDIT1-followup-findings.md)

## 20 个失败的分类（triage）

test-final.txt（Sep 3 02:43）的 20 个 failed tests，逐个核实（git diff --stat upstream/master + 重跑）后分 4 类：

| 类别 | tests | 处理 |
|------|-------|------|
| **fork 自有（当前还在挂）** | result-cache-memory #9、cordis-catalog #19-20 = 3 | 修（见 Resolution §1 §2） |
| **stale（已自愈）** | gen-tool-catalog #11-16（6）、tool-present-table #10 = 7 | 标 stale（manifest `9cbd3a8463` 9/3 10:42 补全、晚于 test-final 7.5h；chart.type 校验 `c3827ca5e3` 8/27 提交。均非当前失败） |
| **上游（fork 没改）** | ui-primitives #7、ui-theme #8、tool-bash #17、native-command #18、locale #3 = 5 | `git diff --stat upstream/master` 空 → upstream，跳过 |
| **环境性 flaky** | install-lefthook #1-2、translation-pairing #4-6 = 5 | fork 改动只是 timeout 30→90s 缓解 / 重构（tsc 干净）；失败是满负载下 git/子进程时序超时 |

→ 20 = 3 fork-own + 7 stale + 5 upstream + 5 env。**真正当前还在挂的只有 3 个 fork-own。** 用户先前 framing 的"13 个失败"= 9 类 13 tests，漏了 gen-tool ×6 + present-table ×1（恰是 7 个 stale）。

## Resolution

### §1 result-cache-memory #9 — 测试 bug

`overwrites (no isError) when the same SQL re-runs with changed rows`：测试在同一个 ctx 上**重复注册** `query_data` 来模拟"数据变了"，但 `NamedEntries` 按名唯一、重复注册被设计禁止（`tool "query_data" is already registered (for a per-agent variant, register through that agent's agent.ctx instead)`）。缓存本体（`MemoryResultCache.put` 对 `qr_` id 静默覆盖、永不抛错——源码注释明示 "a throw would turn a successful query into isError and serve stale rows"）本就对。**修**：注册一次 + 执行两次（`run` 计数器让 `execute` 先回 `[[42]]` 再回 `[[99]]`），忠实模拟"同 SQL 重跑、行变了"。17/17 通过。
〔`packages/data/result-cache-memory/tests/result-cache-memory.spec.ts`〕

### §2 cordis-catalog #19-20 — 代码 bug（typert 只是第 1 层，共 7 道 gate）

typert 自 8/25（`metadata` 变 `unknown` 那次 commit `2ebc0000191`）起在 `@Remote` 边界直接抛 `Remote boundary contains unconstrained unknown data`，`projectCordisCatalog` 在 typert 阶段中止，**下游 6 道 catalog 完整性 gate 全被掩盖**。修 typert 后逐层浮出、逐层修：

1. **typert Remote boundary**：`EvalResultRecord.metadata: Readonly<Record<string, unknown>>` → `Record<string, Json>`（递归 JSON `string|number|boolean|null|readonly Json[]|{readonly [key:string]:Json}`，仿 `@deepseek-ai/dsh-schema-gateway` 的 `Json` 先例——evidence-query `"dependencies":{}` 不能引外部包，本地定义）— `evidence-query/src/types.ts`
2. **events JSDoc `@mode`**：fork 8/30 加的事件 `evidence/eval-run-completed`（`df495b2edf1` W15）没写 JSDoc（缺 `@mode emit` + 描述）— `api/remotes/src/types.ts`
3. **events type-link**：4 类型登记进 `TYPE_LINK_EXEMPTIONS`（PatrolConfig / PatrolProposedEdit / PatrolRoundSummary / ManagementSessionDescriptor）
4. **events scope-page**：`patrol` / `management-session` → `EVENT_SCOPE_PAGE`→`data-agent.md`（packages/data/* 的子系统主页）
5. **services JSDoc**：9 方法补 `@returns`/`@param`（result-cache `get/put/has`、management-session `getActive/listActive/isManagementSession`、patrol `isRunning/getState`、schema `corpusVersion`）— 4 包
6. **services type-link**：4 类型登记（CreateManagementSessionOptions / PatrolState / ResultEntry / DefinitionSnapshot）
7. **partition gate**：`resultCache`→`SERVICE_PAGE`（host class 会被投影渲染，不能 exempt——初判 exempt 错，gate 报 "rendered but still listed"）；`evidence`/`admin` scope→`EVENT_SCOPE_PAGE`；`results`/`contextLayer`→`SERVICE_WALK_EXEMPTIONS`（client-side 不可见）
8. **byte-for-byte**：`npm run gen-cordis-catalog` 重生成 11 committed 工件（`api-catalog.ts` + `docs/subsystems/{core,data-agent,session,tools,typert}.md`/`.zh.md` + pair records）。`verify-cordis-catalog --check` 报 "97 up to date"。2/2 通过。

### §3 7 个 newly-revealed 失败（修 typert 后浮出；fork 自有但被掩盖 / 用户 WIP 引入）

修好 §2 的 7 道 gate 后跑全套，浮出 7 个 test-final.txt 里没有的新失败（typert abort 掩盖 / 用户 session 期间新提交引入）：

- **`ui-semantic-layer/tests/wiring.spec.tsx` ×5**（`TypeError: useStore is not a function`）：用户 commit `e8238003688`（GA-WIRING-impl session-scoped slot store）把 `useStore` 改成 prop，测试 mock 没跟（`SemanticLayerEvidence`/`SemanticLayerSchemaExplorer` 在 active-gate 前调 `useStore`）。**修**：补 `useStoreStub`（仿 `useSessionsStub`，`(selector) => selector({ selectedAsset: null })`，匹配 `selectionStore.init` 的 `{ selectedAsset: null }`）。15/15 通过。〔用户 commit `60740d5197` 已标注"5 个失败为先前已存在（e8238003688 引入）"〕
- **`eval-runner-service/tests/eval-runner-service.spec.ts` ×2**（`provider and model are required (R8: configure the eval LLM gateway in cordis.yml)`）：用户 PB-COMPLY R8 guard（runBatch 处 fail-loud，`index.ts:434`）要求 provider/model；2 个 runBatch 集成测试（describe 名 "stubbed seams, real engine"）没传。**修**：测试构造传 `provider:'stub-provider', model:'stub-model'`（stub LLM `makeStubLlm()` 的 `stream` 忽略参数，stub 值 inert，仅过 R8 guard 的 non-empty 检查；不弱化任何 assertion）。8/8 通过。〔`PB-deferred-eval-runner-fail-loud-runbatch` 决策 A 的测试侧补全〕

## 改动文件

- **源码**：`packages/data/evidence-query/src/types.ts`、`packages/api/remotes/src/types.ts`、`packages/data/result-cache/src/index.ts`、`packages/data/management-session/src/index.ts`、`packages/data/patrol-mode/src/index.ts`、`packages/data/semantic-layer/src/index.ts`
- **测试**：`packages/data/result-cache-memory/tests/result-cache-memory.spec.ts`、`packages/client/ui-semantic-layer/tests/wiring.spec.tsx`、`packages/eval/eval-runner-service/tests/eval-runner-service.spec.ts`
- **catalog 策略**：`scripts/gen-cordis-catalog.ts`（+8 `TYPE_LINK_EXEMPTIONS`、+4 `EVENT_SCOPE_PAGE`、+4 `SERVICE_PAGE`、+2/−1 `SERVICE_WALK_EXEMPTIONS`）
- **重生成工件**：`packages/extensions/tool-cordis/src/api-catalog.ts`、`docs/subsystems/{core,data-agent,session,tools,typert}.md`/`.zh.md` + 对应 `.i18n.yaml`

## 验证（subagent 并行）

- **code review（subagent）**：clean，no correctness bugs。`useStoreStub` 语义正确（Zustand `useStore(selector)=selector(state)`，`{selectedAsset:null}` 匹配 `selectionStore.init`）；eval stub `provider`/`model` 仅走被 stub 覆盖的 LLM 路径（`CtxLlmAdapter.complete`→`ctx.llm.stream`，stub 忽略参数），`RunResult.config` 仅作 attribution metadata；无 assertion 被弱化。
- **full suite（subagent，2026-09-04）**：**0 failures** — 998 files passed / 16118 tests passed / 123 skipped（251s）。test-final.txt 的 20 失败全清：3 fork-own 修掉（§1 §2）、7 stale 已自愈、10 上游/环境 timeout 本轮未复现（负载低，install-lefthook 38/38、translation 17/17 均过）、7 新失败修掉（§3）。无任何 touched package 回归。

## 并发注记

仓库本 session 期间多了 5 个新 commit（用户 wayfinder/CB-1/T10 工作，`469fd8967b`…`60740d5197`）。中途一次 git 操作（stash/restore）把未提交的 `types.ts`/`api-remotes`/`result-cache` 改动**还原回 HEAD** 过一次（lib 已带 fix、src 回退成 `unknown`，typert 又挂）；重新应用后粘住。提交时注意别漏这些文件，且别在 agent 改文件时跑 stash/restore。

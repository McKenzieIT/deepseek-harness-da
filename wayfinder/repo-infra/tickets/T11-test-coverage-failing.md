# T11 — test:coverage gate 红（failing tests）

**Type**: task（或 research——需先定 failing test + 判定 regression vs flake）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: PR #44 CI `node 24 / coverage` 失败 step "Run exhaustive coverage"（job 101598597808，run 34074751506，2026-09-07 02:00，550.96s）。pre-existing（latent，非 W20；非 static gate——是真实 test 失败 OR flake）。**verify on current master cf813c18c0 before fixing。**

## Question

`test:coverage` gate 红：vitest 报 `Test Files 2 failed | 249 passed (251)` + `1 failed | 247 passed | 3 skipped (251)`（两次 run：`test:coverage` + `test:coverage-exempt-heavy`）。

dominant error：`renderSlot('root') before any 'root' registration (boot order)`（多次出现，疑 boot-order 相关 test）。其余 `Error:` 消息（`entry boom`/`entry A boom`/`selector boom`/`inject boom`/`session create failed: internal: attach exploded`/`definition vanished`/`module table missing`/`gone`/`presenter exploded`）疑为 error-path 测试的预期 throw（非 failure）——需定位确认哪些是真实 failure。

非 W20 引入（W20 不 touch 任何 test 源码；`built-lib.e2e.ts` 在 `vitest.e2e.config.ts` 跑，不在 `test:coverage` 的默认 `vitest.config.ts`）。latent on master。

## Scope

从 coverage log（CI job 101598597808，~17.6k lines）定位 failing test files（grep `Test Files` context、`renderSlot('root')` context、`❯ packages/`、`Failed Suites`/`Failed Tests` header -A context），判定 real regression vs flake，修 OR 标 flake，验 `pnpm run test:coverage` 绿。先 verify on current master。

## 2026-09-15 deterministic expectation batch

在 `origin/master` `ac19aca80333aa7cd6526e23af07f16234cc6c1f` 上复现并修正 6 组稳定漂移：CI workflow 的 supersession、runner 与 owner 条件；Cloudflare preview owner/runner；删除已由显式 alias 取代的 invariant wildcard；补登 `gen-package-readme-skeleton`；同步 duplicate-safe package 清单；将 tool catalog 预期同步到实际发布的 88 个 schema。focused run 为 6 files / 106 tests 全绿，`check:ci:static` 51/51。

`package-invariants.spec.ts` 另暴露了一项独立政策实现缺口：若按现有 Agent Note 扫描所有 package，会立即发现 65 个 README 缺 package-specific omission reason。该项不混入本批机械 expectation 修正，保持本票 open，由独立 README/invariant 批次承接。

## 2026-09-15 runtime fixture and generated-remote dependency batch

四项稳定失败已按当前契约修复：credentials fixture 使用 version 1 `refs` 文档；subagent 断言 `personaPrefix`；client bundle 断言 `zod` 属外部依赖；`schema-gateway`、`evidence-query` 与 `result-cache` 声明 generated remote 实际 import 的 `zod` runtime dependency。focused run 为 4 files / 94 tests 全绿，`verify-package-dependencies` 与 `verify-runtime-closure` 均通过。

## 2026-09-15 client visual-token batch

`ui-theme` 的两项 repository-wide CSS 检查稳定复现 24 个 neutral-token `1px` border 与 3 个未配对的 full-round radius。受影响组件统一使用 `0.5px` neutral border，并在满圆角声明旁加入 `corner-shape: round`；focused run 为 2 files / 11 tests 全绿。

## 2026-09-15 consumers snapshot batch

`tool-subagent` 的工具输出 schema 遗留已退场的 `costs` 字段，使 30 个 recorded-session system-prompt 快照稳定漂移；该字段无生产者、无消费者，并违反 `UM-QODER-SUBAGENT-RETIRE` 的零匹配验收。删除遗留 schema 字段后，以 `ptc-turn` 为代表的 focused replay 转绿。剩余 `cordis-inspect-jsdoc` 漂移来自已决定保留的 `ToolExecutionInput.scopeId`，已按当前 API 刷新对应 V3 fixture；全量 headless replay 为 95 passed / 2 platform-skipped。

## 2026-09-15 expected-output title-settlement batch

DeepSeek defaults 用例在收到主请求后仅保活固定 180 ms，却断言后台标题请求一定已到达；PR #148 的真实 CI 以 1 个请求对 2 个请求稳定暴露竞态，而同一用例独立运行通过。该用例改用现有 `waitForTitleRequest` 条件：fixture 以收到 `max_tokens: 64` 请求为释放主响应的状态信号，不依赖调度时序。

## 2026-09-15 coverage Python environment batch

Linux 与 Windows coverage runner 都能启动系统 `python3`，但没有 data runtime 明示承诺的 pandas/numpy；对应两项用例均以 `ModuleNotFoundError` 失败。两个 coverage job 统一安装 Python 3.10 及固定版本 `numpy==2.2.6`、`pandas==2.3.3`。由于 runtime 有意使用 `env: {}` 隔离模型代码，裸 `python3` 不会继承 setup-python 注入的 PATH；coverage step 通过 `DSH_TEST_PYTHON_PATH` 把 action 输出的绝对解释器路径交给测试 fixture，workflow spec 锁定安装与传递两段配置。

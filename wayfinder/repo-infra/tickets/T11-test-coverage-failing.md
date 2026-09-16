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

## 2026-09-15 generated Remote artifact-plane batch

`evidence-query-remote.client.spec.ts` 在 zero-build coverage 中直接加载 `api-remotes` 的完整 Client assembly，而该 assembly 依赖多个仅由 build 生成的 `./remote` 导出，因此 clean checkout 在首个 `agent-presets/remote` 上加载失败。该断言迁入既有 `built-lib.e2e.ts`：plain Node 在完整 build 后加载真实 `api-remotes` bundle，并显式确认 `remote.evidenceQuery` namespace 已挂载；source-plane coverage 不再读取 `lib/`。

## 2026-09-15 invariant omission documentation batch

`package-invariants.spec.ts` 已钉住 Agent Note 的现行规则，但 gate 的 package discovery 仍只扫描声明过 companion 的包，导致删除空 companion 后的包退出检查。discovery 改为覆盖 package tree 下全部 334 个包，39 个 hand-owned companion 保持完整校验；其余包必须在 README 记录 omission 原因。65 个缺口已补齐中英文句子并重录 sidecar，`verify-package-invariants` 与 902 对 pairing 均通过。

## 2026-09-15 eval CLI network-fixture batch

`loads and runs with fake key` 只替换了凭据，仍把四次 LLM 请求发往默认 AGA endpoint；独立运行受本机网络影响约 4 秒，coverage 争用时撞上测试内部 10 秒子进程上限。fixture 显式把 `DASHSCOPE_BASE_URL` 指到本机拒绝连接端口，使 transport failure 立即且确定地返回；不放宽 timeout，也不依赖外网。

## 2026-09-15 Windows CLI-launch batch

`upstream-monitor.spec.ts` 通过裸 `pnpm exec` 启动被测 CLI；Windows 上 `pnpm` 是 `.cmd` shim，`spawnSync` 无法在无 shell 下执行，三项用例因此得到 status=-1 与空 stdout。启动改为仓库已有的 `process.execPath` + tsx ESM hook 路径，与其他 script 套件一致；同时删除把 spawn 失败伪装成 status=-1 的包装层，使未启动或被信号终止的子进程报出真实诊断而不再伪装为退出码。focused run 为 17 passed。

## 2026-09-15 Windows path-expectation batch

`eval` 的 persistence 用例与 `credentials-keychain` 的 `resolveSpec` 用例都写死了 POSIX 正斜杠，而两项实现在 Windows 上组出的是反斜杠，因此 Windows coverage 稳定失败。两项的组合方式并不相同，必须分别推导。

persistence 项的组合方式就是用例自己已持有的 `join(tmpDir, 'nested', 'deep')`，期望改为断言这一完整路径。该半已有真实 CI 证据：不含本修复的 PR #158（job 104635347170）仍报 `expected 'C:\Users\RUNNER~1\...\nested\deep\...' to contain 'nested/deep'`，本分支的 job 104633154572 已不再报该项。

keychain 项的第一版修复把期望写成 `join('/custom/home', KEYCHAIN_FILENAME)`，被本分支自身的 CI 推翻——job 104633154572 报 `expected '\custom\home\credentials.keychain'`、`received 'D:\custom\home\credentials.keychain'`。根因是 `resolveSpec` 的组合不是单个 `join`，而是 `join(resolveDshHome(config.dshHome), KEYCHAIN_FILENAME)`，其中 `resolveDshHome` 以 `resolve(expandHomePath(selected))` 收尾（`packages/util/home-paths/src/index.ts:87`）：Windows 上 `resolve` 会把 root-relative 的 `/custom/home` 补成当前盘符下的 `D:\custom\home`，而 `join` 不会。期望改为经同一个 `resolveDshHome` 导出，覆盖组合的两段而不是只覆盖后半段——第一版只推导了后半段，这正是它仍然红的原因。

同批修掉一处使该用例无法被审阅的缺陷：`keychain.spec.ts` 的 `FakeKeychain.key` 用一个**字面 NUL 字节**（而非 `\u0000` 转义）作复合键分隔符，git 因此把整个 spec 判为二进制文件，`git diff` / PR diff 只显示 `Binary files ... differ`。改为等价的 `\u0000` 转义后文件恢复为文本，键的语义不变。

## 2026-09-16 expected-output pi-ai 请求语义批次

pi-ai compatibility 用例沿用 PR #149 的 `waitForTitleRequest` 状态门，却仍断言 `server.requests` 总数为 2。该门以「收到 `max_tokens: 64` 请求」为释放主响应的信号，在这条路由上等于让主响应在标题请求到达前只发 SSE 注释；而 `llm-pi-ai` 与 `llm-deepseek` 不同，从不在注释上 `watchdog.pulse()`，注释保活对它无效——负载下标题请求晚于该路由 1000 ms 的 `streamIdleTimeoutMs`，主请求 idle 超时，agent-loop 按 `TIMEOUT` 重试，第三条请求就是逐字节相同的 agent 重试。CI job 104631963514（PR #156 head `71bf17d990`）以 `expected [ { …(8) }, { …(7) }, { …(8) } ] to have a length of 2 but got 3` 记下了这个形状：8 键（带 `tools`）的 agent 载荷、7 键的标题载荷、再一条 8 键 agent 载荷。

断言改为按载荷命名请求：线上预算集合恰为 `{1024, 64}`（1024 是路由 `modelOverrides` 覆盖，64 是标题策略预算，后者就是 PR #149 要等的标题到达状态），去重后的载荷恰为 2 条（重试逐字节相同，因此与尝试次数无关），并逐条校验 DeepSeek 兼容形状：只用 `max_tokens` 而无 `max_completion_tokens`、`model` 与 `reasoning_effort` 为路由默认、`tools` 目录只挂在 agent 请求上。负控：把 fixture 的 `streamIdleTimeoutMs` 从 1000 降到 300 可逐字复现原断言文本并给出 `pi-ai stream idle timeout after 300ms` 的 `llm/retry`，改后同一负控三次全绿；预算写错（1024→2048）与标题缺席（idle 50 ms）都仍然失败。真实 1000 ms 配置在 10 核机上叠 24 个忙循环、6 路并发共 18 次运行始终只有 2 条请求，原失败未能本机复现，故本批证据是「负控可复现 + 断言不再依赖全量条数」，不是「竞态已被本机证伪」。

同一文件在 PR #157（job 104648904893）与 PR #160（job 104659731495）失败的是另一个同胞用例 `keeps provider comments alive and sends DeepSeek defaults through the one-shot app`，形态为 60 s 进程未退出（`headless.expected.e2e.ts:453`），源自 `llm-deepseek` 侧 150 ms `streamIdleTimeoutMs` 反复 `DeepSeek stream idle timeout after 150ms` 重试；它不是请求条数断言，与本批无关。

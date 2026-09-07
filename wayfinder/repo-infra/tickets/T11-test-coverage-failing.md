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

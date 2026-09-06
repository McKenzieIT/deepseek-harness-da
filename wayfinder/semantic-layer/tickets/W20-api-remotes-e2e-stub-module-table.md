---
type: task
status: open
blocked_by: []
---

# W20: api-remotes built-lib e2e stub 不模拟 shell module table

**Branch**: `fix/w20-api-remotes-e2e-stub-module-table`  <!-- 待建；CB-4 红线：下一并行批不得在 PR #30 未 merge/abandon 前启动 -->

## 事实（2026-09-06，CB-4 期间发现）

`packages/api/remotes/tests/built-lib.e2e.ts` 的 `instantiate` stub：

```ts
return handoff.factory(specifier => {
  if (specifier === '@deepseek-ai/cordis') return cordis
  throw new Error('unexpected Client external ' + specifier)
})
```

api-remotes client bundle 的 factory 顶部 `let zod = require("zod")`（typert 生成的 wire schema 引用 `zod.z`，rolldown ESM→CJS interop emit）。stub 只 handle `@deepseek-ai/cordis` → throw `unexpected Client external zod` → e2e 的 big `it()`（"runs root and Agent-scoped calls through generated bundles and real HTTP"）跑不起来。

实测（CB4 worktree）：`pnpm exec vitest run --config vitest.e2e.config.ts packages/api/remotes/tests/built-lib.e2e.ts` → big it() FAIL，trace `Object.factory packages/api/remotes/lib/client.js:7:13` → stub throw。

## 根因

stub 不模拟浏览器 shell 的 module table。shell（`packages/client/web/src/seed.ts` `getStaticModules()`）预置 `PLATFORM_MODULES`（react/react-dom/cordis/ui-slots/ui-primitives + CB-4/PR #30 加的 zod）进 frozen module table；plugin bundle 的 `require(specifier)` 走 shell 解析。e2e stub 应同样返回这些 specifier，而非只 cordis。

**pre-existing**：CB-4 前 api-remotes bundle 也 `require("zod")`（loader-mediated，zod 内联但自引用走 factory param），stub 同样 throw——CB-4 的 platform-module 修复（PR #30）没改变这点（bundle 仍 `require("zod")`，只是从内联变 external）。CI 因 `describe.skipIf(!requiredArtifacts)` + `test:e2e` 无前置 build → latent（从未被 CI 捕获）。

## 范围（fix）

stub 的 `require` 应模拟 shell module table：对 `PLATFORM_MODULES` 里的 specifier（react, react/jsx-runtime, react-dom, react-dom/client, cordis, ui-slots, ui-primitives, zod）返回对应模块，其他 throw。这样 e2e big it() 能跑通（api-remotes bundle 真实 instantiate + 跨 `/api` HTTP 走通）。

**推荐**：直接复用 `getStaticModules()`（`packages/client/web/src/seed.ts`）作为 stub 的 require table——单一真源，`platform.ts` 改了 stub 自动跟（CB-4 加 zod 时 stub 不需再改）。

## 顺带

- e2e big it() 跑通后 = 一条真实解析路径的 api-remotes bundle 行为回归测试。CB-4 的 `platform-zod.client.spec.ts` 是 manifest 静态断言（zod 在 PLATFORM_MODULES）；e2e 是行为断言（bundle 真实 boot + RPC）。两者互补。
- 不在 CB-4（PR #30）范围：CB-4 红线"不碰 W16 的 code"——`built-lib.e2e.ts` 是 W16 的真实解析路径测试。

## 验收

- `built-lib.e2e.ts` 的 big it() 跑通（api-remotes bundle instantiate 不 throw `unexpected Client external zod`）。
- stub 的 require table 与 `getStaticModules()` 一致（单一真源，复用而非硬编码）。
- 前置 `pnpm run build:lib` 后跑 `pnpm exec vitest run --config vitest.e2e.config.ts packages/api/remotes/tests/built-lib.e2e.ts` 绿。

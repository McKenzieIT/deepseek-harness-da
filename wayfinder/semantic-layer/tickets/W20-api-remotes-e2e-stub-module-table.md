---
type: task
status: closed
blocked_by: []
---

# W20: api-remotes built-lib e2e stub 不模拟 shell module table

**Branch**: `fix/w20-api-remotes-e2e-stub-module-table`  <!-- 已建；PR #44；CB-4(PR #30)已 merge 故开分支 -->

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

## Resolution（2026-09-07，PR #44）

**状态**：已关闭。修复提交为 [PR #44](https://github.com/McKenzieIT/deepseek-harness-da/pull/44)（`fix/w20-api-remotes-e2e-stub-module-table`，base master）。

**实现**：stub 改为复用 `getStaticModules()`（built `packages/client/web/lib/index.js` 导出，CB-4 PR #30 已让其含 zod）作 require table——单一真源，`platform.ts`/`seed.ts` 改了 stub 自动跟。require callback 对 `PLATFORM_MODULES`（react/react-dom/cordis/ui-slots/ui-primitives/zod）返回对应模块、其他 throw `unexpected Client external`。built client/web lib 是 browser artifact（boot page CSS Modules 副作用），plain Node 无 CSS loader → test-only `module.register` load hook 把 `.css` import stub 成空（`export default {}`），仅消费 `getStaticModules`，boot page 样式无关。`packages/client/web/lib/index.js` 加入 `requiredArtifacts`（未 build 时 e2e `describe.skipIf` skip，保 latent-skip 契约）。

**实测**（worktree `dsh-W20`，base master `47ef19a26f`）：`pnpm run build:lib` 后 `pnpm exec vitest run --config vitest.e2e.config.ts packages/api/remotes/tests/built-lib.e2e.ts` → 1 passed (946ms)；big it()（"runs root and Agent-scoped calls through generated bundles and real HTTP"）不再 throw `unexpected Client external zod`，跨 `/api` HTTP 走通（rootResult rev 1、rootEdit rev 2、scoped goal、rootEvents 2/scopedEvents 1 全断言通过）。typecheck/knip/verify-client-packages 全绿（46 client packages satisfy rules）；pre-push（verify-no-production-src-on-master + typecheck）绿。

**scope**：不动 bundler/shell——CB-4 PR #30 已落地 platform-module 修复（zod external、shell 预置、bundle 94KB）。本票只动 e2e stub（`built-lib.e2e.ts` 是 W16 的真实解析路径测试，W20 scope 即修它，故 CB-4 红线"不碰 W16 code"不适用）。与 `packages/client/web/tests/platform-zod.client.spec.ts`（manifest 静态断言）互补：本 e2e 是行为回归（bundle 真实 boot + 跨 `/api` RPC）。

# W20 — api-remotes e2e stub 模拟 shell module table Session Prompt

> 本文件是下一 session 的完整 prompt。直接粘贴即可开工。规格见 [W20](wayfinder/semantic-layer/tickets/W20-api-remotes-e2e-stub-module-table.md)。

## 0. 前提（本 session 前已落地）

CB-4（[PR #30](https://github.com/McKenzieIT/deepseek-harness-da/pull/30)，已 merge 到 master `f2896a69e5`）把 zod 做成共享 platform module（`packages/client/web/src/platform.ts` `PLATFORM_MODULES` + `packages/client/web/src/seed.ts` `getStaticModules` + `packages/client/web` devDep），api-remotes client bundle 的 `require("zod")` 现走 shell external 解析（bundle 94KB，zod 不再内联）。浏览器实测 api-remotes 插件加载 + 证据 UI 真实数据 + B→A auto-flip + DashboardView 有样式。

但 `packages/api/remotes/tests/built-lib.e2e.ts` 的 instantiate stub 只 handle `@deepseek-ai/cordis`，对 `require("zod")`（及 react 等 PLATFORM_MODULES）throw `unexpected Client external zod` → e2e big it() 跑不起（CI 因 `describe.skipIf(!requiredArtifacts)` + `test:e2e` 无前置 build → latent）。本票让 stub 模拟 shell module table，e2e 跑通 = CB-4 的行为回归测试（与 manifest 静态断言 `packages/client/web/tests/platform-zod.client.spec.ts` 互补）。

## 1. 环境/分支契约（session 启动第一步）

```sh
git worktree add ../dsh-W20 -b fix/w20-api-remotes-e2e-stub-module-table master
cd ../dsh-W20
node scripts/install-lefthook.mjs   # 重新生成 worktree-local hooks
pnpm install
```

- worktree: ../dsh-W20
- 分支: fix/w20-api-remotes-e2e-stub-module-table（W20 票已声明）
- 基线: master（已含 CB-4 PR #30 + CI 修复 PR #31 sandbox-yaml / #33 seatbelt-OOM）
- 禁止直推 master。所有提交落本分支 → gh pr create。

## 2. 直推 master 白名单

本票 diff 触及 `packages/api/remotes/tests/built-lib.e2e.ts`（test 文件）→ 必须走分支 + PR，不得直推 master。

## 3. 任务正文

### 目标（一句话）

让 `built-lib.e2e.ts` 的 instantiate stub 模拟浏览器 shell 的 module table（返回 `PLATFORM_MODULES`），使 e2e big it() 跑通——api-remotes bundle 真实 instantiate + 跨 `/api` HTTP 走通，作为 zod 解析的行为回归测试。

### 根因（已核查，见 W20 ticket + CB-4 Resolution）

stub（`packages/api/remotes/tests/built-lib.e2e.ts` 的 `instantiate`）：

```ts
return handoff.factory(specifier => {
  if (specifier === '@deepseek-ai/cordis') return cordis
  throw new Error('unexpected Client external ' + specifier)
})
```

api-remotes bundle factory 顶部 `let zod = require("zod")`（typert 生成 wire schema 用 `zod.z`，rolldown ESM→CJS interop emit）。stub 只 handle cordis → throw。**pre-existing**（CB-4 前 bundle 也 `require("zod")` loader-mediated，stub 同 throw；CI latent）。CB-4（platform-module 修复）没改变这点（bundle 仍 `require("zod")`，只是从内联变 external）。

### 实施步骤

1. 读 `packages/api/remotes/tests/built-lib.e2e.ts` 确认 stub 位置（`instantiate` 函数）+ `requiredArtifacts` 机制（11 个 lib artifact）。
2. stub 改为模拟 shell module table：对 `PLATFORM_MODULES`（react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis, @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-primitives, zod）返回对应模块，其他 throw。**推荐复用 `getStaticModules()`**（`packages/client/web/src/seed.ts`）作 require table——单一真源，`platform.ts` 改了 stub 自动跟。
3. 前置 `pnpm run build:lib`（建 requiredArtifacts）→ `pnpm exec vitest run --config vitest.e2e.config.ts packages/api/remotes/tests/built-lib.e2e.ts` 绿（big it() 不再 throw `unexpected Client external zod`，跨 `/api` HTTP 走通）。
4. typecheck + knip + verify-client-packages 绿。

### 顺带（同链，本 PR 一并修？）

- 无。W18（evidence-query runs-list/delta data-store）/ W19（DashboardView i18n）是 W16 的独立 follow-up，不在本票。CI infra 之前的 2 失败（create-github-app-token 缺 client-id + `policy.mjs` 错 repo 路径 `deepseek-harness/deepseek-harness` vs `McKenzieIT/deepseek-harness-da`）——master `0987c8220d` 的 wayfinder doc 称 "all known CI red resolved"，本 session 验证时若仍红则记一下。

### 上下文/红线

- CB-4 红线"不碰 W16 code"是对 CB-4 的；本票（W20）scope 就是修 e2e stub（`built-lib.e2e.ts` 是 W16 的真实解析路径测试）——W20 触碰它是本票正题，不冲突。
- CB-4（PR #30）已 merge：api-remotes bundle `require("zod")` external、shell 预置 zod、bundle 94KB（zod 不再内联）。本票不动 bundler/shell，只动 e2e stub。
- CL-22：e2e 跑通是可重复的自动化行为回归测试（非 n=1 浏览器验证），不受 CL-22 n=1 caveat 限制。
- pass^k k=3 live：本票不碰 eval/pass^k，无影响。

### 坑（已知）

- stub 复用 `getStaticModules()` 时：e2e 在 `packages/api/remotes` 的 tsconfig 上下文跑，`getStaticModules()` import 的 react/react-dom/cordis/ui-slots/ui-primitives/zod 必须能 resolve——可能需从 `packages/client/web` re-export 或调 tsconfig paths。CB-4 已加 zod devDep 到 packages/client/web。
- e2e `describe.skipIf(!requiredArtifacts)`：必须先 build（建 11 个 lib artifact）e2e 才跑——`test:e2e` 单跑（无 build）会 skip，这正是 latent 的原因。验证必须 `pnpm run build:lib` 前置。
- rolldown CJS bundle 的 factory `(require) => {...}`：stub 的 require 是 factory param；stub 返回的模块形状必须与 bundle 期望一致（zod 的 `z` 命名空间、cordis 的 Context 等）。
- 大输出截断：vitest e2e 输出 redirect 到 `.tmp/*.log`，grep/tail 读回。
- git pager：`GIT_PAGER=cat` 或 `--no-pager`。
- 网络：github push 偶有 75s 超时，push 超时重试。`gh pr create --head` 显式 + `gh repo set-default McKenzieIT/deepseek-harness-da`。

## 4. 收尾（Lead integration boundary）

- [ ] `pnpm run build:lib` 后 `pnpm exec vitest run --config vitest.e2e.config.ts packages/api/remotes/tests/built-lib.e2e.ts` 绿（big it() 跑通）
- [ ] pnpm run typecheck 绿
- [ ] pnpm run knip 绿
- [ ] pnpm run verify-client-packages 绿
- [ ] gh pr create --base master --head fix/w20-api-remotes-e2e-stub-module-table，过 dsh-pre-push-checks（pre-push: verify-no-production-src-on-master + typecheck）
- [ ] PR 正文标注：W20 = CB-4 follow-up，补 e2e 行为回归测试（stub 模拟 shell module table，复用 `getStaticModules` 单一真源）；不动 bundler/shell（CB-4 PR #30 已落地）；CB-4 红线"不碰 W16 code"不适用（本票 scope 即修 e2e stub）。
- [ ] wayfinder：W20 ticket Resolution（stub 改为复用 `getStaticModules` + e2e 跑通）+ status: closed + map 更新。
- [ ] 下一并行批不得在本 PR 未 merge / 未 abandon 前启动。

## 验收（票的）

- `built-lib.e2e.ts` big it() 跑通（api-remotes bundle instantiate 不 throw `unexpected Client external zod`，跨 `/api` HTTP 走通）。
- stub 的 require table 与 `getStaticModules()` 一致（单一真源，`platform.ts` 改了 stub 自动跟）。
- 前置 build 后 e2e 绿。

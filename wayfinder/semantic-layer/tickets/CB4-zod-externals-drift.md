---
type: grilling
status: closed
blocked_by: []
---

# CB-4: zod dep 移除导致 dsh-api-remotes client bundle 启动失败（master 回归）

**Branch**: `fix/cb4-zod-externals-drift`  <!-- 待建；本地工作树已有解封修复，未提交 -->

## 事实（2026-09-04 实测）

用户重启 `dsh web` 报：
```
failed to import loader entry ccdcec8e (@deepseek-ai/dsh-api-remotes):
client-modules: require("zod") missed the module table — not a platform seed word,
not a materialized module, and no registered package factory
(a build-time externals drift, or a dynamic dependency that did not arrive)
```

→ 整个 include 组失败 → 按钮消失（与 [CB-1](CB1-cold-boot-blockers.md) 同形状的"整组失败"）。

## 根因

**回归源**：commit `52330a98fa`（GA-AUDIT1，Phase B "Cordis 合规"）把 `zod` 从两个包的 dependencies 里删了，理由是 knip 标记 src 不 import zod：
- `packages/data/schema-gateway/package.json`：`dependencies: { "zod": "^4.4.3" }` → `dependencies: {}`
- `packages/data/scope-registry/package.json`：删 `zod`（保留 `js-yaml`）

**机制**（实测验证，非推测）：`dsh-api-remotes` 的 client bundle（`lib/client.js`，220KB）会内联 zod 源码（多半体积是 `zod@4.4.3/v4/core/core.js`），并在 factory 顶部保留一个 `require("zod")` 自引用。内联的 zod 源码靠 `require("zod")` 拿到自己的导出再自引用（`zod.traits.has(...)` 等）。

- **zod 在某处声明为 dep 时**：bundler 把内联的 zod 正确注册进 module table（key="zod"）→ `require("zod")` 解析成功。
- **zod 从 schema-gateway 删掉后**：bundler 仍能从根 `node_modules` 找到 zod 源码内联，但**不再注册**进 module table → `require("zod")` "missed the module table" → 整组失败。

**关键**：api-remotes 的 src、schema-gateway 的 src、schema-gateway/remote（`typert.remote-client.js`，13KB 自包含）**都不 import zod**。zod 是被 bundler 通过 resolution 链拉进 api-remotes client bundle的（具体触发点未定位——可能是 tsdown 的 client-bundle-purity 插件或 platform runtime）。但 zod 需要在 **schema-gateway** 声明为 dep 才能正确注册——这是实测结论：只在 schema-gateway 加回 zod，api-remotes bundle 的 `require("zod")` 从 1 降到 0，boot 200。

## 已验证的解封修复（本地工作树，未提交）

```diff
# packages/data/schema-gateway/package.json
-  "dependencies": {},
+  "dependencies": {
+    "zod": "^4.0.0"
+  },
```

实测：`require("zod")` 计数 1→0、bundle 220KB→724KB（zod 完整内联为 module-table 条目）、`dsh web` boot `GET / → 200`、`verify-client-packages` gate 仍过。

**但此修复不能直接合，有张力**（见下）。

## Question（需决策）

1. **zod 该声明在哪**：schema-gateway 的 src 不 import zod，加回它 = 推翻 GA-AUDIT1 的清理。但实测只有 schema-gateway 加 zod 能修（scope-registry 加不加不影响 api-remotes）。真正 runtime 消费 zod 的是谁？为何 bundler 必须经 schema-gateway 声明才能注册？需要定位 tsdown/rolldown 的 externals 注册逻辑。
2. **knip 张力**：`knip.json` 的 `ignoreDependencies` 只有 `@yarnpkg/cli-dist`、`lightningcss`，zod 未豁免。若直接加回 zod 而无豁免，下次 GA-AUDIT 类清理会再次标它 unused 并删除 → 回归重现。需要 either (a) knip 加豁免 + 注释说明 bundler 需要、(b) 找到真正该声明 zod 的包、(c) 改 bundler 不依赖 dep 声明也能注册。
3. **scope-registry 的 zod 该不该一起加回**：本次解封只需 schema-gateway。但 scope-registry 也被 GA-AUDIT1 删了 zod——它是否有同类 latent 回归（只是没触发到）？
4. **是否归 CB-3**：CB-3 管"include 组失败隔离"。本票根因是 dep 声明缺失（不是失败粒度），但症状同（整组静默消失）。是否合并到 CB-3 作为"dep 声明缺失"子类，还是独立？

## 关联

- **CB-1**：同症状（整组失败→按钮消失），不同根因（CB-1 是 loader id 重复 + enrichment fail-loud；本票是 dep 声明缺失导致 bundle 自引用解析失败）。
- **GA-AUDIT1（`52330a98fa`）**：本次回归源。它的 zod 清理基于"src 不用"的 knip 判断，但没考虑 bundler 的 module-table 注册需要 dep 声明。需与该 session 协调正式修复（它最清楚当初删的范围 + 是否有 follow-up）。

## 关键文件

- `packages/data/schema-gateway/package.json`（本地工作树已加回 zod，未提交）
- `packages/api/remotes/lib/client.js`（220KB，含 `require("zod")` 自引用 + 内联 zod 源码）
- `packages/client/tsdown.client.ts`（clientBundle + externals 配置，zod 注册逻辑在此或其插件）
- `packages/client/web/src/platform.ts`（PLATFORM_MODULES seed 列表，zod 从未在里面）
- `knip.json`（ignoreDependencies，zod 未豁免）
- 回归 commit：`52330a98fa`（Phase B "zod 移除 (schema-gateway/scope-registry)"）

## 验收

- `dsh web` 在 master HEAD 上能 boot（无需本地未提交修复）
- zod 的声明位置有明确决定 + knip gate 不会再次误删
- scope-registry 的 zod 状态明确（加回 or 证无需）
- 一条回归测试：api-remotes client bundle 的 `require("zod")` 计数 = 0（防再现）

## Resolution（2026-09-06，PR #30）

**状态**：已关闭。修复落地为 [PR #30](https://github.com/McKenzieIT/deepseek-harness-da/pull/30)（`fix/cb4-zod-externals-drift`，base master）。

**根因更正**：票里"bundler 把内联 zod 注册进 module table，需 zod 在 schema-gateway 声明为 dep"是**错误归因**。实测（CB4 worktree，origin/master 481d8cc480）：api-remotes client bundle 在 schema-gateway 有/无 zod dep 时**字节级几乎一致**（232725 vs 231841 字节），`require("zod")` line 7 两边都有，zod 始终通过 `alwaysBundle` 内联（tsdown.client.ts `clientConfig`），与 schema-gateway 是否声明 zod **无关**。浏览器 shell 的 module table **只**由 `platform.ts` 静态常量填充（`PLATFORM_MODULES` = react/react-dom/cordis/ui-slots/ui-primitives；`PRELOADED_CLIENT_EXTERNALS` = dsh-client-runtime/client），**不读任何包的 dependencies**——所以"schema-gateway 加回 zod dep"从未把 "zod" 塞进 shell table，浏览器端 `require("zod")` 永远 miss。票里"已验证修复（boot 200）"量的是**服务端** boot（GET / → 200，两种状态都通，与 zod 无关），浏览器端插件加载（require("zod") 所在）从未被该 dep 修复。

**真修复（PR #30）**：把 zod 做成**共享 platform module**（像 react/cordis）——`platform.ts` `PLATFORM_MODULES` 加 `'zod'`；`seed.ts` `import * as Zod from 'zod'` + `'zod': Zod` 进 `getStaticModules()`（shell 预置共享 zod 进 frozen module table）；`packages/client/web/package.json` zod devDep（shell bundle 进 web dist）。bundler（`clientExternals` union `PLATFORM_MODULES`）把 zod 当 external（`neverBundle`），plugin bundle 不再内联 zod，`require("zod")` 解析到 shell 共享实例。zod 有 runtime identity（schema 实例、`_zod` 属性），共享而非每 bundle 内联才对。

**实测**：api-remotes bundle 232KB→94KB（zod external，不再内联）；web dist 399KB→681KB（shell bundle 共享 zod）。浏览器（gstack，n=1，CL-22 caveat：单 run 确认性非决策依据）：dsh web boot；api-remotes 插件加载（无 `require("zod") missed`）；证据 UI 真实数据（Coverage 23 assets、gaps by domain、eval runs）；B→A auto-flip 触发（DashboardView 可见 = `effectiveMode === 'A'`、有样式 `display:flex`）；console 无错。无 temp zod、无 vi.mock bypass（本就不存在）。typecheck/knip/verify-client-packages 全绿（knip 无需豁免——seed.ts 用 zod）。回归测试 `packages/client/web/tests/platform-zod.client.spec.ts` 断言 zod 在 `PLATFORM_MODULES`+`getStaticModules`。

**Q1-Q4 回答**：Q1——zod 声明在 `platform.ts` `PLATFORM_MODULES`（shell seed module table 处），**非** package dep；bundler 不注册 zod，是 shell 从 platform 常量 seed。Q2——无需 knip 豁免，seed.ts import zod，knip 视为 used。Q3——scope-registry 无 `./remote` 导出、src 零 zod 用，GA-AUDIT1 删除正确，无 latent 回归。Q4——独立于 CB-3，根因是 module-table seeding 非 failure 粒度。

**GA-AUDIT1 协调**：`52330a98fa` 删了 schema-gateway zod dep，本 PR **不**恢复该 dep（platform-module 修复下不需要）。GA-AUDIT1 followup（`fix/ga-audit1-followup-ucl-batch-recover`，PR #9）已 merge，未碰 knip.json 或 loader，无冲突。

**brief drift（供 map 记录）**：session brief 前提经代码核实更正——(1)"三包都有 typert.remote-client.js import zod"→只有 schema-gateway/evidence-query 有 remote-client，且自包含不 import zod，zod 引用是 typert 生成 wire schema 的 `zod.z`；(2)"移除 vi.mock('zod') bypass"→全仓无 vi.mock('zod')；(3)"bundler 经 schema-gateway dep 注册 zod"→bundler 不这么做，bundle 字节级一致；(4)"base=master"→本地 master 停 CB-1a（pre-W16），从 origin/master（含 W16 PR #14）建 worktree。

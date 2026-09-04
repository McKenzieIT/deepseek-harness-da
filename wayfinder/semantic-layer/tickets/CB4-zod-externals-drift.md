---
type: grilling
status: open
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

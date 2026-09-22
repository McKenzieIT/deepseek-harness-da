# Prompt B — 完成 da-compliance-audit catalog 半（关闭 cordis-catalog 2 个失败）

> 新 session 直接粘贴本文件内容即可开工。自包含，无需前置对话记忆。

## 工作目录

`/Users/mckenzie/workspace/deepseek-harness-da`（用户本地 git 仓）。

**工具约束（关键）**：本环境 built-in `Read`/`Write`/`Edit`/`Bash`/`Grep`/`Glob` 被 harness 屏蔽，**只能用 `mcp__local__*` 工具**（`read_file`、`write_file`、`edit_file`、`bash`、`grep`、`glob`、`list_dir`、`stat`）。

## 背景

`packages/typert/generator/tests/cordis-catalog.spec.ts` 有 2 个测试失败：
1. `reproduces every committed catalog artifact byte for byte`
2. `resolves each key to the declaration a caller meets, and drops keys no plugin provides`

**根因**（已诊断）：commit `9b87e4da18`（"wire da packages into host + resolve spec type errors"，自标 "typecheck-green half of fix/da-compliance-audit"）把 `scope-registry` 等 da 包加入 host face（`tsconfig.host.json`）+ 声明了 `ctx.scopes` + `scopes/*` 事件，但**从未做 catalog 半**——事件缺 JSDoc、缺 page 映射、committed catalog 文档未 regen。

**已完成的铺垫**（勿重复）：
- `34df7ab847 fix(typert): resolve package.json exports subpath patterns (wildcards)`——analyzer 已支持 `./src/*` 通配 exports。原 `EngineConventions is not exported` 错误**已消除**。剩余失败纯粹是 JSDoc + page-mapping + regen。

## 当前失败点

`pnpm run gen-cordis-catalog`（=`tsx scripts/gen-cordis-catalog.ts`）在 `scripts/gen-cordis-catalog.ts:572` 的 JSDoc-completeness gate 抛错：
```
gen-cordis-catalog: N JSDoc completeness violation(s)
```
（当前 N≈5，但随你加 page 映射可能增多——因为映射后 projection 会 walk 更多事件。**迭代**直到 gen 成功。）

## 任务

### 1. 看当前违规清单
```bash
cd /Users/mckenzie/workspace/deepseek-harness-da
pnpm run gen-cordis-catalog 2>&1 | grep -A30 "JSDoc completeness violation"
```
gate 会列出每个违规事件（文件:行 + 缺什么：`@mode` / 描述 prose / `@param`）。

### 2. 给每个违规事件补 JSDoc
- **格式范本**：`packages/core/session/src/index.ts:45-90`——每个事件 JSDoc：
  ```ts
  /**
   * <1-3 句描述 prose>
   * @param <name> - <描述>      // 有参数时
   * @dshScopeScan unsupported    // 参考范本是否需要
   * @mode emit                   // 或 parallel / waterfall，按事件语义
   */
  'event/name'(this: ..., arg: ...): void
  ```
- `@mode` 语义：`emit`（fire-and-forget，无返回）/ `parallel`（await 所有 listener，无 veto）/ `waterfall`（顺序 veto）。scope 变更通知类用 `emit`。
- 已知违规源：`packages/data/scope-registry/src/index.ts:58-59` 的 `scopes/changed` + `scopes/active-changed`（缺 `@mode`/描述/`@param scopeId`）。其余按 gate 清单补。

### 3. 补 page 映射
在 `scripts/gen-cordis-catalog.ts`：
- `SERVICE_PAGE`（~line 52）：每个 `ctx.<svc>` service 需条目。补 `scopes: 'data-agent.md'`（scope-registry 在 `packages/data/`，data-agent.md 是合理默认；workspace.md 亦可）。
- `EVENT_SCOPE_PAGE`（~line 175）：每个事件 scope 需条目。补 `'scopes': 'data-agent.md'`。
- gate（~line 755-758）会报未映射的 service/event-scope；按报错补。

### 4. 迭代 + regen
循环：补 JSDoc/映射 → `pnpm run gen-cordis-catalog` → 看新违规 → 再补……直到 **gen 成功**（写出 regenerated docs：`docs/subsystems/*.md`、`packages/extensions/tool-cordis/src/api-catalog.ts` 等）。

### 5. 验收
```bash
npx vitest run packages/typert/generator/tests/cordis-catalog.spec.ts   # → 2/2 pass
pnpm run verify-cordis-catalog   # --check：committed 与 regenerated 一致
```

### 6. 提交
regen 会改一批 committed catalog 文档（**diff 大但正当**——文档自 W1-W6 起就 stale：`Nl2sqlEngineService` 行号漂移、scope-registry 缺席、新增 eval-runner-service 等）。一个 commit：
- JSDoc 补充（各事件源文件）
- page 映射（`scripts/gen-cordis-catalog.ts`）
- regenerated catalog 文档
消息：`docs(cordis-catalog): complete da-compliance-audit catalog half (JSDoc + page mappings + regen)`。

## 约束

- 用 `mcp__local__*` 工具。
- 不要 `.skip` 测试或弱化 gate——这是补完审计，要真绿。
- JSDoc 描述要准确（读事件源码理解语义再写），勿瞎填。
- `@mode` 要匹配事件真实语义（错填会让另一个 gate 失败）。
- regen 的大 diff 是预期的——`docs/subsystems/` 多个 `.md` + `api-catalog.ts` 会变。审一眼 diff 确认是 regen 输出（非手写错误）。
- 若某个事件的 page 映射归属真的有架构歧义（data-agent.md vs workspace.md），选 `packages/` 路径最匹配的默认，并在 commit message 注明"page-mapping 默认选择"。

## 注意

- 全量套件约 224s——只在最终验证跑。迭代用 `pnpm run gen-cordis-catalog` + 单文件 `npx vitest run packages/typert/generator/tests/cordis-catalog.spec.ts`（~25s）。
- 根 `npx tsc --noEmit` 是无程序 solution，**不真正检查**；类型验证用 `npx vitest run`（vite 解析）或 `npm run typecheck`。

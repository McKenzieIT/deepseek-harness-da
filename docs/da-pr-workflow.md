# dsh-data-agent PR 工作流

## 分支模型

```
main ──────────────────────────────── 稳定（typecheck + test 绿）
  │
  ├── feat/<ticket-id>-<slug>        功能分支（新能力、新包）
  ├── fix/<ticket-id>-<slug>         修复分支（bug、regression）
  ├── refactor/<slug>                重构分支（不改行为）
  └── upstream/sync-YYYY-MM-DD       upstream merge 分支
```

## 何时用分支 + PR，何时直推 main

| 变更类型 | 方式 | 原因 |
|---|---|---|
| 新包 / 新 seam / 新功能 | **分支 + PR** | 需要验证，留 review 记录 |
| Bug fix（行为修正） | **分支 + PR** | 验证 fix 不引入 regression |
| Wayfinder 文档（map/ticket/research） | **直推 main** | 纯文档，不影响代码 |
| 实验（probe 脚本 + audit log） | **直推 main** | 不影响生产代码 |
| 构建接线（tsconfig ref、manifest） | **随功能 PR** | 附属于功能变更 |
| Upstream sync | **分支 + PR** | 验证 merge 通过 CI |

> **直推 main 的前提**:该 commit 的 diff 不触及 `packages/*/src`(即纯 `wayfinder/` 文档或实验 probe 脚本)。任何触及 `packages/`、`apps/`、`examples/`、`native/`、`python/`、`scripts/` 的 `feat`/`fix`/`refactor` 必须走分支 + PR。

## Session-prompt 分支契约

每个 `wayfinder/*/prompts/*-session-prompt.md` 必须在开头实例化分支契约——session 启动第一步就是建 worktree 和分支,而不是直接在 master 上工作。模板见 [`wayfinder/_templates/session-prompt.md`](../wayfinder/_templates/session-prompt.md);根因与完整方案见 [Per-session branch and worktree isolation for parallel work](../.agents/notes/proposed/process/2026-09-04-parallel-session-branching-policy.md)。

要点:

- 每个 in-flight ticket 一个 worktree(`git worktree add ../dsh-<ticket-id> -b <type>/<id>-<slug> master`)。
- 分支命名遵循 `feat/<ticket-id>-<slug>` / `fix/<ticket-id>-<slug>` / `refactor/<slug>`。
- **禁止把 `feat`/`fix`/`refactor` 直推 master。**
- 收尾 `gh pr create`(依赖链 `gh stack link`),通过 [dsh-pre-push-checks](../.agents/skills/dsh-pre-push-checks/SKILL.md) 后再合并。

## Commit 格式

```
<type>(<scope>): <subject>
```

### type

| type | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改行为） |
| `docs` | 文档变更 |
| `test` | 测试变更 |
| `chore` | 工具/配置/清理 |
| `upstream` | Upstream merge |

### scope

包名或领域：`phase-gate` / `query` / `retrieval` / `semantic-layer` / `eval` / `llm-dashscope` / `audit` / `identity` / `nl2sql` / `wayfinder`（纯文档/planning）

### 示例

```
feat(phase-gate): implement route-gate intent routing (P-DA1)
fix(query-maxcompute): resolve TS4113 override + TS2379 exactOptional
docs(wayfinder): D2h corpus term-only selectable resolved
test(retrieval): add hybrid BM25+vec RRF spec coverage
upstream: merge upstream/master (2026-08-22)
chore: migrate probes to experiments/ directory
```

## PR 模板

```markdown
## <type>(<scope>): <summary> — <ticket-id>

### What
一句话描述这个 PR 做了什么。

### Why
指向 wayfinder ticket 或 experiment audit log entry。

### How
关键设计决策（简要；详细的在 Agent Note 里）。

### Verification
- [ ] `pnpm run typecheck` 绿
- [ ] `pnpm run test:coverage` per-file 100%
- [ ] `pnpm run build && pnpm run hygiene` 绿
- [ ] 行为验证：<describe how>

### Changelog
<copy to CHANGELOG.md [Unreleased] section>
```

## Self-review Checklist

Agent session 完成 PR 前必须自查：

```markdown
- [ ] 没有修改 dsh 包的 src/（规则 4.1）
- [ ] 没有 import dsh concrete Provider 的内部函数（规则 4.4）
- [ ] 所有注册通过 effects（ctx.on / ctx.effect / register()）
- [ ] 新包在 da-owned 目录下
- [ ] Agent Note 已写（如果非 trivial）
- [ ] CHANGELOG.md 已更新（如果 feat/fix）
- [ ] experiment-audit-log 已记录（如果有实验支撑决策）
- [ ] README + JSDoc 已更新（如果改了 API）
```

## Review 关注点

| 关注点 | 检查方式 |
|---|---|
| 是否改了 dsh 源码？ | `git diff --name-only` 无 dsh 包 src/ 变更 |
| 依赖方向正确？ | imports 只指向 Service Definition |
| Agent Note 存在？ | 非 trivial 变更必须有 |
| CHANGELOG 更新？ | feat/fix 必须加行 |
| 实验数据记录？ | 决策类 PR 引用 experiment-audit-log |
| 架构图同步？ | 新 seam/pipeline 变更更新 `docs/da-architecture.md` |

## 与 Wayfinder 的关系

```
Wayfinder ticket (决策层)
    ↓ resolved
PR (实现层)  ← ticket resolution 写 "实现见 PR #N"
    ↓ merged
CHANGELOG entry (记录层)
```

- 一个 wayfinder ticket 可产生 1+ 个 PR
- 一个 PR 关联恰好 1 个 ticket（PR body Why 里链接）
- 纯 wayfinder docs 变更直推 main，不需要 PR
- **每个 ticket 头部声明 `Branch: <type>/<ticket-id>-<slug>`**；认领 ticket 前先建对应分支（`git worktree add ../dsh-<ticket-id> -b <type>/<ticket-id>-<slug> master`，见上方“Session-prompt 分支契约”小节）。

## Upstream Sync PR

```markdown
## upstream: merge upstream/master (YYYY-MM-DD)

### What
Daily automated merge from deepseek-ai/deepseek-harness master.

### Conflicts resolved
- `tsconfig.host.json`: added da refs alongside upstream new refs
- (list any other conflicts)

### Verification
- [ ] `pnpm install` 成功
- [ ] `pnpm run typecheck` 绿
- [ ] `pnpm run test` 绿
- [ ] `pnpm run build` 绿
```

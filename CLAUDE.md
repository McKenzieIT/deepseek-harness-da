# CLAUDE.md

## Eval 实验记录规范

**每次 eval run 必须记录**。LLM 输出不可重现，未记录的实验结果等于不存在。

### 何时必须记录

- 全量 eval run（`--cases packages/eval/eval/cases/k11-v2`）
- 任何产生 pass_rate 数据并影响决策的 eval run
- enrichment / pipeline 变更后的验证 run

### 记录位置

`wayfinder/semantic-layer/research/experiment-audit-log.md`

### 标准模板

```markdown
## YYYY-MM-DD: <ticket/变更描述>

### Setup
- **基线**: Run `<baseline_run_id>`（引用上一次标准 run）
- **Cases**: <count> K11 cases（80 original + 40 alias + 48 voice）
- **Model**: <provider>/<model>, <responder>, pass_k=<n>, concurrency=<n>, sql-judge enabled
- **变更**: <本次改动的具体内容>

### Data (verbatim)
<粘贴 compare.ts 输出或手动 category 表>

### Verdict
<编号分析：什么变了、为什么、下一步>

### Ticket Pointer
Resolves: [<ticket>](link)
```

### 趋势对比工具

```bash
node --import tsx/esm packages/eval/eval-cli/bin/compare.ts <run_id_A> <run_id_B>
```

对比两次 run 的 category-level delta + case-level flips。每次 eval 必须与上一次基线 run 对比。

### 运行 eval 标准命令

```bash
DASHSCOPE_API_KEY=$(grep DASHSCOPE_API_KEY ~/.dsh/.credentials.yaml | awk '{print $2}') \
node --import tsx/esm packages/eval/eval-cli/src/bin.ts \
  --cases packages/eval/eval/cases/k11-v2 --pass-k 1 --concurrency 4 --skip-health-gate
```

## Wayfinder Map

语义层工作跟踪：`wayfinder/semantic-layer/map.md`。每个 session 通过 session prompt（`wayfinder/semantic-layer/prompts/`）获取上下文。

## 并行 session 分支纪律

每个 session 必须在独立 worktree + 独立分支上工作，禁止把 `feat`/`fix`/`refactor` 直推 master。详见 [dsh-data-agent PR 工作流](docs/da-pr-workflow.md) 的“Session-prompt 分支契约”与 [wayfinder session-prompt 模板](wayfinder/_templates/session-prompt.md)；根因见 [Per-session branch and worktree isolation for parallel work](.agents/notes/proposed/process/2026-09-04-parallel-session-branching-policy.md)。

- session 启动第一步：`git worktree add ../dsh-<ticket-id> -b <type>/<ticket-id>-<slug> master`。
- 直推 master 仅限 diff 不触及 `packages/*/src` 的纯 `wayfinder/` 文档或实验脚本。
- **Wayfinder 每个 ticket头部必须声明 `Branch: <type>/<ticket-id>-<slug>`**；未声明分支的票不算认领。
- Lead 在 push 前跑 `pnpm run typecheck` + 相关 surface 测试；上一批 PR 未 merge/abandon 前不开下一并行批。

harness 不会自动建 worktree/分支（[agent-teams 笔记](.agents/notes/implemented/feature/2026-08-05-agent-teams.md)：“Worktree isolation is not a harness runtime behavior”），所以这条纪律必须由 session prompt 和本文件承载。

## Workflow / 大规模审计经验（2026-08-31）

在本环境（pod 侧运行 + Mac 侧 `mcp__local__` 工具）跑大规模 workflow / 多 agent 审计时踩过的硬约束。**再跑类似任务前先看这里。**

### 已知坑

- **workflow 返回结果 >~8KB 会在聊天通知里被截断**，尾部（通常是合成结论）读不到。需要大结果时，让 agent 把结果**写到本地文件**（每个文件 <20KB），主进程只返回一行确认，再用 `mcp__local__read_file` 读回（read_file 不截断）。
- **inline `script` + `resumeFromRunId` 不命中缓存**，会完整重跑；只有 `scriptPath` + `resumeFromRunId` 才缓存。而 pod 侧脚本文件用 `mcp__local__` 工具无法编辑——所以"只改 return 复用缓存"的捷径走不通。
- **pod 侧文件不可读**：`/tmp/claude-1001/...`、`/home/admin/.claude/.../transcript` 都在 pod，从 Mac 侧 `mcp__local__` 工具读不到（两台机器）。只有写到 `/Users/mckenzie/workspace/deepseek-harness-da/` 下的文件才能被 `mcp__local__read_file` 读回。
- **单个 agent 一次性 `write_file` >~32KB 会撞输出上限**，可能拖垮整轮 run。大输出拆成多个小文件分别写。
- `TaskOutput` 查不到 workflow task（"No task found"）；workflow 完成只靠 `<task-notification>`。

### 推荐形态（大规模审计 / 多 agent 任务）

直接并行 `Agent` 调用（**非单大 workflow**）：每个 agent 审一个维度、写自己的小 JSON（如 `.tmp/audit/dN.json`）、返回一行确认；合成 agent 读这些小文件再写小合成文件；主进程 `mcp__local__read_file` 读回。比单大 workflow **更可控、可重试单点、不受返回截断影响**。只有当结果确定 <~6KB 时才用单 workflow 直接返回。

### 本次审计产物

- 原始数据：`.tmp/audit/{d1..d8,actionlist,archdefects}.json`
- 报告：`wayfinder/data-agent/research/generalization-audit-2026-08-31.md`（95 finding → 29 action item + 7 系统性缺陷）

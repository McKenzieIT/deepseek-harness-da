# Next Session Prompt — GA-FORK-CI translation-pairing + 审计 action 收尾

> **STATUS: DONE (2026-09-07)** — 债务经 sessions 3-6 清零（PR #102/#104/#106/#108），`verify-translation-pairing` corpus green（1069 pairs，0 missing，0 OOS，exit 0）。本 prompt 的 Goal A 已达成；保留作历史记录，不再是下一 session 指导。详见 [map § GA-FORK-CI](../map.md#ga-fork-ci-node-24-meta-gates-2026-09-07) + `.tmp/audit/fix-translation-session6-status.md`。

> 从 `wayfinder/_templates/session-prompt.md` 实例化。上一 session（2026-09-07）已把 GA-FORK-CI 推到 **6/7 绿 + 6 解除跳过** + GA-GT3 数据丢失修复已落地（详见 `wayfinder/data-agent/map.md` § GA-FORK-CI）。下一 session 目标：**translation-pairing 变绿**（如并行可暂停）+ 推进审计 action。

## 1. 环境/分支契约（session 启动第一步，必填）

```sh
git worktree add ../dsh-translation-pairing -b fix/ga-fork-ci-translation-pairing master
cd ../dsh-translation-pairing
pnpm install                       # fresh worktree 无 node_modules，必跑
pnpm -r run build                  # 生成 lib/（否则 aggregate tsc 假性 break）
```

- worktree: `../dsh-translation-pairing`
- 分支: `fix/ga-fork-ci-translation-pairing`
- 基线: `master @ <sha>`（启动前 `git fetch origin && git rev-parse origin/master`）
- **禁止直推 master。** 所有提交落在本分支。

## 2. 前置条件（关键）

- **并行 session 必须暂停**——translation-pairing 是 moving-target（并行 session 持续新增文档，比翻译快）。在并发环境里是 losing battle（上一 session 实测：翻译 26 篇时并行又新增 24 篇）。先确认无其他 session 在跑，或协调暂停。

## 3. 任务正文

### Goal A（推荐）: verify-translation-pairing 变绿（1 个仍红的 node-24 门）

详见 [GA-FORK-CI-translation-pairing-debt.md](../tickets/phase-misc/GA-FORK-CI-translation-pairing-debt.md)。步骤：
1. 排除 28 内部文档到 `scripts/translation-pairing.manifest.json` `excluded[]`（`.agents/notes` 22 逐路径 + `wayfinder` 3 逐路径 + `docs/superpowers/plans/` 目录排除——不能用 blanket glob）。
2. Class B byte-align：`docs/tool-catalog.zh.md:~2905` 的 `chart_type` description 对齐 EN。
3. 逐篇翻译用户可见 .zh.md（`docs/da-*` 5 + `packages/*/README` ~21+），**严格 structural parity**（byte-identical code blocks + heading/list/table 对齐 + switcher `[English](<name>.md) | 中文` 在 H1 后）。每篇翻译后 `verify-translation-pairing` 查 parity，**逐个修**（subagent 翻译易在 heading 深度/list 计数/code-block 上出错——上一 session 26 个 .zh.md 多有此类 bug）。
4. `verify-translation-pairing --write --all` re-record。
5. `verify-translation-pairing` → exit 0 → PR + merge。

### Goal B（如 translation-pairing 仍 moving-target / 并行无法暂停）: 推进审计 action

从 `.tmp/audit/ACTION-LIST.json` 选 safe-auto 项推进（每项一个 PR，按 CLAUDE.md 提交纪律：stage 显式路径、绝不 `git add -A`、commit 前核 staged）：
- **safe-auto**：A12 phase-gate 类型化事件 cast（需 scope-registry 进 phase-gate peerDeps）、A14 AGENTS.md 2 条 data-agent 规则迁出到 `packages/data/AGENTS.md`、A18 Cordis 约定 9 项（d3-2/3 diff card、d3-5 presenter、d3-6 cfg 集中、d3-7 tenant Config、d3-8 空 catch 命名、d3-9 dead apply）、A20 U+FFFD 逐行 git 考古、A22 ~12 churn 回退（注释-only catch + 测试 timeout bump）。
- **needs-confirmation（先确认再做）**：A4 原型污染（audit/store.ts `setDotted` 走 `__proto__`）、A5 铸 callId + 回退 id-less 簇（session:336 + assembler:71,81 + ui-conv:240 + ui-traj:223——用户已选"彻底修"）、A6 apiproxy presetSwitches 验证、A9-A11/A13 深 bug（phase-gate sessions Map 泄漏 / reachabilityDelta O(N²) / correctedStats 偏差 / event-edit TOCTOU）。

## 4. 收尾（Lead integration boundary）

- [ ] `pnpm run typecheck` 绿
- [ ] 相关 surface 测试绿（文档改 `doc-sync` = `verify-translation-pairing` + `verify-md-links` + `verify-md-wrap`；代码改对应 surface 测试）
- [ ] `gh pr create`，通过 [dsh-pre-push-checks](../../../.agents/skills/dsh-pre-push-checks/SKILL.md)
- [ ] **下一并行批不得在本批 PR 未 merge / 未 abandon 前启动。**

## 5. 上下文索引

- 上一 session 产物（`.tmp/audit/`，可能已随 worktree 清理——如缺，从 git 历史 / map § GA-FORK-CI 重建）：`SYNTHESIS.md` + `ACTION-LIST.json`（26 action）+ `architecture.html`（交互式架构图）+ `PROCESS-OPTIMIZATION.md`（流程优化建议）+ `d1-d7.*.{md,json}`（7 维审计原始数据）
- map: `wayfinder/data-agent/map.md` § GA-FORK-CI（2026-09-07）
- 经验：CLAUDE.md "Workflow / 大规模审计经验（2026-08-31）"——大规模审计用 file-based handoff（agent 写小文件 <20KB 到 `.tmp/audit/`，主进程 read_file 读回，避免 >8KB 返回截断）；workflow subagent 用 mcp__local__ 工具（ToolSearch 发现）；pod 侧文件不可读，只写 `/Users/mckenzie/workspace/deepseek-harness-da/` 下。
- 并行 session 纪律：CLAUDE.md "并行 session 分支纪律" + "提交与引证纪律"——每 session 独立 worktree + 分支，禁止直推 master；改完一个逻辑单元立即 commit；绝不 `git add -A`（树常挂 100+ 其他 session 在途文件）；任何 file:line 落笔前机械重导一遍。

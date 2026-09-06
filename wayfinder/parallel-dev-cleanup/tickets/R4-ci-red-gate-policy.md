# R4: CI 六个 check 恒红 —— 先定门禁策略，才能开 branch protection

Branch: 未认领（认领时按 CLAUDE.md 声明 `<type>/r4-<slug>`）

## Question

CI 在 PR 上有 **6 个 check 恒红**，全是 master 既有欠债（证据见
[ci-red-audit-2026-09-06](../research/ci-red-audit-2026-09-06.md)）。而 master **无分支保护**
（`gh api .../branches/master/protection` → 404），所以这些红从未拦住任何 merge —— CI 目前是装饰。

**需决策**：哪些 gate 进 required、其余怎么处置？这是 [R3](R3-branch-protection.md)（开 branch
protection）的**前置条件** —— 现在直接开 "require CI green"，master 会被永久锁死。

候选（互斥性待 grilling）：

1. **先修再开**：把 6 个 check 全修绿，然后 required 全量。代价最大 —— coverage 要把
   **161 个文件**补到 per-file 100%（`vitest.config.ts:285-292` 的 `perFile: true` + 四项 100%），
   static 要修 **17 个 gate**（含 **402** 条 jsdoc、**30** 个包的 `./invariant` 导出、
   **25** 个 python closure 依赖）。
2. **分级 required**：只把「确定性、且当前可绿」的 gate 设为 required（如 `verify-no-production-src-on-master`、
   `node-compat`、`python-sdk`），其余降级为 informational，各自开欠债票逐步收。
3. **先划红线基线（baseline）**：把当前 161 文件 / 17 gate 的失败集合**冻结为已知基线**，
   CI 改为「不得**新增**失败」而非「必须全绿」。需要一个 baseline 文件 + 比对逻辑
   （本次审计已证明这种比对可行且有判别力：coverage 双向差集为空、windows 却抖动 ±3 文件）。
4. **接受现状**：不开 protection，CI 保持装饰，靠 session 纪律 + lefthook。明确写下来，
   免得后来的人以为 CI 在把关。

## 已知事实（均已机械重导，详见 research note）

| check | 规模 | 性质 |
|---|---|---|
| `node 24 / static` | 17 gate 失败 | 确定性（集合逐字节相同） |
| `node 24 / coverage` | 512 ERROR / 161 文件 | 确定性（双向差集空） |
| `node 24 / snapshots and artifacts` | 30 包缺 `./invariant` | 确定性 |
| `python runtime / node24-linux-x64` | 25 个 preset 插件缺 dep | 确定性 |
| `windows node 24 / native complete` | 14 文件失败（对比 13） | **非确定性 flake**，集合 run-to-run 抖 ±3 |
| `Issue lifecycle` / `Issue policy` | 2 job | 上游专用，fork 永不可绿 → [R5](R5-issue-workflows-upstream-only.md) |
| `all checks passed` | 派生 | 纯聚合 7 个 `needs`，修单个不变绿 |

**windows 与其余的处置方式不同**：其余是「确定的债，可直接修」；windows 是「不稳定」，
先要量化 flake 率（同 commit 重跑 N 次），否则「修好了」无法验证。

## 与其他票的关系

- **阻塞 [R3](R3-branch-protection.md)**：R3 要 required CI green，本票不定案则 R3 一开即锁死 master。
- **[R5](R5-issue-workflows-upstream-only.md)** 是本票里最便宜、可独立先做的一块（2 个 job，加个
  `if:` 守卫即可），故单独成票。
- ② 的 `verify-no-production-src-on-master`（已 merged, PR #6）是 reactive 的；本票若选候选 2/3，
  它是最该第一个进 required 的 gate。

## 验收

- 定案：required 集合 + 非 required 的处置方式（修 / 冻结基线 / 明示放弃），写进 map。
- 若选候选 3：baseline 文件格式 + 比对脚本 + 「如何更新 baseline」的流程定下来。
- windows：给出 flake 率实测（同 commit ≥3 次重跑）后再决定它进不进 required。
- R3 解除阻塞（或明确记录为「不开 protection」）。

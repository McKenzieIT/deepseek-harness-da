# P11c — eval CLI runner + persistence + pass_at_k reporting

**Type**: prototype
**Phase**: 4
**Status**: resolved (2026-08-25)
**Blocked by**: P11b（resolved 2026-08-20）

**Question**: P11b DEFER 的 eval **CLI runner**（跑单 case / batch demo）+ **run-result 持久化** + **pass_at_k 报告聚合**。P11b ship 了核心库（编排 MultiTurnSession/driveSession/runMultiTurnCase + 判分 scoreDa + judge + match_modes + case loader），P11c 加外围让 eval 可独立跑 + 报告。G1b（实验执行）消费 P11b 库 + P11c runner/report。

**Scope (per P11b decision 7)**:
- CLI runner（跑 case batch，注入真 DeepSeekHarness responder + ctx.query.execute executor + llm-dashscope judge provider）—— owns runtime lifecycle（spawn cordis.yml+DSH_SNAPSHOT_FILE, close/respawn on timeout）。
- run-result 持久化（JSONL/SQLite，落盘 per-case MultiTurnCaseResult）。
- pass_at_k 聚合报告（case-level summary, pass rate, flakiness exposure）。
- ~800 行（P11b 核心之外的完整 eval；P11b ~700 行核心 + P11c ~800 = ~1500 完整 eval per G2 Claim E）。

**关联**: P11b resolved（核心库 + 7 决策 locked）；G1b（实验执行，blocked by P7b+P11b）消费 P11c runner/report 跑 G1 矩阵。仿 P11b→P11c 先例（P7→P7b/P8→P8b/P4→P4b 核心先行 + 外围延后）。

---

## Resolution (2026-08-25)

6 项设计决策锁定，P11c 可直接进入实现：

### D1: 协作者注入方式 → Mini Cordis context

CLI runner 自建最小 Cordis app（programmatic），复用 `eval-runner-service` 已验证的 adapter 模式（`Nl2sqlAgentResponder` + `CtxQueryExecutor` + `LlmJudgeExecutor`）。不 spawn 完整 data-agent 进程。

**为什么选 A**：
- adapter 类已现成（eval-runner-service 已验证）
- 目标是衡量 NL2SQL engine 准确率，不测 agent loop
- 避免 161×3=483 次冷启动开销

**何时该选 B（spawn 完整 agent）**：
- 需要端到端集成 eval 时（验证 agent loop + tool routing + persona 整体行为）
- 作为独立的第二层 eval tier，不替代本 runner

### D2: 输出格式 → JSONL + stdout summary + JSON report（三层）

- **JSONL**：复用 `persistRunResultJsonl` 格式，兼容 `FileBackedEvalResultStore` / evidence-query
- **JSON report**：复用 `writeRunResult`，完整 `RunResult`（per-attempt detail，G1b flakiness 分析需要）
- **stdout summary**：人读 table（total / correct / wrong / declined / infra_failure / pass_rate + per-intent breakdown + top failures）

### D3: 运行模式 → 单 case debug + full batch + 可配置 pass_k

- `--case <case_id>`：只跑指定 case（可多次），调试用
- 无 `--case` 时跑 `--cases <dir>` 下全量
- `--pass-k <n>`（默认 3）：调试用 1，G1b 实验可能用 5

### D4: CLI 入口形态 → 新建 `packages/eval/eval-cli/`

独立包，依赖 `@deepseek-ai/dsh-eval-runner` + Cordis + 各 plugin。遵循 `eval/` 下 per-responsibility 分包惯例（eval = 核心库，eval-runner = 证据引擎，eval-runner-service = Cordis Service，eval-cli = standalone 入口）。

### D5: 配置方式 → Programmatic 构建 + flags/env/credentials

插件集固定（llm + query + schema + credentials），不需要 cordis.yml。配置来源：
- CLI flags：`--provider`（默认 aga）、`--model`（默认 qwen3.7-max）、`--today`（默认当天）
- credentials：`~/.dsh/.credentials.yaml`（PAT auth，P3 决策）
- 其余 `BatchRunOptions` 映射：`--concurrency`、`--skip-health-gate`、`--timeout-ms`

### D6: Schema 加载 → `--schema <dir>` flag

显式指定语义层目录。默认 `examples/k11-semantic-layer/`。schema 与 case set 逻辑独立——G1b 可做"同 cases + 不同 schema 版本"对比实验。

---

### 验收标准

```bash
pnpm exec dsh-eval \
  --cases packages/eval/eval/cases/k11/ \
  --schema examples/k11-semantic-layer/ \
  --output eval-results/ \
  --pass-k 3
```

输出：
1. `eval-results/<timestamp>_<run_id>.jsonl` — per-case JSONL（evidence-query 格式）
2. `eval-results/<run_id>.json` — 完整 RunResult JSON
3. stdout summary table（pass_rate + per-intent + failures）

G1b 可消费该 runner 跑实验矩阵。

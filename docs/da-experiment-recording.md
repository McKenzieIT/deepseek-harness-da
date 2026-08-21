# dsh-data-agent 实验记录规范

> 每个决策必须有实验数据支撑。实验可复跑。旧实验是新实验的 baseline。

## 1. 三类实验制品

| 类型 | 生命周期 | 位置 | 说明 |
|---|---|---|---|
| **Throwaway prototype** | Ticket resolved 即可删 | `wayfinder/<effort>/prototypes/<ticket-id>/` | 验证设计的一次性脚手架，不保证可复跑 |
| **Persistent probe** | 长期存活，可复跑 | `experiments/<domain>/<probe-name>` | 决策依据的度量脚本，audit log 指向它 |
| **Eval suite** | 随代码迭代 | `packages/eval/` + case files | 生产 eval，CI regression guard |

**区分标准**：
- 如果这个实验结果未来可能被引用/复跑/用作 baseline → **Persistent probe**
- 如果只是验证 ticket 设计能跑通 → **Throwaway prototype**
- 如果度量结果变成了"每次代码变更都必须 pass" → **Eval suite**

## 2. 目录结构

```
experiments/                           # persistent probe 脚本
  retrieval-quality/                   # domain
    probe-bm25-baseline.py
    probe-enrichment-variants.py
    d2f-live-activation.ts
    d2h-topk-variant.ts
    README.md                          # 如何跑、依赖什么数据、环境要求
    fixtures/                          # gold cases, corpus snapshots
      scope-10000147-gold-37.json
  intent-routing/                      # domain
    probe-route-gate-accuracy.ts
    fixtures/
  nl2sql-quality/                      # domain
    ...

wayfinder/<effort>/prototypes/         # throwaway（ticket resolved 后可删）
  p8-audit/
  p11-eval-harness/
```

## 3. Experiment Audit Log 格式

位置：`wayfinder/<effort>/research/experiment-audit-log.md`（per-effort，append-only）。

每条 entry：

```markdown
## YYYY-MM-DD — <experiment-name> (<deciding-ticket-id>)

- **Question**: 这个实验回答什么问题？（一句话）
- **Setup**: corpus source + size, case set + gold derivation, scope, config, what is varied
- **Baseline ref**: 若推翻前实验 → 指向被推翻的 entry（"replaces §YYYY-MM-DD <name>"）；首次则 "N/A (initial)"
- **Results**:

  | variant | metric-1 | metric-2 | ... |
  |---|---|---|---|
  | ... | ... | ... | ... |

- **Verdict**: 决定了什么 + 哪个 ticket 被 inform
- **Fidelity caveat**: port-vs-shipped 差异（tokenizer/idf/weights/mock vs real）
- **Reproducibility**:
  - Script: `experiments/<domain>/<script>` (commit: `<sha>`)
  - Data: `experiments/<domain>/fixtures/<file>` 或外部路径说明
  - Run: `<exact command to reproduce>`
  - Env: 环境依赖（RBI repo 路径、credentials、Python 版本等）
```

## 4. Probe 脚本开发规范

每个 persistent probe **必须满足**：

1. **Self-contained run command**：脚本头注释或 README 写明 `Run: <exact cmd>`
2. **Fixtures checked in**：gold cases、corpus snapshots 等小文件放 `fixtures/`；大文件（>1MB）写路径 + 获取方式
3. **External data documented**：依赖外部 repo/service 的，写明路径 + 如何获取/配置
4. **标准化输出**：
   ```
   [RESULT] variant=<name> <metric>=<value> <metric>=<value> ...
   [VERDICT] <one-line conclusion>
   ```
   - 便于 audit log 直接引用
   - 便于未来 agent grep `[RESULT]` 自动解析对比
5. **无隐式状态**：跑两次结果一致（deterministic），或标注 stochastic + 建议 N 次取均值

## 5. Agent Session 实验决策流程

```
1. 检查 experiment-audit-log.md
   ├─ 有相关实验 → 读 verdict
   │   ├─ 条件未变 → 引用该 entry 做决策（不重跑）
   │   └─ 条件变了（代码/数据/配置变更）→ 步骤 2（旧实验 = baseline）
   └─ 无相关实验 → 步骤 2

2. 设计实验
   - 明确 Question
   - 创建或复用 probe 脚本（experiments/<domain>/）
   - 确定 fixtures（新建或复用已有 gold cases）
   - 推翻旧决策时：先跑旧 probe 确认旧数据可复现（baseline 验证）

3. 执行实验
   - 跑 probe，记录 verbatim [RESULT] 输出
   - 有 baseline：同 probe 同 fixtures 对比新旧（Δ 列）

4. 记录 audit log
   - Append entry（全字段填满）
   - Commit probe 脚本到 experiments/<domain>/
   - Baseline ref 指向旧 entry（若存在）

5. 做出决策
   - Ticket resolution 引用 "决策依据：experiment-audit-log.md §YYYY-MM-DD <name>"
   - 若决策 = "不做" → 同样记录（verdict = "维持现状，因为..."）
```

## 6. 推翻旧决策的流程

```
1. 找到旧 experiment audit log entry
2. 读取其 Reproducibility 字段 → 复跑旧 probe
3. 确认旧数据仍可复现（或记录"旧数据已不可复现，因为 <reason>"）
4. 设计新变体（改 config / 改 corpus / 改代码）
5. 同 probe 同 fixtures 跑新变体，得到 Δ
6. Append 新 entry，Baseline ref → 旧 entry
7. 新 verdict 取代旧 verdict（旧 entry 不删不改，作为历史）
```

## 7. 与 Eval Harness 的关系

| | Persistent Probe | Eval Suite |
|---|---|---|
| 目的 | 一次性度量，支撑决策 | 持续 regression guard |
| 触发 | 人/agent 手动 | CI / `pnpm run test` |
| 数据 | 可依赖外部（RBI scope） | Self-contained（fixtures in repo）|
| 输出 | `[RESULT]` 行 + 手动记 audit log | Pass/fail + report |
| 更新 | 推翻决策时新增 variant | 代码变更时更新 expected |

**迁移路径**：当 probe 的度量变成"每次代码变更都必须 pass"的标准 → 迁移 cases + logic 到 eval suite。Probe 保留在 `experiments/` 作为历史证据（不删）。

## 8. 现有内容迁移计划

| 当前位置 | 目标 | 状态 |
|---|---|---|
| `prototypes/d2c-retrieve-baseline/probe_hypotheses.py` | `experiments/retrieval-quality/probe-hypotheses.py` | 待迁移 |
| `prototypes/d2c-retrieve-baseline/d2f_live_activation_probe.ts` | `experiments/retrieval-quality/d2f-live-activation.ts` | 待迁移 |
| `prototypes/d2c-retrieve-baseline/d2h_variant_topk_probe.ts` | `experiments/retrieval-quality/d2h-topk-variant.ts` | 待迁移 |
| `wayfinder/data-agent/prototypes/p8-audit/` | 删除（throwaway, ticket resolved） | 待清理 |
| `wayfinder/data-agent/prototypes/p11-eval-harness/` | 删除（已毕业到 packages/eval/）| 待清理 |
| `wayfinder/data-agent/prototypes/p{4,5,6,7,9,10,12,13}-*/` | 评估各自状态后清理 | 待评估 |

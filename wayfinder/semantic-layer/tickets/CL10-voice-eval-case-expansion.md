---
type: task
status: closed
---

# CL-10: Voice Eval Case 扩展 + Glob 修复 + 双模式 Eval 基线

## Question

现有 120 eval cases（80 original + 40 alias）均为手工构造的标准化查询。真实游戏分析师的提问风格（口语化、缩写、模糊、复合、探索性）未被覆盖。同时 eval-cli 的 glob regex 过滤掉了 alias cases，实际只跑 80 cases。

需要：修复 glob → 补充 voice cases → 建立 sql-judge 模式下的真实基线。

## Resolution

### 完成事项

1. **Glob 修复** (commit `51e390fc70`): `/^[a-z0-9]+_\d+\./i` → `/^[a-z0-9]+(_[a-z0-9]+)*_\d+\./i`，168 cases 全部加载。

2. **48 voice cases** (commit `4b2568b05e`): 5 类用户原声模式，34 EXECUTION + 14 DELIVERY。覆盖 25 个 DWS 表（含 15+ 此前零覆盖表）。

3. **双模式 Eval 基线**:

| 模式 | Total | Pass Rate | Original | Alias | Voice EXEC | Voice DELIVERY |
|------|-------|-----------|----------|-------|------------|----------------|
| no-sql-judge | 168 | 91.7% | 100% | 100% | 100% | 0% |
| **sql-judge** | **168** | **66.1%** | **70.0%** | **80.0%** | **64.7%** | **7.1%** |

### 关键发现

- **F1**: SQL semantic judge 暴露了此前被语法通过性掩盖的真实语义问题（24/80 original wrong）
- **F2**: Voice cases 暴露了 NL2SQL 在口语化/复合查询上的独特失败模式（数据源缺口、多表 join 缺失）
- **F3**: DELIVERY llm_judge 需要校准 — agent 回复质量高但 judge 几乎全判负
- **F4**: Enrichment 仍是最大杠杆（7/12 voice EXEC 失败 = agent 找不到合适数据源）

### 下一步优化方向

见 map "Not yet specified" 中的 5 个新增方向。

## Artifacts

- 实验报告: `research/cl10-voice-eval-experiment-report.md`
- Run 1: `eval-results/033fea6a-c1a7-46b5-b854-13109d1a1e20.json`
- Run 2: `eval-results/9788424c-a167-4a19-9c72-e27ae7455f58.json`

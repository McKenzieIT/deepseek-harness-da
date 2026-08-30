---
type: task
status: open
blocked_by:
  - CL-11
  - CL-12
---

# CL-15: sql-judge 模式确立为标准 eval 基线

## Question

CL-10 证明 no-sql-judge 下的 100% pass_rate 掩盖了真实的 SQL 语义问题。需要正式确立 sql-judge 为标准 eval 基线，并建立可追踪的质量趋势。

## 具体内容

### 基线数据（CL-10，sql-judge 模式）

| Category | Total | Pass | Rate |
|----------|-------|------|------|
| Original | 80 | 56 | 70.0% |
| Alias | 40 | 32 | 80.0% |
| Voice EXEC | 34 | 22 | 64.7% |
| Voice DELIVERY | 14 | 1 | 7.1% |
| **Total** | **168** | **111** | **66.1%** |

### 行动项

1. **文档化**：在 eval-cli README 或 CONTRIBUTING 中声明 sql-judge 为默认评估标准
2. **CI 集成**：eval 脚本默认启用 sql-judge（去掉 `--no-sql-judge` flag）
3. **质量趋势追踪**：每次 enrichment/引擎改进后跑 sql-judge eval，记录 pass_rate 变化到 experiment-audit-log
4. **目标设定**：
   - 短期目标（CL-11 + CL-12 后）：Original 80%+, Voice EXEC 75%+
   - 中期目标：Overall 80%+
   - 长期目标：Overall 90%+（含 DELIVERY judge 校准后）

### 前置依赖

- CL-11（DELIVERY judge 校准）— 解决 DELIVERY cases 的 false negative 问题
- CL-12（SQL judge 基线回归修复）— 修复已知的 SQL 语义问题，建立更高基线

### 验收标准

- sql-judge 模式为默认
- 有文档化的质量趋势追踪机制
- CL-11 + CL-12 完成后，overall pass_rate ≥ 75%

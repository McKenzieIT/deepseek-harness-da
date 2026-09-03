# GA-EXP4 — qwen3.7-max 英文 Prompt 交叉验证

**Type**: research  ·  **Phase**: misc  ·  **Status**: Resolved
**Source**: [GA-EXP3 根因分析](GA-EXP3-en-prompt-degradation-root-cause.md)（2026-09-02）
**Blocked by**: 无
**关联**: GA-EXP2（前置实验）、GA-EXP3（根因分析）

---

## 背景

GA-EXP3 将英文 prompt -41.1% 退化归因为"qwen-plus 在英文指令下切换为 Helpful Assistant 模式"（~55-60%），并标注为 **qwen-plus 特定结论，需交叉验证**。

关键未验证假设：退化是 qwen-plus 能力不足导致的，还是 NL2SQL + 混合语言上下文的结构性问题？

## Question

qwen3.7-max（同家族更强模型）在英文 prompt 下是否同样退化？

| 结果 | 意味着 | 对决策的影响 |
|------|--------|-------------|
| 退化小（<5%） | qwen-plus 能力不足，不是英文 prompt 本身 | Kind 1（prompt 英文化）重新打开——模型升级即可 |
| 退化中等（5-20%） | 更强模型缓解但不消除跨语言干扰 | 保留中文 prompt，但 i18n 路线留作升级后选项 |
| 退化仍严重（>20%） | NL2SQL + 混合语言上下文是结构性问题 | 彻底确认保留中文 prompt |

## 实验设计

复用 GA-EXP2 基础设施（`EXP2_ARM` 环境变量 + `buildPromptEN` + `EXPANSION_SYSTEM_PROMPT_EN`）。

| ARM | 模型 | 结构性 prompt | 动态内容 | EXP2_ARM |
|-----|------|-------------|---------|----------|
| A (baseline) | qwen3.7-max | 中文（prompt.ts） | 中文 | unset |
| B (full-EN) | qwen3.7-max | 英文（exp2-prompts-en.ts） | 中文 | B |

| 参数 | 值 |
|------|-----|
| eval cases | K11-v2 全量 168 cases |
| pass@k | 3 |
| 并发 | 3 |
| SQL Judge | 启用（中文 judge，同 EXP2-A/B） |
| 模型 | aga/qwen3.7-max |

## 运行命令

```bash
# ARM A (baseline)
DASHSCOPE_API_KEY=<key> EVAL_LLM_PROVIDER=aga EVAL_LLM_MODEL=qwen3.7-max \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 3 --concurrency 3 --skip-health-gate \
  --run-id exp4-arm-a

# ARM B (full-EN)
DASHSCOPE_API_KEY=<key> EVAL_LLM_PROVIDER=aga EVAL_LLM_MODEL=qwen3.7-max EXP2_ARM=B \
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 \
  --pass-k 3 --concurrency 3 --skip-health-gate \
  --run-id exp4-arm-b
```

## 成功标准

1. 两组 eval 完整跑完（168 cases × pass@3）
2. 定量对比 A vs B：overall pass rate、per-intent breakdown、SQL 生成率
3. 与 EXP2 同模型（qwen-plus）结果交叉对比
4. 更新 GA-EXP3 结论的"qwen-plus 特定"标注

---

## Resolution（2026-09-03）

**完整报告**: [exp4-crossval-report.md](../../research/exp4-crossval-report.md)

### 结果

| 实验 | 模型 | Prompt | Pass Rate | B-A Delta |
|------|------|--------|-----------|-----------|
| EXP2 | qwen-plus | ZH→EN | 72.0%→31.0% | -41.1% |
| **EXP4** | **qwen3.7-max** | **ZH→EN** | **88.1%→85.1%** | **-3.0%** |

### 结论

- **退化 -3.0%**，在文献预期 1.9-3.5% 范围内
- SQL 生成率两组完全一致（no_sql=0 vs 0），"Helpful Assistant" 模式切换问题完全消除
- **GA-EXP3 "qwen-plus 特定" 标注被验证**——退化是模型能力不足，不是英文 prompt 的结构性问题
- **Kind 1（prompt 英文化）重新打开**——模型升级后英文 prompt 可行

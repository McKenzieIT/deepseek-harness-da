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
node --import tsx/esm packages/eval/eval-cli/bin/eval.ts \
  --cases packages/eval/eval/cases/k11-v2 --pass-k 1 --concurrency 4 --skip-health-gate
```

## Wayfinder Map

语义层工作跟踪：`wayfinder/semantic-layer/map.md`。每个 session 通过 session prompt（`wayfinder/semantic-layer/prompts/`）获取上下文。

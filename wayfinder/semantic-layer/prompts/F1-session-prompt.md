# F1 — DWS→DIM 关系发现功能模块生产化

## 背景

Phase 1 用会话 subagent 充当 llmCall 完成了 K11 种子数据的 DWS→DIM 关系发现（162 DWS 中 126 表得到 225 个 dimension_refs）。但这是一次性操作，生产环境中 llmCall 仍为 undefined，导致：

- on-write hook 只跑确定性轮（PK 名匹配），语义推断轮不触发
- discover_relations tool 调用时同样只跑确定性轮
- events 的 external_refs 从未被发现（G3 决策的"第二轮"）

本 ticket 将其从「subagent-seed 一次性操作」转为「ctx.llm 注入式的可复用生产能力」。

## 当前已有基础设施

- enrichment.ts：discoverRelationsFor（注入式 llmCall）、enrichAllDwsTables、enrichAllEvents
- SemanticLayerService.setLlmCall(fn) + wireEnrichmentLlm(schema, llm) 适配器已存在
- TextLlm 接口已定义：{ text(prompt: string): Promise<string> }
- on-write hook（autoEnrich=true）已在 Service 中工作
- tool-discover-relations 已注册到 bundle
- K11 种子数据已写入（321 tables + 453 events + 3916 metrics）

## 需要实现

### 1. Bundle 挂载时调用 wireEnrichmentLlm

在 data-agent bundle 的初始化流程中（ctx.schema + ctx.llm 都 ready 后）：

    wireEnrichmentLlm(ctx.schema, ctx.llm)

这使得后续所有 discoverRelations 调用 + on-write hook 都走两轮策略。

需要确认：
- ctx.llm 在哪里声明/挂载（找到 LLM Service 的 Cordis 注册点）
- 确保 wireEnrichmentLlm 在 schema 和 llm 都 ready 之后调用（可能需要 ctx.on('ready') 或 effect）
- 确保 LLM provider 配置正确（DashScope 或 DeepSeek，model 选型）

### 2. 多替代 FK 精化

当前 tableKindPlugin.relations() 把一个 DimensionRef 的所有 join_keys AND 连接成 on 字段：

    on: "server_id = server_id, game_server_id = server_id"

对于「同 DIM 多替代外键」场景（如 acc_summary 有 4 个不同的 server_id 列都可以 join dim_server），这是过度约束。应区分：

- 复合键（AND 连接，如 server_id + ds = server_id + ds）
- 替代外键（OR / 多条独立 joins 边）

改动位置：packages/data/semantic-layer/src/kinds/table-kind.ts 的 relations() 方法。

判断逻辑：如果 join_keys 中多个 dws_column 映射到同一个 dim_column，说明是替代外键；否则是复合键。

替代外键应生成多条独立的 RelationDef（每个替代键一条 joins 边），而非一条 AND 连接的边。

### 3. Events external_refs 第二轮

对 K11 scope 的 453 events 执行 ctx.schema.discoverEventRelations()。

前提是步骤 1 完成（llmCall 已接线）。可通过 agent tool 调用或直接写一个 seed 脚本。

验证：events 目录下的 YAML 文件应出现 external_refs 字段。

### 4. 验证生产 enrichment 正常工作

- 手动触发 ctx.schema.discoverRelations({ tables: ['某个DWS表'] })，确认两轮都跑
- 修改一个 DWS 表的 YAML（模拟 syncWrite），确认 on-write hook 自动触发 enrichment
- 检查产出的 dimension_refs 与 Phase 1 subagent seed 结果一致性

## 参考文件

| 文件 | 用途 |
|------|------|
| packages/data/semantic-layer/src/index.ts | wireEnrichmentLlm + SemanticLayerService |
| packages/data/semantic-layer/src/enrichment.ts | 核心 enrichment 逻辑 |
| packages/data/semantic-layer/src/kinds/table-kind.ts | relations() 需要精化 |
| packages/data/tool-discover-relations/ | agent tool（已注册） |
| wayfinder/semantic-layer/tickets/F1-dws-dim-discovery-formalization.md | ticket 全文 |
| wayfinder/semantic-layer/research/dws-dim-discovery-report.md | Phase 1 结果 + 多替代 FK 建议 |

Bundle/preset 相关文件需要在 session 中定位（搜索 agent.cordis.yml 或 preset-data-agent）。

## 验收标准

- [ ] wireEnrichmentLlm 在 bundle 挂载时自动调用
- [ ] ctx.schema.discoverRelations() 在有 LLM 时执行两轮策略
- [ ] on-write hook 在有 LLM 时执行两轮（验证至少一个表）
- [ ] 多替代 FK 表的 relations() 生成多条独立 joins 边（不再 AND 过度约束）
- [ ] events external_refs 已填充（至少部分 events 有结果）
- [ ] F1 ticket closed + map updated

# Session Prompt: SchemaProvider 路由冲突解决

## 背景

`wayfinder/semantic-layer/map.md` "Not yet specified" 记录了此遗留项：

> R4 确定了 `registerSchemaProvider` + `engineType` 路由的整体方案，但多 provider 注册时的优先级排序规则和冲突解决（同 engineType 多 provider 谁优先？）待实现时具体化。

当前只有一个 MaxCompute provider (`@deepseek-ai/dsh-query-maxcompute`)，所以实际不冲突。但设计需要为未来多 provider 场景确定规则。

## 相关文件

- `wayfinder/semantic-layer/research/r4-schema-provider-plugin.md` — R4 调研结果
- `packages/data/semantic-layer/src/` — SemanticLayerService 核心
- `packages/data/nl2sql-engine/src/` — 消费 schema 的引擎

## 目标

1. 定义当同一 `engineType` 有多个 `SchemaProvider` 注册时的行为：
   - 方案 A: 后注册覆盖先注册（last-write-wins）
   - 方案 B: 优先级数字（order 参数，低优先）
   - 方案 C: 报错拒绝（强制唯一）
2. 实现选定方案，添加测试
3. 更新 map.md "Not yet specified" 段落，记录决策

## 约束

- 当前只有一个 provider，不需向后兼容
- 与 Cordis 的 `ctx.provide` 语义对齐（Cordis 默认 last-write-wins）
- 保持 registerSchemaProvider 返回 disposer 的能力

## 参考 skill

- `dsh-plugin-development`（Cordis plugin 模式）
- `domain-modeling`（接口设计）

# Session Prompt: Terminology 挂载点统一

## 背景

`wayfinder/semantic-layer/map.md` "Not yet specified" 记录了此遗留项：

> Terminology 挂载点：全局注入（`ctx.terminology`）vs per-kind 构造参数。当前 `eventKindPlugin.toCorpusItem` 已接受 `terminology?` 参数，需统一为一种模式。

术语表（Terminology）将业务别名映射到标准字段名（如 "日活" → "DAU"、"流水" → "revenue"），用于 BM25 检索增强和 NL2SQL prompt 中的 alias 注入。

## 当前状态

- `eventKindPlugin.toCorpusItem(def, { terminology? })` — 显式传参
- `tableKindPlugin.toCorpusItem` — 尚未接入
- `metricKindPlugin.toCorpusItem` — 尚未接入
- 无全局 `ctx.terminology` 服务

## 相关文件

- `packages/data/semantic-layer/src/kinds/` — 三个 kind plugin 实现
- `packages/data/semantic-layer/src/types.ts` — DataSourceKindPlugin 接口
- `wayfinder/semantic-layer/research/r1-data-model-design.md` — 数据模型设计

## 目标

1. 决策：全局 `ctx.terminology` 服务 vs per-kind 构造参数
   - 全局优点：所有 kind plugin 自动获取，单一注册点，scope 切换时可整体替换
   - 参数优点：无全局状态，测试简单，不增加 ctx 污染
   - 推荐方向：全局服务（与 `ctx.scopes` 解耦联动 — scope 切换时 terminology 跟随）
2. 实现选定方案：
   - 若全局：新建 `TerminologyService`（或复用 scope-registry 内的配置）
   - 三个 kind plugin 统一消费方式
3. 添加测试验证 terminology 对检索结果的影响
4. 更新 map.md

## 约束

- 当前 K11 scope 无 terminology 文件（可创建一个 stub）
- 不改 DataSourceKindPlugin 接口的 toCorpusItem 签名（扩展 context 对象即可）
- 与 scope-registry 的 active scope 切换联动

## 参考 skill

- `dsh-plugin-development`（Cordis service 模式）
- `domain-modeling`（术语统一）

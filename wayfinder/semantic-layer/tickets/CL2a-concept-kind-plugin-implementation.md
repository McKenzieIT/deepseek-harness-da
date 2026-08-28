# CL-2a — ConceptKindPlugin 实现

**Type**: task (AFK)
**Phase**: context-layer-alignment
**Status**: closed
**Assignee**: claimed
**Blocked by**: [CL-2](CL2-concept-kind-plugin.md)（设计决策，已完成）
**Blocks**: [G7](G7-context-projection-unification.md)（间接——CL-2a 实现后 G7 才有实际代码可讨论）
**Related**: [CL-1](CL1-terminology-aliases-migration.md)（验证了图扩展模式）、[G1](G1-data-model-decision.md)（DataSourceKindPlugin 接口）

## Task

实现 CL-2 grilling 锁定的 ConceptKindPlugin 设计。原子完成，一个 commit。

### 实现清单

#### 1. ConceptDefinition schema + ConceptKindPlugin

- `packages/data/semantic-layer/src/types.ts`：新增 `ConceptDefinitionSchema`（zod）
  ```
  name: string (required)
  description: string (optional, default '')
  pref_label: string (optional)
  alt_labels: string[] (optional, default [])
  ```
- `packages/data/semantic-layer/src/kinds/concept-kind.ts`：新增 `conceptKindPlugin: DataSourceKindPlugin<ConceptDefinition>`
  - `kind: 'concept'`
  - `storageDir: 'concepts'`
  - `getId(raw)`: `typeof raw.name === 'string' ? \`concept:${raw.name}\` : undefined`
  - `toCorpusItem(def)`: `{id: \`concept:${def.name}\`, description: [def.name, def.description, def.pref_label, ...(def.alt_labels ?? [])].filter(Boolean).join(' ')}`
  - `toPromptContext(def)`: 概念名 + 描述 + alt_labels 列表
  - `toCriticContext`: undefined
  - `relations(def)`: `[]`（边不由 concept 声明——由 graph builder 处理）

#### 2. Graph builder 支持 concept→asset 边派生

- 图构建逻辑（wherever `RelationGraph.build()` is called）：
  - 加载所有 concept definitions
  - 扫描所有 asset definitions 的 `domains` 字段
  - 对于每个 asset.domains 中的 domain 值 `d`，如果 concept `concept:${d}` 存在，生成 `{sourceId: \`concept:${d}\`, relations: [{type: 'related_to', target: assetId}]}`
  - 这些边随其他 relation 一起传入 `graph.build(entries, aliasData)`

#### 3. Concept alias 进入 aliasIndex

- graph.build 的 `aliasData` 参数中加入 concept 的 `{nodeId: \`concept:${name}\`, prefLabel, altLabels}`

#### 4. 引用验证（domains 校验）

- loadDefinitions（或 registry 的加载逻辑）中：加载完所有 concept 后，校验每个 asset 的 `domains` 值都能匹配到一个 concept name
- 不匹配时：抛出加载错误（严格模式）

#### 5. graph-expand 支持 `related_to`

- `packages/data/nl2sql-engine/src/ontology.ts` `expandCandidates()`：
  - 当前只展开 `joins` 和 `derived_from`
  - 新增：展开 `related_to` 边（从 concept 节点到 asset 节点）
  - 注意：只在命中节点是 concept 时展开 related_to（避免 asset→asset 的 related_to 无限展开）
  - 判断：`if (h.id.startsWith('concept:'))` 则展开 related_to

#### 6. Tool 泛化

- `tool-get-definition`：改为遍历 registry.allPlugins() 按 kind 查找（不再硬编码 table→event→metric）；对 kind='concept' 的结果附带 related assets 列表
- `tool-edit-definition`：支持 kind='concept'；concept 的 patch 逻辑：description/pref_label 直接覆盖，alt_labels union with dedup
- `tool-list-domains`：改为读取 concepts/ 目录的 concept definitions（返回 name + description + alt_labels + asset_count）
- `tool-get-coverage`：增加可选 `domain?: string` 参数；传入时只统计该 domain 下的 assets
- 所有 tool 的 description 文本更新加入 "concept"

#### 7. K11 种子 concept YAML

- `examples/k11-semantic-layer/concepts/` 目录下创建 10 个 YAML 文件
- 每个 concept：name + description（从 K11 的业务语境填写）+ pref_label + alt_labels（初始可空，后续 enrichment 填充）

#### 8. 测试

- ConceptKindPlugin unit tests（schema parse、getId、toCorpusItem、toPromptContext）
- 引用验证 tests（valid domains pass、invalid domains throw）
- Graph builder tests（concept→asset related_to 边正确生成、concept aliases 入 index）
- expandCandidates tests（concept 命中 → related_to 展开到 assets）
- Tool 泛化 tests（get_definition/edit_definition 对 concept kind 正常工作）
- list_domains 返回 concept metadata tests

### 约束

- 原子完成：一个 commit，233+ existing tests 保持绿色
- 不做过渡方案
- 不新增 relation type（使用现有 `related_to`）
- 不改 tool 名称（只改 description + 内部实现）

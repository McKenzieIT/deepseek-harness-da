# W5 — ui-semantic-layer v1 UI（B 布局）

**Type**: task
**Status**: Open
**Blocked by**: W1（SchemaGateway）+ W4（evidence backend）

## Question

新增 `ui-semantic-layer` 包，v1 = **B 布局**（资产为首 + 证据侧栏；G4 Q2 决议）。遵循 `packages/client/ui-workspace`/`ui-settings` 的 slot 注册 pattern（R6）。

### 资产工作区（理解数据资产）
- nav **domain-first**（10 域，tag 式多对多——资产出现在它的每个域下）+ **kind 二级**（table→dws/dim）+ **kind filter**（翻转为 kind-first，G4 Q3）
- 工作区搜索框 + **faceted filter**（kind/domain/status）（G4 Q4；后端经 W1 SchemaGateway.search 复用 Bm25Linker）
- 资产详情：fields / relations / dimension_refs / domains / confirmation / coverage

### 证据侧栏（manage/optimize）
- coverage **KPI 卡** + **资产级 badge**（G4 Q6）
- eval **轨迹**：历次 run + per-batch before/after delta（经 W4）
- 缺口 + 最近变更 feed（enrichment 产出）

### 人驱动作
- **inline edit**（escape hatch，即写 + Tier-2 audit，G4 Q5）
- 手动 enrichment 触发 + 按需 eval 触发（经 W1/W3）
- goal dock（复用 `ui-goal` GoalBar pattern）

## 4 演进约束（须满足，为 B→A 不推翻）

1. 证据面 = **可提升模块**（自包含 view 读 W4，非内嵌工作区布局）
2. **落地路由可切换**（B 落地=工作区，A 落地=dashboard，作 route/config 开关）
3. 共享 evidence-query 后端（= W4）
4. 资产工作区 = **可深链独立视图**（非结构根，A 里可降为 drill 目标）

**Cmd+K 全局跳转 v1.x 不做**（G4 Q4）。

## 验收

- [ ] B 布局可跑：资产工作区（domain-first nav + kind 二级 + filter + 搜索）+ 证据侧栏 + inline edit + enrichment/eval 触发
- [ ] 4 演进约束满足
- [ ] coverage KPI + badge + eval 轨迹呈现

## 参考

- G4（Q1 范围 / Q2 B 布局+4 约束 / Q3 nav / Q4 搜索 / Q5 编辑 / Q6 质量形态）、R5/R6（UI 设计 + 实现 pattern）
- 依赖：W1（SchemaGateway）、W4（evidence backend）；pattern：`packages/client/ui-workspace`、`ui-settings`、`ui-goal`

# W5 — ui-semantic-layer v1 UI（B 布局）

**Type**: task
**Status**: Open
**Blocked by**: W5-lite 仅 W1；W5-full 额外依赖 W4

## Delivery Milestones

### W5-lite（仅依赖 W1）— 可独立交付

资产工作区完整可用，证据侧栏降级为占位态（"eval 未就绪，coverage 本地聚合"）。

**包含**：
- 资产工作区全部功能（domain-first nav + kind 二级 + filter + 搜索 + 详情）
- inline edit（即写 + Tier-2 audit）
- 手动 enrichment 触发（经 W1）
- coverage KPI 卡 + badge（**本地聚合 `confirmation.status`，不依赖 eval**）
- 证据侧栏 = skeleton placeholder + "eval 基建就绪后自动亮起"提示

**不含**：eval 轨迹、before/after delta、按需 eval 触发、goal dock

**价值**：4682 个资产从"只能改 YAML"升级为可浏览/可搜索/可编辑。即使 W3/W4 延期，团队已获得 Web 管理能力。

### W5-full（额外依赖 W4）— W5-lite 之上叠加

证据侧栏完整亮起：eval 轨迹 + delta + 按需 eval 触发 + goal dock。

**触发条件**：W4 就绪 → feature-flag `evidence.enabled` 翻转 → 侧栏从占位切换为完整视图。

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

### W5-lite 验收（可独立 ship）
- [ ] 资产工作区可跑：domain-first nav + kind 二级 + filter + 搜索 + 详情
- [ ] inline edit 即写 + Tier-2 audit
- [ ] coverage KPI 卡 + badge（本地聚合 `confirmation.status`）
- [ ] 证据侧栏 = graceful placeholder（feature-flag `evidence.enabled=false`）
- [ ] 4 演进约束满足（约束 #1 证据面已是独立模块，只是内容为 placeholder）

### W5-full 验收（W5-lite + W4 就绪后）
- [ ] 证据侧栏完整：eval 轨迹 + per-batch delta + 按需 eval 触发
- [ ] goal dock（GoalBar pattern）
- [ ] feature-flag 翻转无需代码变更

## 参考

- G4（Q1 范围 / Q2 B 布局+4 约束 / Q3 nav / Q4 搜索 / Q5 编辑 / Q6 质量形态）、R5/R6（UI 设计 + 实现 pattern）
- 依赖：W1（SchemaGateway）、W4（evidence backend）；pattern：`packages/client/ui-workspace`、`ui-settings`、`ui-goal`

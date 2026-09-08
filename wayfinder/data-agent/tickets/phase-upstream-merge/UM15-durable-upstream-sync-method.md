# UM15 — durable upstream-sync 工程方法

**Type**: grilling→prototype · **Status**: open · **Phase**: upstream-merge
**Blocking**: UM-ARCH（impact analyzer 在图上推理）+ UM-ADAPT（自动化它的 process）
**Serves**: demand ③——后续每次 upstream 更新快速定位"哪里要变"+ 生成新票
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase C，可与验证/PR 并行）

## Question

设计 + 建一套可复用工程方法，让后续 upstream dsh 每次更新都能快速知道 data-agent 哪里要变 + 生成新票。= 这次手动跑的 Track A+C（conflict + impact 评估）+ UM-ADAPT（adaptive 判定）的**自动化 + 流程化**。

## 组件

1. **staleness 检测**：记 fork 最后 merge 的 upstream-SHA（git note / 文件），定期/demand diff `upstream/master` latest → "N commits behind" 告警（这次 merge 9/4、upstream 9/8 已 +449，缺告警才发现晚了）。
2. **change-impact analyzer**（自动化 Track A+C，reason over UM-ARCH 图）：给定 upstream 自上次 sync 的新 commit，产出 ①conflict-overlap（fork 改过的 ∩ upstream 改过的）②seam-impact（5 seams 各被几个 commit 碰、break/采纳）③data-agent 包 overlap（应 0）④**架构移位 + adaptive vs surface 判定**（自动 UM-ADAPT）。
3. **ticket-generation workflow**：impact report → 毕业成 wayfinder 票候选（"迁 seam X break"、"采纳新 seam Y"、"解 conflict Z"、"regen cordis"），人确认后建票。
4. **cadence**：何时 sync（on upstream release / 周期 / on-demand）——grilling 定。
5. **merge-assistance 纪律**：把这次 merge session 的 94-conflict-resolution 纪律（accept-upstream vs keep-fork vs merge、additive-only、UM1-9 那套）形式化作执行手册。

## Deliver

①design doc（grilling 定 cadence + workflow）②tooling（prototype：staleness + impact-analyzer 脚本，自动化 Track A+C）③process 文档（merge 手册 + ticket-gen 模板）。

## Resolution

(open；建一次，后续每次 upstream 更新复用)

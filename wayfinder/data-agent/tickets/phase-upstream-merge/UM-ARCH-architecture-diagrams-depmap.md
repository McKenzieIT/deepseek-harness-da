# UM-ARCH — dsh + data-agent 架构图 + 依赖图 + gen/verify/update 机制

**Type**: task · **Status**: open · **Phase**: upstream-merge
**Blocking**: UM14（权威 dsh 图基于 synced latest）
**Foundational for**: UM15（impact analyzer 在图上推理）、UM-ADAPT（adaptive 守门用依赖图的"对齐状态"）
**Flow**: 见 `UM-flow-2026-09-08.md`（Phase B）

## Question

建工程机制：产出 `dsh` upstream + `dsh-data-agent` 两张 Mermaid 架构图 + data-agent→upstream 依赖图（含 violation 标记），带 gen/verify/update-on-change。这是 demand ③（durable 方法）+ Q2（adaptive-vs-patch 守门）的地基模型——没它，impact 分析只是文件 overlap；有它，才是架构对齐感知的。

## 子步

1. `gen-architecture-graph.ts`——从代码（包结构 + 跨包 import + 5 modular seam + @Remote assembly）生成两张 Mermaid + 依赖图。跟 repo 现有 `gen-module-graph.ts`/`gen-doc-graphs.ts`/`verify-module-graph.ts` 同 pattern。
2. `verify-architecture-graph.ts`——图与代码不漂移则 fail。
3. **依赖图**（data-agent→upstream）：每个 data-agent 组件 → upstream seam/包 → 契约（public / zombie violation）→ 对齐状态。v1 草表见 `UM-flow-2026-09-08.md`（含 R-DA-CLIENT-RUNTIME-DECOMMISSION 的 zombie violation + workspace-files 待采纳）。
4. **update-on-change gate**：每次 data-agent 或 upstream 更新 regen；gate 进 CI（`check:ci:static` 或新 gate）+ pre-push。像 `verify-module-graph`。
5. 用 gen 脚本生成的权威图替换 `UM-flow-2026-09-08.md` 里的手画 v1 草图。

## Deliver

`gen-architecture-graph.ts` + `verify-architecture-graph.ts` + 初始权威两张 Mermaid（dsh + data-agent）+ 依赖图 + update-on-change gate。

## Resolution

(open；gen 脚本设计→从代码生成→替换手画 v1；包名准确来自 tsconfig refs，wiring 需 gen 脚本从跨包 import 权威化)

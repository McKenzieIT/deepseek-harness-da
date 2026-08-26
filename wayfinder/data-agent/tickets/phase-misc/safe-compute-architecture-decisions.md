# 安全计算环境架构决策

> Spawned from [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) research (resolved 2026-08-26). Research produced findings and recommendations but NOT grilled decisions. This ticket locks the architectural choices before implementation proceeds.

**Type**: grilling (HITL)
**Phase**: misc
**Assignee**: claude (claimed 2026-08-26)
**Blocked by**: none (research complete)
**Blocks**: [result-cache-service](result-cache-service.md), [code-runtime-data-python](code-runtime-data-python.md)

## Question

Lock the architectural decisions for data-agent's safe compute environment. The [research](../../research/safe-compute-environment.md) surfaced facts + recommendations; this ticket converts them to grilled decisions.

## Decisions to grill

### 1. 数据注入方案

Research 评估了三种方案，推荐 C：

| 方案 | 描述 | 研究员推荐理由 |
|------|------|---------------|
| A | 新建 `resultCache` Service Definition（独立 seam） | 职责清晰，可测试，多 consumer |
| B | code-runtime binding 内聚（compute 内部自解析） | 最简，无新 seam |
| **C（推荐）** | 混合：resultCache SD 存在 + compute binding 是其薄 facade | A 的优点 + binding 调用路径清晰 |

**待 grill：** A vs B vs C？或其他方案？

### 2. 安全隔离层级

Research 发现 RLIMIT 单独不被行业认为是安全边界。推荐短期进程级增强：

| 层级 | 内容 | 复杂度 | 隔离强度 |
|------|------|--------|---------|
| **当前** | RLIMIT_CPU + RLIMIT_AS（协议已支持） | 零 | 资源限制（非安全边界） |
| **推荐短期** | +seccomp-bpf + namespace + Landlock + RLIMIT_NPROC=0 | 中（Python bootstrap 改动） | 进程级强隔离 |
| **中期可选** | gVisor / microsandbox | 高（需容器/VM 基础设施） | 用户态内核/microVM |
| **长期** | Firecracker microVM | 很高 | 虚拟机级 |

**待 grill：** 第一版到哪个层级？是纯 RLIMIT 先上再迭代，还是一步到位 seccomp+ns？

### 3. resultCache 是否作独立 seam

两种方式让 compute 拿到 query_data 的结果数据：

| 方式 | 描述 | 影响 |
|------|------|------|
| **独立 seam** | `ctx.resultCache` 作 Service Definition，多包可消费 | 新包 + Provider + hook 接线 |
| **内联** | compute 工具内部直接从 phase-gate state / session events 解析 rows | 无新包，但 present_table 也要数据时需重复 |

Research 推荐独立 seam（多 consumer：compute + present_table + 未来物化）。

**待 grill：** 独立 seam 还是先内联后抽取？

### 4. result_id namespace 设计

Research 推荐统一 namespace：

| 前缀 | 来源 | 说明 |
|------|------|------|
| `qr_` | query engine | SQL 执行结果 |
| `cr_` | compute tool | pandas 衍生结果 |

**待 grill：** 是否需要前缀区分？还是单一 namespace 无前缀？

### 5. Python venv 依赖范围

| 选项 | 包含 | 理由 |
|------|------|------|
| **最小** | pandas + numpy | 覆盖 90% 数据分析场景 |
| **扩展** | + scipy + sklearn | 统计检验 + 简单 ML |
| **完整** | + matplotlib + seaborn | 图表生成 |

**待 grill：** 初始 venv 包含什么？

### 6. compute 产出生命周期

| 选项 | 描述 |
|------|------|
| **session-scoped** | 随会话结束自动 GC |
| **持久化** | 存储到 audit/storage，跨会话可引用 |

Research 推荐 session-scoped（计算廉价、无持久化产品需求）。

**待 grill：** 确认 session-scoped？

## 背景材料

- 调研笔记：[`research/safe-compute-environment.md`](../../research/safe-compute-environment.md)
- 代码参考：`packages/code-runtime/`（现有 seam + worker-thread Provider + Python protocol）
- RBI 参考：`libs/rbi-mcp/src/rbi_mcp/tools/presentation.py`（hardcoded ops + AST eval）
- 外部事件：asteval ctypes 逃逸、GPT-5.6 Sol Pro 沙箱逃逸、NVIDIA OpenShell CVEs

## 关联

- [data-agent-safe-compute-environment](data-agent-safe-compute-environment.md) (parent research, resolved)
- [result-cache-service](result-cache-service.md) (blocked by this grilling)
- [code-runtime-data-python](code-runtime-data-python.md) (blocked by this grilling)
- [present-delivery-tools](present-delivery-tools.md) (compute blocked on above)

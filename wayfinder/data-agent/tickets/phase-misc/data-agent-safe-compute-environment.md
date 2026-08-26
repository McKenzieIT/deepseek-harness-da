# data-agent 安全计算环境设计

> Child of [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md) aggregate. Surfaced 2026-08-26 by the present_* delivery-tools grilling session: `compute` 的形态确定为 "LLM 生成代码 + 安全沙箱执行 against 数据"，但如何确保安全计算、如何提供执行环境需要调研。

**Type**: research (AFK)
**Phase**: misc
**Assignee**: (unclaimed)
**Blocked by**: none
**Blocks**: `compute` tool ship（[present-delivery-tools](present-delivery-tools.md) Decision #3）

## Question

Data-agent 的 `compute` 工具需要让 LLM 根据业务问题 + 查询结果数据，生成计算逻辑（pandas 等科学计算），在安全环境中执行并返回结果。核心问题：如何设计一个安全的、data-aware 的代码执行环境？

## 调研范围

### 1. 安全沙箱设计
- 现有 `code-runtime` seam 的安全模型（Service Definition: `packages/code-runtime/code-runtime/`；Providers: `code-runtime-worker-thread`(JS) + `code-runtime-python`(CPython subprocess)）
- `code-runtime` 的安全边界：binding-only I/O（程序只能通过 host binding 交互）、无网络、无 fs 直接访问 — 是否满足 data-agent intranet-security-first 需求？
- Python subprocess Provider 是否支持 pandas import？（dependency isolation：pandas + numpy 在 subprocess 虚拟环境中）
- 需不需要特化 Provider（`code-runtime-data-python`）还是在现有 Python Provider 上加 pandas binding？

### 2. 数据注入机制
- `query_data` 返回 `{ state: 'done', result_id, rows }` — rows 目前存在 session event log 中，但无按 result_id 索引取回的 service
- 方案 A：新建 `resultCache` Service Definition（`ctx.resultCache.get(resultId): Row[]`）— Provider 通过 `tools/post-execute` hook 捕获 query_data 结果
- 方案 B：code-runtime binding 内聚（`compute` 注册 `load_result(rid)` host binding，内部从 session state 解析）
- 方案 C：混合 — resultCache seam + binding 层调用 resultCache
- 评估维度：职责清晰度、可测试性、多 consumer 复用（present_table 未来物化也需要）

### 3. 计算结果存储与展示
- `compute` 的产出也是数据（DataFrame → rows）— 需要一个新 `result_id` 使 `present_table` 可引用
- result 存储层的统一 namespace：原始查询结果 + 计算衍生结果共享同一套 result_id 机制
- 结果的生命周期（session-scoped? persist?）

### 4. 与现有工具/门禁的边界
- `tool-bash` 已被 phase-gate 禁止 business user 触达 — `compute` 的 LLM-generated code 是否走同一条禁止路径，还是单独的安全通道？
- `code-runtime` 在 bundle `cordis.patch.yml` 中已有注释占位（"code-runtime runs pandas transforms"）— 解注释的前提是什么？
- Phase-gate INTERPRETATION_TOOLS 白名单已含 `compute` — 安全在 tool execute 内部实现（sandbox），不在 phase-gate 层

### 5. RBI 参考
- RBI 的 `compute` 用硬编码 operation 模板 + `_safe_eval_expression`（AST parse 受限表达式）— 我们决定不走这条路（不够 intelligent）
- RBI 的 `delivery_compute.py`（rbi-web service）做物化 — 参考其 result cache 实现

## 预期产出

一份调研笔记，覆盖上述 5 个维度，给出推荐方案 + 依赖链（需要先 ship 什么 infra packages），使 `compute` tool 可以进入实现阶段。

## 关联

- [present-delivery-tools](present-delivery-tools.md)（parent decision — compute blocked on this）
- [data-agent-tool-packages-shipping](data-agent-tool-packages-shipping.md)（aggregate）
- `packages/code-runtime/`（现有 seam + providers）
- `packages/bundle/data-agent/cordis.patch.yml:202-209`（code-runtime 注释占位）
- RBI `libs/rbi-mcp/src/rbi_mcp/tools/presentation.py`（compute 源实现）
- RBI `apps/rbi-web/src/rbi_web/services/delivery/`（delivery_compute 物化层）

---

## Research Note

Research completed 2026-08-26. Full findings at [`wayfinder/data-agent/research/safe-compute-environment.md`](../research/safe-compute-environment.md).

**Summary of recommendations:**
1. Ship new `@deepseek-ai/dsh-code-runtime-data-python` Provider (Python fd-3 protocol + RLIMIT sandbox + pandas/numpy venv)
2. Introduce `resultCache` Service Definition (hybrid option C: reusable seam + compute binding as thin facade)
3. Unified `result_id` namespace: `qr_` (query engine) + `cr_` (compute derivations), session-scoped
4. No new security boundaries needed — code-runtime binding-only I/O + kernel RLIMIT already satisfies intranet-security-first
5. Dependency chain: resultCache SD → resultCache Provider → data-python Provider → compute tool plugin → bundle integration

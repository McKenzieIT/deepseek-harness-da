# P-DA4 Resolution — Scope Routing Tools Design

## 决策总览

| # | 决策点 | 选择 | 理由 |
|---|--------|------|------|
| 1 | delegate_query 实现 | **Nl2sqlEngine 纯函数调用**（非 subagent） | eval-cli 先例；天然无 clarify；并行安全；50-80 行 glue code |
| 2 | scope 隔离机制 | **传参隔离**（不同 corpus/retrieval linker） | 不需要独立 Cordis root；不改全局状态；不写 scopes.yaml |
| 3 | 用户交互（clarify/stop） | **完全留在主 agent** | 引擎是纯计算，无交互通道；主 agent 负责 intent 理解 |
| 4 | INTERPRETATION 归属 | **主 agent 做 SYNTHESIS** | 跨 scope 汇总需要完整上下文；引擎只返回 rows |
| 5 | 并行多 scope | **`isConcurrencySafe: true`** | 每个 engine 实例完全独立，无共享可变状态 |
| 6 | scope 感知方式 | **resolve_scope(keyword) 工具**（非 system prompt 注入） | 模型主动调用；最小信息暴露；防权限泄漏和模型读错 |
| 7 | scope 识别三层 | **resolve_scope(确定性) + 记忆系统(习惯) + LLM推理(复杂)** | 各层职责清晰，智能不在工具里 |
| 8 | Ontology | **可管理可审计的知识图谱**（独立于 memory） | admin + 用户交互积累；有 provenance；可编辑 |
| 9 | phase whitelist | **delegate_query → UNDERSTANDING-only** | scope 路由是意图理解的一部分，进入 GENERATION 后 scope 锁定 |
| 10 | budget 控制 | **不设 delegate 次数硬上限，计入主 agent 总预算(60)** | Nl2sqlEngine 每次 ~3 LLM 调用，自然受总预算约束 |
| 11 | system prompt | **只注入当前 active scope 名称** | 不注入 scope 列表；不暴露其他 scope 技术细节 |

## 架构图

```
主 Agent (PhaseGate 4 阶段)
│
├── UNDERSTANDING
│   ├── search / load / route:clarify / route:proceed
│   └── 检测多 scope → 决定 delegate
│
├── delegate_query(scope_id, question)     ← 普通 tool, 非 subagent
│   ├── ctx.scopes.get(scope_id).semanticRoot
│   ├── loadRetrievalCorpus(targetRoot) → Bm25Linker
│   ├── new Nl2sqlEngine({ llm, odps, retrieval })
│   ├── engine.run({ question })
│   └── return { ok, sql, rows, decline_reason }
│
├── switch_scope(scope_id)                 ← 切全局 active scope
│
└── INTERPRETATION (主 agent 汇总所有 delegate 结果)
```

## 工具表（最终）

| 工具 | 作用 | Phase | 并发安全 |
|------|------|-------|---------|
| `resolve_scope(keyword)` | 确定性匹配 scope（alias + name/desc） | UNDERSTANDING | true |
| `switch_scope(scope_id)` | 切换当前 active scope | UNDERSTANDING | false |
| `delegate_query(scope_id, question)` | 跨 scope NL2SQL 查询（Nl2sqlEngine） | UNDERSTANDING | true |

**去掉的**：`list_scopes`（全量列举）→ 改为 `resolve_scope`（按需单一匹配）

## scope 识别三层架构

```
第一层: resolve_scope (确定性, ~0ms)
  - alias 精确匹配
  - scope name / description 关键词匹配
  - Ontology 属性匹配 (未来)

第二层: Ontology 知识图谱 (可管理, 可审计)
  - 来源: admin seed + 用户交互确认
  - 有 provenance (追溯每条关联的来源)
  - admin 可查看/编辑/删除
  - 独立于 memory 系统

第三层: LLM 推理 (实时, 有代价)
  - 对话上下文推断
  - 追问用户 → 确认后写入 Ontology
```

## 关键技术依据

1. **eval-cli 先例**：`packages/eval/eval-cli/src/context.ts` 已证明 Nl2sqlEngine 可以独立于 PhaseGate/Agent Loop 工作
2. **Nl2sqlEngine 是纯函数**：只需 `Llm` + `OdpsExecutor` + `RetrievalLinker` 三个接口
3. **天然无 clarify**：engine 只有 ok / decline / pending 三种终态
4. **并行安全**：无共享可变状态，多 engine 实例可并行
5. **Cordis Service 单例限制**：同进程子 agent 共享 ctx.schema，无法原生隔离 → 纯函数引擎绕过此限制

## 关键设计原则

- **用户决策留主 agent，确定性计算留 delegate** — delegate_query 是计算 tool，不是 subagent
- **最小信息暴露** — system prompt 只注入当前 active scope 名称，不暴露其他 scope 细节
- **模型主导路由** — 模型负责意图识别和调用 resolve_scope，harness 不主动注入 hint
- **Ontology 可管理可审计** — 不是隐式记忆，是有结构、有来源、可编辑的知识图谱

## 待验证（实验 ticket E-DA4）

- [ ] Nl2sqlEngine 对不同 scope 的 corpus 能否正确路由（BM25 linking 质量）
- [ ] ODPS executor 能否跨 scope 执行（不同 workspace/project 的 SQL）
- [ ] conventions 从目标 scope 的 config.yaml 加载是否完整
- [ ] 冷启动 Bm25Linker 的耗时（K11 ~100ms 已知，X63 ~10ms）
- [ ] Llm adapter / OdpsExecutor adapter 接口兼容性

## 遗留 ticket

- P-DA4b: phase-gate SQL_CONVENTIONS 动态化
- switch_scope 的 phase-gate state reset（scopes/active-changed → reset scope-sensitive state）
- Ontology 知识图谱设计（独立 ticket，涉及存储、provenance、admin UI）
- scope metadata aliases 扩展（scopes.yaml metadata.aliases 字段）

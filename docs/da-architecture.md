# dsh-data-agent Architecture

## 数据管道全景

```mermaid
flowchart TB
    subgraph UNDERSTANDING["UNDERSTANDING 阶段"]
        A[用户自然语言] --> B[route-gate 意图路由]
        B -->|proceed| C[search_data_sources]
        B -->|clarify| D[present_clarification → HALT]
        B -->|decline| E[honest_decline]
        C --> F[load_table/event_definition]
    end

    subgraph GENERATION["GENERATION 阶段"]
        F --> G[NL→SQL prompt + conventions]
        G --> H[LLM generates SQL]
        H --> I[sqlSyntaxGate + critic]
        I -->|pass| J[advance to EXECUTION]
        I -->|fail| K[fallback → retry/UNDERSTANDING]
    end

    subgraph EXECUTION["EXECUTION 阶段"]
        J --> L[query_data → MaxCompute sidecar]
        L --> M{3-state outcome}
        M -->|done| N[advance to INTERPRETATION]
        M -->|failed| O[fallback → GENERATION]
        M -->|running| P[wait/poll]
    end

    subgraph INTERPRETATION["INTERPRETATION 阶段"]
        N --> Q[present_table / present_decomposition]
        Q --> R[suggest_followups]
    end
```

## Capability Seam 拓扑

```mermaid
flowchart LR
    subgraph da["data-agent owned seams"]
        query["ctx.query<br/>QueryEngine"]
        schema["ctx.schema<br/>SemanticLayer"]
        embedder["ctx.embedder<br/>Embedder"]
        retrieval["ctx.retrieval<br/>Retrieval"]
        audit["ctx.audit<br/>AuditService"]
        nl2sql["ctx.nl2sql<br/>NL2SQLEngine"]
        identity["ctx.identity<br/>Identity"]
        scopes["ctx.scopes<br/>ScopeRegistry"]
    end

    subgraph providers["da providers"]
        qmc["query-maxcompute<br/>(stdio sidecar)"]
        sl["semantic-layer<br/>(YAML substrate + G3 AI-native enrichment)"]
        efh["embedder-fakehash<br/>(dev stub)"]
        eh["embedder-http<br/>(OpenAI-compat)"]
        ri["retrieval-inproc<br/>(BM25+vec RRF)"]
        audit_sqlite["audit<br/>(SQLite store)"]
        nle["nl2sql-engine<br/>(BM25 linking)"]
        id_stub["identity<br/>(stub → P9b)"]
        sr["scope-registry<br/>(YAML namespace registry)"]
    end

    subgraph dsh["dsh provided seams (consumed by da)"]
        tools["ctx.tools"]
        llm["ctx.llm"]
        sp["ctx.systemPrompt"]
        cred["ctx.credentials"]
        subagents["ctx.subagents"]
    end

    query --- qmc
    schema --- sl
    embedder --- efh
    embedder --- eh
    retrieval --- ri
    audit --- audit_sqlite
    nl2sql --- nle
    identity --- id_stub
    scopes --- sr

    subgraph orchestration["Orchestration (phase-gate)"]
        pg["phase-gate plugin<br/>7 event hooks"]
    end

    pg -->|"tools/post-execute<br/>(observe tool results)"| tools
    pg -.->|"ctx.tools.guard (API: hard whitelist, not an event hook)"| tools
    pg -->|"agent/request<br/>(reasoningEffort)"| llm
    pg -->|"system-prompt/assemble<br/>(persona + phase instructions)"| sp
    pg -->|"agent/turn-stopping<br/>(phase transition)"| tools
    qmc -->|"credentials.resolve()"| cred
```

## Bundle 组合层次

```mermaid
flowchart TB
    base["dsh-base<br/>(core: tools, llm, session, agent-loop, ...)"]
    web["dsh-web-app<br/>(browser UI + client modules)"]
    da_bundle["dsh-data-agent<br/>(disable code-agent + insert data seams)"]
    preset["data-agent preset<br/>(phase-gate + tool roster)"]

    base --> web
    base --> da_bundle
    da_bundle --> preset

    style da_bundle fill:#e1f5fe
    style preset fill:#e1f5fe
```

## da 包与 dsh 的边界

```
packages/
├── core/           ← dsh (不动)
├── llm/
│   ├── llm/        ← dsh (不动)
│   ├── llm-deepseek/ ← dsh (不动)
│   └── llm-dashscope/ ← DA [data-agent]
├── shell/          ← dsh (不动)
├── subagent/
│   ├── subagent/   ← dsh (不动)
│   └── subagent-qoder/ ← DA [data-agent]
├── credentials/
│   ├── credentials/     ← dsh (不动)
│   ├── credentials-local/ ← dsh (不动)
│   ├── credentials-keychain/ ← DA [data-agent]
│   └── credentials-keychain-host/ ← DA [data-agent]
├── data/           ← DA (全部 da-owned: phase-gate, semantic-layer, audit, nl2sql-engine, scope-registry, tool-discover-relations, preset-autojoin, tool-*)
├── query/          ← DA (全部 da-owned)
├── embedder/       ← DA (全部 da-owned)
├── retrieval/      ← DA (全部 da-owned)
├── eval/           ← DA (全部 da-owned)
├── identity/       ← DA (全部 da-owned)
└── bundle/
    ├── base/       ← dsh (不动)
    ├── web-app/    ← dsh (不动)
    └── data-agent/ ← DA
```

## 更新规则

- 新增/删除 seam → 更新 "Capability Seam 拓扑" 图
- Pipeline 阶段变更 → 更新 "数据管道全景" 图
- 新增 da 包 → 更新 "da 包与 dsh 的边界" 树
- 本文与 `docs/capability-seams.md`（auto-generated）互补，不重复

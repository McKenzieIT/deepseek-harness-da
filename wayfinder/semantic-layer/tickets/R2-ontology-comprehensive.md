# R2 — Ontology / 知识图谱全面调研

**Type**: research
**Status**: Resolved（2026-08-21）
**Blocked by**: —

## Resolution

Ontology 与语义层是互补两层（节点属性 vs 边）。推荐轻量实现：YAML relations 声明 + in-memory adjacency list。不需要图数据库。详见 `research/r2-ontology-comprehensive.md`。

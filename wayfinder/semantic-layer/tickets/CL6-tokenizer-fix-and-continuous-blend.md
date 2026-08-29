# CL-6 — Tokenizer 修复 + Continuous-blend 生产实现

**Type**: task
**Phase**: context-layer-alignment
**Status**: resolved
**Assignee**: claude
**Blocked by**: 无（CL-5 已完成）
**Blocks**: [CL-7](CL7-production-retrieval-experiment.md)

## Resolution

All changes in `packages/data/tool-search-data-sources/src/index.ts`:

1. **extractQueryTerms fix**: CJK/ASCII mixed tokens now segment at boundaries and generate bigrams per CJK segment. Exported for testability. 39% of K11 queries were affected.
2. **applyContinuousBlend**: Coverage-weighted BM25+graph fusion. Graph-only candidates get a median-floor score to survive the topK cap in graph expansion. Without this floor, alias resolution is effectively disabled in the 4692-item production corpus.
3. **Config.blendingMode**: `'strategy-b'` (default) | `'continuous-blend'`. Dispatched via `blend` variable in `apply()` closure.
4. **6 new tests** (S14–S19): tokenizer fix verification, continuous-blend graph-only candidates, graceful degradation without resolveAlias, default mode preserves B behavior.
5. **L3 enrichment**: 24 tables enriched with alt_labels via `enrich-l3-aliases.ts`.

19/19 tests pass. `pnpm run typecheck` clean for tool-search-data-sources.

## Question

将 CL-5 原型验证的两项行动落地到生产代码：(1) 修复 `extractQueryTerms` CJK/ASCII 混合 bigram bug，(2) 实现 `continuous-blend` 作为可配置 blending mode。

### 1a. 修复 extractQueryTerms

文件：`packages/data/tool-search-data-sources/src/index.ts`

当前 bug：`extractQueryTerms` 对 CJK/ASCII 混合 token（如"氪金超过500元的玩家"）整体做 CJK regex 检测，因含 ASCII 字符检测失败，不生成 bigram。39% 的 K11 eval query 受影响。

修复方案：在 CJK/非CJK 边界分段，对每个 CJK 段独立生成 bigram。参考 `packages/eval/retrieval-experiment/src/blending.ts` 的 `extractQueryTerms` 修复版实现。

验证：
- 现有 `tool-search-data-sources` tests 全绿
- "这个月氪金超过500元的玩家有多少" 应生成包含 "氪金" 的 terms
- "ARPPU是多少" 应生成 "arppu" + "是多" + "多少"

### 1b. 实现 continuous-blend 作为可配置 blending mode

在 `applyAliasFusion` 旁新增 `applyContinuousBlend` 函数，逻辑：
1. 计算 query coverage = terms_with_alias_hits / total_terms（用 `extractQueryTerms` + `graph.resolveAlias`）
2. BM25 pass：score 按 `(1 - coverage)` 加权（归一化到 max BM25 score）
3. Graph pass：alias resolve → 命中节点 + 1-hop 邻居 → score 按 `coverage` 加权（归一化到 max graph hit count）
4. 合并去重，按 final score 排序

在 Config 中新增：
```typescript
readonly blendingMode?: 'strategy-b' | 'continuous-blend'  // default 'strategy-b'
```

在 `execute` 中按 `config.blendingMode` 分派（`applyAliasFusion` vs `applyContinuousBlend`），不改动其余管线（query expansion、ctx.retrieval、graph expand、qualify 均不变）。

### 1c. 测试

- 所有现有 tests 不变（默认 strategy-b）
- 新增 tests：continuous-blend 路径、coverage 计算、graph pass 引入新候选
- `pnpm test -- packages/data/tool-search-data-sources packages/data/semantic-layer packages/data/nl2sql-engine` 全绿

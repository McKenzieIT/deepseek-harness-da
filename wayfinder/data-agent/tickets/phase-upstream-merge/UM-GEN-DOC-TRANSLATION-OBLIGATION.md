# UM-GEN-DOC-TRANSLATION-OBLIGATION — 生成文档的翻译义务：带上 zh 生成 vs 从配对哈希豁免

**Type**: grilling · **Status**: resolved (2026-09-14, decision; 实现待落地) · **Phase**: upstream-merge
**Assignee**: unclaimed
**Blocked by**: —
**Blocks**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) 的 `translation pairing` 门（A 类 pre-existing）长期可解 + 喂 [UM15](UM15-durable-upstream-sync-method.md)（regen 清单的翻译义务形式化）
**Graduated from**: [UM12](UM12-post-merge-ga-fork-ci-resweep.md) + [UM15](UM15-durable-upstream-sync-method.md) 2026-09-14（本轮 regen `gen-doc-graphs` 实测 +2 条 translation-pairing sub-failure）

## Question

同仓两个生成器对翻译义务**处理不一致**：

- **`gen-module-graph`**：写 `.md` + `.zh.md` + `.i18n.yaml` **三件**（本轮删僵尸 regen 实测 "3 artifact(s) written"，配对债为零）。
- **`gen-doc-graphs`**：**只写英文 `.md`**（6 个产物：capability-seams / event-producer-consumer / agent-lifecycle / tool-execution-pipeline / graph-atlas / apps/cli/composition）。其 `.zh.md` 是**人工评审译文**，`.i18n.yaml` 记配对哈希。

后果：任何 upstream graph 变动触发 `gen-doc-graphs` regen → 英文变了、zh 没变 → `verify-translation-pairing` 报 "out of sync"（本轮实测 `capability-seams.md` + `event-producer-consumer.md` 各 +1 sub-failure）。`translation pairing` 门本就红（A 类 pre-existing，归 parallel-dev-cleanup/R1），但 regen 会让它**更红**——这是 durable sync 方法（[UM15](UM15-durable-upstream-sync-method.md)）的硬阻塞：每次 upstream sync 都会 regen，每次 regen 都会打破配对。

三个选项需人定：

- **(a) 让 `gen-doc-graphs` 带上 zh 生成**：和 `gen-module-graph` 一致。但 graph 文档的 zh 是人工评审译文，机翻会降质——除非 zh 也走生成器（那得写 zh 渲染逻辑）。
- **(b) 把生成文档从配对哈希里豁免**：`verify-translation-pairing` 的 in-scope 判定排除 `gen-doc-graphs` 的 6 个产物。代价：zh 侧 drift 不再被抓（但 zh 本来就追不上生成的英文——现状已是如此，只是门在喊）。
- **(c) 混合**：结构化部分（表格/mermaid）生成器带上 zh，prose 部分豁免。

## Scope

grilling 定 (a)/(b)/(c)。产出：一个决策 + `gen-doc-graphs` 或 `verify-translation-pairing` 的对应 patch。喂 [UM15](UM15-durable-upstream-sync-method.md) §5.3（regen 清单必须把翻译义务形式化——这是 7 项 grilling 第 8 项「impact report 落哪」的同源问题：凡生成文档都有这个翻译义务冲突）。

## 诚实边界

- 未读 `verify-translation-pairing.ts` 的 in-scope 判定逻辑（(b) 的可行性需读源确认它怎么决定哪些文件是「in-scope documentation must merge bilingual」）。
- `gen-module-graph` 写 zh 的机制（它是真生成 zh 文本，还是 copy 英文做占位？）未读——(a) 若要 `gen-doc-graphs` 跟齐，得先理解 module-graph 怎么做的 zh。
- 本轮只实测了 `gen-doc-graphs` 打破配对；`gen-architecture-graph`（只写英文 `architecture-graph.md`，无 zh 对）是否也在 in-scope 里、是否也欠配对，未核。

## Resolution

### [2026-09-14 grilling] 决策 = 生成器带上 zh（(a)）。实现待落地

用户拍板：**(a) 让 `gen-doc-graphs` 带上 zh 生成**（跟 `gen-module-graph` 一样写 `.md`/`.zh.md`/`.i18n.yaml` 三件），**不**走 (b) 豁免配对哈希、也**不**走 (c) 混合。

理由（从决策反推）：fork 重视双语文档的人工评审质量，但「regen 英文必打破配对」这个结构性问题不能靠豁免掩盖（豁免 = zh drift 永远不被抓，durable sync 方法每次 regen 都让 zh 落后）。正确路径是让生成器自洽：regen 同时刷英文和 zh，配对哈希自然保持。代价（机翻降质）通过「结构化部分（表格/mermaid/路径）机器生成、prose 部分人工评审」在生成器内部分层处理——这是实现细节，不改变 (a) 的决策。

**实现待落地（下 session）**：
1. 先读 `gen-module-graph.ts` 的 zh 写入机制（`renderIndex`/`writeArtifacts` 那段，`:112-151`）——它是真生成 zh 文本，还是 copy 英文做占位？决定 `gen-doc-graphs` 的 zh 渲染怎么写。
2. 给 `gen-doc-graphs.ts` 的 6 个产物（capability-seams / event-producer-consumer / agent-lifecycle / tool-execution-pipeline / graph-atlas / apps/cli/composition）加 zh 渲染 + `.i18n.yaml` 配对哈希写入。
3. regen + 验证 `verify-translation-pairing`（本轮 +2 sub-failure 应清零）。
4. 同步核 `gen-architecture-graph`（只写英文、无 zh 对）是否也欠配对——若是，一并加 zh。

落地后 UM12 的 `translation pairing` 门（A 类 pre-existing，归 parallel-dev-cleanup/R1）的 gen-doc-graphs sub-failure 清零；UM15 §5.3 regen 清单的翻译义务形式化 = 「生成器自带 zh」。

**→ 本票 grilling resolved（决策已定）。实现是一个 follow-on task（下 session），tracked 在 UM12 translation-pairing 修法 + UM15 regen 清单。**

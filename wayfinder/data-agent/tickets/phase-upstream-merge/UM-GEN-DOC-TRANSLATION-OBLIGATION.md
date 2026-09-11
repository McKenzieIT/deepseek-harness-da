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


## Session progress — 2026-09-11（S-3 证伪前提 + 用户锁定 Cordis region-splice，apply 待做）

- **⚠ premise 证伪**：`gen-module-graph.ts` **不** emit md/zh/i18n 三件套——只写英文 `docs/module-graph.md`；`.zh.md` 人工审校（文件头自述："英文源由 gen-module-graph.ts 生成，本中文为审校对应，更新：跑 gen-module-graph → 更新本文件 → `verify-translation-pairing --write`"）；`.i18n.yaml` 由 `verify-translation-pairing --write` 写。原 ticket/任务 "gen-module-graph 已写三件，作参考" 是未验证错误前提（ticket 自身 honesty boundary 亦承认 "gen-module-graph 写 zh 的机制…未读"；声称 "3 artifact(s) written" 从未验证，不出现在 gen-module-graph.ts）。
- **真 zh 参考 = `scripts/gen-cordis-catalog.ts`**（:880-1030）：`renderPageRegion` 生成语言无关 region → 对 `[page, page.zh.md]` 两侧 `spliceRegion(current, region)` 注入（保人工 prose）→ `maybeRecordPair(pageRel, before)`(:937，exported) 仅当 prose 字节不变时刷新 `.i18n.yaml`（否则留 stale → gate RED → 人工翻译后 `--write`）。从不静默 create 新 pair 的 sidecar。
- **复用 primitives 在 `scripts/translation-pairing.ts`**：`blobHash(content: Buffer)`(:71)、`renderPairMeta(source,sourceHash,zh,zhHash)`(:109)、`parsePairMeta`(:89)、`partitionGeneratedRegions(content): {regions, stripped}`(:35)、fence grammar(:21-23 `<!-- BEGIN/END GENERATED <slug> -->`)、`spliceRegion`（gen-cordis-catalog.ts，exported）。gen-doc-graphs 应同 import。
- **8 products 非 6**：`renderDocs()`(:1491) 返 5 in-corpus `docs/*`（capability-seams/event-producer-consumer/agent-lifecycle/tool-execution-pipeline/graph-atlas）+ 3 out-of-corpus（apps/cli、examples/headless-agent、examples/acp-agent composition）。只 5 `docs/*` 进翻译语料（`isTranslationSource`=README+docs/，:180-187）；3 组合文件须纯英文（加 .zh.md 会被 gate orphan-flagged）。
- **`.i18n.yaml` schema** = 双语对一致性记录（4 行注释头 + `<basename>.md: <40-hex git-blob-hash>` + `<basename>.zh.md: <40-hex>`，`renderPairMeta` 写）非 title/description/nav。
- **用户 2026-09-11 锁定方向 = Cordis region-splice**（option i，S-3 推荐；option ii full-zh render 不可选——破坏现有人工翻译）。
- **apply plan**（S-3 `/tmp/s3-patch.md` 若持久；自含要点见 handoff prompt §五A）：3a imports（`blobHash`/`partitionGeneratedRegions`/`renderPairMeta` from `./translation-pairing.ts` + `maybeRecordPair`/`spliceRegion` from `./gen-cordis-catalog.ts`，皆已 export，gen-cordis-catalog main 有 entry-point guard 故 import side-effect-free）；3b（5 render fns 的 mermaid/tables 包 `BEGIN/END GENERATED <slug>` fence——renderCapabilitySeams mermaid+services table / renderEventRelations mermaid+matrix / renderLifecycle mermaid ONLY（prose 不 fence）/ renderToolPipeline mermaid ONLY / renderIndex `|Graph|Mode|` index table ONLY；**需先读各 render fn 拿 verbatim old**——S-3 给 representative shape 非 verbatim；`partitionGeneratedRegions` 要求 well-formed markers，BEGIN/END slug 配对否则 throw；不 fence renderAppComposition）；3c（main() rewrite：`PAIRED_DOCS` Set 5 docs/* + write loop 加 splice zh `for (const region of partitionGeneratedRegions(doc.content).regions) zhNext = spliceRegion(zhNext, region)` 仅 `existsSync(zhAbs)` 时 + `maybeRecordPair(doc.rel, before)`；不 create zh from scratch——cordis rule）。
- **⚠ bootstrap 待验**：**先读 `spliceRegion`（`scripts/gen-cordis-catalog.ts:920`，非 S-3 说的 :747）** body 确认 insert-if-absent（首 regen 进 fence-less zh 文件——5 个现有 `.zh.md` 是从 fence-less 英文人工翻的，首 regen 须 INSERT fence；gen-cordis-catalog 曾同样 bootstrap）。若只 replace existing fenced pairs → 需 one-time migration helper 先 insert fences 进 5 个 `.zh.md`。
- regen `pnpm run gen-doc-graphs`（8 md + 5 zh-splice + 5 i18n = 18 touches）+ `pnpm run verify-translation-pairing`（structured-only regen → **GREEN**——maybeRecordPair 见 prose 字节不变 → 一次刷新两侧 hash；prose change → **RED** by design，人工翻译后 `--write`）+ `verify-md-links`。commit on resync `[wayfinder] 线3: gen-doc-graphs zh emission (Cordis region-splice, UM-QODER-RETIRE 前置)`。**不半做**——partial（3a/3c 无 3b）= `verify-translation-pairing` RED（English 无 fence → regions 空 → maybeRecordPair 见整文件 prose 变 → 不 refresh → stale）。
- follow-on（out of scope）：`gen-architecture-graph.ts`（只英文 `docs/architecture-graph.md`，无 zh）若 in-corpus 需同处理或 one-time .i18n.yaml；`renderIndex` 死 label `examples/cordis-agent/composition.md`（APP_EXAMPLES 不含）应 prune。

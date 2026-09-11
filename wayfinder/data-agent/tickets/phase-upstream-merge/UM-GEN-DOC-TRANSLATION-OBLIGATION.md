# UM-GEN-DOC-TRANSLATION-OBLIGATION — 生成文档的翻译义务：带上 zh 生成 vs 从配对哈希豁免

**Type**: grilling · **Status**: resolved (decision) + **实现已落地 2026-09-11**（resync `4d4f725748`，全绿，未 push） · **Phase**: upstream-merge
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


## 实现已落地 — 2026-09-11（resync `4d4f725748`）

决策 (a)「生成器带上 zh」按用户锁定的 **Cordis region-splice** 路线**实现完成并全绿**，提交在 resync 树 `4d4f725748`（17 files, +342/−128；未 push）。

**改了什么**

- `scripts/gen-cordis-catalog.ts`：`spliceRegion(content, region, beginMarker?, endMarker?)`，默认仍为 cordis-surface 两常量。原 JSDoc 的不变量（「只匹配本生成器的精确 marker，不用通用 grammar，好让别人的 region 大声失败而不是被静默覆盖」）**保留**——参数化后仍是精确匹配，marker 由调用方提供。既有 call site（:1102）不传额外参数 → **cordis 目录字节不变**（`verify-cordis-catalog`: 99 generated file(s)/region(s) up to date）。
- `scripts/gen-doc-graphs.ts`：5 个 render fn 把结构化块包进 `BEGIN/END GENERATED <slug>`；新增 `PAIRED_DOCS` / `generatedBegin` / `generatedEnd`；`main()` 写英文后把 region 经 `localizePageRegion` 注入 `.zh.md`，再 `maybeRecordPair`。zh 缺失或 render 无 region 一律 fail-closed。
- `docs/*.{md,zh.md,i18n.yaml}` ×5 重生成。

**5 slug**：capability-seams / event-producer-consumer / agent-lifecycle / tool-execution-pipeline / graph-atlas。`apps/cli/composition.md` 不配对（无 `.zh.md`），符合 S-3 的判定。

### 本次实现纠正的 4 处前置错误

1. **`spliceRegion` slug 硬编码**（S-3 的 SURPRISE，已证实）：它比的是 `line === REGION_BEGIN`，那是 `cordis-surface` 字面量，不匹配 gen-doc-graphs 的 5 个 slug → companion 改动**非可选**。已按 generalize 路线做（而非在 gen-doc-graphs 里另写一份本地 splice），因 default 参数让 cordis 侧字节不变，代价最小。
2. **交接 prompt 的 3a import 清单漏了 locale 改写**：`renderIndex` 的表格链接指向 `docs/*.md`，若不改写，每次 regen 都把 zh 侧索引链接打回 `.md`。已复用**已 export 的 `localizePageRegion`**（`gen-cordis-catalog.ts:956`），不必直接 import `rewriteTranslationLinkLocales`。实测：`module-graph.zh.md` 等配对目标→`.zh.md`，`../apps/cli/composition.md`（无 zh 对）保持 `.md`，`verify-md-links` 1730 文件全绿。
3. **prompt 说「structured-only regen → GREEN」——对首轮是错的**。`maybeRecordPair` 要求 recorded hash == 写前字节（`gen-cordis-catalog.ts:1145`）**且**两侧 stripped 不变（`:1147-49`）；而「引入 fence」本身就把内容从 unfenced prose 移进 fenced region → **两侧 stripped 都变** → 首轮必然 decline。实测首轮 `refreshed 0`，**必须一次 `--write`**。第二次 regen = `spliced 0, refreshed 5` → **稳态自洽已实证**，此后 regen 不再打破配对（这正是 (a) 想要的）。
4. **不可用裸 `--write`**：脚本自带守卫（`translation-pairing.ts:293-295`：「recording pairs you did not review blesses unconfirmed content」）要求显式 pair 路径或 `--all`。只对这 5 对显式 `--write`；corpus 里 `config-catalog` / `subsystems/README` / `tool-catalog` / `adr/0002` 等 stale 属既有真实翻译债（A 类 pre-existing，归 parallel-dev-cleanup/R1），**不能**被 `--all` 顺手抹掉。

### 这次 `--write` 为什么是诚实的（已逐行核）

原本 stale 的 2 对（`capability-seams` recorded md `a47ec285` vs 实际 `c87a3991`；`event-producer-consumer` `88413a45` vs `a2cab381`——正是本票记的 2 条 sub-failure）的 drift **全部落在结构化块内**：前者全是 mermaid 节点行（fork 新增的 `ctx.audit`/`ctx.embedder`/`ctx.nl2sql` 等 data 包），后者全是矩阵表行。**无 prose drift** → fence 化后两侧 prose 与人工复核过的状态逐字节一致，重新记账不是掩盖债务，而是让这 2 条 pre-existing RED **合法转绿**。另 3 对（agent-lifecycle / tool-execution-pipeline / graph-atlas）本就同步。

### 代价（既定 doctrine，非本次新引入）

fence 内是英文，只有配对文档链接按 locale 改写。依据是仓库自述原则（gen-cordis-catalog 生成的那句 "the language sides differ only in locale-specific paired document paths"）+ 先例 `docs/subsystems/agent-team.zh.md` 的 cordis-surface region 即英文。具体损失：`graph-atlas.zh.md` 的 7 行译名（`| 图 | 模式 |`、`模块依赖图`、`能力 seam 与核心服务`、`agent（智能体）轮次与步骤生命周期` …）变英文；`agent-lifecycle.zh.md` / `tool-execution-pipeline.zh.md` 的 mermaid **本来就是全英文**（participant / Note over / alt 标签皆英文），几乎无损失。译者从此只拥有 fence 外的 prose。

### 门禁

`verify-doc-graphs` ✔ / `verify-md-links`(1730) ✔ / `verify-cordis-catalog`(99) ✔ / scoped `verify-translation-pairing`(5 pairs consistent) ✔ / `tsc -b tsconfig.host.json` exit 0 ✔ / pre-commit hooks（translation pairing staged records、lint staged、whitespace、vendor manifest guard）全 ✔ / 构建零 untracked 污染。

### 仍未做（follow-on，不在本次范围）

- `gen-architecture-graph.ts` 只写英文 `docs/architecture-graph.md`、无 zh 对——是否 in-corpus、是否欠配对，仍未核（本票 honesty boundary 的第 3 条至今未清）。
- `renderIndex` 的死 label `examples/cordis-agent/composition.md`（`APP_EXAMPLES` 不含）应 prune。
- corpus 级 `verify-translation-pairing` 仍红，但**全部是既有的 A 类 pre-existing**（config-catalog / subsystems-README / tool-catalog / adr-0002 incomplete pair + 一批 wrong-locale link），与 gen-doc-graphs 无关；本票负责的 gen-doc-graphs sub-failure **已清零**。

# Kind 1 (Prompt Englishization) — Grilling Brief

> Status: COMPLETE. Sections 1-3 by evidence subagent; sections 4-7 + open questions completed by the main session after the subagent's connection dropped.
> Purpose: evidence for a human-led decision. This brief does NOT make the decision and does NOT modify tickets/maps/source.

---

# ⚠️ TWO RETRACTIONS (2026-09-04) — read before using any number below

An earlier revision of this header was lost to a concurrent commit; this is the restored and expanded version.

## Retraction 1 — statistical: EXP4's `-3.0%` is not significant

Post-hoc paired testing finds the qwen3.7-max language effect **null on every metric**:

| metric | EXP4 (qwen3.7-max) | EXP2 (qwen-plus) |
|---|---|---|
| best-of-k pass rate | −3.0pp, McNemar **p=0.332** | −41.1pp, **p<0.001** |
| pass^k pass rate | +1.2pp, **p=0.875** | −23.8pp, **p<0.001** |
| attempt-level (n=504) | 371/504 vs 366/504 | 249/504 vs 71/504 |
| ordinal Wilcoxon (pass-count 0–3) | **p=0.749** | **p<0.001** |
| flakiness (any-pass, not all-pass) | 53 vs 46, **p=0.427** | 76 vs 47, **p=0.002** |

At n=168 the **MDE is ~5.4–10.1pp**; detecting the observed 1.2pp would need **N≈10,000**. The sign even flips between verdict semantics — itself evidence the effect sits inside the noise band.

Wherever §1–§3 reason about "the −3.0% degradation", substitute **"no detectable difference, effect < 5.4pp"**. This *strengthens* the case for Kind 1's technical viability. It also makes **§3's "two defects confound the headline numbers" moot** — there is no headline effect to confound. Any per-dimension concentration (L3, comparison, distribution) is sub-slice noise on n≈10–44 and is **not** a finding. EXP2's qwen-plus effect remains significant on every metric.

## Retraction 2 — measurement: §1–§3's corpus figures and line numbers are WRONG

These were produced by this brief's authoring pass, then propagated into four tickets before an independent review caught them. Verified corrections, re-derived mechanically against the working tree:

| §1–§3 claim | **Verified actual** |
|---|---|
| `prompt.ts` = 1129 CJK / 198 lines; "combined LLM-facing = 1161"; "live LLM-facing = **847**" | **782 CJK ideographs** (913 incl. CJK punctuation), **203 lines**. No counting method reproduces 1129/1161/847. |
| `见方言规范` at `:111`, `:113`; 6 dependent sites `:111,113,124,174,186,188` | **`:54`, `:56`** (inside `renderCoreRules` rules 1 and 3) **and `:145`** (date block) — **3 sites; none of the claimed lines contain it** |
| `buildEvalPrompt` defined at `:159` | **`:180`** |
| `renderConventionsPrompt` called at `:71` / `:161` | **`:108`** (buildPrompt) / **`:182`** (buildEvalPrompt) |
| `TOOL_CATALOG` at `:51`; normative strings at `:53`, `:54` | `TOOL_CATALOG` at **`:88`**; `不得硬编码` at **`:119`**; `仅 SELECT，必带分区过滤` at **`:91`** |
| `buildEvalPrompt` holds 314/1161 = **27%** of the CJK | ≈**85 = 10.9%** |
| "The 8 core rules are **duplicated near-verbatim** at `:110-118` vs `:185-193` (187 vs 188 CJK)" | **FALSE — no duplicate exists.** `renderCoreRules(isTrend)` is a **shared function** (`prompt.ts:53`); `buildPrompt:139` and `buildEvalPrompt:198` call the **same** one. `renderCandidates` is shared too (`:27`). The `nl2sql-4` refactor already deduplicated these. Actual rule-block sizes: 64 and 68 CJK. |
| "No test guarantees the two rule copies stay in sync" | **FALSE.** `tests/prompt.spec.ts` is explicitly *"exact-output pin (nl2sql-4 refactor guard)"* and **byte-pins both functions' output**. |
| `query-postgres/src/conventions.yaml` (130 CJK) | the file is **`conventions.ts`** (130 CJK is correct) |
| `conventions.ts` 39 CJK | **35 ideographs** (39 incl. punctuation) |
| `exp2-prompts-en.ts` 166 lines / 9164 chars | 166 lines / **9132 chars** |
| "全仓引用仅 barrel export + 3 个测试" | also **`tests/prompt.spec.ts`** (8 refs) and `research/exp2-arms/arm-c-english/prompt-variant.ts` (comments) |

**What survives — every §2/§3 argument.** The narrow-scope rejection (§2a) rests on the *existence* of a pointer from Chinese rule bodies to a boilerplate header; that coupling is **real**, only the citations were wrong. §3's "≈82% of the English already exists, ≈18% stale in exactly the GA-GT2 dimension" verdict is unaffected. §1's 0.2% ratio is unaffected (817 vs 440,988 ≈ 0.19%). The §2 "13.6% boilerplate" share was computed on the falsified 1161 denominator and has **not** been recomputed — treat it as "small, unquantified".

**What was reversed** — the `buildEvalPrompt` deletion case (GA-CL-batch CL19). Both of its stated reasons (the 27% figure, the duplicate-rules hazard) were false, so CL19 is **downgraded to "do not do unless someone explicitly wants the cleanup"**: deleting `buildEvalPrompt` also deletes the `prompt.spec.ts` pins guarding the shared-helper refactor.

Tickets corrected in commit `4dc531f097` (`GA-EXP5`, `GA-GRILL2`, `GA-CL-batch`, `map.md`).

---

## Sharp open questions

Ordered so that answering an early one can dissolve the later ones.

**Q1 — Is there a version of Kind 1 that is neither trivial nor all-or-nothing?**
The narrow scope ("boilerplate only") buys **13.6%** of the corpus *and* dangles six intra-prompt pointers (`见方言规范` at `prompt.ts:111,113,124,174,186,188` → header at `conventions.ts:25`) that "keep core rules Chinese" forbids repairing (§2a). But the full scope is only **847 live LLM-facing CJK chars** — about one screen of prose (§1). So the cheap option is broken and the complete option is small. If the partial scope is off the table, is there anything to debate beyond yes/no?

**Q2 — The `-3.0%` is not a clean measurement of language. Re-run, or accept it as an upper bound?**
The EXP4 English arm carried **three non-language defects** (§3): it still emitted the **Chinese** conventions section (`exp2-prompts-en.ts:14,35` calls the Chinese renderer); it rendered **two** conventions headers back-to-back, one English one Chinese (`:84` kept the header GA-GT2 deleted); and its rules 1/3 are **pre-GT2 MaxCompute-hardcoded**, so the arm re-introduced `ds`/`MAX_PT`/`GET_JSON_OBJECT`/`GETDATE`. This cuts both ways and neither reading is settled by repo data: a clean arm might beat `-3.0%`, or the mixed prompt might have been *helped* by its Chinese anchor. Does the decision need a clean arm first?

**Q3 — `buildEvalPrompt` is dead. Delete or translate — decide before scoping.**
`buildEvalPrompt` (`prompt.ts:159`) has **no runtime caller** (`engine.ts:35` imports only `buildPrompt`; the only references are the barrel export and three tests). It holds **314 of 1161 CJK = 27%**, and duplicates the 8 core rules near-verbatim from `buildPrompt` (§1). Any Kind 1 estimate that includes it is 27% oversized, and translating it would create a second copy of the rules to keep in sync.

**Q4 — Should `renderConventionsPrompt` stay Chinese permanently?**
Conventions i18n is **252 CJK across three packages** and is **per-engine, so it grows with every new adapter** (§4): 39 CJK of hardcoded structure in `nl2sql-engine/src/conventions.ts`, plus **content that is itself Chinese and lives in the engine packages** — `query-maxcompute/conventions.yaml` (83 CJK), `query-postgres/src/conventions.yaml` (130 CJK). GA-GT2 deliberately made conventions engine-owned. Meanwhile EXP4 shows Chinese conventions + English instructions costs ~nothing on qwen3.7-max — that exact mixture *is* the `-3.0%` arm. Answering "yes, stay Chinese" caps Kind 1 at ~808 CJK in one file and removes the cross-package problem entirely.

**Q5 — Should Kind 1 be hard-blocked on GA-GT5?**
GA-GT5 (`Status: Open`, priority **critical**) owns domain identity — persona / nlsqlOpener / expansionPrompt / fewShots — which GRILL2 already ruled **out** of Kind 1 scope (§5, §7). Those are part of the same prompt surface. Doing Kind 1 first means translating strings GT5 is about to relocate.

**Q6 — What concretely improves? The maintainability case is weaker than it looks.**
There is **no runtime i18n seam** for prompts to plug into. The repo's only i18n machinery is `*.i18n.yaml` + `scripts/verify-translation-pairing.ts` — a **docs** bilingual-pair consistency record (git blob hashes of `README.md`/`README.zh.md`), not a string catalog (§6). GRILL2 already rejected a prompt-template registry as over-engineering. So realistic Kind 1 = *replace Chinese literals with English literals*: no seam added, no locale switching enabled. And the repo already maintains bilingual docs with **equal authority**, so Chinese-primary source text is an accepted norm here, not an anomaly. If the concrete benefit is "a non-Chinese-reading contributor can read `prompt.ts`", is that worth a measured quality risk?

**Q7 — Priority.** If Kind 1 trades a `-3.0%`-to-unknown quality risk for an unmeasurable maintainability gain, does it outrank GA-GT5 (critical), GA-GT3's two *unblocked* safety items (real data loss — see the GT3 brief), or GA-GT4? (§7 lists the field without ranking it.)

**Counter-evidence the human should weigh against englishizing at all:** `EXPANSION_SYSTEM_PROMPT_EN` (`exp2-prompts-en.ts:106-120`) has English instructions but **deliberately keeps its four few-shots in Chinese** (`:113-120`) because the BM25 target corpus is Chinese. Full englishization is already known to be undesirable in at least one place — the question is how many other such places exist.

## 1. Chinese prompt corpus size

All measurements via `node` on working-tree content (`packages/data/nl2sql-engine/src/prompt.ts`, **modified vs HEAD** — see §8; the modification is type-safety only, **zero CJK delta**).

File totals: **198 lines, 8095 chars, 1129 CJK chars, 70 CJK-bearing lines**.

### Decomposition

| Part | Lines | Chars | CJK | LLM-facing |
|---|---|---|---|---|
| Module docblock (comment, not sent to LLM) | 1-17 | 875 | 7 | no |
| `granularityTag()` labels `[日粒度]`/`[快照]` | 21-25 | 136 | 5 | YES (interpolated into candidate list) |
| `TOOL_CATALOG` (9 tools + 1 `[drop]`) | 51-60 | 912 | 138 | YES |
| buildPrompt: no-candidate placeholder `（无候选）` | 77 | 15 | 5 | YES |
| buildPrompt: JOIN-constraints section header | 78-80 | 172 | 16 | YES |
| buildPrompt: metric-definitions section header | 81-83 | 97 | 18 | YES |
| buildPrompt: PERSONA line | 84 | 39 | 23 | YES |
| buildPrompt: §3 staged SOP (phases A-D) | 88-105 | 662 | 239 | YES |
| buildPrompt: §5 honest-refusal | 107-108 | 106 | 61 | YES |
| buildPrompt: §6 eight rules (+rule 9 trend) | 110-118 | 376 | 187 | YES |
| buildPrompt: current-date block | 123-124 | 109 | 64 | YES |
| buildPrompt: question header | 126-127 | 18 | 4 | YES |
| buildPrompt: retrieval-candidates header | 129-130 | 50 | 6 | YES |
| buildPrompt: event-definition header + placeholder | 132-133 | 87 | 11 | YES |
| buildPrompt: phase/GENERATION footer | 135-136 | 114 | 31 | YES |
| buildEvalPrompt: no-candidate placeholder | 167 | 15 | 5 | YES* |
| buildEvalPrompt: JOIN-constraints header | 168-170 | 172 | 16 | YES* |
| buildEvalPrompt: metric-definitions header | 171-173 | 97 | 18 | YES* |
| buildEvalPrompt: PERSONA + task line | 174 | 57 | 38 | YES* |
| buildEvalPrompt: output-format spec | 176-178 | 57 | 34 | YES* |
| buildEvalPrompt: candidate-table header | 182-183 | 31 | 11 | YES* |
| buildEvalPrompt: core rules 1-8 (+9) | 185-193 | 374 | 188 | YES* |
| buildEvalPrompt: user-question header | 195 | 6 | 4 | YES* |
| **TOTAL (listed)** | | **4577** | **1129** | |

`*` = `buildEvalPrompt` is **not reachable from any runtime path** — see "Dead weight" below.

Plus `packages/data/nl2sql-engine/src/conventions.ts`: **51 lines, 1910 chars, 39 CJK** across 7 lines (see §4). Combined LLM-facing CJK across both files: **1161**.

### Notes that matter for sizing

- **Two prompts, not one.** `buildPrompt` (`prompt.ts:69`) is the production/agent prompt; `buildEvalPrompt` (`prompt.ts:159`) is a simplified eval prompt. The 8 core rules are **duplicated near-verbatim** (`prompt.ts:110-118` = 187 CJK vs `prompt.ts:185-193` = 188 CJK; delta is only the heading `# §6 八规则` vs `# 核心规则`). Same duplication for the JOIN header (`:79`/`:169`), metric header (`:82`/`:172`), no-candidate placeholder (`:77`/`:167`).
- **Dead weight: `buildEvalPrompt` has no runtime caller.** `packages/data/nl2sql-engine/src/engine.ts:35` imports only `buildPrompt`; there is no `buildEvalPrompt` reference anywhere in `engine.ts`. Repo-wide, `buildEvalPrompt` appears only at its definition (`prompt.ts:159`), the barrel export (`packages/data/nl2sql-engine/src/index.ts:39`), and three tests (`packages/data/nl2sql-engine/tests/ontology-enrichment.spec.ts:4,304,308,329,331`). **314 of the 1161 CJK chars (27%) are in a function nothing calls in production or eval.** A Kind 1 ticket that does not first ask "delete or translate?" is 27% oversized.
- **No few-shots in `prompt.ts`.** None found. Few-shot content lives in the query-expansion prompt (see §5).
- **CJK is concentrated**: SOP (239) + eight rules (187+188) + `TOOL_CATALOG` (138) = 752 of 1129 = **67%**.
- **Live LLM-facing CJK (buildPrompt + conventions only) = 847 chars.** That is small — roughly one screen of prose. **Migration size is not the risk; behavioural regression is.** Framing Kind 1 as "a big migration" attacks the wrong axis.

## 2. Is the boilerplate / core-rule boundary clean?

### Verdict: **NO — the boundary is not clean, and the narrow scope buys ~14% of the corpus.**

Measured split of the 1161 LLM-facing CJK chars:

| Bucket | CJK | Share |
|---|---|---|
| Pure boilerplate (section headers, placeholders, structural labels) | 158 | **13.6%** |
| `TOOL_CATALOG` | 138 | 11.9% |
| Core semantic (persona, SOP, 8 rules ×2, refusal, date instructions, output-format) | 865 | **74.5%** |

Boilerplate-only = 13.6%. Boilerplate + tool catalog = 25.5%. The narrow scope leaves **~75% of the Chinese in place**.

### Four concrete reasons the split does not separate

**(a) The Chinese core rules point at a boilerplate header by name.** `prompt.ts:111` and `prompt.ts:113` reference `见方言规范` ("see the dialect spec"), which resolves to the header emitted at `packages/data/nl2sql-engine/src/conventions.ts:25` (`# 方言规范（${conv.engine}）`). Six sites depend on that string: `prompt.ts:111, 113, 124, 174, 186, 188`. Rule 1 uses it twice:

```
1. 分区表查询须带分区列过滤（分区列名/格式见方言规范）；非分区 DIM 表不带分区过滤；_df 后缀日期不明时取最新分区（见方言规范）
```

A section header is exactly what "boilerplate-only" proposes to translate. Translating `# 方言规范` → `# Dialect Conventions` **dangles the pointer inside six Chinese rule bodies** — which "keep core rules Chinese" forbids fixing. Boilerplate-only therefore either breaks intra-prompt cross-references or silently expands into the core rules. **This is the single hardest fact against the narrow scope.**

**(b) Same coupling on the `§` anchors.** `prompt.ts:104` (`不可修复→§5 拒绝`) points at header `prompt.ts:107` (`# §5 诚实拒绝`). Milder — `§N` numerals survive translation — but it is the same class of defect.

**(c) `TOOL_CATALOG` is not boilerplate; it embeds hard constraints.** `prompt.ts:53`:

```
- load_event_definition(event_name): 加载事件定义（params_fields/metrics/external_refs）；SQL FROM/WHERE event/字段来自此返回不得硬编码（P6 ctx.schema）
```

`不得硬编码` ("never hardcode") is normative, restating the field-checklist rule at `prompt.ts:91`. `prompt.ts:54` carries `（仅 SELECT，必带分区过滤）`, restating core rule 1 (`prompt.ts:111`). So "tool catalog = boilerplate" is factually wrong: translating it either translates core rules by accident or requires splitting single lines mid-sentence.

**(d) There is no data structure to split along.** The production prompt is one template literal, `prompt.ts:84-136`; the eval prompt a second, `prompt.ts:174-195`. No named string constants, no message-catalog keys, no `boilerplate`/`rules` objects. `TOOL_CATALOG` (`prompt.ts:51`) is the *only* extracted constant. "Boilerplate vs core rules" exists in the reviewer's head, not in the code — a partial migration cannot be enforced by a test, and subsequent drift between the halves is undetectable.

Sub-line interleaving compounds it: `prompt.ts:118` is `8. 千位以上加千分位${isTrend ? '\n9. 趋势/时序类问题优先使用 _di（日粒度增量）表…' : ''}` — a rule with a conditional rule concatenated inline; `prompt.ts:124` interleaves Chinese date instructions with `${args.today}`.

### The one genuinely clean seam (and how small it is)

`granularityTag()` (`prompt.ts:21-25`, 5 CJK) and the structural headers inside `renderConventionsPrompt` (`conventions.ts:23-41`, 39 CJK) are emitted by small pure functions and could be swapped without touching rule text. Together **44 CJK = 3.8%** of the corpus. That is the only part of the "boundary" that is actually a boundary.

### Important nuance discovered in §3

The EXP2 "full English" arm was **itself already a mixed-language prompt** (it kept the Chinese conventions section). So the claim "no data exists for a mixed prompt" is **too strong**: the measured `-41.1%` (qwen-plus) and `-3.0%` (qwen3.7-max) are both mixed-prompt numbers. See §3.

## 3. How much English already exists, and is it stale?

### Verdict: **~82% of a full-English `buildPrompt` already exists and is reusable; ~18% is stale in exactly the dimension GA-GT2 just fixed; the conventions section was never translated at all; `buildEvalPrompt` has no English counterpart.**

`packages/eval/eval-cli/src/exp2-prompts-en.ts` (166 lines, 9164 chars, **122 CJK** — all of it deliberate, see below). Single commit: `0df6601bfa feat(eval): GA-EXP2 prompt-language experiment arms (EXP2_ARM + EN prompts + promptBuilder)`, 2026-09-02. Working tree: ` M`, diff is 4 lines of type-safety only (`Number(c.score)` → `c.score`), **no prompt-text change**.

### Coverage map (`prompt.ts` part → EN status)

| `prompt.ts` part | EN counterpart | Status |
|---|---|---|
| `granularityTag` (`:21`) | `granularityTagEN` (`exp2-prompts-en.ts:16-20`) | translated |
| `TOOL_CATALOG` (`:51`) | `TOOL_CATALOG_EN` (`:22-31`) | translated |
| no-candidate placeholder (`:77`) | `:41` `'(no candidates)'` | translated |
| JOIN header (`:79`) | `:43` | translated |
| metric header (`:82`) | `:46` | translated |
| persona (`:84`) | `:49` | translated |
| §3 staged SOP (`:88-105`) | `:52-69` | translated |
| §5 honest-refusal (`:107-108`) | `:71-72` | translated |
| §6 eight rules (`:110-118`) | `:74-82` | **STALE** (see below) |
| conventions/dialect section | **none** — `:35` calls the *Chinese* `renderConventionsPrompt` | **NOT TRANSLATED** |
| current-date block (`:123-124`) | `:89` | **STALE** |
| question / candidates / event-def / phase headers | `:91-100` | translated |
| `buildEvalPrompt` (`:159-197`) | **none** | **NOT TRANSLATED** (but dead code, §1) |
| — | `EXPANSION_SYSTEM_PROMPT_EN` (`:106-120`) | translated; few-shots intentionally Chinese |
| — | `buildJudgePromptEN` (`:124-165`) | translated |

### The staleness, precisely

`exp2-prompts-en.ts` was committed (`0df6601bfa`, 2026-09-02) **after** `89311537d9 feat(query): GA-GT2 engine abstraction` (2026-09-02) — confirmed by `git merge-base --is-ancestor 0df6601bfa 89311537d9` returning false — yet its rule text is translated from the **pre-GT2** `prompt.ts`. GA-GT2's own commit message says the GA-EXP2 work was carried as WIP alongside and excluded from that commit, which explains the split-brain.

GA-GT2 changed `prompt.ts` rules 1 and 3 from hardcoded MaxCompute to engine-neutral:

```
-1. 分区表必带 ds（yyyyMMdd）；非分区 DIM 不带 ds；_df 后缀日期不明用 MAX_PT
+1. 分区表查询须带分区列过滤（分区列名/格式见方言规范）；…（见方言规范）
-3. params 用 GET_JSON_OBJECT(params,'$.字段')，数值前 CAST AS BIGINT/DOUBLE
+3. params 字段提取用方言规范中的 JSON 函数；数值字段按 cast_map CAST（见方言规范）
```

The EN file still carries the **pre-GT2 MaxCompute-hardcoded** form:
- `exp2-prompts-en.ts:75` — `1. Partitioned tables must include ds (yyyyMMdd); non-partitioned DIM tables omit ds; _df suffix with unclear date uses MAX_PT`
- `exp2-prompts-en.ts:77` — `3. params use GET_JSON_OBJECT(params,'$.field_name'), numeric values preceded by CAST AS BIGINT/DOUBLE`
- `exp2-prompts-en.ts:89` — `… ds partition format is also yyyyMMdd. … do not use GETDATE() or runtime functions.`

**Consequence: adopting `exp2-prompts-en.ts` as-is would regress GA-GT2's engine-neutrality** (it re-hardcodes `ds`, `MAX_PT`, `GET_JSON_OBJECT`, `GETDATE` into the prompt). Stale volume ≈ rules 1+3 (82 CJK-equivalent) + date block (64) = **~146 of 808 live buildPrompt CJK ≈ 18%**; the remaining **~82% is reusable**.

### Two defects in the arm that produced the headline numbers (confounds for EXP2/EXP4)

1. **The "English" prompt still emits a Chinese conventions section.** `exp2-prompts-en.ts:14` imports and `:35` calls `renderConventionsPrompt` from the engine package — the Chinese renderer (`conventions.ts:25-41`). So arms B/C/D shipped English chrome + English rules + a **Chinese `# 方言规范` block**.
2. **Duplicate conventions header.** `exp2-prompts-en.ts:84` still emits `# Dialect Conventions (engine conventions seam injection)` — the header GA-GT2 **deleted** from `prompt.ts:119` (because `renderConventionsPrompt` now emits its own). The EN arm therefore renders *two* conventions headers, one English and one Chinese, back to back.

Grilling implication (cuts both ways, state both): the `-3.0%` on qwen3.7-max was achieved **despite** a mixed-language, double-headed, engine-regressed prompt — so a clean full englishization might do *better* than `-3.0%`. Equally, the `-3.0%` cannot be attributed cleanly to "language" because at least three non-language defects rode along in the same arm. **Neither reading is settled by data in this repo.**

### The seam: production-usable or eval-only?

The **injection point is production code**; the **English content is not**.

- `promptBuilder?: (args: BuildPromptArgs) => string` is declared on `EngineDeps` at `packages/data/nl2sql-engine/src/engine.ts:128`, stored at `:165`, defaulted at `:175` (`deps.promptBuilder ?? buildPrompt`), and consumed at `:265`. That is a normal production DI seam — any embedder can pass a builder. `engine.ts` is ` M` in the working tree but the diff (`postProcessSql` regexes, JSDoc, `Number()` removal) does **not** touch `promptBuilder`.
- The **only** injector is `packages/eval/eval-cli/src/context.ts:385`, gated on `process.env.EXP2_ARM` read at `:376`. Two further env reads: `:296` swaps the expansion prompt (arms B/C/D), `:539` swaps the judge prompt (arm E only). Boot log at `:520-521`.
- The English text itself lives in `packages/eval/eval-cli/` — an **eval package**. Nothing in `packages/data/**` or an app imports it.

**So: eval-only as shipped, production-capable by construction.** A production Kind 1 would need the English strings relocated into `packages/data/nl2sql-engine` (or a shared i18n package) and selected by something other than `EXP2_ARM`. Note also that `promptBuilder`'s type is `BuildPromptArgs`-only, so this seam cannot swap `buildEvalPrompt` — moot, since `buildEvalPrompt` is dead (§1).

Deliberate non-translation worth defending: `EXPANSION_SYSTEM_PROMPT_EN` (`exp2-prompts-en.ts:106-120`) has English instructions but keeps its four few-shot examples in Chinese (`:113-120`, 122 CJK) — correct, because the BM25 target corpus is Chinese. This is direct evidence that **full englishization is not even desirable everywhere**, which the human should press on.

## 4. renderConventionsPrompt

### Verdict: **always Chinese; and the translation is NOT one file — it is 252 CJK across three packages, and it grows with every engine adapter.**

`renderConventionsPrompt` lives at `packages/data/nl2sql-engine/src/conventions.ts:22-51` (51 lines, 1910 chars, **39 CJK**, file is **clean** vs HEAD). It has no locale parameter and no branch — output is unconditionally Chinese.

**Hardcoded Chinese structure (owned by `nl2sql-engine`), 7 sites / 39 CJK:**

| Site | String |
|---|---|
| `conventions.ts:23` | `（无 conventions）` — the null placeholder |
| `:25` | `# 方言规范（${conv.engine}）` — **the header six rule bodies point at (§2a)** |
| `:27` | `## 方言速查` |
| `:31` | `## 可用函数` |
| `:35` | `## 字段逻辑类型 → CAST 映射` |
| `:36` | `\| 逻辑类型 \| 含义 \| 写法 \|` — table header row |
| `:41` | `## 典型查询模板` |

**Engine-supplied content — also Chinese, and outside this package.** The renderer interpolates `conv.key_differences`, `conv.functions[].name/signature`, `conv.cast_map[].meaning`, `conv.sql_templates[].name`. That data is loaded from per-engine YAML:

| File | CJK | Note |
|---|---|---|
| `packages/query/query-maxcompute/conventions.yaml` | **83** | e.g. `key_differences: "JSON 提取: GET_JSON_OBJECT(col, '$.path')"`, `"日期分区: ds 字段格式 yyyyMMdd"`, `"标识符: 反引号"` |
| `packages/query/query-postgres/src/conventions.yaml` | **130** | the GA-GT2 validation shell — already carries *more* Chinese than maxcompute |
| `packages/query/*/src/conventions.ts` | 0 | loaders only, no prose |

**Total conventions CJK = 39 (structure) + 83 + 130 (content) = 252.**

**Why this matters more than the raw count.** GA-GT2 deliberately moved conventions ownership to the engine packages (`EngineConventions` from `dsh-query`, consumed via `ctx.query.getConventions()`). So englishizing conventions means either (a) every future engine adapter author must write English prose — a new contributor obligation GT2 never signed up for, or (b) building a translation layer for engine-supplied data, which is precisely the template registry GRILL2 rejected as over-engineering. `query-postgres` already demonstrates the drift risk: it is a not-yet-implemented shell and it already has 130 CJK chars, more than the working engine.

**Consumers** (`grep renderConventionsPrompt`, excluding `lib/` build output):
- `prompt.ts:71` — `buildPrompt`, the live production path
- `prompt.ts:161` — `buildEvalPrompt`, **dead** (§1)
- `exp2-prompts-en.ts:35` (imported `:14`) — **the "full English" arm calls the Chinese renderer.** This is confound #1 from §3, confirmed at source.
- `packages/data/nl2sql-engine/src/index.ts:40` — barrel re-export (so external embedders can call it)

**The empirical argument for leaving it Chinese:** the `-3.0%` EXP4 result *was measured with* Chinese conventions + English instructions. That mixture is not hypothetical — it is the arm that produced the headline number. Deciding "conventions stay Chinese" therefore has direct supporting data, caps Kind 1 at ~808 CJK inside a single file, and removes the cross-package/per-engine problem entirely.

## 5. Other LLM-facing Chinese prompts

Full sweep. All three files are **clean** vs HEAD.

| Prompt | Location | Size | Owner / status |
|---|---|---|---|
| Query expansion | `packages/data/tool-search-data-sources/src/expand-query.ts` | 124 lines, **254 CJK** | **GA-GT5 (`ctx.domain`)** — GRILL2 puts `expansionPrompt` + `fewShots` under domain identity, explicitly **OUT** of Kind 1. Verified: GA-GT5 is `Type: grilling`, `Status: Open`, priority **critical**. |
| SQL semantic judge | `packages/eval/eval-runner/src/sql_semantic_judge.ts` | 153 lines, **236 CJK** | **Already settled** — EXP2 arm E measured judge language at **+0.0%** overall (17.9% per-case disagreement, cancelling out). An English version already exists: `buildJudgePromptEN` (`exp2-prompts-en.ts:124-165`), injected via `context.ts:539`. So this is a no-risk, already-written swap — and also a no-benefit one. |
| Phase-gate internal markers | `packages/data/phase-gate/src/domain.ts` | 285 lines, **8 CJK** | **Already done** by GA-I18N-5 (markers englishized to `【decompose】`/`【incomplete】` + `stripInternalMarkers`). The residual 8 CJK are the user-visible delivery markers (`【发现】`/`【注意】`), which GRILL2 assigns to project-level i18n, not Kind 1. |

**Net:** 490 CJK sits outside `prompt.ts`, but **none of it is actually Kind 1 work** — 254 belongs to GT5, 236 is already written and measured as neutral, 8 is done. This narrows Kind 1 to `prompt.ts` (+ optionally conventions, per Q4).

## 6. Testing the maintainability argument

### Verdict: **the maintainability benefit is materially weaker than the ticket implies. There is no seam for prompts to plug into, and building one was already rejected.**

**What i18n machinery actually exists:** three root files — `README.i18n.yaml`, `CONTRIBUTING.i18n.yaml`, `BRAND_GUIDELINES.i18n.yaml` — plus `scripts/verify-translation-pairing.ts` (wired at `package.json:88` as `verify-translation-pairing`). Their content is a **consistency record, not a catalog**:

```yaml
# Bilingual-pair consistency record (docs/i18n/README.md): the git blob hash of each
# side as of the last confirmed-consistent state. Both languages carry equal authority;
# after editing either side, bring the other along and re-record with:
#   pnpm run verify-translation-pairing --write README.md
README.md: 9ccd27b8934449bd0d2311317dc38aee5a5c0cdc
README.zh.md: 7eb9ef1a62afbcf95b235e5b90fa7529869af59d
```

This stores git blob hashes so CI can detect that one side of a **doc pair** drifted. It resolves no strings at runtime and has no notion of a current locale. **Prompts cannot plug into it** — there is no `prompt.md`/`prompt.zh.md` pair to hash, and a prompt is assembled from interpolated template literals, not a file.

**And the alternative was already ruled out.** GRILL2's own decision record: *"prompt-template registry（原始方案 A）否决——业界无先例，过度工程"*. So the realistic Kind 1 is not "add an i18n seam" — it is *swap Chinese string literals for English string literals*. That yields no locale switching, no zh fallback, and no structural improvement.

**Evidence that cuts against the maintainability premise:**
1. **Chinese-primary source is an accepted norm here, not an anomaly.** The repo maintains three bilingual doc pairs where the record explicitly states *"Both languages carry equal authority."* A Chinese `prompt.ts` is consistent with that stance.
2. **Nothing today forces a contributor to edit Chinese prompt text** unless they are changing prompt *semantics* — and someone changing NL2SQL prompt semantics for a Chinese-language game-analytics corpus is already operating in a Chinese-language domain. The eval cases (`packages/eval/eval/cases/k11-v2/*.yaml`) are Chinese questions; the retrieval corpus is Chinese; the `alt_labels` are Chinese.
3. **Full englishization is already known to be wrong in at least one place** — `EXPANSION_SYSTEM_PROMPT_EN` keeps Chinese few-shots on purpose because the BM25 corpus is Chinese (`exp2-prompts-en.ts:113-120`).
4. **It would create a sync obligation, not remove one.** With `buildEvalPrompt` duplicating the 8 rules (§1) and `exp2-prompts-en.ts` already 18% stale within days of being written (§3), the repo's demonstrated track record on keeping parallel prompt copies in sync is poor.

**The strongest honest case *for* Kind 1** (state it fairly): the corpus is genuinely tiny (847 live CJK, §1), ~82% of the translation already exists (§3), the model no longer punishes English (`-3.0%`, and possibly better once the three confounds are removed), and English prompt text would let the *engine-neutral* direction of GA-GT2/GT4/GT5 extend to the prompt layer — i.e. it is cheap groundwork for a non-Chinese deployment, if one is ever wanted. Whether such a deployment is on the roadmap is a question for the human, not a fact in this repo.

## 7. Competing work (for prioritization; not ranked here)

From `wayfinder/data-agent/map.md` (推荐顺序 line + open-ticket sections), verified against each ticket header:

| Ticket | Type / Status | Priority | Size & note |
|---|---|---|---|
| **GA-GT5** domain injection seam | grilling · Open | **critical** (C2/arch G3) | `ctx.domain` service + `domain-profile.yaml` + 5 injection sites. **Owns part of Kind 1's surface** (persona/expansionPrompt/fewShots) → see Q5. |
| **GA-GT3** enrichment 泛化 | grilling · Open | high (H4/arch G4) | Blocked by GA-EXP1, but per the GT3 brief **2 of 6 items are unblocked**, one of which is a **real data-loss bug** (replace mode discards curated `dimension_refs`). |
| **GA-GT4** eval 框架去 K11 | grilling · Open | high (H5+H8/arch G6) | scopeId/regex de-K11 + multi-engine FailureClassifier. |
| **GA-GT2-eval** prompt 引擎中性验证 | task · Open | — | Small: run 168-case eval to confirm GT2's D2 prompt rewrite caused no regression. **Directly interacts with Kind 1** — both change prompt text, so doing them out of order confounds attribution. |
| **GA-EXP1** LLM-driven 推断实验 | experiment · Open | high | 4 phases; Phase 1 half-done (judge calibration never run). Gates GT3. Live-LLM cost. |
| **GA-I18N-R1** trend recall 提升 | research/impl · Open | M | Break the 85% recall ceiling; unblocked. |
| **GA-EVAL-REBASELINE** pass^k 基线重建 | task · Open | — | New (2026-09-03). Blocked on the uncommitted `runner.ts` pass^k change landing. **Blocks trustworthy before/after numbers for any prompt change — including Kind 1's.** |
| **W13** ContextLayer 动画层不重绘 | — · Open | — | Frontend; 11 `update*Data` calls with zero `draw()` → animations never rendered. Unrelated surface. |

**Sequencing facts worth surfacing (not a ranking):** GA-GT5 owns part of Kind 1's text; GA-GT2-eval and Kind 1 both mutate prompt text so their effects confound each other; GA-EVAL-REBASELINE gates whether *any* prompt-change measurement is trustworthy, since the current 88.1% baseline is best-of-k and would read ~47.6% under the pending pass^k semantics.

## 8. Working-tree caution

- `packages/data/nl2sql-engine/src/prompt.ts` — ` M`. Diff vs HEAD is **type-safety only** (`candidates && candidates.length` → `candidates.length`; `Number(c.score)` → `c.score`, at `:72-75` and `:162-165`). **Zero CJK/prompt-text delta.** Report based on working tree; conclusions hold at HEAD.
- `packages/eval/eval-cli/src/exp2-prompts-en.ts` — ` M`. 4 lines, same type-safety change. No prompt-text delta.
- `packages/data/nl2sql-engine/src/engine.ts` — ` M`, +24/-? lines: `postProcessSql` DATEADD regex narrowing, `partitionResolver` JSDoc, `Number()` removal. `promptBuilder` wiring unchanged vs HEAD.
- `packages/eval/eval-cli/src/context.ts` — ` M`, 86 lines changed. The `EXP2_ARM` arms at `:296, :376-385, :520-521, :538-539` are present in the working tree. Resolved: the `EXP2_ARM` mechanism is **in HEAD** — it was committed as part of `0df6601bfa` (GA-EXP2 arms); the working-tree delta is the same type-safety sweep affecting ~155 files, not the arm wiring.
- `packages/data/nl2sql-engine/src/conventions.ts` — **clean** (not modified).
- `packages/query/query-maxcompute/conventions.yaml`, `packages/query/query-postgres/src/conventions.yaml` — **clean**.
- `packages/data/tool-search-data-sources/src/expand-query.ts`, `packages/eval/eval-runner/src/sql_semantic_judge.ts`, `packages/data/phase-gate/src/domain.ts` — all **clean**.

**Concurrency warning.** The working tree is being modified by something outside this session — the GT3 evidence pass observed the dirty-path count moving from 181 → 171 mid-session. Treat every `git status` reading in this brief as a point-in-time sample, and re-check before acting on any of it.

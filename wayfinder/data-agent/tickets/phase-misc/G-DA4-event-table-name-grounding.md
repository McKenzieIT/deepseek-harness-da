# G-DA4 — event 定义不暴露 ODS 表名 → GENERATION 卡 FROM

**Type**: grilling
**Phase**: misc
**Status**: open
**Graduated from**: 2026-08-22 P-DA3 e2e——persona 加厚后 model-following 通（UNDERSTANDING search + load_event_definition + route:proceed 正确），但 GENERATION 卡：event 定义不暴露底层 ODS 表名，模型不知 `SELECT FROM` 什么。

## Question

`load_event_definition` 返回的 event 定义有 `event_filter`（`event='game.role.online'`）但**不暴露底层表名**（如 `ods_game_event` / `ods_<scope>_all_view`）→ GENERATION 写不出 `FROM <table>` → 卡。怎么让模型拿到 event 的表名？

## 现状（先调查）

- **先查**：dsh `EventDefinition`（`packages/data/semantic-layer/src/types.ts`）有没有 data-view/table 字段？K11 corpus（`examples/k11-semantic-layer`）的 event 定义有没有填它？rbi 的 event_definition 有「数据视图」字段（= 表名）——dsh 对没对齐？
- P4c case 037 SQL 用 `ieu_cdm.dws_10000251_univ_acc_act_di`（DWS 表，非 event view）——event view 的实际表名（`ods_<scope>_all_view`?）在 ieu_cdm 是否存在、叫什么？

## 3 修法

- **(a) K11 corpus 修**：enrich `examples/k11-semantic-layer` event 定义加 `table`/`data_view` 字段（语料内容）。若 K11 fixture 可改（非并发 territory）→ 我做。
- **(b) semantic-layer shape 修**：`EventDefinition` 加 `table`/`data_view` 字段 + `load_event_definition` 暴露它 → `packages/data/semantic-layer/`（**并发会话 territory**，cautious 先查 git 状态）。
- **(c) SQL_CONVENTIONS/persona 修**：告诉模型 event 查询表名 pattern（如 `FROM ods_<scope>_all_view WHERE event='<name>'`，rbi pattern）→ `phase-gate.ts` SQL_CONVENTIONS（我的、无并发撞车）。但若实际表名非此 pattern → 错。

## 我的 lean

先调查现状（EventDefinition 有无 table 字段 + K11 corpus 填没填 + ieu_cdm 实际 event view 表名）。据结果：
- corpus 有 table 字段只是没 surface → **(b)** shape 改让 load_event_definition 暴露（cautious 并发）。
- corpus 没填 → **(a)** enrich K11 event 定义。
- 能确定表名 pattern 且 ieu_cdm 有该 view → **(c)** 最简（persona/SQL_CONVENTIONS，无并发撞车）。

## 依据

- P-DA3 e2e（2026-08-22）：GENERATION 卡 FROM（event 定义无表名）。
- rbi：`load_event_definition` 返回「数据视图、event_filter、params_fields、metrics、external_refs」（数据视图 = 表名）——`rbi-purpose-arch.md` §4#2。
- K11 corpus：`examples/k11-semantic-layer`（scope 10000251）；web-app bundle `semanticRoot: ./examples/k11-semantic-layer`。
- P4c case 037：`ieu_cdm.dws_10000251_univ_acc_act_di`（DWS 表，dau=4336 锚点）。

## Out of scope

- present_* ship（→ `present-delivery-tools.md` deferred）。
- route-token 简化（P-DA3 加厚已够，deferred）。
- 更强模型（qwen3.7-max 是 DashScope 最强，不可换）。

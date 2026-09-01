# GA-EXP1 Phase 1 — LLM-as-Judge Calibration Report

**Date**: 2026-09-01  
**Source**: [GA-EXP1 ticket](../../tickets/phase-misc/GA-EXP1-llm-driven-inference-experiment.md)  
**Ground truth**: [ground-truth-20.yaml](./ground-truth-20.yaml)

---

## 1. Ground Truth Summary

20 tables annotated (10 DWS + 10 DIM), covering high and low complexity across 5 inference fields: `kind`, `primary_key`, `label_columns`, `freshness`, and `column_roles`.

### 1.1 Heuristic baseline accuracy

| Field | DWS (n=10) | DIM (n=10) | Overall (n=20) |
|-------|-----------|-----------|----------------|
| kind | 0% (not inferred) | 100% | 50% |
| primary_key | 0% (not inferred) | 40% | 20% |
| label_columns | 100% (N/A — no labels) | 50% | 75% |
| freshness | 0% (not inferred) | 60% | 30% |
| **Average** | **25%** | **62.5%** | **43.75%** |

### 1.2 Key heuristic failure modes

| # | Failure mode | Affected tables | Root cause |
|---|-------------|-----------------|------------|
| F1 | No DWS metadata inference | All 10 DWS tables | `generateTableYaml` doesn't infer PK/kind/freshness |
| F2 | Composite PK missed | function_info_arch, knight_starup_info, trans_hard_boss_info_df_arch, resource_name_info | Only picks first `*_id` column |
| F3 | Non-`_id` PK missed | trans_item_df (type+value), auto_event_cfg_info (id), active_code_info (code) | `endsWith('_id')` doesn't match bare `id`, `code`, etc. |
| F4 | Non-standard label names | trans_hard_boss_info_df_arch (name), trans_item_df (name), auto_event_cfg_info (event/domain), function_info_arch (function_name1/2) | Suffix check `_name/_desc/_label/_title` misses bare `name` and numbered variants |
| F5 | Partitioned DIM freshness | function_info_arch, trans_hard_boss_info_df_arch, trans_item_df, knight_starup_info (debatable) | Always `static_reference` — ignores `_df`/`_arch` suffixes and ds partition |
| F6 | INT/BIGINT type codes as measure | pvp_type, user_type, pay_type, card_job, card_pool_type, item_type, item_value | `inferRole` treats all numeric non-`_id` as measure when no measure suffix matches |
| F7 | Kind misclassification by prefix | active_code_info (dws_ prefix but semantically dim) | Table naming convention doesn't always match semantics |

### 1.3 Column role errors in detail

The `inferRole` heuristic misclassifies numeric categorical columns as measures. Across the 20 tables, 8 column-role errors were identified:

| Table | Column | Type | Heuristic says | Correct role | Why wrong |
|-------|--------|------|----------------|-------------|-----------|
| play_stage_df | pass_status | int | measure | dimension | Binary 0/1 flag |
| bi_role_new_analysis_di | user_type | int | measure | dimension | Type code 1/2/3 |
| progression_card_df | card_job | int | measure | dimension | Card class/job |
| pvp_score_df | pvp_type | bigint | measure | dimension | PVP mode type |
| com_pay_order_df | pay_type | int | measure | attribute | Payment type 1/2/3 |
| biz_acc_tag_df | user_type | bigint | measure | dimension | Type code 1/2/3 |
| resource_name_info | item_type | bigint | measure | dimension | Item category code |
| resource_name_info | item_value | bigint | measure | dimension | Item identifier (PK) |

**Pattern**: any `INT`/`BIGINT` column that is a categorical code, enum, or identifier (without `_id` suffix) is misclassified. This is a systematic blind spot — the heuristic has no signal for "this number is a code, not a quantity."

## 2. LLM-as-Judge Prompt Design

### 2.1 Purpose

The judge evaluates whether a given inference (PK, kind, labels, freshness, column roles) for a table is correct, given the table's full schema context. This allows scaling evaluation beyond the 20 manually annotated tables to all 321 K11 tables.

### 2.2 Judge prompt

```
You are a data modeling expert acting as a correctness judge. Given a table's schema and a proposed set of modeling attributes, evaluate whether each attribute is correct.

## Table Schema

Table name: {table_name}
Engine: {engine}
Table comment: {table_comment}
Partitions: {partitions}

Columns:
{columns_with_type_comment_role}

## Proposed Attributes

kind: {proposed_kind}
primary_key: {proposed_primary_key}
label_columns: {proposed_label_columns}
freshness: {proposed_freshness}

## Evaluation Instructions

For each attribute, judge whether the proposed value is correct:

1. **kind**: Is this table correctly classified?
   - `dim`: static/slowly-changing reference table used for JOINs (lookup)
   - `dws`: wide/fact table with measures, typically partitioned by ds
   - Consider: table comment, column mix (dimensions vs measures), naming pattern, partition structure

2. **primary_key**: Do these columns uniquely identify each row?
   - Check: do the proposed PK columns exist? Are they plausible identifiers?
   - For daily-snapshot tables (_df), ds should typically be part of the PK
   - For dimension tables, the PK is the lookup key used in JOINs
   - An empty PK is wrong if the table has obvious identifier columns

3. **label_columns**: Are these human-readable name/description columns?
   - Label columns provide display text when the PK is an ID/code
   - Must exist in the column list; should be STRING type with descriptive content
   - An empty list is wrong if the table has obvious name/description columns

4. **freshness**: Does this match the table's update pattern?
   - `static_reference`: no partition, configuration/reference data
   - `daily_snapshot` (_df suffix): daily full snapshot, partitioned by ds
   - `daily_incremental` (_di suffix): daily increment/delta
   - `realtime`: streaming or near-real-time
   - Check: partition structure, table name suffix (_df/_di/_od), table comment

5. **column_roles** (sample 5 columns): Is each role correct?
   - `dimension`: categorical/identifier columns used for grouping/filtering (IDs, names, type codes, flags)
   - `measure`: numeric quantities that are aggregated (amounts, counts, scores, durations)
   - `attribute`: descriptive metadata that is neither grouped-by nor aggregated (timestamps, JSON blobs, lists)
   - Key rule: INT/BIGINT columns that are type codes, enum values, or identifiers should be `dimension`, not `measure`

## Output Format

Return JSON:
{
  "kind": {"correct": true/false, "reason": "..."},
  "primary_key": {"correct": true/false, "reason": "...", "suggested": [...]},
  "label_columns": {"correct": true/false, "reason": "...", "suggested": [...]},
  "freshness": {"correct": true/false, "reason": "...", "suggested": "..."},
  "column_roles": [
    {"column": "...", "proposed": "...", "correct": true/false, "reason": "...", "suggested": "..."}
  ],
  "overall_score": 0-5  // count of correct attributes out of 5
}

Be strict. If the proposed value is partially correct (e.g., PK missing a column), mark it as incorrect and suggest the fix.
```

### 2.3 Judge invocation protocol

1. **Input**: table YAML (full schema) + proposed attributes (from heuristic or LLM inference)
2. **Model**: same model as the inference arm being tested (to avoid cross-model bias); temperature=0
3. **Output**: structured JSON per the format above
4. **Post-processing**: parse JSON, compute per-field accuracy, compare against ground truth where available

### 2.4 Calibration design

Calibrate the judge on the 20 ground-truth tables by:

1. Feed each table's schema + **heuristic output** (known-incorrect for many fields) to the judge
2. Compare judge's verdict against ground truth annotations
3. Compute judge accuracy: % of fields where judge agrees with ground truth

Expected calibration matrix:

| Judge verdict | Ground truth: correct | Ground truth: incorrect |
|--------------|----------------------|------------------------|
| Correct (TP) | Judge confirms valid heuristic | — |
| Correct (FP) | — | Judge misses heuristic error |
| Incorrect (TN) | — | Judge catches heuristic error |
| Incorrect (FN) | Judge flags valid heuristic | — |

**Success criterion**: Judge accuracy ≥ 85% on the 20-table calibration set (≥ 85% agreement with ground truth on field-level correctness verdicts).

### 2.5 Calibration expectations (pre-run estimates)

Based on the ground truth analysis, the judge should:

**Easy cases** (expect judge to get right):
- DIM tables with simple PK (_id suffix) and clear label columns (_name suffix): charm_info, server_info, toy_info, card_pool_info
- DWS tables where PK is obvious from granularity description
- Freshness when _df/_di suffix is present
- Column roles when comment clearly states the semantics

**Hard cases** (judge may struggle):
- Composite PKs with non-obvious members (e.g., trans_hard_boss_info_df_arch: boss_id + boss_level + dungeon_id + ds)
- Kind misclassification by prefix (active_code_info: dws_ but semantically dim)
- Column role for ambiguous INT columns without clear comments (pass_status, card_job)
- Label columns with non-standard names when comment doesn't help

**Estimated judge accuracy by field**:

| Field | Estimated accuracy | Reasoning |
|-------|-------------------|-----------|
| kind | 95% | Comment + column structure usually sufficient; active_code_info is edge case |
| primary_key | 75% | Simple PKs easy; composite PKs need understanding of granularity |
| label_columns | 85% | Comment + column names usually sufficient; bare "name" columns may confuse |
| freshness | 90% | Table name suffix (_df/_di) + partition structure is strong signal |
| column_roles | 80% | Comments help but some INT codes lack clear descriptions |

## 3. Phase 2 Readiness

### 3.1 What this phase established

1. **Ground truth**: 20 tables with 5-field annotations, ready to calibrate inference arms
2. **Heuristic baseline**: quantified at 43.75% average accuracy, with systematic blind spots documented
3. **Judge prompt**: designed and ready for calibration run
4. **Failure taxonomy**: 7 documented failure modes (F1-F7) that LLM inference should address

### 3.2 Next steps (Phase 2 execution)

1. **Run judge calibration**: execute the judge prompt on 20 tables × heuristic output, compute accuracy
2. **If judge accuracy ≥ 85%**: proceed to Phase 2 with the judge as automated evaluator
3. **If judge accuracy < 85%**: iterate on judge prompt (add examples, tighten rubric) until calibrated
4. **Phase 2 arms**: run Baseline / A (improved heuristic) / B (LLM) / C (LLM + tool) on all 321 tables, evaluated by calibrated judge + spot-checked against 20-table ground truth

### 3.3 Synthetic PG test data

Separate from K11 calibration, Phase 2 needs 10-20 synthetic PostgreSQL tables to test engine generalization. These should use PG naming conventions (`id` not `_id`, `text` not `STRING`, `integer` not `BIGINT`) to stress-test the heuristic's MaxCompute-specific assumptions. Recommended: create from a typical OLTP schema (users → orders → products → payments → reviews).

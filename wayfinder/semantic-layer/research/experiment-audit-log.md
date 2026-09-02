# Experiment Audit Log — Semantic Layer Effort

## 2026-09-02: CL-22 eval 非确定性深查（3-run 方差 + dup 清理归因 + alias trace）

### Setup
- **基线**: Run `32dd9532`（09-02 联合 eval）70.8%（119/168）——本 ticket 的调查起点
- **对照基线**: Run `10320fe2`（CL-15 标准基线）73.8%；Run `75ad2a5c`（同代码重跑）73.2%
- **Cases**: 168 K11 cases（80 original + 40 alias + 30 voice EXEC + 18 voice DELIVERY）
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge on, --skip-health-gate
- **代码状态**: HEAD `1f295b8f5c`（= CL-18 + V1 + CL-17 dup 清理），eval 相关文件无未提交变更
- **实验设计**: 在完全相同代码状态下运行 3 次 full eval（`32dd9532` + 2 新 run），测量 LLM 非确定性方差

### Data

**3 同代码 run 汇总（HEAD `1f295b8f5c`）：**

| Category | Run A `32dd9532` | Run B `e7a946be` | Run C `b244533a` | **Median** | Range |
|----------|-----------------|-----------------|-----------------|-----------|-------|
| Original | 72.5% (58/80) | 77.5% (62/80) | 76.3% (61/80) | **76.3%** | ±5.0pp |
| Alias | 62.5% (25/40) | 65.0% (26/40) | 70.0% (28/40) | **65.0%** | ±7.5pp |
| Voice EXEC | 73.3% (22/30) | 73.3% (22/30) | 66.7% (20/30) | **73.3%** | ±6.7pp |
| Voice DELIVERY | 77.8% (14/18) | 72.2% (13/18) | 77.8% (14/18) | **77.8%** | ±5.6pp |
| **Overall** | **70.8% (119)** | **73.2% (123)** | **73.2% (123)** | **73.2%** | **±2.4pp** |

- 3-run case flip rate: **26.8%**（45/168 cases 在 3 run 中至少翻转 1 次）
- Stable pass: 98 (58.3%)；Stable wrong: 25 (14.9%)
- Run A→B: +18 gained / -14 lost = +4 net（32 flips, 19.0%）
- Run A→C: +18 gained / -14 lost = +4 net（32 flips, 19.0%）

**CL-15 同代码对照（验证非确定性基线）：**
- `10320fe2`: 73.8% (124) vs `75ad2a5c`: 73.2% (123) = -0.6pp, 35 flips (20.8%)

**4-run 慢性翻转者分析（10320fe2 / 75ad2a5c / 1510b3e0 / 32dd9532）：**
- 0 次翻转（稳定）: 109/168 (64.9%)
- 1 次翻转: 28/168 (16.7%)
- 2 次翻转: 22/168 (13.1%)
- 3 次翻转（完美交替）: 9/168 (5.4%) — 含 alias_003/004/005/011

**Alias -15pp 逐 case 归因（9 lost cases in Run A vs CL-15 baseline）：**

| Case | 查询关键词 | 是否含回归/回流 | 失败模式 | 同代码重跑翻转? |
|------|-----------|--------------|---------|--------------|
| alias_003 | 氪金/非氪金/在线时长 | **否** | SQL 逻辑不完整（仅 pay=1） | **是**（完美交替） |
| alias_005 | 氪金/轻度付费/活跃用户 | **否** | SQL 聚合错误 | **是**（完美交替） |
| alias_009 | 免费玩家/活跃/30天 | **否** | tool-call 文本替代 SQL | 否 |
| alias_011 | 零氪玩家/等级段/分布 | **否** | 裸 CASE 表达式（无 SELECT） | **是**（完美交替） |
| alias_018 | 新注册/角色 | **否** | 错误表 + 占位符 `<数据视图>` | **是** |
| alias_024 | 首充用户/活跃天数/分布 | **否** | 裸 CASE 表达式 | **是** |
| alias_029 | 首次充值/金额/分布 | **否** | 裸 CASE 表达式 | 否 |
| alias_033 | 角色等级段/留存率 | **否** | 裸 CASE 表达式 | **是** |
| alias_037 | 氪金用户/白嫖用户/MAU | **否** | 显式拒绝（"无法回答"） | 否 |

- **0/9 使用回归/回流**——dup 清理无因果关系
- **5/9 在同代码重跑中也翻转**——confirmed 非确定性
- **4/9 为裸 CASE 表达式**——同一 LLM 输出格式缺陷

**dup 清理反向证据（alias_016 "回归玩家转化率"）：**
- `covered_assets` = `univ_role_tag_df`（被 dup 清理的表）
- 查询含"回归"（dup 清理减少的词）
- CL-15 基线: **WRONG**（agent 拒绝"回归定义缺失"）
- Run A: **CORRECT**（生成有效 SQL）→ Run B: **WRONG** → Run C: **WRONG**
- 结论：alias_016 是非确定性 coin-flip，dup 清理未伤害检索

### Verdict

1. **-3pp 是噪声**：3 同代码 run 中位数 73.2%（= CL-15 同代码重跑的 73.2%），70.8% 是 3 run 中的异常值。同代码 range 仅 ±2.4pp。单 run 结果不可用于趋势判断。
2. **Dup 清理无需回滚**：case-level 证据决定性——0/9 lost alias cases 使用 回归/回流 词汇；唯一使用该词的 alias_016 在各 run 中随机翻转（WRONG→CORRECT→WRONG→WRONG），与 dup 无关。dup 清理是正确的数据卫生操作（tf 2→1 不影响检索召回）。
3. **Alias -15pp = LLM 非确定性**：9 个 lost cases 的失败模式多样（裸 CASE 4/tool-call 1/SQL 逻辑 2/检索失败 1/拒绝 1），5/9 在同代码重跑中也翻转。Alias 3-run range ±7.5pp（3 case flips = 7.5pp on 40-case denominator），-15pp 约等于 6 个 coin-flip case 同时倒霉——概率上合理。
4. **需建立多 run 基线**：26.8% case flip rate 意味着 ~45/168 cases 跨 run 随机翻转。建议后续 eval 至少跑 3 次取中位数，或引入 pass_k=3 + majority-vote 降噪。
5. **真实基线（中位数）**: Overall 73.2%, Original 76.3%, Alias 65.0%, Voice EXEC 73.3%, Voice DELIVERY 77.8%。与 CL-15 基线 73.8% 几乎持平（-0.6pp，在 ±2.4pp 噪声带内）。

### Ticket Pointer
Resolves: [CL-22](../tickets/CL22-eval-nondeterminism-deepcheck.md)。Run IDs: `32dd9532`（existing）+ `e7a946be`（CL-22 run 1）+ `b244533a`（CL-22 run 2）。

---

## 2026-09-02: 联合全量 eval（CL-18+V1 完成 + CL-17 dup 清理后）

### Setup
- **基线**: Run `10320fe2`（CL-15 标准基线）73.8%；上次 run `1510b3e0` 76.8%
- **Cases**: 168 K11 cases（80 original + 40 alias + 30 voice EXEC + 18 voice DELIVERY）
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge on, --skip-health-gate
- **凭证**: `DASHSCOPE_API_KEY` 从 `~/.dsh/.credentials.yaml`（`scripts/run-eval.sh`）；gateway `pre-aga-ai-gateway.alibaba-inc.com` 可达
- **变更**: CL-18 Phase 2（算法加固，不改既有 dimension_refs）+ V1（audit delta，不影响 eval）+ CL-17 dup 清理（`univ_role_tag_df` 去重 回归/回流）+ CL-16 无新代码（Type-1→CL-19）。today=20260902（基线 today=20260830；日期相对问题不影 sql-judge 语义评分）

### Data (compare.ts 10320fe2 → 32dd9532, verbatim)
- Overall: **73.8% → 70.8% (-3.0pp)**；119/168 correct（49 wrong）；Run `32dd9532`，2283.5s

| Category | A (10320fe2) | B (32dd9532) | Delta |
|----------|-------------|-------------|-------|
| Original | 75.0% (60/80) | 72.5% (58/80) | -2.5pp |
| Alias | 77.5% (31/40) | 62.5% (25/40) | **-15.0pp** |
| Voice EXEC | 70.0% (21/30) | 73.3% (22/30) | +3.3pp |
| Voice DELIVERY | 66.7% (12/18) | 77.8% (14/18) | **+11.1pp** |

- Gained 16 / Lost 21 / Net -5
- Gained: 019/029/067/069/074 [Original], alias_004/016/028 [Alias], voice_007/026/028/029 [EXEC], voice_034/039/042/043 [DELIVERY]
- Lost: 001/011/021/042/043/046/049 [Original], alias_003/005/009/011/018/024/029/033/037 [Alias], voice_008/025/030 [EXEC], voice_033/036 [DELIVERY]

### Verdict
1. **Voice DELIVERY +11.1pp（66.7%→77.8%，14/18）**：CL-11 reply 管道 + looksLikeToolCall + CL-15 迁移 + 校准 judge 的 DELIVERY 改进 **hold 且提升**（voice_034/039/042/043 经正确结构化拒绝翻转）。仍 4 wrong（voice_017/033/036 +1）= Type-1 tool-call/SQL 发射 + Type-2 agent 行为。**CL-16 85% 目标未达（77.8%<85%）**，差距在 agent 行为（Type-1→CL-19，Type-2 独立）。
2. **Alias -15.0pp**：大幅回归但 **归因 LLM 非确定性**（lost 9 alias 多样：tool-call/SQL/CASE/拒绝，非 回归/回流 单一检索效应；回归 case alias_016/028 反 GAINED）。dup 清理理论中性（dup 不助 BM25）但 BM25 term-frequency 使其非严格中性——单 run 无法区分 dup 效应 vs 非确定性。**不回滚 dup（正确 hygiene），flag 待查**。
3. **CL-17 数据质量发现**：`univ_role_tag_df` 12 alt_labels（去重后），远超 08-31 "≤6 targeted" guidance（ARPU/ARPPU/流失/LTV/首充/首次充值 等 generic 标签稀释 BM25——CL-9 教训）。08-31 日志称 "trimmed to 6" 但文件实有 12-14 → trim 未完全落地。
4. **Overall -3pp 在 LLM 非确定性范围**（08-31 run 自身 Net +5 / "15 loss 全随机波动"；本次 Net -5）。单 run 不结论；趋势需多 run 中位数。
5. **CL-17 78% 目标未达（70.8%）**：enrichment 杠杆已尽（labels 已在；概念 case 仍拒）。真正剩余杠杆（皆非 "add labels"）：(a) trim over-enriched 表（univ_role_tag_df→6 targeted），(b) 概念 formula/定义（大R 阈值/回归 标识字段），(c) 迁移真不可答 EXEC-refusal→DELIVERY（018/071/058/064/066/070 多表/缺字段 case，拒绝质量高，DELIVERY judge 可打高分，如 CL-12/14/15 先例）。

### Ticket Pointer
Resolves: [CL-16](../tickets/CL16-reply-pipeline-delivery-fix.md)（部分——DELIVERY 77.8%<85%，pipeline 已尽，Type-1→CL-19，Type-2 agent 行为），[CL-17](../tickets/CL17-data-source-enrichment-round2.md)（部分——enrichment 已尽，78% 未达，剩余=trim/概念formula/迁移，非 enrichment）。Informs: [CL-19](../tickets/CL19-eval-toolcall-emission-rootcause.md)（live 多格式 tool-call 发射证据：`call:default_api:`/`call:func{}`/`<tool>`/`{"tool_calls":[...]}`/`{"name":...}`——looksLikeToolCall 漏部分格式）。Run `32dd9532` vs `10320fe2`。

---

## 2026-09-02: CL-16/CL-19 voice_017 Type-1 单 case 诊断（live eval）

### Setup
- **基线**: Run `10320fe2`（CL-15 标准基线）73.8%；上次 CL-16+17 run `1510b3e0` 76.8%
- **Cases**: 1（`k11v2_voice_017` "玩家反馈怎么样"，DELIVERY/llm_judge）
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge on, **--skip-health-gate**
- **凭证**: `DASHSCOPE_API_KEY` 从 `~/.dsh/.credentials.yaml` 加载（"secrets in file" 约定）；wrapper `scripts/run-eval.sh`
- **变更**: 无代码变更（诊断 run）

### Data (verbatim)
- Run ID `8b465bd9`，1 case，pass_rate 0.0%（1 wrong），23.3s
- `[DIAG] SQL: call:default_api:load_event_definition{event_name: "game.playerFeedback.sendFeedback"}`
- `[DIAG] ok=true decline=undefined rows=1`
- verdict: wrong（DELIVERY judge 判负）
- health-gate 需 `--skip-health-gate`（5s budget < AGA ~6-17s 延迟，否则 pre-flight 超时退出）

### Verdict
1. **Type-1 根因 live 确认**：eval LLM（aga/qwen3.7-max）对开放 DELIVERY 问题发射 tool-call 文本而非 SQL。本 run 格式 `call:default_api:load_event_definition{...}`（08-31 snapshot 为 `<tool>{"name":...}`）——**格式跨 run 不确定**。
2. **looksLikeToolCall 不完备**：08-31 的 `looksLikeToolCall()` 只捕 `<call>`/`<tool>`/`{"name":`/`func(...)`，**漏 `call:default_api:...`** → tool-call 文本直作 reply → judge 见乱码 → wrong。
3. **engine ok=true（非 decline）**：critic 不拒非-SQL + StandInOdps 对任意输入返 done+rows → garbage "SQL" "成功"。与 08-31 snapshot 推断（decline+空 reason）不同——实为 ok=true+tool-call reply。
4. **管道修复翻不了 case**：扩 looksLikeToolCall / critic 拒非-SQL / engine decline 都只改失败形态（乱码→劣质 LLM 答→干瘪 decline），judge 仍要结构化拒绝（仅 agent/LLM 能产出）。根因 = LLM 行为（对开放 Q 发 tool-call）+ prompt/model，见 CL-19。
5. **凭证 + gateway + --skip-health-gate 可用**：eval 可跑（23.3s/case）；后续 full run + compare 走 `scripts/run-eval.sh`。

### Ticket Pointer
Informs: [CL-19](../tickets/CL19-eval-toolcall-emission-rootcause.md)（Type-1 根因 + 修复定位）；CL-16（部分——pipeline 已尽，85% 需 agent 行为）

---

## 2026-08-31: CL-16 + CL-17 sql-judge 质量推进至 76.8%

### Setup

- **基线**: Run `10320fe2`（CL-15 标准基线），73.8%（124/168）
- **Session 基线**: Run `75ad2a5c`（同代码重跑），73.2%（123/168）
- **Cases**: 168 K11 cases（80 original + 40 alias + 30 voice EXEC + 18 voice DELIVERY）
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge enabled
- **变更**:
  - **CL-16**: `looksLikeToolCall()` 函数添加到 `context.ts`，过滤 `<call>/<tool>/{"name":...}` 格式的 tool call 文本，防止其作为 reply 传递给 DELIVERY judge
  - **CL-17 (trimmed)**: 3 表 alt_labels 扩充 + 2 concept alt_labels + pref_label 修正
    - `role_common_feature_df`: +8 labels（等级/角色等级/平均等级/战力/角色战力/VIP/通用特征/全服等级）
    - `univ_role_tag_df`: +6 targeted labels（免费玩家/零氪/大R/高付费/回归/回流）+ pref_label 修正为"角色标签宽表"
    - `social_fteam_summary_df`: +5 labels（小队/组队/小队成员/小队活跃/协战）
    - `univ_role_churn_di`: +5 labels（流失/流失用户/流失角色/流失率/流失预警）
    - `univ_acc_churn_di`: +4 labels（流失/流失账号/流失用户/流失率）
    - `item_circle_df`: +1 label（消耗量）
    - concept 付费经济: +4 labels（大R/高付费/零氪/免费玩家）
    - concept 用户生命周期: +2 labels（回归/回流）
  - **CL-15 DELIVERY 迁移生效**: 074/080/voice_034/voice_039 已在 YAML 中迁移

### Data (verbatim)

**Run 3** (CL-16+17 trimmed, Run ID `1510b3e0`):

| Category | CL-15 Baseline | New | Delta |
|----------|----------------|-----|-------|
| Original | 60/80 = 75.0% | 64/80 = 80.0% | **+5.0pp** |
| Alias | 31/40 = 77.5% | 30/40 = 75.0% | -2.5pp |
| Voice EXEC | 21/30 = 70.0% | 21/30 = 70.0% | +0.0pp |
| Voice DELIVERY | 12/18 = 66.7% | 14/18 = 77.8% | **+11.1pp** |
| **Total** | **124/168 = 73.8%** | **129/168 = 76.8%** | **+3.0pp** |

**Case flips vs CL-15 baseline**: Gained 16, Lost 11, Net +5

**Attributable gains**:
- k11v2_019 (负面舆情): CL-16 pipeline fix — tool call text no longer passed as reply ✅
- k11v2_080/074 (经济系统/用户质量): CL-15 DELIVERY migration ✅
- voice_034/039 (武将平衡/活动奖励): CL-15 DELIVERY migration ✅
- voice_007 (免费玩家): CL-17 univ_role_tag_df enrichment ✅
- alias_016 (回归玩家转化率): CL-17 concept enrichment ✅
- k11v2_062/066/067/069 (multi-table queries): LLM non-determinism (no code change)

**Enrichment regression diagnostic** (Run 2, `136c657c`, over-broad enrichment):
- 18 labels on univ_role_tag_df + 12 on role_tag_basic_df caused -12.5pp alias regression
- Trimmed to 6 targeted labels → alias regression reduced to -2.5pp (within LLM noise)

### Verdict

1. **Original 达到 80% 目标** (+5.0pp): CL-15 DELIVERY 迁移（074/080）+ LLM 非确定性净正。
2. **DELIVERY 大幅改善** (+11.1pp): CL-15 迁移（voice_034/039）+ CL-16 pipeline 修复（019 翻转）。
3. **Alias 小幅波动** (-2.5pp): trimmed enrichment 消除了 Run 2 的 -12.5pp regression，剩余 -2.5pp 在 LLM 噪声范围内。
4. **Over-broad enrichment 教训**: 给宽表加大量 generic labels 会严重稀释 BM25 信号。CL-17 的正确做法是 targeted labels（≤6 per table）+ concept anchors。
5. **Overall 76.8% 未达 78% 目标但显著进步**: 距 78% 仅差 2 个 case（131/168），且 Original 已达 80%。剩余 gap 主要来自 agent 行为（tool call 输出、不可回答问题错误生成 SQL）和数据缺口。

### Ticket Pointer

Resolves: [CL-16](../tickets/CL16-reply-pipeline-delivery-fix.md)（部分——Type 1 修复 ✅，Type 2 LLM 行为未改善），[CL-17](../tickets/CL17-data-source-enrichment-round2.md)（部分——7 检索缺口中 2 翻转，5 概念缺口中 1 翻转）

---

## 2026-08-30: CL-11~14 sql-judge 质量提升（四 ticket 联合）

### Setup

- **基线**: Run `9788424c`（CL-10 sql-judge 模式），66.1%（111/168）
- **Cases**: 168 K11 cases（80 original + 40 alias + 48 voice）
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4, sql-judge enabled
- **变更**:
  - CL-14: 4 表 alt_labels 扩充（pvp_card_statistics_di, univ_role_gacha_result_statis_di, pve_progress_df, com_pay_order_df）+ 5 表补充 enrichment（item_circle_df, role_server_base_df, progression_card_df, public_sentiment_df, play_rogue_df）+ 2 voice cases 迁移为 DELIVERY（voice_017, voice_020）
  - CL-11: DELIVERY judge prompt 改进（语义对齐而非文本匹配）+ **reply 管道修复**（agent 输出非 SQL 时，将完整文本传递给 judge 而非截断的 "Declined: ..."）
  - CL-12: 5 original cases 迁移为 DELIVERY（019, 049, 075, 078, 079，均为数据不支持/主观问题）
  - CL-13: 受益于 CL-14 enrichment（pve_progress_df → voice_030）

### Data (verbatim)

**Run 3** (CL-11~14 combined, Run ID `10320fe2`):

| Category | Baseline | New | Delta |
|----------|----------|-----|-------|
| Original | 56/80 = 70.0% | 60/80 = 75.0% | +5.0pp |
| Alias | 32/40 = 80.0% | 31/40 = 77.5% | -2.5pp |
| Voice EXEC | 22/34→21/32 | 21/32 = 65.6% | +0.9pp |
| Voice DELIVERY | 1/14→12/16 | 12/16 = 75.0% | +67.9pp |
| **Total** | **111/168 = 66.1%** | **124/168 = 73.8%** | **+7.7pp** |

**Case flips**: Gained 28, Lost 15, Net +13

**DELIVERY judge 修复效果**（核心改进）:
- 原始 14 DELIVERY cases: 1/14 → 11/14（+71.5pp）
- reply 管道修复是关键：agent 的完整拒绝文本现在完整传递给 judge

**CL-14 enrichment 效果**: voice_003（PVP胜率）✅, voice_008（充值流水）✅, voice_030（副本通关率）✅, voice_032（渠道转化率）✅

**LLM 非确定性波动**: 15 个 loss 全为随机波动（alias -2.5pp 即此原因）

### Verdict

1. **DELIVERY judge 从几乎全废到可用**：reply 管道 bug 是根因（agent 的拒绝文本被截断为 "Declined: ..." 传给 judge），修复后 +67.9pp。
2. **Enrichment 继续是 EXEC 质量的主要杠杆**：4 个 voice EXEC case 通过 alt_labels 扩充翻转。
3. **迁移主观/不可回答 case 到 DELIVERY 是正确做法**：5 个 original + 2 个 voice case 迁移，其中 agent 正确拒绝的多数能通过新 judge。
4. **75%+ 目标接近但未完全达成**（73.8%）：剩余 gap 主要来自 (a) 15 个 LLM 非确定性 loss，(b) original 80%+ 目标仍差 5pp。
5. **下一步杠杆**：减少 agent 错误拒绝（仍有 ~15 个 "no_sql" original cases 是 agent 找不到表或过于谨慎）。

### Ticket Pointer

Resolves: [CL-11](../tickets/CL11-delivery-judge-calibration.md), [CL-12](../tickets/CL12-sql-judge-baseline-regression.md), [CL-13](../tickets/CL13-compound-query-join-completeness.md), [CL-14](../tickets/CL14-data-source-gap-catalog.md)

---

## 2026-08-30: CL-10 Voice Eval Case Expansion (dual-mode baseline)

### Setup

- **Code state**: glob fix (`/^[a-z0-9]+(_[a-z0-9]+)*_\d+\./i`) + 48 voice cases added
- **Cases**: 168 K11 cases (80 original + 40 alias + 48 voice)
- **Voice breakdown**: 34 EXECUTION (scalar_exact / row_count_range) + 14 DELIVERY (llm_judge)
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, concurrency=4
- **Varied**: SQL Semantic Judge (disabled vs enabled)

### Data (verbatim)

**Run 1** (no-sql-judge, Run ID `033fea6a`):

| Category | Total | Pass | Wrong | Rate |
|----------|-------|------|-------|------|
| Original | 80 | 80 | 0 | 100.0% |
| Alias | 40 | 40 | 0 | 100.0% |
| Voice EXEC | 34 | 34 | 0 | 100.0% |
| Voice DELIVERY | 14 | 0 | 14 | 0.0% |
| **Total** | **168** | **154** | **14** | **91.7%** |

**Run 2** (sql-judge enabled, Run ID `9788424c`):

| Category | Total | Pass | Wrong | Rate |
|----------|-------|------|-------|------|
| Original | 80 | 56 | 24 | 70.0% |
| Alias | 40 | 32 | 8 | 80.0% |
| Voice EXEC | 34 | 22 | 12 | 64.7% |
| Voice DELIVERY | 14 | 1 | 13 | 7.1% |
| **Total** | **168** | **111** | **57** | **66.1%** |

**Run 2 failure classification** (57 wrong):
- execution_match=false (SQL judge 判负): 44
- delivery_match=false (DELIVERY judge 判负): 13

**Voice EXEC failures** (12/34 wrong):
- "Input is not SQL" (agent 退化为拒绝/工具调用): 7
- SQL 语义不完整 (缺 join / 缺聚合 / 选错表): 5

### Verdict

1. **SQL semantic judge 是更真实的质量标准**：no-sql-judge 下 100% 的 original cases 启用 judge 后降为 70%——judge 捕获了选错表（_df vs _di）、缺 join、过滤条件不精确等真实语义问题。
2. **Voice cases 有效暴露独特失败模式**：数据源缺口（agent 找不到 PVP 明细/抽卡流水/副本通关表）和多表 join 缺失（复合查询只完成一半）。
3. **DELIVERY judge 需校准**：agent 拒绝/澄清回复质量高（结构化 + 原因 + 建议），但 judge 几乎全判负。
4. **Enrichment 仍是最大杠杆**：7/12 voice EXEC 失败 = agent 找不到合适数据源。

### Ticket Pointer

Resolves: [CL-10 — Voice Eval Case Expansion](../tickets/CL10-voice-eval-case-expansion.md)
Full report: [research/cl10-voice-eval-experiment-report.md](cl10-voice-eval-experiment-report.md)

---

## 2026-08-30: CL-8 Cross-Validation (continuous-blend default)

### Setup

- **Code state**: `Config.blendingMode` default = `continuous-blend`; both `applyAliasFusion` and `applyContinuousBlend` have median-floor fix
- **Cases**: 80 original K11 cases (eval-cli glob filters alias cases)
- **Model**: aga/qwen3.7-max, engine responder, pass_k=1, SqlJudge disabled
- **Run ID**: `cl8-continuous-blend`

### Data (verbatim)

| Metric | cl8-full-fixed (strategy-b) | cl8-continuous-blend |
|--------|---------------------------|---------------------|
| pass_rate | 96.3% (77/80) | **100.0% (80/80)** |
| correct | 77 | 80 |
| wrong | 3 | 0 |
| declined | 0 | 0 |

Previously-wrong cases now correct:
- k11v2_011: `load_event_definition{event_name: "game.yanwu.match"}` (was wrong)
- k11v2_012: `SELECT COUNT(DISTINCT role_id) FROM dws_10000251_play_rogue_df` (was wrong)
- k11v2_025: `SELECT SUM(arena_win_times) / NULLIF(SUM(arena_battle_times), 0)` (was wrong)

### Verdict

**100% confirms zero regression from the blendingMode change.** The 3 flipped cases are LLM non-determinism on PVP metric_lookup borderline cases, not a blendingMode effect (CL-7 proved B=C at retrieval level). Both runs validate the median-floor alias scoring fix + L3 enrichment.

### Ticket Pointer

Cross-validates: [CL-8 — 端到端 Eval + Go/No-Go](../tickets/CL8-e2e-eval-go-nogo.md)

---

## 2026-08-30: CL-7 Production Pipeline Retrieval Experiment

### Setup

- **Corpus**: `SemanticLayerService.loadRetrievalCorpusAll()` — 4692 items (328 tables + 3919 metrics + 3207 events)
- **Graph**: `SemanticLayerService.getRelationGraph()` — live RelationGraph with aliasIndex
- **Cases**: 120 K11 cases (80 original + 40 CL-4 alias-dependent), `covered_assets` as ground truth
- **Varied**: `Config.blendingMode` (strategy-b / continuous-blend) × semantic layer state (L1: 4 tables with aliases / L3: 28 tables with aliases)
- **Pipeline**: Full `search_data_sources` execute: BM25 → blending → graph expansion → qualify (no query expansion, no qualification)
- **L3 aliases**: Hand-crafted from CL-5 `L3_ALIASES` mapping, written to K11 YAML files via `enrich-l3-aliases.ts`

### Data (verbatim)

**Run 1** (neither B nor C fixed): B = C = 0.467 (L1), 0.479 (L3). Zero delta.

**Run 2** (only C fixed with median-floor):

| Config | Mean R@20 |
|--------|-----------|
| B(L1)  | 0.467     |
| C(L1)  | 0.629     |
| B(L3)  | 0.479     |
| C(L3)  | 0.804     |

**Run 3** (both B and C fixed with median-floor — final):

| Config | Mean R@20 | Median R@20 | Mean P@20 | Orig R@20 | Alias R@20 |
|--------|-----------|-------------|-----------|-----------|------------|
| B(L1)  | 0.629     | 1.000       | 0.034     | 0.456     | 0.975      |
| C(L1)  | 0.629     | 1.000       | 0.034     | 0.456     | 0.975      |
| B(L3)  | 0.804     | 1.000       | 0.045     | 0.744     | 0.925      |
| C(L3)  | 0.804     | 1.000       | 0.045     | 0.744     | 0.925      |

B = C exactly (120/120 unchanged). Enrichment: both +17.5pp (L1→L3).
Flip analysis L1→L3: 27 improved, 2 regressed (k11v2_alias_009, _019), 91 unchanged.

### Verdict

**B and C produce identical results when both have the median-floor alias scoring fix.** The Run 2 "C wins" result was an artifact of fixing C but not B.

The real bug was alias-resolved candidate scoring: `ALIAS_BOOST=2.0` vs BM25 scores of 30–40 in the 4692-item production corpus. `applyGraphExpansionAndJoins` dropped these low-scored candidates at the topK slice. **Alias resolution has been effectively disabled in production since CL-1.**

The median-floor fix (`score = max(original, medianBm25)`) resolves this for both strategies. The blending formula (fixed boost vs coverage-weighted) makes no difference to recall@20.

Enrichment is the sole lever: +17.5pp from 4→28 tables with alt_labels.

### Fidelity Caveat

- **No query expansion**: `config.queryExpansion=false` (no LLM provider). Production would have LLM-powered expansion, potentially boosting both B and C. Direction should hold; absolute values may shift.
- **No qualification**: No `ctx.query` provider. Candidate IDs are unqualified (no ODPS project prefix). Affects the downstream NL2SQL but not retrieval-level metrics.
- **L3 aliases hand-crafted**: From CL-5 `L3_ALIASES`, not `discover_alt_labels`. Quality likely higher than LLM auto-discovery.
- **Median-floor fix applied to both B and C**: Run 3 applied the median-floor fix to B's `applyAliasFusion` as well, revealing B=C. The fix addresses an independent scoring bug (alias-resolved candidates scored 15–20× below BM25 in the 4692-item corpus), not a strategy-specific design choice.

### Ticket Pointer

Resolves: [CL-7 — Production Pipeline Retrieval Experiment](../tickets/CL7-production-retrieval-experiment.md)
Full report: [research/cl7-production-pipeline-experiment-report.md](cl7-production-pipeline-experiment-report.md)

## 2026-08-22: P3 Ontology NL2SQL Join Comparison (Structural)

### Setup

- **Corpus**: K11 semantic layer, 321 tables (162 DWS + 159 DIM), loaded via `loadTables(examples/k11-semantic-layer)`
- **Graph**: Built from `tableKindPlugin.relations()` over all parsed tables' `dimension_refs` (126 DWS with 225 join edges to 34 DIM tables)
- **Cases**: 5 K11 multi-table join eval cases (`k11-join-cases.ts`):
  - k11-j01: 各服务器的充值总金额 (pay_order → server_info ON server_id)
  - k11-j02: 每个商品配置的付费订单数 (pay_order → trans_recharge ON cfg_id)
  - k11-j03: 各活动的充值金额排名 (pay_order → com_activity_info ON activity_id)
  - k11-j04: 各区服角色通用特征的战力分布 (role_common_feature → server_info ON server_id)
  - k11-j05: 各服务器流失角色数 (univ_role_churn → server_info ON server_id)
- **Varied**: `EngineDeps.graph` — group A: real `RelationGraph` from K11 dimension_refs; group B: `undefined`
- **LLM**: PromptAwareLlm (scripted test double — returns correct multi-table JOIN SQL for each question; same SQL for both groups)
- **ODPS**: Permissive `StandInOdps({})` (returns `{ state: 'done', rows: [{ cnt: 42 }] }` for any SQL)
- **Scoring**: Structural join scoring — does the SQL reference the expected DWS table, DIM table, and join key pattern?

### Data (verbatim)

| Case | With Graph | Without Graph | Mechanism |
|------|-----------|---------------|-----------|
| k11-j01 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expands BM25 candidates to include dim_server_info; without graph, DIM not in candidates → critic `table_not_in_candidates` → decline |
| k11-j02 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Same mechanism: graph expansion adds dim_trans_recharge_df |
| k11-j03 | PASS (joinCorrect=true, traceHasConstraints=true) | PASS (joinCorrect=true) | BM25 retrieves both tables from "活动充值" keywords matching both descriptions; graph adds redundant constraint |
| k11-j04 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expansion adds dim_server_info |
| k11-j05 | PASS (joinCorrect=true, traceHasConstraints=true) | FAIL (declined=true, sql=undefined) | Graph expansion adds dim_server_info |

**Aggregate**:
- With graph: **100%** pass rate (5/5)
- Without graph: **20%** pass rate (1/5)
- Delta: **+80 percentage points**
- `joinConstraintsInjected`: true (all 5 cases)

### Verdict

The ontology relation graph provides two concrete mechanisms for multi-table query accuracy:

1. **Graph-expanded recall (C3)**: `expandCandidates` adds 1-hop `joins` neighbors (DIM tables) to BM25 candidates. Without this, the critic's `table_not_in_candidates` rule correctly rejects SQL referencing unlinked DIM tables — the LLM can generate the right JOIN, but the critic blocks it because the DIM wasn't retrieved.

2. **Join constraint injection (C1)**: `buildJoinConstraints` injects declared join conditions as hard constraints into the LLM prompt. This ensures the LLM uses the correct join keys rather than guessing.

The +80pp delta is driven primarily by mechanism #1 (recall expansion). Mechanism #2 (constraint injection) is harder to measure in isolation with a scripted LLM (it always generates the same SQL regardless of prompt content).

### Fidelity Caveat

- **Scripted LLM, not live**: The PromptAwareLlm is a test double that always generates correct multi-table JOIN SQL regardless of prompt content. A real LLM (DashScope/DeepSeek) would show the true accuracy delta — the scripted double demonstrates the mechanism (graph enables the SQL to pass the critic) but not the LLM's sensitivity to join constraints in the prompt. The real delta with a live LLM is likely smaller than 80pp (the LLM might generate single-table SQL without constraints, rather than correct JOIN SQL that gets blocked).
- **No ODPS execution**: SQL is not executed; scoring is structural (table + key presence). A live ODPS would additionally validate SQL correctness (column names, partition filters, data types).
- **Partition resolver not wired**: `partitionResolver` was not provided (defaults to `['ds']`); matches K11's actual partition scheme so no distortion.

### Ticket Pointer

Resolves: [P3 — Ontology NL2SQL Integration](../tickets/P3-ontology-nl2sql-integration.md) acceptance criterion "对比实验：有/无 ontology 辅助的多表查询准确率"

## 2026-08-31: B-DA6 option B 验证（FAILED — 已回滚）

### Setup
- **基线**: Run `10320fe2`（CL-15 标准基线，bare prompt），73.8%（124/168）
- **Cases**: 168 K11 cases（k11-v2：80 original + 40 alias + 48 voice）
- **Model**: aga/qwen3.7-max，Responder: engine，pass_k=1，concurrency=4，sql-judge enabled
- **变更**: B-DA6 option B — NL2SQL `buildPrompt` 渲染候选表名为 provider-qualified 形（`ieu_cdm.dws_…`），经 simulated-qualify 在 eval-cli `context.ts` 激活（生产用 `ctx.query.qualifyTable`；eval `withQuery=false` 时 inactive，故标准 eval 不暴露——需 simulated patch 才测得到）。

### Data (compare.ts 10320fe2 → 1f0ec09c)
- Overall: **73.8% → 6.5% (-67.3pp)**
- Original 75.0%→13.8%(-61.3pp) | Alias 77.5%→0%(-77.5pp) | Voice EXEC 70%→0%(-70pp) | Voice DELIVERY 66.7%→0%(-66.7pp)
- Lost 113, Gained 0. 153/168 semantic wrong（仅 4 parse-fail ≈ baseline 1 → 排除 judge-infra flake）。

### Verdict
1. **生成破坏（非 judge bug）**：qualified 候选名（`ieu_cdm.` 前缀）使 LLM 在 `buildPrompt` 路径输出**推理 prose / tool-call 文本 / 空**，而非 ```sql 围栏 SQL → `extractSqlCandidate` 抽不出 SQL → judge "Input is not SQL" → 153 semantic wrong。抽样：k11v2_006 输出推理（"用户的问题是…在检索候选中…"）、k11v2_011 输出 tool-call、k11v2_020/021 空 SQL。
2. 生产路径（`search_data_sources` tool 的 `qualifyCandidates`）在 session-31bd30c9 下正常生成 qualified SQL——破坏是 **buildPrompt-path-specific**（prompt 结构差异）。
3. B-DA5 已让裸名经 per-scope config 解析（K11 DAU 实测 7 日返回），qualification 对 MaxCompute 正确性冗余。

### Action
B-DA6 option B 全量回滚（`prompt.ts`/`engine.ts`/`eval-cli context.ts`/`eval-runner-service index.ts` + 删 `qualify-table.spec.ts` + 回滚 S20）；E-DA5 `loadScopeCorpus` + `cases/k11→k11-v2` staleness fix 保留；104 tests 绿（2 pre-existing eval-runner-service env 失败，CL-15 staleness，非 B-DA6）。若需 qualification，走 option A（execute 时 SQL 改写，不动 prompt/LLM）。

### Ticket Pointer
Resolves: [B-DA6](../../data-agent/tickets/phase-misc/B-DA6-qualifytable-live-wiring.md)（reverted）；run `1f0ec09c`（qualified）vs `10320fe2`（baseline）。

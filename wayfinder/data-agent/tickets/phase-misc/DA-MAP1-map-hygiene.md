# DA-MAP1 — data-agent map 从「存储」恢复为「决策索引」

**Type**: task  ·  **Phase**: misc  ·  **Status**: resolved (2026-10-06)
**Assignee**: claude (DA-MAP1 session)
**Branch**: master（纯 `wayfinder/` 文档，不触 `packages/*/src`——按 CLAUDE.md「直推 master 仅限 diff 不触及 packages/*/src 的纯 wayfinder 文档」）
**Blocked by**: —
**Blocks**: 后续任何读 map 取 ticket 的 session（当前 map 不可用作索引）
**Related**: [semantic-layer A21 map/prompt hygiene](../../../semantic-layer/tickets/A21-map-prompt-hygiene.md)（范本，commit `fd0bdf6102`）

## Question

`wayfinder/data-agent/map.md` 已从「索引」退化为「存储」：360 KB / 621 行，最长单行 12.5 KB，
违反 wayfinder skill 的两条约定——"The map is an index, not a store" 与「map 不镜像 open-ticket 状态」。

按 A21 先例把它恢复成决策索引：规范章节只保留 Destination / Notes / Decisions so far /
Not yet specified / Out of scope；每条 Decisions-so-far 压成「一行 gist + 票链接」；
实施记录与审计明细留在票里或移去 `research/`；open-ticket 状态镜像删除（状态唯一来源是票自己的 `**Status**`）。

同时清理 `tickets/` 下 11 个无可解析状态的文件：分出哪些是真票（补规范 Status）、
哪些是 session 总结 / prompt / 早期 spec 文档（`git mv` 出 `tickets/`）。

**这是搬运与压缩，不是重新决策**——所有跨 map 指针、fog、scope 边界原样保留。

## 范围边界（并行 session 硬约束）

- 只对 `wayfinder/data-agent/**` 有写权，含 `map.md`。
- 发现属于别的 map（repo-infra / evaluation / semantic-layer）的工作：只允许**新建 ticket 文件**，
  指针记在本票 Answer；**不编辑别人的 `map.md`**（另有并行 session 在跑）。
- `tickets/phase-1/调用文档-emp-414028.md` 是已 gitignore 的凭据文档（`842dbf3325` 已处理）——不动、不提交。

## 验收

1. `map.md` 回到 5 个规范章节，体积与行宽大幅下降（目标同量级于 semantic-layer 的 21 KB）。
2. 每条 Decisions-so-far 是「一行 gist + 票链接」，不含实施细节与 open 状态镜像。
3. `tickets/` 下只剩真票；每张票有可解析的 `**Status**`。
4. 本票 Answer 写明：归档了什么、哪些内容搬去哪、哪些判为 out of scope、给别的 map 开了哪些票。

## Answer

Resolved 2026-10-06。本票是**搬运与压缩**，零重新决策：所有跨 map 指针、fog、scope 边界原样保留或补回。

### 1. map.md 回到规范形状

`368,819 B / 621 行` → `66,310 B / 342 行`（**5.6×**）；最长单行 `12,561 B（9,074 字符）` → `1,027 B（647 字符）`（**12×**）。
章节恰好 5 个：Destination / Notes / Decisions so far / Not yet specified / Out of scope。

**密度对账**（这才是「同量级于 semantic-layer 的 21 KB」的正确读法）：semantic-layer 88 条决策 / 205 B 每条；
本 map **220 条** / 230 B 每条。每条的密度同量级（+12%），文件更大只因 data-agent 的已结决策是它的 2.5 倍。

6 个非规范章节逐一处置（行号已先核再改）：

| 原章节 | 处置 |
|---|---|
| L281 `## Next wave: 语义层/Ontology 管理 + 知识图谱可视化` | 已结票（M1-range-where-hint / W8 / W9 / W10 / W11 / GA-GT1-impl / Follow-on-3-B / UM4 / UM-DATA-SRC-DTS-POLLUTION / UM12）→ Decisions-so-far 一行 gist；「并行启动 / 下一批 / W10+W11 完成后」这类排程镜像**删除** |
| L340 `## Generalization audit (2026-08-31)` + 6 子节 | 审计报告与开票清单 → Decisions-so-far 的 2 条指针（报告留 `research/`）；已结的 GA-GRILL/GA-GT/GA-I18N/GA-EXP/GA-MODEL/GA-EVAL → 各一行 gist；**open 票（GA-EXP1 / GA-EXP5 / GA-GT5 / GA-GT3-* / GA-EVAL-CASESET-EVENT-ANCHOR / GA-EVAL-EVENTDEF-RECALL / GA-EVAL-CRITIC-DOTTED-PARAMS / GA-EVAL-ATTACH-POLL / GA-GT2-eval / GA-I18N-R1 / GA-GT1-cleanup / GA-CL15 等）全部移出 map**（状态唯一来源是票）；`### 推荐顺序` 整节删除（纯 open-state 镜像） |
| L411 `## Open follow-up tickets` | 整节删除 —— 3 条全是 open 票镜像（CI-pack-verify-release-version / CI-claude-md-symlink-mode-guard / GA-AUDIT1-followup-ucl7） |
| L417 `## GA-FORK-CI node-24 meta-gates` | 门禁计数与 PR 账目**删除**（属票与 git 历史）；留 2 条决策 gist（GA-FORK-CI-green 的三类根因、translation-pairing 债的可靠方法） |
| L429 `## Upstream merge 2026-09-07`（最大一块，108 KB） | 五轮 session 进度、门账、PR 链、worktree 清单、session 估算**全部删除**；压成 **UM1–UM18 + 20 张 UM-\* 的一行 gist**，每条只留「哪个结论、哪条反直觉事实」（如 UM12 的 CI red-set ⊊ 本地红集、UM-MERGE-INTEGRITY 的整包回退、UM-DATA-SRC-DTS-POLLUTION 的首要嫌疑被证伪、UM18 编号复用警告） |
| L596 `## Audit actions 2026-09-07` | 27 个 action 的逐条去向**删除**（明细在 `.tmp/audit/ACTION-LIST.json` 与各 PR）；其中跨域的几条进新设的「跨 effort 移交」节 |

**跨 effort 移交**另立一节，把原先散在实施记录里的 11 条跨 map 指针收拢。首版漏了 6 条，已补回并逐条验证可达：
interpretation-client-rendering map、repo-infra T6/T10/T11/T14/T15/T16、task-orchestration-dag G10、CLAUDE.md、parallel-dev-cleanup map。

**Notes 的变化**：补「状态所有权」「跨 effort 所有权」「凭证不过 transport」「upstream 内容不改」四条常设原则，
并把 frontier 查询**命令**直接写进 Notes（而不是让 map 继续列 open 票）。

### 2. 搬去哪了

| 文件 | 去向 | 判据 |
|---|---|---|
| `tickets/phase-upstream-merge/UM-flow-2026-09-08.md` | `research/um-flow-2026-09-08.md` | flow 规划文档（有自己的 Destination / 核心需求），非 question 形状的票 |
| `tickets/phase-upstream-merge/UM-session-2026-09-08-summary.md` | `research/um-session-2026-09-08-summary.md` | session handoff 总结 |
| `tickets/phase-misc/G1b-retrieval-quality-resolution.md` | `research/g1b-retrieval-quality-resolution.md` | **不是票**（订正本票 prompt 的「真票但状态写法不可解析」假设）：无 Question / Type，标题即 "Resolution Notes"；真票 [G1b-retrieval-quality](G1b-retrieval-quality.md) 已有自己的 Status 与 Resolution，且全仓**零引用**此文件 |
| `tickets/phase-misc/GA-AUDIT1-followup-next-session-prompt.md` | `archive/prompts/` | session prompt，其承接的 ④ cleanup 已于 2026-09-07 收口 |
| 根目录 `next-session-prompt.md` | `archive/prompts/next-session-prompt-gt3-sqlgen-prompt-fix.md` | 目标票 GA-EVAL-SQLGEN-PROMPT-FIX（09-05）与 GA-GT3 item 5+6（09-07）均已 resolved；改名以显其主题 |
| 根目录 `next-session-prompt-ga-eval-sqlgen-followup.md` | `archive/prompts/` | 目标票 GA-EVAL-SQLGEN-FOLLOWUP 已 resolved（09-06） |
| 根目录 `next-session-prompt-pb-deferred.md` | `archive/prompts/` | 6 项中 1 项已 resolved，且 prompt 内含 `map ~line 211` 这种被本次改动失效的行号指针；**5 项仍 deferred 的工作不丢**——各有自己的 `PB-deferred-*.md` 票（Status 可解析），prompt 只是 session 入口 |

`UM-flow` 被 **11 张活票 + 2 篇 research + 5 份 prompt** 引用，共 26 处路径引用全部 repoint（字节级、纯 ASCII 模式，避免 CJK read-modify-write 损坏）；
另 3 处是按名字的散文提及（`UM-flow-2026-09-08 Session A finding` 等），按 wayfinder「按名引用」保留不动。
`verify-md-links`：**2,277 文件全绿**。

### 3. tickets/ 下 11 个文件的真实分类（订正了 prompt 的分组）

机械扫描结果是 **8 + 3**，不是「全部无状态」：

- **8 份完全没有 `**Status**`**：上表 4 份非票（已移出）+ 4 份真票（`compute-tool` / `present-delivery-tools` /
  `data-agent-tool-packages-shipping` / `data-agent-conversation-readiness`）。
- **3 份有 Status 但不可解析**：`GA-FORK-CI-translation-pairing-debt`（只在 H2 标题里）、
  `data-agent-safe-compute-environment`（只在 H3 标题里）、`GA-GRILL3-tabledef-schema`（值写作 `Grilled`）。
  顺带修了同样毛病的 `GA-GRILL2-i18n-architecture`。

**5 份「疑似早期 spec 文档」全部判为真票**（不是文档）：都带 data-agent 的票头形状
（`**Type**` / `**Phase**` / `**Assignee**` / `**Blocked by**` / `**Blocks**`）+ `## Question` + `## Resolution`，
只是缺 `**Status**` 这一行。已补规范 Status。

`data-agent-conversation-readiness` 从「Not resolved」改为 resolved，并在票内写了 Reconciliation 节记录判据：
它自述的 hard gate #3（工具包占位）经**读 live preset 实测**已关闭——`agent.cordis.yml` 里
`tool-query-data`/`tool-load-*`/`tool-present-*`/`tool-suggest-followups`/`tool-compute`/`tool-critique-sql`/`tool-evaluate-sql-quality`
全部解注释带 `name:`，全文件 `name TBD` 零命中；#4 由 `dashscope-default-llm-plugin` resolved。

**结果**：`tickets/` 下 246 份 `.md` = 243 张真票 + 2 份 README + 1 份 gitignore 的凭据文档；
**243 张真票 0 份缺 `**Status**`**。
`phase-1/调用文档-emp-414028.md` 全程未动、未提交（已 gitignore，`842dbf3325` 处理过）。

### 4. 判为 out of scope / 边界的

map 的 `## Out of scope` 保留并压缩原有 4 条（workspace-files seam、P12c runtime-exfil ACL、
harness 重复路由静默、reverse-bi flywheels 等 Q3 裁剪项），**没有新增 out-of-scope 判定**——本票无权重新决策。

两处**显式区分了「专项边界」与「map 级 out-of-scope」**（沿用 2026-09-15 与 09-20 两次已有的口径澄清）：
UM4 关票交回 B-DA1、UM18 的 coverage 剥离为 COV1、UM18→B-DA7 归位，都仍在本 map 的 destination 内，
故记在 Decisions-so-far 的「跨 effort 移交」节而**不是** Out of scope。

### 5. 给别的 map 开了哪些票

**一张也没开**，三个候选都经核实后判为不值得：

1. **mojibake 清理**（旧 map 记「`map.md` 7 行 + `research/experiment-audit-log.md` 1 行，没有任何票在追踪」）——
   本次实测后**旧记录是过期的**：`experiment-audit-log.md` 现在**零命中**；整个 `wayfinder/**/*.md` 只剩 **1 处**，
   在 `prompts/next-session-2026-09-12-post-pr117-merge.md`。map 的 7 处随本次重写清零（它们全在被删/被压缩的章节内）。
   为一份已失效 handoff 里的 1 个损坏字符开票是过度工程；已把**实测事实 + 可跑的定位命令**写进 Out of scope 条目。
2. **根目录未追踪的 `analyze-real-exec-gap.mjs`** —— 单文件归位决定，指针记在 [DA-MAP2](DA-MAP2-status-value-accuracy.md)。
3. **GA-EVAL-CASESET-EVENT-ANCHOR 是否已被 evaluation [T11](../../../evaluation/tickets/T11-loader-source-strip.md) supersede** ——
   T11（resolved）确实做了 reference SQL / `meta.anchor_ds` 快照锚点的保留，但判定「它是否取代本票」是**重新决策**，
   超出本票授权。票保持 open 原状，只在 map 的 eval 节留了跨 effort 指针。
   顺带订正一条过期风险记录：`packages/eval/eval/cases/rbi-10000251-exec/` 的 39 个 case **现已入 git**
   （实测 `git ls-files` = 39），旧 map 的「未被追踪、源在仓库外、基线不可复现」已不成立。

### 6. 本 session 新开的票（data-agent 自有）

- [DA-MAP2 — ticket 的 Status **值** 与实际状态对账](DA-MAP2-status-value-accuracy.md)（task, open）。
  本票解决的是**可解析性**；准确性是另一回事：map Notes 那条 frontier 命令返回 **46** 份，
  其中混着 Status 写错的已结票。两类缺陷已确证（非推断）：
  `R-DA-CLIENT-RUNTIME-DECOMMISSION` 票头 `open` 而工作已落地且 map 记为 closed；
  `P3-subagent-qoder` 的 Status 是叙事链、`resolved` 埋在第三段。
  按 wayfinder「一 session 一票」，本 session 未擅自翻它们的状态。

### 7. 过程中踩到并修掉的两件事（值得下一棒知道）

1. **我自己犯了 CLAUDE.md 第 3 条记的那个错**：用 `edit_file`（read-modify-write）改这份 CJK 密集文档后，
   在**离编辑点约 4 行**的两行里各打坏一个字（`，`→2×U+FFFD、`轨`→2×U+FFFD）。
   lefthook 的 whitespace/vendor 门、`verify-md-links`、`--stat` **全部不报**。
   抓到它靠的是每次写完都跑一次 `grep -c` 计数；修复用**字节级替换**。
   此后对该文件的全部编辑改走 python 字节级操作。**结论：CLAUDE.md 那条不是历史轶事，工具链今天仍然不保护你。**
2. **第一版写进 map 的 frontier 命令是坏的**：返回 142 份（真值 46）。两个原因——
   Status 值的 `Resolved` 是**大写** R（漏了 `-i`），以及 `✅ resolved` 这种带 emoji 前缀的值
   过不了 `[[:space:]]*\**`（改成 `[^A-Za-z]*`）。
   修正后 default locale 与 `LC_ALL=C` 都返回 46，并与一份独立的 python 扫描交叉核对一致。
   **一条死命令比没有命令更糟**——落笔即自己跑一遍，这次正是这么抓到的。

### 提交（逐单元，按路径 stage，无 `git add -A`）

- `c4c6476568` claim DA-MAP1
- `4ee108dbe3` map 恢复为决策索引
- `f52236109c` 非票移出 tickets/ + 失效 prompt 归档 + 26 处引用 repoint
- `22573b8382` 补规范 Status + frontier 改为查询
- `cf18ffdb9e` 开 DA-MAP2

未触碰 `wayfinder/` 下任何其他 effort 的文件（并行 session 期间 `wayfinder/evaluation/` 一直有在途改动，全程未 stage）。

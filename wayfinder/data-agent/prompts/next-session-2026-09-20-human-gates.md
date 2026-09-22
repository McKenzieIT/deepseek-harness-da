# Next session — 清掉 3 个人工闸（HUMAN-IN-THE-LOOP session）

> **承接** 2026-09-14 session-4（origin/master 到 `909f8b508c`；UM15 §3 停 2/6 seam 在 `dsh-s3-resync` mid-merge）。
>
> **本 session 唯一目标**：把专项剩余里**只有人能提供的三项输入**一次性收齐——① UM4 的 JSONL capture 结果、② eval-team 对 eval-cli 3 问的回答、③ UM15 §4 的 expiry calibration 数值。每个闸清掉后，**便宜且自包含的收尾就地 land**；重的执行（fixture、§4 代码+测试、§3 merge）**不在本 session**，交给再下一个 AFK session。
>
> **这是必须有用户全程在场的 session。** 不是 AFK。开场就把三个闸摆到用户面前，别自己闷头写代码。

---

## ⚠️ 头号纪律：核工具，不信 prompt 里的数字

上上 session 一次抓到 **4 类** stale fact（拓扑 ahead 数、blocker 诊断、文件数、双基线全错）。本 prompt 里每个 SHA / 行号 / 计数，动手前用工具复核。尤其三个闸都要引用具体行号（`tsconfig.host.json:131`、`upstream-sync-record.ts` 的 `Waiver` interface 等），先 `grep` 确认现行有效再动。

## 0. Preflight（30 秒）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git rev-parse origin/master          # 期望 909f8b508c（以实测为准）
git rev-list --left-right --count origin/master...master   # 期望 0	0
git status --short                   # 期望仅 4 个故意 untracked（docs/adr ADR sidecar + 3× G13）
git worktree list | wc -l            # 期望 8
git -C /Users/mckenzie/workspace/dsh-s3-resync rev-parse MERGE_HEAD  # c291e7961a51（本 session 不碰它）
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md");let n=0;for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;}console.log("U+FFFD:",n)'  # 13
```

## 1. 三个人工闸

**共同形态**（三个都一样，是本 session 的核心洞察）：**人给输入 → agent 判分支 → 便宜的就地 land，重的传给 AFK session**。人工闸清掉 = 输入到手或被明确 characterize，**不等于**全部代码落地。

| # | 闸 | 人要给什么 | 清掉后就地 land | 传给 AFK session |
|---|---|---|---|---|
| ① | **UM4** capture | 跑一次交互复现，贴回 `turn/end` 的 `reason.reason.kind` | （可选）2 个 additive 件 | 5 fixtures + scope 硬化 |
| ② | **eval-cli** ack | 答 3 问（或从 eval-team 取回） | sub-option b 全套（自包含）| —— |
| ③ | **UM15 §4** calibration | 定 N-syncs + expiry 窗口（grilling）| §2 knownRed[] schema | §4 代码+spec+test |

### 闸 ① — UM4 JSONL capture（**最先做**，用户点几下就出结果）

**为什么先做**：capture 结果（`'disposed'` vs `'error'`）决定 UM4 的实现是否进 AFK session 的 scope。早拿到，AFK 的 scope 才定得下来。

**让用户照做**（[UM4 票](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md) 的「解锁本票所需的精确 capture 协议」节，勿再设计）：
1. 启 DSH（data-agent bundle），**新建会话**（必须新会话——300s stall watchdog 那条 abort 源在首条消息不可能触发，是排干扰的关键）。
2. preset 选择器选 **取数模式**。
3. **立刻**发一条消息（让 `@Remote('select')` 的 switch 与首个 turn 的 prompt 竞争 = B-DA1 的 race window；等 switch settle 再发就复现不出来）。
4. 看 UI 是否出 `Interrupted: interrupted`。
5. `ls -t ~/.dsh/storages/sessions/*.jsonl | head -1` → 在该文件里 `grep -a 'turn/end' <id>.jsonl | tail -1`，取 **`reason.reason.kind`**（**双层** `reason.reason`，不是 `reason.kind`）。

**agent 按值分支**：
- **`'disposed'`** → observer-fix 假设**确认**。本 session 可选地 land 那 2 个 additive 件（`pendingSwitch(sessionId)` read-only accessor on `packages/preset/agent-presets/src/index.ts` 的 private `switches` Map :684；`packages/data/preset-autojoin` 的 `agent/pre-step` guard）——它们 additive、不动 `@Remote('select')`。**5 fixtures + `packages/core/scope` rebind-hardening 传 AFK session**（票已判 `singleSessionFeasible: FALSE`）。
- **`'error'`** → Hypothesis B（DashScope/LLM wiring）介入，与 observer-fix 正交。UM4 **仍 defer**，但已 characterize；把这个结论记进票，不在本 session 展开。
- **缺失 / 其它** → 停下问用户，别猜。

**铁律**：capture 出不来就停下问用户，**不要转而去写实现**（票明写这条）。

### 闸 ② — eval-cli 3 问（早摆出来，可能本 session 不落地）

[UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS 票](../tickets/phase-upstream-merge/UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md) 已把 3 问逐字备好。**开场就摆给用户**——若要转 eval-team，有往返延迟，早问才有机会本 session 内拿回答。3 问（`packages/eval/eval-cli` 是永续运行的 eval 机器，动它的 tsconfig 不能自助）：
1. `tsconfig.host.json:131` 为何**整包** exclude `packages/eval/eval-cli/**`？加一个 sibling `tsconfig.tests.json`（从 `tsconfig.host.json:250` 引用）而**不**掀那条整包 exclude，安全吗？
2. tests tsconfig 形状：emit（composite，为 `tsc -b` graph 完整）还是 noEmit（纯类型检查）？
3. 加这个 tests program 会不会扰动永续运行的 eval 机器的 build/typecheck？

**agent 按回答分支**：
- **答到了** → 按票的「落地方案 sub-option b」实现（自包含，本 session 可 land）：建 `packages/eval/eval-cli/tsconfig.tests.json`（形状按第 2 问答案定 emit/noEmit）→ `tsconfig.host.json:250` 旁加 reference → 复验 `OXC_LOG=debug oxlint .` unmatched 55→49 且 6 spec 的 `Got tsconfig` 不再 `<none>` → **删 `run-oxlint.ts` 的 `EVAL_CLI_PENDING_FIX` + `oxlint-contract.spec.ts` 里对它的断言**（防线转无豁免全绿）→ 关本票 + 更新 UM-LINT-B。
- **没答到** → 本票**保持 blocked**，本 session 只把问题摆清楚让用户去追，**不碰 tsconfig**。这不算失败——票明写「拖着不做不会让 A 类无声重长」，防线现在就是绿的。

### 闸 ③ — UM15 §4 calibration（grilling，本 session 主戏）+ §2

[UM15 票](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md) §4 节的 policy sketch 已就位，缺的是**人的判断数值**。grill 用户定这些（`Waiver` interface 在 `scripts/upstream-sync-record.ts`，`collectGitFailures` 现在对 zero-hit waiver 只发 NOTE）：
- **N**：`decision:'keep'` 的 waiver，连续多少轮 recorded sync **零命中**后，从 NOTE 翻成 **FAILURE**（强制重新裁决）？
- **expiry 窗口**：`decision:'drop'`（欠 remediation）的硬 expiry 绑 ticket——窗口多长？`decision:'pending'` 取最短 fuse（票说「不得存活 >1 sync round」——确认 = 1 轮？）。
- **known-red expiry**（给未来 §2 的 `knownRed[]`）：`reopenTrigger` 语义 + 可选 review-by date 的模型确认。
- **确认语义变更本身**：把 zero-hit 从 note 翻成 failure 会改 `collectGitFailures` 行为——用户确认要这个。

**calibration 定死后**：
- **§2**（`knownRed[]` schema + `verify-gate-coverage.ts` 的 Check 4 + `gate-coverage.manifest.json` 2 条 entry：client-ui-i18n 83 KNOWN-RED + doc-standard 2 KNOWN-RED）——additive、自包含，**本 session land**。
- **§4**（`Waiver` interface 加 `expiresAfterSyncs`/`expiresOn` + `collectGitFailures` note→failure + spec/test）——数值定死后实现是**机械**的。本 session 预算够就 land；不够就把**定死的数值**写进票，代码传 AFK session（它已无人工未知）。

## 2. 推荐顺序

1. Preflight。
2. **闸 ①** capture（用户点几下，最快出结果，且决定 AFK scope）。
3. **闸 ②** 3 问（早摆出去争取往返）。
4. **闸 ③** §4 grilling（主戏）→ land §2 → author/land §4。
5. 回到闸 ①/②：把便宜的收尾 land（UM4 2 additive 件 if disposed；eval-cli sub-option b if answered）。
6. Push A-path（从 `dsh-resync`，逐 ticket 一 commit）→ PR → `gh pr merge --merge`。
7. Handoff（见 §6）。

## 3. 明确**不在**本 session（→ AFK session）

- **UM15 §3 merge**（36 out-of-seam + seam-5/1/3/6）——serial，`dsh-s3-resync` 本 session **完全不碰**。
- **UM4 5 fixtures + scope rebind-hardening**——即便 capture 确认 disposed。
- **§4 代码实现**——若 grilling 定了数值但预算不够。
- **UM-FORK-README-GENERATOR-RESIDUALS**（2 项）——纯 AFK，无人工输入。
- 这些正是"可并行 AFK"的部分：AFK session 里 §3 单 worktree serial 跑，其余（fixtures / §4 代码 / residuals）disjoint 可并行 fan-out。

## 4. Budget（~250-450K，比 merge session 轻）

| Phase | Tokens |
|---|---|
| Preflight | ~15K |
| 闸 ① capture 分析 + (可选) 2 additive 件 | ~40-70K |
| 闸 ② sub-option b（若答到）/ 仅摆问题（若没答） | ~10-60K |
| 闸 ③ §4 grilling + §2 land + §4 author | ~80-150K |
| Push + verify（逐 ticket）| ~40-60K |
| Handoff + AFK prompt + map | ~40-60K |
| **Total** | **~250-450K** |

## 5. 铁律

1. 仅 `mcp__local__*`；**从不 `--no-verify`**；commit `-F` + 显式路径；**永不 `git add -A`/`.`**（4 个 untracked 故意留着，3 个在 HANDS-OFF 路径）。
2. `.worktrees/{r10,t1,g10}` + `wayfinder/evaluation/` + `wayfinder/task-orchestration-dag/` **完全 hands-off**。
3. `edit_file` BLOCKED on `map.md` → node Buffer byte-splice；核 **U+FFFD=13** + 字节守恒；**别复制任何 U+FFFD 字节进新文本**。
4. 推非 master ref 从 **`dsh-resync`** 推（主树 pre-push typecheck fail，dsh-root build breakage 仍在，UM12/UM16 tracked）；PR 走 A 路径。
5. **`dsh-s3-resync` 本 session 不碰**（它是 AFK session 的战场，保持 mid-merge 原状）；`stash@{0}` 保留勿 drop。
6. **人工闸出不来结果就停下问用户**，不要转去写别的填时间——本 session 的价值 = 把人工未知清零，不是堆代码量。
7. eval 机器永续运行：eval-cli 的 apply **必须先协调**（read-only 复现随便跑，改 tsconfig 不能自助）。
8. 测试用显式 spec 路径；`--dir` 会跑全仓；`--reporter=basic` 在 vitest 4 不存在。

## 6. Handoff — 收尾时**写 AFK session prompt**

三个闸清完、输入已知，AFK session 的 scope 就完全定了。收尾：
- 各票记回结果：UM4 capture 值 + 分支结论；eval-cli 答到没（答到→closed，没答→仍 blocked 但问题已递）；§4 定死的 N + 窗口数值（无论代码落没落）。
- 写 `prompts/next-session-2026-09-21-afk-execution.md`：AFK 执行 session，一个 serial §3 subagent（`dsh-s3-resync` 续，按上上 prompt 的 8 步 resume 序）+ 一个并行 fan-out（UM4 fixtures if disposed / §4 代码 if 数值定 / GENERATOR-RESIDUALS 2 项 / eval-cli 若本 session 没答但事后答到）。带上所有 gotcha（tsconfig.base.json blocks-all-vitest、强制 pnpm install、显式 spec 路径）。
- map.md byte-splice session entry + 票账 delta。

## 7. Reference

- **三票**：[UM4](../tickets/phase-upstream-merge/UM4-apiproxy-rehome-results-rpc-remote.md)（capture 协议 + Implementation sketch + Fixture list）· [UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS](../tickets/phase-upstream-merge/UM-LINT-B-EVAL-CLI-TSCONFIG-TESTS.md)（3 问 + sub-option b + 收口清单）· [UM15](../tickets/phase-upstream-merge/UM15-durable-upstream-sync-method.md)（§2 schema + §4 policy sketch + `[2026-09-14]` §3 节）
- **本 prompt supersedes 的**：`next-session-2026-09-19-um15-s3-continue.md`（§3 merge——被本 human-gate session 插到它前面；§3 挪到 human 之后的 AFK session）
- **专项 close-out 顺序**：human-gates（本）→ AFK-execution（§3 + fixtures + §4 代码 + residuals）→ 专项归零。约 3 个 session 收尾，前提是本 session 三个闸都清掉。
- **origin/master**：`909f8b508c`（session-4 close，PR #129）

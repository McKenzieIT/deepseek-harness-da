# Next session — upstream-merge 剩余 9 张开票收口（workflow-driven）

> 承接 `push-master-2026-09-12.md` + post-#119 audit（tracker commits `e21916c572` + `f1bcee778f`）。**唯一目标**：以 workflow-驱动方式清掉 `phase-upstream-merge/` 下 9 张 open 票的**大部分**（A 类必收，B/C 类应收，D 类要拍板，E 类给出下一批 session 拆分）。

---

## 0. 一句话现状（勿重新调查，直接用）

- **PR-blocker 全消**：#115/#116/#117/#119 均 merged；`origin/master = 9ffb7b3eed`；无环境阻塞（master-sync gate 已解）。
- **票账**：33 = **9 open** + 17 resolved + 6 archived + 1 folded。
- **Local master `f1bcee778f`**（2 tracker commit unpushed：`e21916c572` UM11 master-sync resolved + `f1bcee778f` post-#119 UM audit sweep）。origin/master 是 local master 的祖先，FF-relation。
- **前置本地修复**（不入 git，别误以为回归）：
  1. `packages/query/query-maxcompute/tests/per-scope-maxc-config.spec.ts`（`.gitignore:65` 明确保 local，CI 不查）：`CredentialProvider` 5 个 record 方法的 mirror class override 缺时补上（照 sibling `per-scope-data-source.spec.ts:71-77` 抄）；tsc 0 错、vitest 13/13。
  2. `export CI=true` 让 pnpm install 不在非 TTY 要求 TTY 确认（`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NOTTY`）。

---

## 1. 铁律（copied from `push-master-2026-09-12.md` §4，仍适用）

1. **只用 mcp__local__\***（built-in Read/Write/Edit/Bash/Grep/Glob BLOCKED）；sh 非 bash（无 `<()`、无 `PIPESTATUS`、无数组、无 `< <()`；取退出码用临时文件 + `$?`）；`export PATH="/usr/local/bin:$PATH"` + `export CI=true`（node v24 + pnpm 不要求 TTY）。
2. **commit message 用 `-F` 文件**，不用 `-m`；**`git add` 只显式路径**，不 `-A`；**从不 `--no-verify`**。
3. **绝不 `rm -rf lib`**（上上 session 的坑：删了 tsdown entry 来源）；清 stale 用 `tsc -b --force` 重建。
4. **改源码后跑全量 `check:ci:static`**（~5min），不只跑针对门——doc-only edits 可跳过（本 session 的 A/B/C 多数属源码/机制变更，须跑）。
5. **不碰 `wayfinder/evaluation/`**（reconcile 已完成，勿再动）；不碰 `.worktrees/r10-harness-goodhart` / `.worktrees/t1-exec-grader`（evaluation effort worktree）。
6. **`edit_file` BLOCKED on `wayfinder/data-agent/map.md`**（13 U+FFFD 落 byte offsets 159892/175578/223382/230887 等，`edit_file` 的字符串匹配在 U+FFFD 附近可能不 byte-safe）→ **用 node Buffer byte-splice**：`fs.readFileSync(P)` → `Buffer.indexOf(anchor)` → `Buffer.concat` → `fs.writeFileSync(P)`；splice 后核 `U+FFFD count 保 13` + `bytes 前 + entry length == bytes 后`。
7. **推非 master ref 从 `dsh-resync` worktree 推**（HEAD ≠ master → `no production src on master` 门 legitimately 跳过）；**推 master 本身**只有在 origin/master..HEAD 全为 doc-only（不碰 `packages|apps|native|python` 下 `src|bin` 或 `scripts/`）时才能过门；否则走 feat 分支 + PR merge 路径（`gh pr merge` 不跑 lefthook）。
8. **不 push tracker commit**（沿 `a79ede0862`/`5b8fc6da5a`/`e3d7710aaa`/`e21916c572`/`f1bcee778f` 同类 discipline，用户显式指示前不 push）。

---

## 2. 攻略顺序（A→E，前一顺无环境阻塞，可并行 session；E 是 pointer 集）

**A → B → C → D → E**（推荐单 session 单档；A/B 可合成一个 session，D 独立 grilling session）。

| 档 | Cluster | Session 估 | Workflow value |
|---|---|---|---|
| A | UM-QODER costs 半 | ~1-2 | 高（并行 grep + 并行 regen dry-run） |
| B | UM-MERGE-INTEGRITY 2 waiver drop | trivial | 无（chore，两处 edit） |
| C | UM11 p2-* 后清 4 branch 决策 | ~1 | 中（4 并行 branch analyzer） |
| D | UM-C-GATES + UM12 收口 | ~1（grilling） | 高（judge panel + adversarial verify） |
| E | UM4 / UM6 / UM15 slice 2-3 / UM-LINT-B | 见各条 | 见各条（独立 session） |

**当 session 单档且 A+B 可合并时**：session 1 = A + B（合并大 regen pass 内触 B 的 waiver drop），session 2 = C，session 3 = D（grilling），后续按 E 单开。

---

## 3. Cluster A — UM-QODER costs 半（退 Qoder subagent + 删 SubagentCosts）

**目标 & 前提** — "Done" = 退掉 Qoder-as-subagent 产品能力并随之删除 `SubagentCosts` 类型 + `SubagentResult.costs` 字段 + audit G3 Credits 对账 feed + admin qoder export + bundle 挂载行，使 `SubagentResult` 恢复 upstream 原貌，`verify-type-equiv` 的 costs DRIFT 自动消失（11 红 → 10）。本票**只做 §A（Qoder+costs 半）**，NOT §B（scopeId），因票内 2026-09-11 复核确证 scopeId 前提证伪（3 writer + 6 live reader，删它破 tsc 且回退 per-tenant linker 隔离 tenant-leak #19）→ 拆独立票重新 grilling（未做，本 session 不动）。前提 `Blocked by: UM11` 已由 2026-09-12 节释放（#115/#116/#117/#119 全 merged），UM-INVARIANT 已 resolved 于 `7ad3242d97`（subsume 关系：本票删整包会覆盖其 invariant retirement，顺序 OK）。

**Scope（具体文件/行）** — 严格照 Scope §A + 2026-09-11 复核补漏项，共 6 + 3 遗漏 = 9 组站点：
1. 删整包 `packages/subagent/subagent-qoder/`（~487 行，含 `run.ts` 的 `qoderCosts()` — costs 唯一生产者；invariant 三件套已 retire，spec 已清 companion，其余测试随包删）。
2. `packages/subagent/subagent/src/types.ts`：删 `SubagentCosts`（`:280`）+ `SubagentResult.costs` + JSDoc（`:333-335`）；`src/index.ts:89` 删 `SubagentCosts` re-export。
3. `packages/subagent/tool-subagent/src/index.ts`：`:25` 删 import、`:201` 删 `readonly costs?`、**`:223` 第三处 costs 站点**（2026-09-11 复核补漏）。
4. `packages/data/audit/src/index.ts:199,214-215,315-317,323` 删 `extractCosts` + `extra.credits`；`src/schema.ts:45,96,102` 删 `qoder_call`/`QODER_CALL` tag；**`src/store.ts:572`（`TAG.QODER_CALL` SQL 汇总）+ `:629`（`correctedStats` 分支）2026-09-11 复核补漏**；对应 `tests/audit.spec.ts` 同步。
5. `packages/data/admin/src/index.ts:538` 清 qoder export + 相关 API。
6. `packages/bundle/data-agent/cordis.patch.yml:224,227-228` + `README.md:5,11,19`。
7. **`extensions/tool-cordis/src/api-catalog.ts:6422-6423,6463`（`SubagentCosts`）+ `:565`（`qoder_call` 描述）**（2026-09-11 复核补漏，属 catalog generator 产物 — 让 generator regen 出新版本，不手编）。
8. 5-generator regen 级联（**非票头 3 而是 5**，2026-09-11 复核修正）：`api-cordis-catalog`/`config-catalog`/`doc-graphs`/`module-graph`/`architecture-graph`。
9. Translation-pairing 双语面 **38 个文件**（audit READMEs、identity、phase-gate、credentials-keychain{,-host} specs、12 `docs/` 双语对含 `da-architecture`/`da-plugin-development-guidelines`/`subsystems/data-agent`/`da-upstream-debt`）— zh emission 已于 `4d4f725748` 落地，本票只需**不恶化**。

**Workflow 设计**（sh + node v24，注意 `rg` 未装用 `grep -rEn`）

```javascript
export const meta = {
  name: 'um-qoder-costs-retire',
  description: '退 Qoder subagent + 删 SubagentCosts 全站点 sweep + 5-generator 并行 regen',
  phases: [
    { title: 'Sweep', detail: '7 并行 grep 遍历命中所有 costs/qoder 站点' },
    { title: 'Verify-scope', detail: 'adversarial verify: grep 命中 vs 票 Scope 是否一致' },
    { title: 'Edit', detail: '串行 apply 9 组站点（写文件+验 tsc/audit spec）' },
    { title: 'Regen', detail: '5 并行 generator regen dry-run（--check）' },
    { title: 'Gate', detail: '全量 check:ci:static + build:official + verify-type-equiv' },
  ],
};

phase('Sweep');
const PATTERNS = [
  { label: 'SubagentCosts',   pattern: 'SubagentCosts',                                    paths: 'packages/ apps/ scripts/ extensions/' },
  { label: 'costs-field',     pattern: '\\.costs\\b|readonly costs\\?',                    paths: 'packages/subagent/ packages/data/' },
  { label: 'subagent-qoder',  pattern: 'subagent-qoder|@dsh/subagent-qoder',               paths: 'packages/ apps/ scripts/' },
  { label: 'qoder_call',      pattern: 'qoder_call|QODER_CALL|TAG\\.QODER',                paths: 'packages/data/audit/' },
  { label: 'qoderCosts',      pattern: 'qoderCosts|extractCosts|extra\\.credits',          paths: 'packages/' },
  { label: 'bundle-mount',    pattern: 'subagent-qoder',                                   paths: 'packages/bundle/ apps/' },
  { label: 'catalog-hits',    pattern: 'SubagentCosts|qoder_call',                         paths: 'extensions/tool-cordis/src/api-catalog.ts' },
];
const hits = await parallel(PATTERNS.map(p => () =>
  agent(`Run: grep -rEn '${p.pattern}' ${p.paths} 2>/dev/null | head -200
Return the raw lines. If empty, return "NO HITS".`,
    { label: p.label, phase: 'Sweep' })));

phase('Verify-scope');
const delta = await agent(`These are the grep sweeps for the UM-QODER §A retirement:
${PATTERNS.map((p, i) => `--- ${p.label} ---\n${hits[i] || '(dropped)'}`).join('\n')}

Adversarially verify: cross-reference against the ticket's Scope §A + 2026-09-11 复核 补漏项 (list in the outer session prompt cluster A briefing). Return:
- MISSING: sites in Scope not present in greps (drift, ticket line stale)
- SURPRISE: sites in greps not in Scope (need judgment call)
- CONFIRMED: sites in both
Structured as JSON.`, { phase: 'Verify-scope', schema: { type: 'object', properties: { missing: { type: 'array' }, surprise: { type: 'array' }, confirmed: { type: 'array' } } } });

log(`Scope delta: missing=${delta.missing.length} surprise=${delta.surprise.length} confirmed=${delta.confirmed.length}`);
if (delta.missing.length || delta.surprise.length) {
  log('DRIFT detected — human review before Edit phase');
  return { status: 'blocked-drift', delta, hits };
}

// Edit + Regen + Gate phases run serially — the workflow is design-only,
// human main-session should apply edits with mcp__local__edit_file / bash directly
// (mixing parallel edits on shared files via workflow agents corrupts).
return { status: 'sweep-clean', delta, next: 'Main session applies 9 edits + 5 regens + gates serially' };
```

**Iron rules 具体到本 cluster**
- **不动 §B scopeId** — 票内 2026-09-11 复核明确 defer；即便 grep 命中 scopeId 也**跳过**（若命中，Verify-scope 该归 SURPRISE 但不 apply）。
- `docs/*.zh.md` 手写双语对 — 若目标文件恰好在 map.md 类的 U+FFFD 高危区，用 node fs Buffer byte-splice；否则 `edit_file` 可用。
- Regen cascade **5 个 generator**（非票头写的 3 个），须全部跑 + 全绿再提交。
- `mcp__local__grep` 不可靠 → **一律 `grep -rEn` in `mcp__local__bash`**（sh, BSD grep, 无 `-P`；用 `-E` 扩展正则）。
- `rg` (ripgrep) 未装 → grep only。

**Acceptance criteria**
- `grep -rEn 'SubagentCosts|\.costs\b|subagent-qoder|qoder_call|QODER_CALL' packages/ apps/ scripts/ extensions/`（排除 lib/、.zh.md、node_modules）返回 0。
- `verify-type-equiv` 的 `SubagentResult.costs` DRIFT 消失（3 红 → 2；另 2 条 scopeId 保留至 §B 独立票）。
- `pnpm run build:official` GREEN；`tsc --noEmit` 0 错；audit spec 绿。
- `check:ci:static` 不新增失败；5-generator regen 全绿；translation-pairing 不恶化。
- Ledger: `map.md` 票账更新 open 9 → 8、resolved 17 → 18；票头 Status `open` → `resolved`；若 §B scopeId 独立票尚未建，同 session 建 stub 票 `UM-SCOPEID-RETIRE-REGRILL.md`。

**Estimated session count** — ~1（票头 2026-09-11 估「Qoder+costs 半 ~1 session」已拍板+AFK；5-generator regen 并行后瓶颈仍是编辑扫和 build，单 session 可闭环）。

---

## 4. Cluster B — UM-MERGE-INTEGRITY 2 条 waiver drop（chore）

**目标 & 前提** — 收口 UM-MERGE-INTEGRITY 票末 2026-09-12 append 的两条 dead-export/stale-waiver chore：drop `packages/data/result-cache` 的死 `"./client"` 导出、drop `packages/client/ui-settings-models/` 的 `revert-fork` waiver（M1 整包回退已被 PR #117 `c174c9a784` 撤销，waiver 无对象）。前提均在：PR #117 (ui-settings-models re-port) merged；PR #119 merged @ `9ffb7b3eed`；无 PR-blocker。票内三道完整性门（删除/保留/内容采纳）不受本 chore 影响，只是维护台账。

**Scope（具体文件/行）**
1. `packages/data/result-cache/package.json` — 删 `"./client": "./src/client/index.ts"` 导出条目。核旁边确无 `dsh.client` 声明、无 `tsdown.config.ts`；grep 确认唯一引用只有 `src/client/index.ts:10` 自引（票末 append 项 1 已核）。Minimal 修改：只 drop package.json 的 export map 条目；`src/client/index.ts` 保留不动，除非 gate/tsc 报要。
2. `upstream-sync.json` — 删 `packages/client/ui-settings-models/` 的 `revert-fork` waiver 条目（`verify-upstream-sync-record` push-time 报错原文：`1 waiver(s) still pending a keep-or-drop decision: packages/client/ui-settings-models/ (revert-fork) — UM-MERGE-INTEGRITY-LOSSY-BOTH-WAYS`）。
3. `upstream-sync.json` — 顺手 `grep -En 'revert-fork|regression|M1' upstream-sync.json` 复核有无同类 stale waiver（票末 append 项 2 显式要求）。
4. Verify：`pnpm exec tsx scripts/verify-upstream-sync-record.ts`（0 pending waivers）+ `pnpm exec tsx scripts/verify-client-packages.ts`（票已确证抓不到但跑一遍验非回归）+ `pnpm build:official`（result-cache export drop 不应炸——票已确证 0 外部 importer）。
5. Ledger：UM-MERGE-INTEGRITY 从 `open` 收成 `resolved`（票 Resolution 已写「Scope 1/2/3 完成…仍 open 的原因」——本 cluster 只收前两 chore，其余 spawned 到 [UM-UI-SETTINGS-RE-PORT](已 resolved) 与 [UM-TSCONFIG-PATHS-POLICY](已 resolved)，本票可关）；同步 `map.md` 票账 9→8 open / 17→18 resolved。

**Workflow 设计**

SOLO — no workflow needed. Reason: 2 targeted edits + 1 grep + 3 verify 脚本，串行且互无判断分支；workflow 开销 > 直接执行。

1. `mcp__local__read_file packages/data/result-cache/package.json` → 用 `mcp__local__edit_file` 删 `"./client"` 那一行（含前一行尾逗号处理）。
2. `mcp__local__bash "grep -rEn '\"./client\"|result-cache/src/client' packages/ apps/"` 复核 0 外部消费者。
3. `mcp__local__read_file upstream-sync.json`，`mcp__local__edit_file` 删 `ui-settings-models` 的 `revert-fork` waiver 块；`grep -En 'revert-fork|regression|M1' upstream-sync.json` 核残余。
4. 跑 3 验证脚本（`verify-upstream-sync-record` / `verify-client-packages` / `build:official`，都在 `export CI=true` 下），全绿则收。
5. `map.md` byte-splice + UM-MERGE-INTEGRITY.md 追加 `## Resolution` 节（含涉及 commit SHA + 前后 waiver 数字），commit `-F` + explicit paths。

**Iron rules 具体到本 cluster**
- `upstream-sync.json` 通常小、可用 `edit_file`（若含 U+FFFD 再切 node byte-splice；先 `node -e ... 0xEF/0xBF/0xBD` 探一下）。
- **不删** `packages/data/result-cache/src/client/index.ts` 源文件（票没要求，minimal-change 原则）；除非 gate 强要。
- verify 脚本用 `pnpm exec tsx scripts/…` 而非直接 `tsx …`（走 workspace-local 版本）。

**Acceptance criteria**
- `verify-upstream-sync-record` 报 `0 pending waivers`（前：1；后：0）。
- `verify-client-packages` + `build:official` 保持绿（前后 delta 0）。
- 票头 Status: `open` → `resolved`；追加 Resolution 节。
- map.md 票账：`9 open + 17 resolved` → `8 open + 18 resolved`。

**Estimated session count** — trivial（可与 A cluster 合并为一个 session 的收尾步）。

---

## 5. Cluster C — UM11 p2-* worktree 后清（4 branch 决策）

**目标 & 前提** — UM11 Scope 4-6 residual 收：4 个 worktree/分支决策落地，UM11 Status 从 `open (p2-* residual)` → `resolved`。前提均已就位：master-sync 项已 done via PR #119；`origin/master = 9ffb7b3eed`；PR #117 已 land seam-3（`refactor/rda-admin-lazy-webserver-2026-09-08` 现是 `is-ancestor` origin/master YES）；`chore/um-arch-impl-2026-09-08` 的 arch-regen 结果已在 origin/master via `038d8b51ce`。

**Scope（具体分支/文件）**

| 分支 / worktree | 决策 | 依据 |
|---|---|---|
| `refactor/p2-present-table-2026-09-12` (worktree `dsh-p2-present-table`) | **keep** | 1 residual `table-card.client.spec.tsx` 加 `callView:null` field 到 `makeRunningBlock()`；未被 `eb9e4cf05c` 收编；归 R-DA-UI-SETTINGS-MODELS-VITEST-DEBT tracking |
| `refactor/p2-uism-vitest-2026-09-12` (worktree `dsh-p2-uism-vitest`) | **keep** | 5 test residuals（apply/components/provider-form/store/welcome-notice specs）；不同 mock 模式 + RemoteError + type imports；ui-settings-models vitest-debt outside `eb9e4cf05c` scope；归同上票 |
| `chore/um-arch-impl-2026-09-08` (worktree `dsh-arch`, ahead 6) | **rescue + delete** | 代码 fully absorbed via arch-regen `038d8b51ce` in origin/master；但 3 doc/manifest residuals 未落：(a) `wayfinder/data-agent/tickets/phase-upstream-merge/research/um-arch-design-2026-09-08.md` line 63/65 未纠正（4 bundles vs 7 / 9 remotes vs 3 / lefthook 假前提），(b) `scripts/translation-pairing.manifest.json` 漏 `architecture-graph.md` excluded 行，(c) UM-ARCH ticket 的 Session B Cross-check 节被 regen 替换（rescue 需 cherry 或手抄 3 处 doc 行） |
| `refactor/rda-admin-lazy-webserver-2026-09-08` (worktree `dsh-rda-admin`, `9ba8638eac`) | **safe delete** | 09-12 note 确证 `git merge-base --is-ancestor 9ba8638eac origin/master = YES`（PR #117 已 land seam-3）；分支 + worktree 均可 delete；核 `packages/data/admin/src/index.ts:141` 现应是 `['storageDomain','credentials']`（webServer 已从 eager inject 移出） |

**Workflow 设计**

```javascript
export const meta = {
  name: 'um11-p2-branch-triage',
  description: '4 并行 branch analyzer 各产 verdict + apply plan（read-only 阶段）；主 session 串行 apply',
  phases: [
    { title: 'Analyze', detail: '4 并行 verdicts（re-verify ancestry + residual diff）' },
    { title: 'Cross-check', detail: 'adversarial: cross-check verdicts against briefing' },
  ],
};

phase('Analyze');
const BRANCHES = [
  { name: 'refactor/p2-present-table-2026-09-12',        wt: 'dsh-p2-present-table',       expect: 'keep',        residuals: 'table-card.client.spec.tsx callView:null' },
  { name: 'refactor/p2-uism-vitest-2026-09-12',          wt: 'dsh-p2-uism-vitest',         expect: 'keep',        residuals: '5 test files, mock/type/fixture diffs' },
  { name: 'chore/um-arch-impl-2026-09-08',               wt: 'dsh-arch',                   expect: 'rescue',      residuals: '3 doc lines: um-arch-design line 63/65 + translation-pairing.manifest + UM-ARCH Cross-check' },
  { name: 'refactor/rda-admin-lazy-webserver-2026-09-08', wt: 'dsh-rda-admin',              expect: 'safe-delete', residuals: 'per 09-12 UM11 note: is-ancestor origin/master YES via PR #117' },
];

const verdicts = await parallel(BRANCHES.map(b => () =>
  agent(`Analyze branch ${b.name} (worktree ${b.wt}) for UM11 Scope 4-6 cleanup.
Expected verdict from briefing: ${b.expect}
Expected residuals: ${b.residuals}

Read-only checks (run via mcp__local__bash from /Users/mckenzie/workspace/deepseek-harness-da):
1. git merge-base --is-ancestor <branch-tip> origin/master  (YES = ancestry-safe)
2. git diff --stat origin/master ${b.name}  (residual size)
3. git diff origin/master ${b.name} | head -200  (residual content preview)
4. If expect=='keep': confirm residuals match briefing description
5. If expect=='rescue': verify each of the 3 doc lines still needs the rescue (may already be in origin/master)
6. If expect=='safe-delete': re-verify is-ancestor YES + no drift since briefing

Return structured verdict {branch, verdict: 'keep'|'rescue'|'safe-delete'|'DRIFT', ancestryYes: bool, residualStat: string, rescueFiles?: string[], applyPlan: string}`,
    { label: b.wt, phase: 'Analyze', schema: {
      type: 'object',
      properties: {
        branch: { type: 'string' },
        verdict: { type: 'string' },
        ancestryYes: { type: 'boolean' },
        residualStat: { type: 'string' },
        rescueFiles: { type: 'array' },
        applyPlan: { type: 'string' },
      },
      required: ['branch', 'verdict', 'applyPlan'],
    } })
));

phase('Cross-check');
const cross = await agent(`Verdicts: ${JSON.stringify(verdicts)}
Adversarial cross-check: any verdict != briefing? any ancestryYes==false where briefing expected YES? Any residual grown/shrunk vs briefing? Return {ok:bool, drifts:[...], recommendation:string}`,
  { phase: 'Cross-check', schema: { type: 'object', required: ['ok'] } });

log(`Verdicts summary: ${verdicts.map(v => v.verdict).join(' / ')}   cross-check ok=${cross.ok}`);
return { verdicts, cross, next: cross.ok ? 'Main session applies rescue + branch/worktree deletes serially' : 'Human review — drift detected' };
```

**Iron rules 具体到本 cluster**
- Read-only analyze via workflow OK；**apply（rescue commit / branch delete / worktree remove）必须主 session 串行**（并行 `git branch -D` on shared repo state 会 index.lock 抢占）。
- Rescue 3 doc lines 用 `mcp__local__edit_file`（这几个 doc 无 U+FFFD）+ commit `-F` msg file、explicit paths。
- `git worktree remove <path>` 前先 `cd` 到主 worktree；worktree 有 uncommitted 改动会拒删（`--force` 前先核）。
- **不碰 `.worktrees/r10-harness-goodhart` / `.worktrees/t1-exec-grader`**（evaluation effort）。

**Acceptance criteria**
- 4 branch 决策全部落地：2 keep（无操作，只在 R-DA-UI-SETTINGS-MODELS-VITEST-DEBT 记指针）+ 1 rescue（3 doc lines 补 + branch delete）+ 1 safe-delete（branch + worktree）。
- `git worktree list` 从 8 降到 6（删 2：`dsh-arch` + `dsh-rda-admin`）。
- UM11 追加 Resolution 节，Status `open` → `resolved`；p2-keep 2 记 residual pointer；map.md 票账 9→8 open / 18→19 resolved（若 A/B 先做则 8→7）。

**Estimated session count** — ~1（4 并行 verdict ~2min + serial rescue/delete ~10min + ledger update）。

---

## 6. Cluster D — UM-C-GATES + UM12 收口（grilling，成对决策）

**目标 & 前提** — 拍板 4 无主 C 类红（upstream 新门、fork 从未满足）+ UM12 CI real red-set 已第 4 次一致确证（`{Dependency layout, Pack npm tarballs}`，观测系列 #115/#116/#117/#119），是否接 CI = UM15 §2 gate-coverage meta-gate 裁决点。两票**成对决策**因为 UM-C-GATES 的裁决方向直接决定 UM12 的收口 shape（若选「全接 CI」则 UM12 open 项要求把 A 类 4 + 本地 9 门接 CI；若选「known-red 永久」则 UM12 open 项收在「CI red set 已量化」）。

**Scope（决策矩阵）**

4 无主 C 类红（读 [UM-C-GATES-UPSTREAM-NEW](tickets/phase-upstream-merge/UM-C-GATES-UPSTREAM-NEW.md) 拿具体门名 + evidence）+ 类推 A 类 4 + UM-LINT-B（56 unmatched programs 是类似 meta-gate 问题，若接 CI 决策落定应类推）。

每门 3 选 1：**(a) fix + 接 CI**（fork 补齐 upstream 期望）/ **(b) waive**（有意分歧，登记 upstream-sync.json waiver）/ **(c) known-red permanent**（不接 CI，本地跑，README 讲明理由）。

**Workflow 设计**

```javascript
export const meta = {
  name: 'um-c-gates-judge-panel',
  description: '3 独立 judge 各给 fix/waive/known-red verdict + 1 refuter + synthesis',
  phases: [
    { title: 'Judge', detail: '3 并行 judge 各给 verdict + rationale' },
    { title: 'Refute', detail: '1 adversarial refuter 攻每 judge 的核心 assumption' },
    { title: 'Synthesize', detail: '1 synthesizer 合成 final recommendation' },
  ],
};

phase('Judge');
const GATES_CTX = /* read from UM-C-GATES ticket + UM12 ticket + UM15 §2 section */;
const JUDGE_ANGLES = [
  'strict upstream fidelity — 尽量 fix + 接 CI，最小化 fork drift',
  'pragmatic fork ergonomics — 尽量 waive + known-red，最小化本地 dev friction',
  'meta-gate coverage first — 优先设计 gate-coverage meta-gate 本身，再逐门决策',
];
const judgments = await parallel(JUDGE_ANGLES.map((angle, i) => () =>
  agent(`Judge angle #${i+1}: ${angle}

Read [UM-C-GATES](tickets/phase-upstream-merge/UM-C-GATES-UPSTREAM-NEW.md) fully via mcp__local__read_file. For each of the 4 unowned C-class reds, from your angle, output verdict fix|waive|known-red + one paragraph rationale. Then output your overall recommendation on the UM12 收口 question (given CI real red-set = {Dependency layout, Pack npm tarballs} × 4 观测一致): 「single meta-gate for gate-coverage」 vs 「per-gate deferred forever」 vs 「hybrid（A 类接、C 类 waive）」.

Also read [UM-LINT-B](tickets/phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md) briefly and note if your framework extends to it.

Return structured: { angle, perGateVerdicts:[{gate, verdict, why}], um12Recommendation, umLintBExtensionNote }`,
    { label: `judge-${i+1}`, phase: 'Judge', schema: { /* ... */ } })));

phase('Refute');
const refutation = await agent(`3 judges said:
${judgments.map((j, i) => `Judge #${i+1} (${j.angle}): ${JSON.stringify(j)}`).join('\n\n')}

Adversarial: for each judge, identify the weakest assumption in their framework and try to refute. Default to refuted=true if uncertain. Return {perJudge:[{judge, weakestAssumption, refuted:bool, alternative}]}`,
  { phase: 'Refute', schema: { /* ... */ } });

phase('Synthesize');
const final = await agent(`Judges + refuter output:
JUDGMENTS: ${JSON.stringify(judgments)}
REFUTATIONS: ${JSON.stringify(refutation)}

Synthesize: pick a defensible final recommendation for each gate (majority-vote or best-argument-wins if divided; prefer the one that survives refutation). Compose:
1. Per-gate final verdict table
2. UM12 收口 shape (which gates接 CI, which are waived, which are known-red permanent)
3. UM15 §2 gate-coverage meta-gate: proposed contract (input/output/coverage guarantee)
4. UM-LINT-B alignment note
5. Grade uncertainty (low/med/high) — if med/high, propose one focused experiment before landing

Return as markdown doc for direct paste into UM-C-GATES Resolution section.`,
  { phase: 'Synthesize' });

return { judgments, refutation, final };
```

**Iron rules 具体到本 cluster**
- **本档是 grilling，不是 apply** — workflow 产出是 markdown decision doc，主 session paste 进 UM-C-GATES + UM12 的 Resolution 节，然后**用户拍板前不接 CI / 不改 workflow yaml**（决策类改动须用户显式同意）。
- 若 synthesizer 给 uncertainty=high → 停下，用 `AskUserQuestion` 让用户拍板（3 options：fix/waive/known-red，附 synthesizer 的 rationale）。
- `superpowers:brainstorming` skill 若与 grilling 冲突以本 workflow 为准（judge-panel 是 grilling 的 workflow 化）。

**Acceptance criteria**
- UM-C-GATES 追加 Resolution 节含 4 门 verdict + rationale；Status `open` → `resolved`（若用户批 hybrid/permanent）或保留 `open (awaiting apply session)`（若批 fix + 接 CI 需下一 session code work）。
- UM12 收口：追加最终 Resolution 节链 UM-C-GATES 决策；Status → `resolved` 或 fold 进 UM15 §2。
- UM15 §2 gate-coverage meta-gate 追加 contract 草案（decision doc 的 §3）。
- UM-LINT-B 追加 alignment 注（decision doc 的 §4）。
- map.md 票账更新：若 UM-C-GATES + UM12 都 resolved → open 8→6（若 A/B/C 已做则 5→3）。

**Estimated session count** — ~1（grilling session，无 code apply；若批 fix + 接 CI 则触发下一 apply session ~1-2）。

---

## 7. Cluster E — 剩余单开票 pointer 集（UM4 / UM6 / UM15 slice 2-3 / UM-LINT-B）

4 张票每张需独立 session，本次只放**指针 + 前置校验 + estimated size**，不深入。

### E1. UM4 — apiproxy 重落户 + presetSwitches → data-agent
- **前置**：已 unblocked 2026-09-10（UM1/UM3 archived、R-DA-CLIENT-RUNTIME-DECOMMISSION Phase 1+2 resolved）。
- **Related**: T8/T9/T10/T11/T12/T13 results-RPC 簇、B-DA1-preset-switch-tool-interrupt-race、harness-package-removal research。
- **Estimated**: **~2-3 session**（真代码工作，results-RPC 迁移 + presetSwitches 落 data-agent）。
- **Unblocks**: UM6。
- **Session prompt skeleton**: `wayfinder/data-agent/prompts/next-session-2026-09-14-um4-apiproxy-rehome.md`（本 session 建 stub）。

### E2. UM6 — docs/subsystems（保 fork data-agent + 接受 upstream 其它）
- **前置**：blocked on UM4 only（其它均 archived/done）。
- **Estimated**: **~1**（trivial docs merge after UM4）。
- **Session prompt skeleton**: `wayfinder/data-agent/prompts/next-session-2026-09-??-um6-docs-subsystems.md`（UM4 done 之后建）。

### E3. UM15 slice 2/3 — durable upstream-sync method
- **前置**：slice 1（§1 + §5.2(c)）已 land（`b3a516fe98`+`c579b809d2`）；§2 gate-coverage meta-gate 依赖 Cluster D 决策；§3 upstream-tracking-ref cadence trigger 已响（upstream tracking ref `c291e7961a51` ≠ record `c389f96bf3a9`，需量 commit count + seam touches vs 150/14d/seam>0 阈值）。
- **Estimated**: **~2-3**（§2 依赖 D 决策先落；§3 cadence 实测 + 第三轮 re-sync gating；§4 slice 2/3）。
- **Session prompt skeleton**: `wayfinder/data-agent/prompts/next-session-2026-09-14-um15-slice-2-3.md`（本 session 建 stub）。

### E4. UM-LINT-B — 56 unmatched programs
- **前置**：诊断 evidence 已备齐（票内），awaiting 决策是否把 tsgolint 的 inferred program 认领策略正式化。参考 UM-LINT-A resolved via (F) 的决策框架。
- **Estimated**: **~1**（grilling）或 **~2**（grilling + apply）。
- **Depends-on**: Cluster D 若批「gate-coverage meta-gate 建立」则本票的决策框架应类推。
- **Session prompt skeleton**: 与 Cluster D 决策合并落 UM-C-GATES Resolution doc（§4 alignment 注）。

---


---

## 8. Handoff（结束时更新以下 4 项）

1. **map.md** 追加一条 `[2026-09-13] cluster {X} resolved via workflow ...`（用 node byte-splice，anchor `## Audit actions 2026-09-07`）。
2. **该 cluster 涉及的 ticket 文件**：Status field 从 `open` → `resolved`，追加 `## Resolution` 或 `### [2026-09-13] ...` 节含 workflow run ID、涉及 commit SHA、gate 前后 delta（源码变更须给 `check:ci:static` before/after 数字）。
3. **票账更新**：若 A resolve → `9 open + 18 resolved`；若 A+B → `8 open + 19 resolved`；若 A+B+C → `7 open + 20 resolved`（但 UM11 只是 p2-* residual 收，master-sync 项早在 09-12 done — Status 若还 open 是因 residual，收 residual 后 → resolved）。
4. **commit** 用 `-F` message file、explicit paths、no `--no-verify`；不 push（沿 tracker discipline）；若 A/B/C/D 有一整档收口的 milestone，可与用户确认是否推 tracker（现有 3 tracker commit unpushed）。

## 9. 成功判据

- 至少 A（首选）或 A+B 落地：source-level 变更 + `check:ci:static` 无新增红 + tickets Status/Blocked-by 头对齐 + map.md landscape 追加。
- 若 C 也完成：4 branch 决策全落地（rescue commits + branch/worktree deletes），UM11 Status 从 `open (p2-* residual)` → `resolved`。
- 若 D 也完成：UM-C-GATES 决策文档就位（3 judge + synthesis + adversarial verifier 记录），UM12 「最后一个 open 项」claim 收；`UM15 §2 gate-coverage` 更新指针。
- E 4 项：至少每项一个 `next-session-2026-09-14-{umX}-*.md` 骨架 prompt 就位（含每张的目标 + 前置验证 + estimated session count）。

## 10. 前置校验（session 开头 30 秒必跑）

```sh
export PATH="/usr/local/bin:$PATH"; export CI=true
cd /Users/mckenzie/workspace/deepseek-harness-da
git status --short   # 期望：clean（若脏 alert）
git rev-parse master origin/master  # 期望：master ahead 2 (tracker), origin/master = 9ffb7b3eed
git ls-remote origin refs/heads/feat/tracker-2026-09-12  # 期望：5398de2399（未删）
gh auth status | head -3  # 期望：logged in
grep -c 'U+FFFD' wayfinder/data-agent/map.md  # 期望：0（U+FFFD 是 3-byte 序列，grep 找不到；下条才是真核）
node -e 'const b=require("fs").readFileSync("wayfinder/data-agent/map.md"); let n=0; for(let i=0;i+2<b.length;i++){if(b[i]===0xEF&&b[i+1]===0xBF&&b[i+2]===0xBD)n++;} console.log("U+FFFD:",n);'  # 期望：13
```

若 5 项全 match 预期，session 可开工；任一 drift → 停下先核。

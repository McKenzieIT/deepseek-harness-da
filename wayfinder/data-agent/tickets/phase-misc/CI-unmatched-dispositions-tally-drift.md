# CI-unmatched-dispositions-tally-drift — oxlint 的 unmatched 程序台账已漂移，而 durable fence 发现不了

**Type**: grilling（一部分是机械修正、一部分是两个未裁定文件归属判断） · **Status**: open · **Phase**: misc
**Assignee**: unclaimed
**Blocked by**: nothing
**Serves**: 让 [UM-LINT-B-UNMATCHED-PROGRAMS](../phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md) 落定的「unmatched 程序处置台账 + durable fence」真的 durable —— 即台账漂移时门会落红，而不是一直绿着掩盖烂账
**Related**: [UM-LINT-B-UNMATCHED-PROGRAMS](../phase-upstream-merge/UM-LINT-B-UNMATCHED-PROGRAMS.md)（本票的来源契约，2026-09-14 resolved）；[COV1](../phase-coverage/COV1-per-file-coverage-100-track.md) 陷阱 §2（「scoped 覆盖率静默 ≠ 已覆盖」——本票是其在 lint 契约上的同构）；`scripts/run-oxlint.ts`（`UNMATCHED_DISPOSITIONS` 表 + `assertNoStrictOverrideUnmatched` fence）；`scripts/oxlint-contract.spec.ts:263`（只求和、不查文件系统的断言）

> **Provenance（2026-09-21）**：本票在 [COV1](../phase-coverage/COV1-per-file-coverage-100-track.md) eval-cli batch 1 的尾巴、PR [#178](https://github.com/McKenzieIT/deepseek-harness-da/pull/178)（`p15-probe.ts` 移位）里浮出。#178 要把 `{bin,dev}` 的 `count` 3→4，按 COV1 纪律「拿零命中当证据前先验证」用 `OXC_LOG=debug oxlint .` 复现 unmatched 清单，顺带发现**整张台账早就在漂**，且 UM-LINT-B 自称的 durable fence **没拦住**。#178 只改了 waive 侧那一行（3→4）+ 如实记录漂移现状，**不偷偷修 keep 侧**——理由见下「为什么不并进 #178」。

## Question

UM-LINT-B 落定时的契约是：**8 条 `waive` glob（34 处）+ 5 条 `keep` glob（15 处）= 49 个 unmatched 程序被显式裁定**，外加 `assertNoStrictOverrideUnmatched` 这道 fence 在 `OXC_LOG=debug` 下复现 unmatched 列表、把任何「落严格 override 却无豁免」的文件判违规。

2026-09-21 复现发现：**`waive` 侧精确（34→35，含 #178 的 +1），`keep` 侧已漂**——声明 15、实测覆盖 28，另有 **2 个文件从未被任何 disposition 覆盖**。而 fence 与 `oxlint-contract.spec.ts` **全绿**。

问题三层：
1. **机械层**：两处 `keep` 计数错了（`apps/desktop` 的 d.mts glob 18 不是 7；`snapshots` 7 不是 5），要不要直接改对？
2. **裁定层**：2 个从未被覆盖的文件（`packages/tsdown.worker.ts`、`packages/util/lazy-require/tests/fixtures/value.cjs`）归哪个桶、为什么？这是判断题，不该由「移一个文件」的 PR 替 lint 契约的维护者发明理由。
3. **根因层**：为什么漂了 13 个文件（+2 未分类 = 15）一直没人发现？因为 `oxlint-contract.spec.ts:263` 只把各条 `count` **求和**跟硬编码总数比，**从不与文件系统核对**。fence 只管「严格 override 内有无未豁免文件」，不管「dispositions 声明的 count 是否与实测吻合」。所以只要维护者把 count 填成自洽的一组数，门就绿，哪怕整张表与真相脱节。

## 已测证据（勿重导，2026-09-21 tip `4207191054`，#178 已合并后）

复现命令（与 `assertNoStrictOverrideUnmatched` 同机制）：

```sh
cd <worktree>
OXC_LOG=debug pnpm exec oxlint . 2> /tmp/oxc.log
sed 's/\x1b\[[0-9;]*m//g' /tmp/oxc.log \
  | grep -aoE 'Unmatched file:[[:space:]]*.+' \
  | sed -E 's/^Unmatched file:[[:space:]]*//' | sed "s#^$PWD/##" | tr -d '\r' | sort -u
```

实测（#178 后）：

| | 声明 | 实测 | |
| --- | --- | --- | --- |
| unmatched 总数 | — | **66** | |
| 　落 strict override 内（豁免） | — | 1 | 0 违规 ✓ |
| 　落 strict override 外 | — | **65** | dispositions 应覆盖 |
| 8 条 `waive` glob 合计 | **35** | **35** | ✅ 精确（#178 的 +1 已计入）|
| `keep`: `apps/desktop` d.mts | 7 | **18** | ❌ +11 |
| `keep`: `snapshots` | 5 | **7** | ❌ +2 |
| `keep`: 其余 3 条（`vitest.shared.ts` / `coverage-uncovered-locations.cjs` / `eval-results/p11d-calibration`） | 1+1+1 | 1+1+1 | ✅ |
| `keep` 合计 | **15** | **28** | ❌ +13 |
| 任何 disposition 都未覆盖 | — | **2** | ❌ 从未裁定 |
| 两个未裁定文件 | | `packages/tsdown.worker.ts`<br>`packages/util/lazy-require/tests/fixtures/value.cjs` | |

账：`waive 35 + keep 28 + 未分类 2 = 65`（= strict 外总数）✓。

**#178 前**（master `fecd5b7fe1`）同法测得 unmatched 总数 65、waive 34、keep 28、未分类 2 —— 即漂移**在 #178 之前就存在**，与 p15-probe 移位无关。#178 只让 waive 34→35、总数 65→66。

## 为什么 durable fence 没拦住

`scripts/oxlint-contract.spec.ts` 有两条相关断言（`#263` 一带）：

```ts
expect(counted('waive')).toBe(34)   // → #178 改成 35
expect(counted('keep')).toBe(15)    // 仍是 15，但实测 28
```

`counted(kind)` 把该 kind 下各条 `disposition.count` **求和**，跟一个**硬编码总数**比。它**从不**调用 `assertNoStrictOverrideUnmatched` 的文件系统复现来核对「声明 count == 实测 count」。所以：

- 维护者把 `count` 填成任何自洽的一组数（和 = 硬编码总数）→ 门绿。
- `apps/desktop` 的 d.mts glob 实际匹配 18 个文件、声明 7 个 → 只要 `keep` 总和凑齐 15，门照绿。
- 2 个从未被任何 glob 覆盖的文件 → **没有任何断言能发现它们**（fence 只查严格 override 内的未豁免文件，不查 override 外的未裁定文件）。

这是 COV1 陷阱 §2（「scoped 覆盖率『静默』≠『已覆盖』」）在 lint 契约上的**同构**：**声明式计数 + 不核对真相 = 假绿**。COV1 那条是 v8 对从未被 import 的文件报 `0/0/0/0`、逐文件门静默跳过；本条是 dispositions 的 `count` 不与文件系统核对、fence 静默放行。两者都是「门绿 ≠ 真的查了」。

## 候选解法（需拍板，非互斥）

### A. 修对两处 keep 计数（机械）

`apps/desktop` d.mts glob 的 `count` 7 → 18；`snapshots` 的 5 → 7。`counted('keep')` 15 → 28，硬编码总数同步改。**但这只是把账填对，不解决根因**——下次再漂，门还是发现不了。而且 `count` 是手填的快照数，文件增减后立刻过期，本质上就不该当断言用。

### B. 让 fence 真的查文件系统（根因）

改 `oxlint-contract.spec.ts`：不只比声明 count 之和，而是**跑一次 `OXC_LOG=debug` 复现、把 unmatched 列表与 dispositions 逐文件比对**——每个 unmatched 文件必须命中恰好一条 disposition glob，否则落红。这是 UM-LINT-B 的 `assertNoStrictOverrideUnmatched` 已有机制（它复现 unmatched 列表、查严格 override 内的违规）的**自然延伸**：把「override 外的文件也必须被某条 disposition 覆盖」加进去。

代价：spec 要跑一次真实 oxlint debug（慢，~秒级），且依赖 `OXC_LOG=debug` 的输出格式稳定（UM-LINT-B 已依赖它，不算新风险）。收益：**漂移当场落红**，`count` 字段甚至可以删（变成纯文档）或保留为人类注释。

### C. 裁定 2 个未分类文件（判断）

- `packages/tsdown.worker.ts`：tsdown 的 worker 入口。归 `keep`（build 工具，故意在 type-aware 图外）？还是该有 tsconfig owner（`waive`→ 给个 tsconfig）？看它是否本就在 `packages/client/tsdown.client.ts` 同类——后者已被 `.oxlintrc.json` ignorePatterns 显式排除（`"packages/client/tsdown.client.ts"`），而 `tsdown.worker.ts` 没有。
- `packages/util/lazy-require/tests/fixtures/value.cjs`：测试 fixture 的 `.cjs`。`.oxlintrc.json` 的 ignorePatterns 已含 `**/*.js` 和 `**/*.mjs` 但**不含 `**/*.cjs`**——这是漏网，还是故意？`oxlint-contract.spec.ts` 里有断言 `matchesStrictOverrideGlob('scripts/coverage-uncovered-locations.cjs')` 为 false，说明 `.cjs` 文件**不走**严格 override（在默认规则侧），那它为何 unmatched？

这两个需要人判断「它该在图外（waive/keep）还是该被认领（FIX: 给 tsconfig）」，不该由本票预设答案。

## 为什么不并进 #178

#178 是「移一个文件」的 chore PR，它的逐条裁决要干净（消失 133 全是 p15-probe、新增 0）。把 keep 计数修正 + 2 个文件的归属裁定混进去会：
- 污染 #178 的裁决账（多出无关的 diff）；
- 让 2 个未裁定文件的归属**被一个无心的 PR 顺手定掉**，而那应该是 deliberate 的判断。

所以 #178 只改 waive 那一行 + 在 `run-oxlint.ts` docstring 与 spec 注释里**如实记录**漂移现状与未裁定文件，把修正留给本票。记录已落 master `4207191054`（#178 合并 `dbe703f153` 后的 docs commit）。

## 验收定义（本票做完对照）

- [ ] 两处 `keep` 计数改对（A），或 `count` 字段改为非断言（B 落地后它变纯文档）。
- [ ] 2 个未分类文件裁定完成（C），各归入一个 disposition 或显式判 FIX（给 tsconfig owner）。
- [ ] fence 升级（B）：`oxlint-contract.spec.ts` 跑一次 `OXC_LOG=debug` 复现，断言每个 unmatched 文件命中恰好一条 disposition glob（或落 strict override 豁免），否则落红。
- [ ] 复现命令与实测数写进 `run-oxlint.ts` docstring（#178 已起头，本票补完 keep 侧与 fence 升级）。
- [ ] 回写本票 Status = resolved，并在 [map](../../map.md) 记一行。

## 建议 skills

`dsh-ci-test-reliability`（门的负控与证据类型）、`verification-before-completion`（宣称 durable 前跑 fence 看它真落红）、`grilling`（2 个文件的归属是判断题）。

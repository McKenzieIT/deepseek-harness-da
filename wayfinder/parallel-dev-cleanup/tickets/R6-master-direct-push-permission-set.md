# R6: master 直推许可集 —— 措辞 / gate 正则 / GitHub 设置三者对齐

**Status**: open
**Branch**: 未认领（认领时按 CLAUDE.md 声明 `<type>/r6-<slug>`）
**Blocks**: [R3](R3-branch-protection.md)
**Type**: grilling（需与 user 定「文档怎么走」；其余为机械落地）

## Question

「什么 diff 可以不经 PR 到达 master」这件事现在由**三处**各自定义，互不一致：

| 载体 | 位置 | 允许什么 |
|---|---|---|
| 散文 | `CLAUDE.md:83` | 「diff 不触及 `packages/*/src` 的纯 `wayfinder/` 文档或**实验脚本**」 |
| 正则（实际强制） | `scripts/verify-no-production-src-on-master.ts:41` | 拦 `(packages\|apps\|native\|python)/**/( src\|bin )/` + `scripts/` |
| GitHub 设置 | （无） | 2026-10-06 复测 `protection` → **404 未受保护**，即三者里唯一真正生效的只有正则（经 lefthook pre-push + CI workflow） |

**需决策**：许可集的**单一定义**是什么，然后让三处都指向它。

本票从 [R4](R4-ci-red-gate-policy.md) 的「附带决策」一节与 [R3](R3-branch-protection.md) 的「约束 2」
合并而来（2026-10-06）——两者是同一问题的两种表述：一个是散文+正则，一个是 GitHub 设置。
本票**零依赖红门**，可立即取。

## 2026-10-06 复测：三条不一致，方向各不相同

### ① 正则比措辞**宽**，但 `bin/` 这个缺口已经补上了

R4 原文（2026-09-06）记「`bin/` 下的可执行代码可以直推 master」。**该事实已失效**：

```
scripts/verify-no-production-src-on-master.ts:41
/^(?:(?:packages|apps|native|python)\/(?:[^/]+\/)+(?:src|bin)\/|scripts\/)/
```

`bin` 已在 `34f8098a83 fix(scripts): direct-push gate now covers bin/, not just src/` 加入。
2026-10-06 实测：`packages/eval/eval-cli/bin/probe-triage.ts` → **true（已拦）**。
spec 现有 **32 个测试全绿**（原 27，随 `bin/` 扩展增至 32）。
→ **R4 建议的「gate 收紧到 bin/」已完成，本票不必再做。**

剩余放行项（实测 false）：`tests/**`、`.github/**`、任意 `*.md`、`pnpm-lock.yaml` 等配置与锁文件。
其中 `tests/`（影响 CI 判定）与 `.github/`（影响 CI 本身）是否该继续放行，是本票要定的。

### ② 措辞比正则**窄**

`CLAUDE.md:83` 只允许「纯 `wayfinder/`」文档。于是 `packages/*/README.md`、`docs/*.md`、
`.agents/notes/**` 这些**零运行时影响**的文档，gate 放行而措辞禁止。
为一行 README 更正开 PR 是纯摩擦。

### ③ 措辞允许了一件正则**禁止**的事（新发现，方向与 ①② 都不同）

`CLAUDE.md:83` 写「……或**实验脚本**」。但正则把 **`scripts/` 整个目录**都拦掉
（2026-10-06 实测 `scripts/run-gates.ts` → true）。
如果「实验脚本」指 `scripts/` 下的文件，那么措辞许可的事 gate 根本不放行——
**这条是措辞宽于 gate，与 ①② 相反。** 本票须先问清「实验脚本」指什么、放在哪，
否则这句话要么是死条文，要么是在要求一个 gate 不支持的例外。

## 为什么不能简单地「把措辞放开到与 gate 一致」

那会把 `tests/` 与 `.github/` 的直推合法化——恰好是剩下的两个真风险（一个影响 CI 判定，
一个影响 CI 本身）。方向反了。同理也不能「把 gate 收到与措辞一致」，那会把 `*.md` 一并禁掉。
**两边都要各自归位，而不是一边向另一边靠。**

## 约束：开 branch protection 会切断现有直推路径

这条原在 [R3](R3-branch-protection.md) 的「约束 2」，与本票同属许可集问题，故迁入。

CLAUDE.md 明文允许「纯 `wayfinder/` 文档」直推 master，`wayfinder/_templates/session-prompt.md`
与各 session prompt 的「文档直推」小节把它当标准做法（**本票所属的 2026-10-06 scoping session
本身就在用这条路径提交**）。而 classic branch protection 的 required status checks
**对直推同样生效**——所以这不只是 "Restrict pushes" 的问题，R3 的约束 1「会把 master 永久锁死」
锁的正是这条路径。

开之前必须先决定文档怎么走：

- **(a)** 文档也一律走 PR —— 每次改 ticket/map 都开一个 PR，成本显著上升；
- **(b)** 给 master 留 bypass（"Allow specified actors to bypass required pull requests"）；
- **(c)** 改用 ruleset 按路径豁免（`wayfinder/**` 免 PR）—— **需先验证 GitHub 当前是否支持按路径放行**
  （2026-09-06 落笔时未查，2026-10-06 仍未查；这是本票唯一需要外部事实的一步）。

## 诚实记录

提出本建议的那个 session（2026-09-06）自己推了一次 `packages/eval/eval-cli/README.md` 到 master
（为修正 README 里 8 处指向不存在产物的基线引用）。gate 放行，但在现行措辞下**越界**。
不做事后合规化辩解——正确的解法是让措辞与 gate 各自归位，而不是继续在两者的缝隙里操作。

同样诚实地记一笔：**本票所属的 scoping session（2026-10-06）也在用 `wayfinder/**` 直推路径**，
这条是措辞明文允许的，但它恰好是 (a)/(b)/(c) 要处置的那条路径——即本票的决议会反过来约束
后续 wayfinder session 自己的提交方式。

## 一个自洽性自检

改 `PROD_SRC_PATTERN` 本身属 `scripts/` → **会被 gate 自己拦**，必须走 PR。
规则能约束到修改规则的行为，说明这个方向自洽。

## 验收

- 许可集有**单一定义**（写在一处，另两处引用它）。
- `CLAUDE.md:83` 的措辞与 `PROD_SRC_PATTERN` 不再互相越界，且「实验脚本」这一项有明确所指或被删。
- `tests/` 与 `.github/` 的放行/收紧有决议（若收紧：扩正则，32 个测试的回归网托着，成本低）。
- 文档路径三选一有决议；若选 (c)，先给出 GitHub 按路径豁免的能力验证。
- R3 解除本票这一侧的阻塞。

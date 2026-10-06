# T12 — windows node 24 / native complete CI 红（investigate）

**Type**: research（需先定 root cause）
**Phase**: post-discovery
**Status**: moot（2026-10-06）—— 前提蒸发，见下方「判为 moot」
**Assignee**: unclaimed（从未被认领）
**Related**: PR #44 CI `windows node 24 / native complete` 失败 step "Run complete native Windows gate inventory"（job 101598597789，run 34074751506，2026-09-07 02:00，21m32s）。pre-existing（latent，非 W20）。**verify on current master cf813c18c0 before fixing。**

## Question

`windows node 24 / native complete` job 红（21m32s，log 太大未深 fetch）。疑：downstream of [T7](T7-verify-export-jsdoc.md)/[T8](T8-readme-gates.md)/[T9](T9-built-package-invariants.md)/[T10](T10-publint.md) + [T4](T4-zh-translation-lag.md)/[T5](T5-readme-bilingual-gaps.md)（native complete 跑完整 gate inventory，含 static + snapshots gates，故继承其红）+ 可能 windows-specific test/gate 失败。

非 W20 引入。latent on master。

## Scope

fetch native log（CI job 101598597789），grep `== FAILED` 定位 failed gates；若全是 T7–T10 + T4/T5 的 downstream 则随其修后自愈（关本票为 downstream-duplicate）；若有 windows-specific failure 则开子票。先 verify on current master。

---

## 判为 moot（2026-10-06）

三条证据，本票的前提已全部蒸发：

1. **它命名的 job 不存在。** `ci.yml` 现声明的 Windows job 是
   `windows node 24 / build`（`ci.yml:543`）、`windows node 24 / coverage`（`:588`）、
   **`windows node 24 / native tests`**（`:673`）、`windows node 24 / observational`（`:723`）。
   没有 `native complete`。全仓 workflow 对 `native complete` / `native-complete` 零命中；
   "complete" 只作为 **step** 名存活在 `ci-master.yml` 的串行 job 里
   （`:174`/`:207`/`:270`/`:508` 的 "Run complete unsharded …"）。
   即本票追的那个 job 已被重构掉，它引用的 job id `101598597789` 也早已不可比对。
2. **它自己写的关票条件已满足。** 本票 Scope 原文：「若全是 T7–T10 + T4/T5 的 downstream
   则随其修后自愈（**关本票为 downstream-duplicate**）」。
   [T7](T7-verify-export-jsdoc.md) / [T8](T8-readme-gates.md) / [T9](T9-built-package-invariants.md) /
   [T10](T10-publint.md) / [T4](T4-zh-translation-lag.md) / [T5](T5-readme-bilingual-gaps.md)
   **六张全部已 closed/resolved**。本票预判了自己的结局。
3. **它不在当前红门清单里。** map 的「当前真实红门清单（2026-09-16）」列的是
   `node 24 / coverage`、`windows node 24 / coverage`、`node 24 / snapshots and artifacts`
   三条 lane，不含任何 native lane。

### 为什么是 `moot` 而不是 `out of scope`

前提蒸发是**走过的一步**（一次得到空结果的调查），不是范围判断。
Windows native 门属本 map 的 destination 之内——只是本票追的那个具体对象没了。
故进 Decisions so far，不进 Out of scope。

### 接力

`windows node 24 / native tests` **现在红不红未知**。这条由
[T30](T30-ci-red-gate-rebaseline.md)（重建基线）点名回答；**若红则另开新票**，
本票票体作为既往证据保留，不复用本票编号。

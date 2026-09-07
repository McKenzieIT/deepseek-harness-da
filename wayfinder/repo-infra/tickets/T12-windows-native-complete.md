# T12 — windows node 24 / native complete CI 红（investigate）

**Type**: research（需先定 root cause）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: PR #44 CI `windows node 24 / native complete` 失败 step "Run complete native Windows gate inventory"（job 101598597789，run 34074751506，2026-09-07 02:00，21m32s）。pre-existing（latent，非 W20）。**verify on current master cf813c18c0 before fixing。**

## Question

`windows node 24 / native complete` job 红（21m32s，log 太大未深 fetch）。疑：downstream of [T7](T7-verify-export-jsdoc.md)/[T8](T8-readme-gates.md)/[T9](T9-built-package-invariants.md)/[T10](T10-publint.md) + [T4](T4-zh-translation-lag.md)/[T5](T5-readme-bilingual-gaps.md)（native complete 跑完整 gate inventory，含 static + snapshots gates，故继承其红）+ 可能 windows-specific test/gate 失败。

非 W20 引入。latent on master。

## Scope

fetch native log（CI job 101598597789），grep `== FAILED` 定位 failed gates；若全是 T7–T10 + T4/T5 的 downstream 则随其修后自愈（关本票为 downstream-duplicate）；若有 windows-specific failure 则开子票。先 verify on current master。

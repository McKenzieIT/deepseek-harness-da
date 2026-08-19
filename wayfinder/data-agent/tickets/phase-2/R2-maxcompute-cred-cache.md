# R2 — MaxCompute 凭证缓存模式（research, resolved）

**Type**: research
**Phase**: 2
**Status**: Resolved
**Blocks**: P4

**Question**: ⑤a 深度——生产 override-factory 短路 per-scope 缓存；迁移是正经接 tier-0 凭证解析，还是沿用 override-factory？

**Research note**: → `../../research/r2-maxcompute-cred-cache.md`（已解）。

**Finding**: 目标态正经接 tier-0（`credentials.py:225-237 install_credential_resolver()` 已接线，`TestAcceptanceGate` 验证内置路径能读 DB 凭据）；override 作过渡保险本批不删（退休判据=生产验收绿；2026-08-05 五天停服红线 commit `8f169d91`）；**不新建第二份 override-factory**。query-maxcompute sidecar：per-call `ctx.credentials.resolve(ref)`、`scope_id` 显式工具入参、凭证经 stdio `env` 注入子进程（不进 args）、sidecar 自有 per-scope ODPS 缓存（复刻 `ScopeConnection`）、监听 `credentials/updated` → invalidate。

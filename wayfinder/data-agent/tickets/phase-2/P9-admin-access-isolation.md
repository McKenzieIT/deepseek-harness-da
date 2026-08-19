# P9 — admin harness app + 访问隔离

**Type**: prototype
**Phase**: 2/生产
**Status**: Unblocked

**Question**: per-game scope/credential/access-link 颁发/吊销 + token→scope 绑定 + 门覆盖 `X-RBI-Scope` + 系统配置（方案 1）。

**Research**: → `../../research/access-isolation-options.md`（方案 1 vs 2 分析）。

**From G3（per-user PAT，2026-08-19）**：per-user 登录（账号+密码，**复用 RBI `Tenant`**）+ 端点/scope 绑定（同一 addr:port 多用户各有独立登录）+ PAT **自助** UI（用户登录后粘自己 Qoder PAT → 存 per-user keychain 槽，admin 不经手 PAT）。per-user 凭证存储依赖 **P12**（keychain provider + per-user 寻址）。详见 G3 Finding。

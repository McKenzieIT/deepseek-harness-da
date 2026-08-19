# P3 — subagent-qoder 插件

**Type**: prototype
**Phase**: 1（P0）
**Status**: Unblocked（T1 resolved 2026-08-19）

**Question**: Qoder 作 harness subagent 插件——`query()` 委派 + `SDKMessage`→harness 流式适配（保 tool/reasoning）+ PAT auth + `resolveModel`/BYOK 控制模型。Phase 1, P0。

**Risks**: per `../../research/qoder-model-migration.md`（模型级不可达、内部不可控、Qoder 默认用己工具、Credits、流式类型松散、混淆 runtime 无 semver）。

**From T1（PAT auth 落地）**: PAT 已存 `~/.dsh/.credentials.yaml` 为 `QODER_PERSONAL_ACCESS_TOKEN`（seam file 层、doc 0600，**不**进 process.env）。本插件须 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 每操作解析 + 经 Qoder SDK `accessToken(value)` 显式传值；**不**用 `accessTokenFromEnv()`（那条要求 PAT 在 process.env，与 intranet-security-first 冲突）。等价 seam 写入 = `ctx.credentials.set(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'), '<pat>')`。前提：账号有 Credits（`query()` 跑 agent 消耗额度）。详见 T1 Finding。

**Scope（P3 不管理 PAT）**：P3 只**消费** PAT（`resolve` + `accessToken(value)`），**不**生成/轮换/删除 PAT。PAT 轮换是**人**（在 `qoder.com/account/integrations` 生成新 PAT）或 **P9 admin**（经 seam `ctx.credentials.set(ref, newValue)`）的动作；`credentials/updated` 事件热更新，P3 下次 `resolve()` 即生效、无需重启、无需 P3 参与。Qoder SDK 无 set/rotate-token API——鉴权面仅 `accessToken`/`accessTokenFromEnv`/`qodercliAuth`/`serviceAccount`，全是 call-side 消费，无 account-side 写。故"subagent 在页面上改 PAT"不成立。

**From G3（per-user PAT 设计，2026-08-19）**：PAT 解析从全局 `resolve(ref)`（T1 MVP，早期 fallback 用）演进为 **caller-parameterized `resolve(ref, { userId })`**——按登录用户从 keychain（P12）取其 PAT → `accessToken(value)`；无 per-user PAT 且 fallback 开 → T1 全局；fallback 关且无 → 拒。per-user 切片**依赖 P12**（keychain provider + per-user 寻址；未建前 P3 MVP 用 T1 全局）。scope 正交：PAT per-user（Qoder 鉴权）⊥ 数据 per-scope（pipeline 持有）。详见 G3 Finding。

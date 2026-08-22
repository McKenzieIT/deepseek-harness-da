# P4d — query-maxcompute Provider 前置 cred-check vs P4c「maxc 自持 auth」没对齐

**Type**: prototype（小 code fix；fix 路径有决策）
**Phase**: 2（query-maxcompute followup）
**Status**: resolved (2026-08-22, (b) credMode flag landed + EXECUTION proven — 真 ODPS rows dau=4336 via Provider→skip pushCredentials→sidecar→maxc；+ latent tilde bug fixed in maxc-sidecar.mjs)
**Graduated from**: 2026-08-21 乙 e2e（G-DA3）——EXECUTION 卡 credentials：`missing ODPS credential 'ODPS_ACCESS_ID' for scope 'K11'`。
**Assignee**: (unclaimed)
**⚠ 并发**: `packages/query/query-maxcompute/` 有并发会话在改（P4c ticket 已记「query-maxcompute 包有并发 session 在改」）——patch Provider 须先查并发状态、避撞。

## Question

query-maxcompute Provider 在调 maxc sidecar **之前**查 `ctx.get('credentials')` 要 `ODPS_ACCESS_ID`/`ACCESS_KEY`/`PROJECT`/`ENDPOINT`——但 P4c 设计说「maxc 自持 auth（`~/.maxc/config_ieu_cdm.yaml.bak`）、`set_credentials`→no-op（da 不推 cred）」。Provider 代码没跟上 P4c 设计（仍前置查 cred）→ EXECUTION 失败。怎么修？

## 现状（2026-08-21 乙 e2e 实证）

- 乙（G-DA3）已把 `query-engine`(`@deepseek-ai/dsh-query-maxcompute`，args=maxc-sidecar.mjs --maxc-config ~/.maxc/config_ieu_cdm.yaml.bak) 挂进 web-app bundle → ctx.query 注册、maxc sidecar boot 成功。
- K11 DAU 全链：UNDERSTANDING grounding ✅ → GENERATION ✅（P-DA2）→ **EXECUTION 失败**：`missing ODPS credential 'ODPS_ACCESS_ID' for scope 'K11'`。
- 根因：Provider.execute 在 callTool(sidecar) 前先 `ctx.get('credentials').resolve(...)` 取 ODPS_ACCESS_ID/etc 推给 sidecar 的 set_credentials——但 maxc sidecar 的 set_credentials 是 no-op（maxc 自持 auth 于 config），且 credentials seam 没这些 ODPS env（intranet-security-first：PAT-not-in-env；ODPS cred 也不该进 env）→ resolve 失败 → EXECUTION abort。

## 两修法

### (a) Provision ODPS creds 进 credentials seam（workaround，用户做）
- 在 `~/.dsh/.credentials.yaml`/settings 填 ODPS_ACCESS_ID/ACCESS_KEY/PROJECT/ENDPOINT（可从 ~/.maxc/config_ieu_cdm.yaml.bak 取）→ Provider cred-check 过 → call sidecar（set_credentials no-op、maxc 自持 auth）→ EXECUTION 跑。
- **优**：不碰 query-maxcompute（无并发撞车）；立即可行（你的 ~/.dsh）。
- **缺**：provision 了 maxc **不需要**的 cred（maxc 自持 auth）= 冗余；违 P4c「da 不推 cred 给 maxc」设计精神（虽不破安全——cred 经 credentials seam 非 env）。

### (b) Patch Provider 跳过 cred-check for maxc sidecar（P4c-faithful，agent cautiously 做）〔lean〕
- 改 `packages/query/query-maxcompute/src/index.ts` Provider：当 sidecar 是 maxc-backed（config.args 指 maxc-sidecar / 或 detect maxc config）→ 跳过 `ctx.get('credentials')` 前置查、直接 callTool（maxc sidecar 自持 auth、set_credentials no-op）。
- **优**：P4c-faithful（maxc 自持 auth、da 不推 cred、对齐 intranet-security-first）；不冗余 provision。
- **缺**：query-maxcompute **有并发会话改**→ patch 须先查并发状态（git status/log）避撞；可能要协调。

## 我的 lean

**(b) patch Provider**——P4c-faithful + 不冗余 provision + 对齐安全精神；但要 **cautiously**：先 `git status`/`git log packages/query/query-maxcompute` 查并发会话状态，若并发在改该文件则等/协调，避撞车。(a) 作即时 workaround（你 provision creds、立刻能跑 EXECUTION）若不想等并发。

## 依据

- 乙 e2e（2026-08-21）：`missing ODPS credential 'ODPS_ACCESS_ID' for scope 'K11'`（EXECUTION 失败点）。
- P4c 设计：`wayfinder/data-agent/tickets/phase-2/P4c-real-odps-execution-path.md`——「set_credentials/invalidate_scope → no-op（maxc 自持 auth 于 config、da 不推 cred）」。
- Provider 代码：`packages/query/query-maxcompute/src/index.ts`（前置 `ctx.get('credentials')` 查）。
- G-DA3 乙 patch：`packages/bundle/web-app/cordis.patch.yml`（query-engine args=maxc-sidecar）。

## Out of scope

- present_* 交付工具 ship（→ `phase-misc/present-delivery-tools.md` deferred）。
- 并发 test 文件 host-tsc 修复。

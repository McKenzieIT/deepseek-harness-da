# T1 — 配置 Qoder 账号 + PAT

**Type**: task（AFK checklist）
**Phase**: 1（P0 依赖）
**Status**: Resolved (2026-08-19)
**Assignee**: wayfinder-session 2026-08-19
**Blocks**: P3

**Question**: 为 subagent-qoder 配置 Qoder 账号 + 取 PAT（`QODER_PERSONAL_ACCESS_TOKEN`），经 harness `credentials` seam 存 env/.env。

**Work log**
- 2026-08-19（claim）：调研 credentials seam（`packages/credentials/credentials` + `credentials-local` + `docs/subsystems/credentials.md`）与 qoder PAT 用法（`research/qoder-sdk-ts.md`、`qoder-model-migration.md`）。
  - **存储定位** = `~/.dsh/.credentials.yaml`（seam 的 file 层，0600/0700）。现文件已有 3 key（`DEEPSEEK_API_KEY` / `ZAI_CODING_CN_API_KEY` / `DASHSCOPE_API_KEY`），无 `QODER_PERSONAL_ACCESS_TOKEN`；无 `~/.dsh/.env`；env 中各 key 均未导出 → 现有约定即"秘密在 `.credentials.yaml`、不进 process.env"。
  - ticket 字面"存 env/.env"读为松散措辞：seam 的 `set()` 只写 `.credentials.yaml`、**不**写 `.env`；`.env` 层会进 process.env → 违反 intranet-security-first（PAT 会被 bash 等工具子进程继承）。故落 `.credentials.yaml`，与现有 3 key 一致；wiring precedent 见 `~/.dsh/settings.yaml` 的 `apiKeyEnv:` 引用模式。
  - **P3 耦合（待回填 Finding）**：PAT 不进 process.env → P3（subagent-qoder）须 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 每操作解析 + 经 Qoder SDK `accessToken(value)` 显式传值；**不**用 `accessTokenFromEnv()`（那条要求 PAT 在 process.env）。等价 seam 写入 = `ctx.credentials.set(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'), '<pat>')`，落盘态同直接写 `.credentials.yaml`。
  - **待人（HITL）**：配置/登录 Qoder 账号 + 生成 PAT + 落盘。checklist + 安全 store 命令已交付（token 不经本会话上下文）。落盘后 verify（存在+长度，不打印值）→ 回填 `Resolved` + Finding → map Decisions 加 gist → 解锁 P3。

**Finding**（2026-08-19 resolved）:
- **done**: Qoder PAT（`QODER_PERSONAL_ACCESS_TOKEN`，len=64）已存 `~/.dsh/.credentials.yaml`（seam file 层；doc `-rw-------` 0600 owner-only；dir `~/.dsh` 755 属 harness home 既有态，与现有 3 凭证同环境，未改动——doc 级 0600 才是 enforced 边界）。落盘经剪贴板→文件（`pbpaste`），token 全程不经 agent/会话上下文。独立复核：YAML 解析 4 key 全非空、无 env 影子（seam `describe()` 报 `source:'file', writable:true`）、现有 3 凭证完好。
- **决策（存哪）**: 落 `.credentials.yaml` 而非 `.env`。理由：(1) seam `set()` 只写 file 层、**不**写 `.env`——"经 seam 存 .env" 技术上不通；(2) `.env` 进 process.env → PAT 被 bash 等工具子进程继承 → 违反 intranet-security-first；(3) 与现有 3 凭证（DEEPSEEK/ZAI_CODING_CN/DASHSCOPE）+ `settings.yaml` 的 `apiKeyEnv:` 引用模式一致。ticket 字面"存 env/.env"读为松散措辞。
- **P3 耦合（later ticket depends on）**: subagent-qoder 须 `ctx.credentials.resolve(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'))` 每操作解析 + Qoder SDK `accessToken(value)` 显式传值；**不**用 `accessTokenFromEnv()`（那条要求 PAT 在 `process.env`，与上述安全决策冲突）。等价 seam 写入 = `ctx.credentials.set(credentialRef('QODER_PERSONAL_ACCESS_TOKEN'), '<pat>')`。
- **Credits 前提**: PAT 只解决认证；`query()` 跑完整 agent loop 消耗 Qoder Credits/专业版额度——P3 跑通需账号有额度。
- **PAT 来源**: `https://qoder.com/account/integrations`（Account → Integrations → Personal Access Token → Generate；token 只显示一次）。
- **deferred to P3**: 运行时 `ctx.credentials.resolve` 实测（本 ticket 验的是存储态 = seam 的 file 层；live 解析属 P3 构建期验证）。

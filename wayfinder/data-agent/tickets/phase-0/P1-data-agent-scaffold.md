# P1 — dsh-data-agent bundle/profile 脚手架

**Type**: prototype（HITL, /prototype）
**Phase**: 0
**Status**: Resolved（2026-08-19）
**Assignee**: claude — wayfinder session（glm-5.2）

**Question**: Phase 0——`dsh-data-agent` bundle/profile 的 `cordis.patch.yml`：挂载 data 插件、disable code-agent；新建 `packages/data/` group（tsconfig 注册）。

## Resolution（2026-08-19）

**形态**：patch-only bundle（镜像 base），叠在 dsh-base 之上；不碰 app-boot/core/plugin 源码（additive-only，保上游升级路径）。可运行 profile 留 out-of-tree `dsh plugin --profile data-agent add @deepseek-ai/dsh-data-agent` 或 P7。

**patch 内容**（`packages/bundle/data-agent/cordis.patch.yml`）：
- disable code-agent 面 3 项：`tool-str-replace-editor` + `tool-ralph`（`disabled: true`）+ `tools.mode: native`（关 Code Mode；`--patch` 组合时覆盖 headless 的 `!!js process.env.DSH_TOOLS_MODE` seam）。
- data 插件行**全注释 TODO**（query-engine/retrieval/embedder/semantic-layer/audit/admin/llm-dashscope/subagent-qoder，标 ctx key + 填充 ticket）——不写 active `name:`，避免引不存在的 bare specifier 炸 pnpm/verify-cordis-config；P4-P11 把注释改真行。
- `tool-bash`/`code-runtime` 保留（map Q9 agent 自用执行后端；业务用户门禁归 P10 内网工具层，不在 bundle）；`tool-pwsh` base 已按平台 off；fs/web/jobs/workflow 暴露归 P7(preset)/P10。
- persona 不设（map「persona 归 preset」→ P7）。
- code-runtime 未来挂载块（注释，P7 变换 + 报告/Excel）。

**group**：新建 `packages/data/` 空 group 壳（README + 包/ctx-key 映射表标 TBD/P4-P11）；`tsconfig.base.json` 加 `./packages/data/*/src` + `/invariant.ts`（dsh-* + dsh-*/invariant 两 wildcard 列表）；`tsconfig.host.json` references 加 `./packages/bundle/data-agent`；`packages/README.md` + `packages/bundle/README.md` 表加行。

**验证**：`pnpm install` 干净（新包注册、无依赖错误——印证注释 TODO 决策）；`dsh --profile headless --patch ./packages/bundle/data-agent/cordis.patch.yml --dump-config` `EXIT=0`、无 absent-id 警告——`tool-ralph`/`tool-str-replace-editor` disabled、`tools.mode: native` 覆盖 headless env seam 生效；narrow `tsc --noEmit -p packages/bundle/data-agent/tsconfig.json` `EXIT=0`（src 编译过）；YAML 解析 3 条 active 行 id 正确。

**Deferred/TODO**：data 插件行（P4-P11 填）；code-runtime 挂载（P7）；persona（P7）；可运行 profile（out-of-tree `dsh plugin` 或 P7 驱动）；bilingual i18n.yaml blob hash 已记录（PR 时 `pnpm run verify-translation-pairing --write` 复核）。

**新冒出 fog**：报告/Excel 二进制产物交付机制（code-runtime pandas 生成 + `ctx.attachments` 复用 vs 专用 deliverable/export 工具；文本报告走 tool-fs write，二进制不走 str-replace-editor/tool-fs——两者仅 UTF-8）→ 已加 map Not-yet-specified。

**无 blocker 更新**：P1 非 P4-P11 的显式 blocker（frontier 未如此接线）；P1 解未解锁新 ticket。

**产物**：`packages/bundle/data-agent/`（cordis.patch.yml + package.json + tsconfig + src/{index,invariant}.ts + README.md + README.zh.md + README.i18n.yaml）、`packages/data/`（README.md + README.zh.md + README.i18n.yaml）、`tsconfig.base.json` + `tsconfig.host.json` + `packages/README.md` + `packages/bundle/README.md` 加行。

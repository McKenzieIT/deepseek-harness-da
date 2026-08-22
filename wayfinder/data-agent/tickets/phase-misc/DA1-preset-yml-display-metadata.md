# DA1 — data-agent preset.yml 展示元数据

**Type**: task
**Phase**: misc
**Status**: resolved (2026-08-21)
**Assignee**: da1-landing-subagent

## Question

data-agent preset（`apps/cli/config/agent-presets/data-agent/`）缺 `preset.yml`，导致模式选择器里只显示裸目录名 `data-agent`、无 `name`/`description`/`order`（standard 显示「标准模式」、code 显示「PTC 模式」）。补这个文件即可。

## 根因（已诊断，见 research）

- `apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md:26`：「a preset without it shows up in every picker as its bare directory name.」
- `standard/preset.yml`：`name: 标准模式` / `description: …` / `order: 1`。
- `code/preset.yml`：`name: PTC 模式` / `description: …` / `order: 2`。（用户口中的「PTC 模式」= `code` preset。）
- `data-agent/` 目录仅 `agent.cordis.yml` + 3 个 G1 变体，**无 `preset.yml`**。

## 要做的（task，非决策）

新增 `apps/cli/config/agent-presets/data-agent/preset.yml`：
```yaml
name: 数据模式            # 或「数据取数模式」，正式名随 map Destination 待定
description: 自然语言取数 Agent：经语义层 NL→SQL→执行→结构化交付的四阶段管道，回答标准看板覆盖不到的个性化数据问题。
order: 3                  # standard=1, code=2
```
（`name`/`description` 文案可 grill 定稿；order 取 3 接在 code 后。）

## 依据 / 引用

- 诊断笔记：`../../research/2026-08-21-conversation-pipeline-root-causes.md` §1。
- 元数据约定：`apps/cli/config/agent-presets/cordis/skills/editing-cordis-compositions/SKILL.md:26,68,70`。

## Out of scope

不改 `agent.cordis.yml` 工具 roster；不碰 bundle；纯加展示元数据文件。

## Resolution

已新增 `apps/cli/config/agent-presets/data-agent/preset.yml`，内容如下：

```yaml
name: 取数模式
description: 自然语言取数 Agent：经语义层将业务问题转 SQL→执行→结构化交付的四阶段管道，回答标准看板覆盖不到的个性化数据问题。
order: 5
```

- 格式与四个 sibling preset（standard=1 / code=2 / minimal=3 / cordis=4）完全一致：3 键（`name`/`description`/`order`）、无引号、中文、`description` 单行以「。」收尾、带尾随换行。读回 + `python3 -c "import yaml; ..."` 解析均通过，输出 `{'name': '取数模式', 'description': '…', 'order': 5}`。
- `order: 5`：1-4 已被 standard/code/minimal/cordis 占用，取数模式接在其后。
- `name: 取数模式` 为**可回退占位名**。map Destination 中 data-agent 的正式名仍「待定」，故在此先用领域动词「取数」（reverse-bi 源项目与本 map 均用此动词）+「模式」尾缀（对齐 标准/PTC/极简/创造 的 `X模式` 约定）。正式名定稿后可在本文件单点修改，不影响其它代码。
- 说明文案为 purpose-level（与 sibling 口径一致）；data-agent 尚未完全 wired 的状态由独立 ticket `data-agent-conversation-readiness` 跟踪，不体现在 mode 标签里。
- 范围严格遵守：仅新增此一个 `preset.yml` + 本 ticket 状态更新；未改 `agent.cordis.yml`、未碰 bundle、未触其它文件。

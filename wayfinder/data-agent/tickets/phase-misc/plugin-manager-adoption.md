# plugin_manager 采用设计 —— da 要不要让模型能跨 session 持久改插件清单

**Type**: grilling（HITL —— 权限边界是人的判断题，agent 不得自答） · **Status**: resolved（设计 2026-09-20 拍板，实现待排） · **Phase**: misc
**Assignee**: unclaimed
**Blocked by**: nothing
**Serves**: 在不让模型获得「跨 session 持久自我扩张」这一未受约束能力的前提下，定出 da 采用上游 `plugin_manager` 的形态
**Related**: [UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md) §2.5.4（本票的来源）+ 其「coverage 独立轨道【第一棒】（2026-09-20）」节 §四.3（方向拍板记录）；`packages/boot/plugin-manager`（上游包）；[COV1](../phase-coverage/COV1-per-file-coverage-100-track.md)（同批毕业的另一条轨道，无依赖关系）

> **Provenance（2026-09-20）**：本票从 [UM18](../phase-upstream-merge/UM18-post-0d1f50007f-residual-red-gates.md) §2.5.4 毕业。该问题**历经三棒未决**（2026-09-17、09-19、09-20），每棒都记「仍待用户决策、本棒不擅自采用」。2026-09-20 用户拍板：**方向 = 采用，但另起专票设计，不夹带进 coverage 轨道。** 本票即那张专票。
>
> **本票开出时（2026-09-20）da 尚未做任何接入改动。** 若后续有人发现 da 已挂上 `plugin_manager`，那是本票之后的事，请回写。

## Question

方向已定为「采用」。剩下的是**怎么采用才不越界**：启用范围（哪些 profile）、`danger-full-access` 的收敛方式、插件清单变更的审计、以及与 da bundle patch 的接入点。

## 为什么这不是一个普通的「挂个工具」决策

先把语义摆清楚，因为前两棒都在这里含糊过：

`plugin_manager`（`packages/boot/plugin-manager`，动作 `list` / `set` / `install` / `remove` 插件与 bundle）管的是**已装插件清单** ——

- **跨重启持久**：写进 profile 配置，不是进程内状态；
- **影响该 profile 后续所有 session**：不是只影响当前会话；
- **不是** in-process 动态定义能力（上游退役动态 cordis 工具族后，`plugin_manager` 是其对「持久插件管理」的替代，但两者管的不是一回事）。

所以把它挂给模型，等于**让模型能跨 session 持久扩张自己的能力面**，且需要 `danger-full-access`。这与「给模型加一个查询工具」不在同一个风险量级上 —— 后者的影响随会话结束而消失，前者不会。

da 的 bundle patch 从未启用它（只有 `cordis` creator preset 挂了），所以**da 的模型当前没有这个工具**。这是现状，也是默认安全态。

## 需要定的（每条都要有结论，不能留「看情况」）

1. **启用范围**：哪些 profile 挂？headless / web / 默认 profile / 仅 admin persona？
   - 参照既有分层先例：`packages/data/admin` 的服务端解析 scope（非客户端可供给）+ fail-closed；P10 的工具门禁 defense-in-depth（业务用户 agent 经 identity-scoped allowlist 禁 bash）。**问题**：`plugin_manager` 该不该进 UNIVERSAL 白名单，还是只给 admin identity？
2. **`danger-full-access` 的收敛方式**：它是这个工具的硬前置。整个 profile 开 full-access 是最省事也最危险的做法。
   - 有没有「只为这一个工具放行」的粒度？若没有，是否接受「挂 `plugin_manager` ⇒ 该 profile 全程 full-access」这个连带后果？若不接受，本票的结论可能是「在收敛机制存在之前不挂」—— **那不算推翻用户的方向，是把方向落到一个前置条件上**。
3. **插件清单变更的审计**：`data/audit` 已有 Tier-2 写入记录 + `recordTier2Write`。清单变更要不要走同一条审计路径？
   - 判据参照 [B-DA7](B-DA7-phase-gate-infrastructure-failure-terminal-state.md) 的教训：**只写 `ctx.logger` 的决策在 transcript 里不可见，会误导诊断**。插件清单变更比那个更该留痕 —— 它跨 session 生效，事后回溯时如果查不到「谁在哪一轮装了什么」，就没法判断一个异常行为是代码问题还是模型自己改了清单。
4. **与 da bundle patch 的接入点**：具体在哪个文件、哪一行挂？挂了之后 `verify-cordis-config` / boot manifest 的既有计数会变，要不要同步基线？
5. **回退路径**：装错/装了恶意插件之后怎么回到干净态？`remove` 够不够，还是需要一个「重置为 bundle 声明的清单」的动作？

## 决策记录（2026-09-20，用户逐项拍板）

**核过源码的机制底牌（驱动以下决策）**：plugin_manager 的 6 个动作（含只读 `list_plugins`/`list_bundles`）**全部**要 `danger-full-access`——`packages/boot/plugin-manager/src/tools.ts:33-40` 的 `execute` 在 action switch 前无条件调 `approveEscalation({ requestedMode: 'danger-full-access' })`，无读/写分叉。`danger-full-access` 是 **profile 级**沙箱总开关（`packages/sandbox/sandbox-policy`，三态之一），无按工具/按 identity 粒度。**但**工具支持逐次审批：低 mode 下每次调用经 `approval` 服务弹审批，**批准只对这次生效、不改 session 权限模式**（工具描述原文 “Approval does not change the session permission mode” + README）；`never`/无审批通道（headless）→ 拒绝执行。这条把 #1 与 #2 绑定：交互式能靠逐次审批收敛，headless 无通道只能整 profile full-access。

1. **启用范围 = 仅 Web/交互式 profile**（headless/默认不挂）。
   - 否决「含 headless/默认」：headless 无审批通道，挂它必须整 profile full-access，风险不可接受。
   - 否决「交互式 + admin 门禁」：现阶段不加 identity wrapper（`tools.restrict` 是按 scope 非按 identity，admin-only 需 da 侧加 `role==='admin'` 检查，成本 > 当前收益）；范围已由「仅交互式」收窄。
   - 否决「暂不挂」：逐次审批已提供收敛路径，无需等待。
2. **danger-full-access 收敛 = 靠逐次审批（不整 profile 放宽）**。profile 保持正常 mode，每次调用经 approval，session 不永久提权。
   - 否决「整 profile 开 full-access」：全程 full-access 最危险，仅 headless 被迫如此，而 #1 已排除 headless。
   - 否决「不挂直到更细粒度」：逐次审批即交互式的收敛，无需再等。
   - 注：此项为用户风险判断，agent 未自决。
3. **清单变更审计 = da 侧监听器 → recordTier2Write**。听 `plugin-manager/changed` 事件，把「谁/哪轮/装或禁了什么」写 Tier-2 审计（`packages/data/audit` 已有 `recordTier2Write`，不改上游）。
   - 否决「只靠 approval 日志」：approval 只记「批准了升级」不记具体包，事后无法回溯。
   - 否决「不加审计」：清单跨 session 生效，B-DA7 教训要求留痕。
4. **接入点（随 #1 定）**：在 Web/交互式 profile 的 patch 加 `- id: tool-plugin-manager` / `disabled: false`；实现时钉准确切文件，并**同步 `verify-cordis-config` / boot manifest 基线计数**。现状：全仓仅 `packages/preset/agent-presets/presets/cordis/agent.cordis.yml` 挂了它。
5. **回退路径 = remove 够用**。
   - 否决「reset-to-bundle 流程」与「git 还原」：暂以 remove 为准。**已知 caveat（README）**：remove 有失败残留、且无法禁用自身管理组件；若日后 remove 清不干净，再升级到 reset-to-bundle。

**设计已决，剩下是实现**（挂载 + 审计监听器 + 依 remove 回退），走分支 + PR。本票 grilling 部分到此 resolved。

## 硬约束

- **不改上游 `packages/boot/plugin-manager` 本身**（fork 一律不修上游产品代码）。本票只决定 da 侧的挂载与门禁。
- 本票是 **grilling（HITL）**：`danger-full-access` 的取舍是人的风险判断，**agent 不得自答后当作已决**。若某个 session 想推进本票而用户不在场，正确做法是把选项和取舍整理好停下，不是替用户拍板。

## 明确不在本票范围

- in-process 动态插件定义（上游已退役该工具族；见 `.agents/notes/` 里 2026-09-19 那条 `docs(skill,wayfinder): retire the dynamic in-process mode` 的记录）。
- 插件市场/分发形态。
- `plugin_manager` 自身的覆盖率（若它是上游文件，按 COV1 的归属规则不属 da 的债）。

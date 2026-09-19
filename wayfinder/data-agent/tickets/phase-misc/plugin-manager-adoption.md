# plugin_manager 采用设计 —— da 要不要让模型能跨 session 持久改插件清单

**Type**: grilling（HITL —— 权限边界是人的判断题，agent 不得自答） · **Status**: open · **Phase**: misc
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

## 硬约束

- **不改上游 `packages/boot/plugin-manager` 本身**（fork 一律不修上游产品代码）。本票只决定 da 侧的挂载与门禁。
- 本票是 **grilling（HITL）**：`danger-full-access` 的取舍是人的风险判断，**agent 不得自答后当作已决**。若某个 session 想推进本票而用户不在场，正确做法是把选项和取舍整理好停下，不是替用户拍板。

## 明确不在本票范围

- in-process 动态插件定义（上游已退役该工具族；见 `.agents/notes/` 里 2026-09-19 那条 `docs(skill,wayfinder): retire the dynamic in-process mode` 的记录）。
- 插件市场/分发形态。
- `plugin_manager` 自身的覆盖率（若它是上游文件，按 COV1 的归属规则不属 da 的债）。

# PROTOTYPE (throwaway) — G2 DAG 面板放置方案

> Wayfinder ticket [G2 — DAG panel placement and interaction design](../tickets/G2-dag-panel-placement-and-interaction.md) 的原型。
> 回答的问题:**DAG 面板放在三栏 AppFrame 的哪里、如何伸缩、节点如何交互**。
> 用完即弃 — 不进产品代码;决策定型后本目录整体归档/删除。

## 运行

```sh
node wayfinder/task-orchestration-dag/prototype/server.mjs
# → http://localhost:4310/?variant=A   (端口可用 PORT= 覆盖)
```

零依赖、零构建:`server.mjs` 同时把仓库自带的 `@antv/g6@5.1.1` UMD 包
(来自 `packages/client/ui-context-layer` 的 node_modules)挂到 `/vendor/g6.min.js`,
不访问外网。底部悬浮条或 `←`/`→` 键切换方案,URL `?variant=A|B|C` 可直达。

## 方案(结构性不同,不是换色)

| 方案 | 席位 | 折叠形态 | 节点点击 |
|---|---|---|---|
| **D 融合方案(默认)** | sidebar 分区 + `shell.overlay` 弹窗 | dock 摘要条 + 侧栏迷你进度条 | 容器内底部详情卡 |
| **A 右侧详情栏** | `details.aux` | 会话头按钮 `▦ 任务图 · N 运行` + 详情栏页签徽标 | 底部详情卡上滑 |
| **B 左侧侧边栏** | sidebar 分区 | 侧栏底部迷你进度条 + composer 上方 dock 摘要条(TodoPanel 后继) | 侧栏旁浮出卡片 |
| **C 浮动窗口** | `shell.overlay` | 右下状态条(点击恢复);窗口可拖拽/缩放/最大化 | 窗内右侧检视器 |

**D = 用户 2026-09-02 反馈的融合**:B 的骨架(dock 摘要条 + 侧栏伸缩,弃浮出卡) +
A 的底部节点详情卡 + C 的弹出大视图(⛶,默认 860×600,补小屏、兼顾单节点与全貌) +
加大字号(任务节点 134×38/13px)。状态机 `collapsed → sidebar ⇄ popped`;
小地图默认**关**(🗺 开关,开时右上角——修掉 C 的右下角遮挡 bug);⤢ 适配一键回全貌;
<1180px 宽时侧栏态提示建议弹出。侧栏展开态**限高 min(42vh,400px)**(一瞥视图;
左下角「◍ 模拟 40 会话」压力开关实测:不限高会把会话列表挤到 230px 可见)。

**演示动效(2026-09-02 追加,像素级验证)**:D 默认**自动演进**(⏸/⏵⏵,2.6s/步,
6 步一循环含归零重放)。动效走 **@antv/g Web Animations API**(场景树按 id 取显示
对象 → `element.animate()`)——实测 `updateEdgeData` 改 `lineDashOffset` **不触发
重绘**(像素哈希 600ms 不变),rAF 循环是死的;这是 W12 之外 G6 使用层的第二个坑。
动画速度按当前 zoom 换算,屏幕观感恒定 ≈48px/s(缩放后防抖重装):

- **派生边流动**(紫虚线,目标运行中,全速)+ **包含边缓动**(琥珀虚线,工作流运行中,半速);
- **活跃节点呼吸**(进行中任务/运行中代理,线宽+辉光 1.5s 循环)——"现在在执行什么";
- **hover 上下游高亮**:悬停节点 → 祖先/后代链路高亮加粗、其余压暗至 0.22/0.1,
  移开还原——"上下游关联是什么";
- **状态变迁脉冲**(750ms 加粗发光)+ 完成依赖路径转绿;
- **dock 摘要条点名当前任务**("正在执行 「实现会话事件投影层」 …")+ 面板底部图例行。

共享图本体(dag-graph.js)按 G1 决议绘制:5 种节点(task/subagent/workflow-run/
workflow-agent 状态配色)、4 种边(dependency 实线、sequence 细线、spawning 流动虚线
marching-ants、containment 琥珀虚线);已完成的依赖路径变绿(Y 模式)。
每个方案头部有 **▶ 演进下一步** 按钮,步进模拟任务/子代理/工作流的状态推进,
用于检验折叠态是否足以传达进度。侧栏/详情栏宽度严格取自
`packages/client/ui-layout/src/client/columns.ts` 的契约常量(280/420、360/520、56 rail)。

## 自验记录(headless 浏览器)

- A:入口按钮 → 页签 → 图渲染(canvas 359×789)→ 节点点开详情卡 → 演进后
  chips/页签徽标/头按钮计数同步(4→3)。
- B:dock 摘要条文案、迷你条 2/6·33%;展开侧栏 280→420、canvas 419×343;
  节点点开浮出卡(t3)。
- C:窗口 560×430;收起→状态条文案"进行 2 · 运行 4"、点击恢复;节点检视器(t2);
  拖拽 340,88 → 460,180。(用户反馈 minimap 遮挡图 → 已改默认关。)
- D:折叠态 dock+迷你条;展开 420/canvas 419×416/三按钮工具条;节点点击→底部详情卡;
  ⛶ 弹出 860×600 窗口、侧栏回迷你条;🗺 开→5 画布(右上角小地图)、关→4;
  ⤡ 收回→窗口关、侧栏展开态恢复;演进同步 dock/迷你条/chips;无页面错误。
- 自动演进+动效(2026-09-02):默认开,实测 2/6→4/6→6/6 步进、循环归零重放;
  WAAPI 重写后**像素哈希实测流动中**(暂停演进后 500ms 两次采样哈希不同,
  animCount=10);hover 首个探针点即触发重绘(上下游高亮生效);无页面错误。
- 过程中修掉的真 bug:G6 5.1.1 的节点点击事件 id 在 `evt.target.id`,
  `evt.itemId` 不存在(上游 `ContextLayerGraph` 用的恰是不存在的那个键 — 已开
  data-agent map 的 W12 工单,subagent 已修复,test:gui 全绿)。

截图:`shots/`(D-collapsed/D-sidebar/D-sidebar-detail/D-popped/D-auto-mid/
D-auto-complete/D-popped-auto/D-flood(-capped);A-entry/A-open、B-collapsed/
B-expanded、C-window/C-pill/C-inspector)。

调试钩子(故意保留):`window.__dagGraph`(图实例)、`window.__factoryClicks`、
`window.__popDebug`。

> ⚠️ 2026-09-02 18:10 本目录四个代码文件曾被外部批量回滚至 9/1 状态(疑似同步工具,
> 同一秒 mtime)。同日已全部重建并重新像素级验证(点击/流动/自动演进/无错误)。
> 若再见到"没有流动效果/点击无反应",先 `ls -la` 核对 mtime 是否又被回写。

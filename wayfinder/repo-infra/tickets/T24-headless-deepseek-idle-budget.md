# T24 — snapshots lane：headless DeepSeek defaults 用例烧完 60 秒 smoke 预算，并以 fail-fast 遮蔽整条 lane

**Type**: research（需先定两件事：`streamIdleTimeoutMs: 150` 是刻意预算还是意外收窄；修法落在产品侧还是 fixture 侧）
**Phase**: post-discovery
**Status**: open
**Assignee**: unclaimed
**Related**: [T11](T11-test-coverage-failing.md)、[T21](T21-snapshot-lane-scheduling-assertions.md)；证据取自 `node 24 / snapshots and artifacts` job 104648904893（PR #157）与 job 104659731495（PR #160）

## Question

`node 24 / snapshots and artifacts` 的**第一项**失败此前从未建票。它是 `apps/cli/tests/profiles/headless/tests/headless.expected.e2e.ts:450`（suite `headless stream-json snapshots`）的「keeps provider comments alive and sends DeepSeek defaults through the one-shot app」：

```
Error: DeepSeek adapter defaults headless stream-json snapshot did not exit within 60s.
 ❯ runLoaderSmoke packages/test-support/loader-smoke/src/index.ts:216
 ❯ apps/cli/tests/profiles/headless/tests/headless.expected.e2e.ts:453
```

两次真实运行分别耗时 **60138ms**（job 104648904893）与 **60171ms**（job 104659731495）——都不是「差一点」，而是恰好烧完 `DEEPSEEK_DEFAULTS_PROCESS_TIMEOUT_MS = 60_000`（`headless.expected.e2e.ts:50`，经 `processTimeoutMs` 传给 `runLoaderSmoke`，见同文件 464 行）。抛出点是 `execa` 的 `result.timedOut` 分支（`packages/test-support/loader-smoke/src/index.ts:216`），即子进程始终没有退出，而不是断言不匹配。

子进程的流内证据是同一条错误重复出现：

```
{"message":"DeepSeek stream idle timeout after 150ms","code":"TIMEOUT"}
```

随后是 `llm/retry` 的第 1..5 次尝试。该消息由 `packages/llm/llm-deepseek/src/adapter.ts:508` 产出，`150` 即 fixture `apps/cli/tests/profiles/headless/tests/fixtures/deepseek-defaults.patch.yml:13` 给 `llm-deepseek` 配的 `streamIdleTimeoutMs`。

## 为什么这一项会遮蔽整条 lane

它是该文件里排在前面的用例，lane 又是 fail-fast，因此它一红就吃掉后面 85+ 条 recorded-session replay（`snapshots/session/headless.snapshot.ts:879` 的 `${mode}s ${scenario.name} through dsh --profile headless`）。后果是可测量的：

- PR #155 / #156 / #157 / #159 / #160 的 snapshots job 里，`replays … through dsh --profile headless` 记录数都是 **0**——不是「replay 全绿」，是**一条都没跑**。
- 只有 PR #161 越过了这一项（该用例在那次运行里侥幸通过），才第一次跑到 **85** 条 replay，并随即失败在 `replays persistent-pwsh-tool-turn`（scenario 目录 `snapshots/session/persistent-pwsh-tool-turn`）。因此 `persistent-pwsh-tool-turn` 在**干净树上的真实状态至今未知**——它只在一个带着已被推翻改动的 draft 分支上被观测过一次。

还有一条结构性事实必须记下：`ci-master.yml` **没有** snapshots job（全文无 `snapshot` 字样；该 lane 只存在于 `ci.yml:274`）。所以 master 从来不跑这道门，这批遮蔽只能在 PR 上被看到，master 的「绿」对该 lane 不构成任何证据。

## 需要先判定的分叉

**先记已核实的接线事实，因为它直接约束了可选修法。** 「让 DeepSeek 路径把 provider comment 当作存活证据」这条产品侧修法**已经实现了**，不是缺口：

- `adapter.ts:711` 以 `parseSse(response.body, onActivity)` 消费流；
- `packages/llm/llm-deepseek/src/sse.ts:34` 把该回调作为 `EventSourceParserStream({ onComment })` 的 comment 回调；
- `onActivity` 即 `adapter.ts:493` 传入的 `() => { watchdog.pulse() }`；
- `packages/util/timeout/src/index.ts` 的 `idleWatchdog.pulse()`（162-164 行）只在 `next` 在飞（`outstanding`）时重新武装计时器。

fixture 侧同样已核实：server 每 **60ms** 写一次 `: keep-alive`（`headless.expected.e2e.ts:101-102` 与 112 行的 `setTimeout(write, 60)`）。

于是出现一个必须先解释的**矛盾**：若 comment 确实每 60ms 重新武装 150ms 的看门狗，这条流就不该 idle out；但日志明确显示它 idle out 了五次。两种读法必有一处不完整，**这个矛盾就是要先解决的东西**，不是先去改预算。两条候选解释（都**未确认**，均为假设）：

1. **余量假设**：60ms 心跳对 150ms 预算只有约 2.5 倍余量；snapshots lane 争用峰值下，单次事件循环延迟超过 150ms 即触发。这解释了「间歇」但不解释「稳定烧满 60 秒」。
2. **fixture 结构性循环假设**：`headless.expected.e2e.ts:99-100` 的保活条件是 `keepAlives-- > 0 || (waitForTitleRequest === true && !requests.some(request => request.max_tokens === 64))`。前 3 次由 `keepAlives`（96 行）供给；此后主响应的保活只在**已经记录到 title 请求**（`max_tokens === 64`）时才停止，而 title 请求要等主回合结束才会发出。若确如此读，主响应会无限保活、永不发送 `DEFAULTS_OK`（105-110 行），子进程自然不退出——与「烧满 60 秒」吻合。这一条只从 fixture 源码读出，**尚未用运行时观测证实**。

必须先判定的两个问题，措辞放明白：

- `streamIdleTimeoutMs: 150` 是**刻意且有理由**的预算，还是一次意外收窄？该值旁边没有任何注释或笔记为它辩护；对照仓库内既有取值（`packages/llm/llm-pi-ai/tests/adapter.spec.ts:134` 用 10_000，`snapshots/sdk/persistent-tools/cordis.yml:15` 用 172800000），150ms 在本仓属极端值。
- 修法在**产品侧**还是 **fixture 侧**？产品侧「comment 计为存活」已具备，故该方向基本封闭；剩下的产品侧空间是「重试语义」与「保活 comment 与 idle 预算的交互」，fixture 侧空间是上面第 2 条循环（若成立，则是 fixture 缺陷，与 150ms 无关）。**定完 root cause 前不要动任何数字。**

## Scope

1. 先解释矛盾：在该用例上取得一次带时序的观测（comment 到达时刻、`pulse()` 调用、看门狗触发时刻），判定是余量不足还是 fixture 循环。这一步本身就是修复的一部分——现在的失败消息只说「没在 60 秒内退出」，不说卡在哪一环。
2. 按判定结果二选一：若为 fixture 循环，修正保活终止条件，使主响应的结束不依赖一个必须在它之后才会发生的请求；若为余量不足，把 `streamIdleTimeoutMs` 定到一个**有实测支撑并写明理由**的值，而不是「调大一点」。
3. 顺带把该用例从 lane 的遮蔽位置上解开：无论根因为何，一项失败吞掉 85+ replay 的可见性本身是 lane 的缺陷，应记下是否值得让 replay 集合先跑。
4. **不接受的修法**：放宽 60 秒 smoke 预算、加 `retry`、或重录 snapshot。三者都只会把这条流的真实行为继续埋起来。

验收：`node 24 / snapshots and artifacts` **连续两次真实运行**该用例全绿，且同一批运行里 `replays … through dsh --profile headless` 的记录数不为 0（后者是本票是否真的解除遮蔽的唯一证据）。`persistent-pwsh-tool-turn` 的真实状态待遮蔽解除后单独判定，不并入本票。

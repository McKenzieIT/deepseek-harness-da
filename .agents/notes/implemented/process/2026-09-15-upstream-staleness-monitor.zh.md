# Agent Note: 用定时门禁而非定时报告来监控上游滞后

Status: implemented

[English](2026-09-15-upstream-staleness-monitor.md) | 中文

## 问题

[`upstream-status`](../../../../scripts/upstream-status.ts) 按约定始终以 0 退出，而且没有任何工作流声明 `schedule:`，因此这个 fork 无从得知自己已经落后上游。把该报告放上定时任务并不能解决问题：无论 fork 是最新的、落后数月，还是根本连不上远端，每次运行都会报告成功。该报告还在刷新引用的 fetch **之前**读取本地 `upstream/master` 引用，于是任何上游已经前进的运行都会把 fetch 前的 sha 与 fetch 后的 sha 相比较、把该引用判为陈旧，并因此拒绝给出落后提交数——恰恰在 fork 刚刚落后时压掉了这个数字。

## 决策

[`upstream-monitor`](../../../../scripts/upstream-monitor.ts) 是覆盖同一份记录与同一次引用探测的独立门禁。它在超出记录声明的阈值时以 1 退出，在记录不可读、违反自身形状约定或所记上游提交不是 `HEAD` 的祖先时以 2 退出，在无法探测远端时以 3 退出，在无法证明新鲜度时以 4 退出——陈旧的跟踪引用或缺失的计数永远不会被报告为成功。滞后判定不进入为拉取请求把关的 [`verify-upstream-sync-record`](../../../../scripts/verify-upstream-sync-record.ts)：上游的推进与任何拉取请求无关，把落后计数放在那里会让无关的改动失败，并在一周内被关掉。

[`upstream-monitor.yml`](../../../../.github/workflows/upstream-monitor.yml) 在每周一 21:17 UTC（即周二 05:17 Asia/Shanghai）以及手动派发时运行这两条命令，权限为 `contents: read`，按引用与事件各保留一个不可取消的运行，并且在失败的运行上同样把报告留存为构件。失败的运行本身就是通知；不创建 Issue，因为自动建 Issue 首先要定义写权限、去重、更新与关闭行为。

`probeRef` 现在先探测远端再读取跟踪引用，这正是它自己的文档一直声称的约定。两条命令都接受 `--root <path>`，因此夹具套件针对带路径式 `upstream` 远端的临时仓库驱动陈旧、未知与记录畸形这几条分支，绝不触碰真实远端。

## 考虑过的替代方案

**让 `verify-upstream-sync-record` 因滞后而失败。** 它在每个拉取请求上运行，而落后计数并非作者可控。该门禁会让无关改动失败，并被豁免掉。

**定时运行 `upstream-status` 然后看日志。** 没人打开的绿色运行不是信号，而且这个运行永远是绿的。阈值判定必须落在退出码上。

**从工作流创建 Issue。** 这需要 `issues: write`，再加去重、更新与关闭规则；无人管理的机器人会每周开一个 Issue。而失败的定时运行已经会通知仓库所有者。

**把 `indeterminate` 当作成功。** 未 fetch 或不可达的引用会低报与上游的距离，而这正是该报告要防的假绿。无法证明的新鲜度一律失败。

## 后果

漂移超过 14 天或 150 个提交的 fork 现在会让一个定时任务失败，记录损坏或远端不可达同样如此；构件里带着原因。`upstream-status` 保持其报告语义，但上游已前进的那种运行现在会打印它过去压掉的落后提交数。该监控要求 `fetch-depth: 0` 和已配置的 `upstream` 远端——浅克隆会报告 `indeterminate` 而不是假通过。首次定时触发只会在该工作流进入默认分支之后发生。

[夹具套件](../../../../scripts/upstream-monitor.spec.ts) 覆盖了新鲜、提交阈值、天数阈值、不可探测的远端、不可读的记录、形状违规、未被吸收的上游提交、`--no-fetch` 陈旧、fetch 后新鲜、第二父提交不匹配，以及失败时的构件留存。

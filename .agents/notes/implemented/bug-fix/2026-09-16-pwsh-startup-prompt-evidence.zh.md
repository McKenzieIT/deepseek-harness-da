# Agent Note: pwsh 启动以验证过的提示符证据结算

Status: implemented

[English](2026-09-16-pwsh-startup-prompt-evidence.md) | 中文

## Problem

托管的 `node 24 / coverage` job 以 `expected '' to contain 'dsh> '` 拒绝了一次持久 pwsh 的 spawn：发布出来的 `motd` 是空串（[job 104635347140](https://github.com/deepseek-harness/deepseek-harness/actions/runs/34103061266/job/104635347140)）。

启动在任何 `stdin_read` 等待原因上就跳出 pwsh 设置循环，而该原因在会话的就绪轮询中有两个互相独立的生产者。一个是验证过的提示符——私有 OSC `133;D;` 标记，后面紧跟精确的可打印提示符。另一个是 Linux 精确 stdin 等待探测，它只观测到前台进程组里有某个进程阻塞在终端读取上。pwsh 与 PSReadLine 会在渲染任何内容之前发出光标位置查询并阻塞读取其回复，而 sanitizer 会剥掉这条查询，于是探测用一个空 viewport 结算了首个启动发送，启动把它发布了出去。

失败的用例在 8000 ms 的启动预算里 710 ms 就结束——比它通过的同胞用例更快——并且该次运行没有任何一行记录 `PTY shell did not reach readiness` 或 `PTY shell exited`，因此 spawn 是成功返回，而不是耗尽时间。争用饿死不是原因。PR #159 的 CI 显示失败的是相反的参数（`hold command: false`），所以 barrier 命令也不是原因：该标志第一次被读取的位置在 `motd` 断言之后。

只有 Linux 会命中它，有两个结构性事实。`isStdinWaiting` 在 macOS 与 Windows 上直接返回 false，因此该探测只存在于 Linux。`initializing`——让启动等待首个字节的标志——只在 `initialize()` 内部设置，而后端只为 bash 调用它；pwsh 路径直接调用 `startSend`，完全没有这道闸门。

提交 `4f3a47d792` 引入了该回归：它把针对 viewport 与 scrollback 的 `CONTROLLED_PROMPT` 子串检查换成了裸的等待原因。那个子串检查本身有一个真实的误判，因为 `PWSH_PROMPT_SETUP` 内嵌了字面量 `dsh> `，而 pwsh 会回显自己的设置源码。这次替换把那个误判换成了另一个会发布空启动消息的误判。

## Decision

`LocalPtySession.promptReady` 暴露会话本已跟踪的就绪证据：标记已到达，且其后的可打印文本恰好是 `CONTROLLED_PROMPT`。就绪轮询的提示符档位读取同一个访问器，因此该证据只有一处定义。

pwsh 启动循环只在结算既是 `stdin_read` **且** `promptReady` 成立时跳出。其他任何结算都继续等待，而围绕整个循环的那一个绝对截止时间仍是唯一的界：真正从不给出提示符的 pwsh 依旧以 `PTY shell did not reach readiness before startup timeout` 拒绝。

回显的输入无法伪造被接受的信号。`PWSH_PROMPT_SETUP` 在运行时用 `[char]27` 与 `[char]7` 构造标记的 ESC 与 BEL 字节，因此 pwsh 回显回来的可打印源码永远不含真正的标记；只有渲染出的提示符才会产生一个。

同一循环内另外两处缺陷随之修好。不携带新字节的结算不再丢弃更早结算已经收集到的启动文本。记录前导设置已提交的是显式状态，而不是空 viewport，因此无论到达多少个不带输出的结算，设置行只会写入一次。

## Testing

`tests/index.spec.ts` 中的伪 pwsh 会话会表达提示符就绪。新用例钉住：viewport 为空且无证据的 `stdin_read` 结算让循环继续等待；在重复的空结算之间设置前导只提交一次；没有证据的回显提示符字面量仍然不算就绪。`tests/session.spec.ts` 针对真实会话钉住该访问器在探测结算与标记结算两种结果下的取值。`tests/local.spec.ts` 中的真实 pwsh 用例未改动，仍是 Linux 路径正确结算的唯一证据；在没有 pwsh 的宿主上它们自跳过。

## Alternatives considered

**在 `TerminalWaitReason` 或 `TerminalSendResult` 中携带提示符证据。** 已否决：两者都是终端接缝的导出类型，还有其他实现方（包括 E2B 终端），而 `LocalPtySession` 是本包内部类型。访问器把改动限制在 `terminal-bash` 内，并且不触动任何其他实现方。

**恢复 `CONTROLLED_PROMPT` 子串检查。** 已否决：那正是 `4f3a47d792` 关闭的误判。设置源码含有字面提示符且 pwsh 会回显它，因此子串检查会把回显当作渲染出的提示符接受。

**放宽 `timeoutMs` 或重试 spawn。** 已否决：该失败在 8000 ms 预算中用了 710 ms 就成功返回。任何计时改动都修不了一个不携带提示符的结算。

**给 pwsh 路径加上 bash 的首字节闸门。** 已否决：scrollback 内容不是提示符证据，而回显的设置源码正是内容。这道闸门只会延后同一个错误答案，而不会拒绝它。

**把带提示符证据的 `inferred_idle` 也当作启动就绪。** 已否决：静默是服务后续发送的有界推断。启动拥有唯一的截止时间，付得起等待精确信号的代价。

## Consequences

到不了提示符的 pwsh 现在会在启动截止时间拒绝 spawn，而不是发布空 `motd`。失败是响亮的，消息不变；此前会拿到一个无用会话的调用方现在拿到错误。

该修复在 Linux 之外不可观测。精确 stdin 等待探测只存在于 Linux，而真实 pwsh 用例在没有 pwsh 可执行文件时跳过，因此本机运行只能证明没有别的东西回归。

有一个狭窄窗口仍然敞开。`startSend` 会为每次发送丢弃就绪证据，包括不提交任何输入的后续发送。若某次结算落在同一次渲染的标记写入与可打印提示符之间，下一次启动发送会清掉这份部分证据，而后续输出不会再补全它，于是启动在截止时间拒绝。进入该窗口需要一次就绪轮询正好在 pwsh 处于两次写入之间时观测到阻塞的终端读取，且 `acceptsStdinWait` 还要求前台进程组曾离开过更早的等待。关闭它意味着不再为从不写入的发送丢弃证据，那会改动与 bash 共享的发送语义，留待它自己的证据。

已报告失败的验收标准仍是 `node 24 / coverage` 连续两次真实运行全绿；本机包内运行全绿不是该证据。

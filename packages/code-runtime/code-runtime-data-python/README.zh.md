# @deepseek-ai/dsh-code-runtime-data-python

[English](README.md) | 中文

面向 data-agent 的 CPython 子进程版 [`@deepseek-ai/dsh-code-runtime`](../code-runtime/README.md) 接缝实现。`DataPythonCodeRuntime` 在一个全新的 `python3` 子进程中运行每个程序，提供 pandas/numpy，使用由 [`@deepseek-ai/dsh-code-runtime-python`](../code-runtime-python/README.md) 拥有的现有 fd-3 JSON-lines 线协议，并返回 `{ value, logs, error? }`。**遏制，而非安全边界**：信任姿态是 binding-only I/O 加资源限制——与 [`worker-thread`](../code-runtime-worker-thread/README.md) 后端相同，只是把 Node 隔离体换成一个全新的 CPython 进程，让模型代码用 Python 而非 TypeScript 编写。

## Config

```yaml
- id: code-runtime
  name: '@deepseek-ai/dsh-code-runtime-data-python'
  config:
    cpuSeconds: 30                # RLIMIT_CPU seconds applied to the bootstrap before model code runs
    addressSpaceBytes: 2147483648  # RLIMIT_AS bytes capping the child address space (Linux-enforced; macOS ignores)
    maxWallMs: 600000             # wall-clock ceiling; the host SIGKILLs the child on expiry
    maxLogBytes: 1048576          # shared byte budget for captured log text (host + child ledgers) — 1 MiB
    maxValueBytes: 67108864       # byte cap for the serialized completion value — 64 MiB
    pythonPath: python3           # CPython interpreter invoked for the bootstrap
```

每个字段都经过校验并带默认值；`cpuSeconds`、`addressSpaceBytes` 与 `maxWallMs` 为正有限数，`maxWallMs` 还额外不超过 `MAX_TIMER_DELAY_MS`（Node 的 `setTimeout` 钳位值），`maxLogBytes` 与 `maxValueBytes` 为不小于四字节的安全整数，`pythonPath` 为字符串，此外没有其他可调项。

## 设计

- **每次运行一个全新 CPython 进程，无池化** —— 程序的世界随其子进程一同消亡：无可记录的跨运行状态，状态串扰不可表示，运行可仅凭会话日志重建。
- **fd-3 JSON-lines 线协议，而非 stdout** —— Node 用 `stdio: ['pipe','pipe','pipe','pipe']` 按位置固定通道；Python bootstrap 读取协议包拥有的同一个 `PROTOCOL_FD` 常量，把 stdout/stderr 留给程序自身输出（由宿主作为杂散日志捕获）。JSON-lines 分帧。
- **宿主将每个入站帧视为恶意** —— 模型代码可完全访问 fd 3 并能投递任意内容，因此 `validateChildFrame` 在宿主读取前对每帧做形状校验并重建（伪造的额外字段无法搭车，非数字 call id 永远不会被回显进回复，垃圾帧归约为 `undefined` 而非在宿主消息处理器中抛出），`createCappedLineReader` 在 `JSON.parse` 运行前整体丢弃 UTF-8 字节长度超过帧上限的行，`hasUnsafeIntegerToken` 拒绝超出安全范围的整数 token，`hasNonLosslessNumber` 拒绝无界 `call.args` 中的非有限或负零数字。Python 侧信任宿主回复（宿主不受模型控制）。
- **两个相互独立的预算，因为对端是恶意的** —— `maxLogBytes` 计量共享的捕获日志字节账本（宿主 + 子进程账本，`logs` 数组的 JSON 序列化），`maxValueBytes` 单独计量序列化完成值。二者独立：完成值只对 `maxValueBytes` 做检查，而非对日志预算的剩余量。宿主通过 `checkDoneValue` 对完成值按 `maxValueBytes` 复查；bootstrap 以 `_check_value_bytes(result, max_value_bytes)` 对应，使一个中等规模的 DataFrame 摘要（如 5 MiB）能在文档所述的 64 MiB 值预算下完成，而非在 1 MiB 日志预算处失败。合并溢出为 `output-limit`；有损完成值（非有限浮点、bytes、非字符串键）为 `invalid-output`。共享的 `[dsh-code-runtime-python] log capture truncated at <maxLogBytes> bytes` 标记在两侧字节相同，因此无论上限如何触发，截断的日志运行读起来都一样。
- **Binding-only I/O 是首要遏制层** —— 子进程以 `env: {}` 启动：无环境凭证或 harness 密钥能到达模型代码。绑定以无损 JSON 经 fd 3 传递；宿主只将绑定名解析为自有属性（伪造的 `constructor` 无法沿原型链遍历），每个 call id 至多应答一次，并校验每个绑定解析为无损 JSON。可选的命名空间描述符指明错误构造器的全局名与接收失败成员名的自有属性；Python 侧物化并注入该真实类，使 `instanceof` 无需硬编码 `tools` 或 `ToolCallError` 即可工作。无效或冲突的全局名声明在进程启动前即失败。
- **资源限制是仅 POSIX 的资源保护，而非安全边界** —— `RLIMIT_CPU`（`cpuSeconds`）与 `RLIMIT_AS`（`addressSpaceBytes`）由 bootstrap 在模型代码运行前施加；在 Windows 上 `_apply_rlimits` 为空操作。`isolation` 在非 Windows 下报告 `process-rlimit`，在 Windows 下报告 `process`。
- **挂钟时间上限兜底忙碌时间** —— `maxWallMs` 是硬性 `setTimeout`，到期时以 `SIGKILL` 杀死子进程，结束热的同步循环；`RLIMIT_CPU` 额外限制 CPU 秒数。超时表现为 `kind: 'timeout'`；永不解析的绑定 await 由挂钟时钟而非 CPU 时间捕获。
- **程序命名空间中提供 pandas 与 numpy** —— bootstrap 在可用时将 `pandas`（以 `pd`/`pandas`）与 `numpy`（以 `np`/`numpy`）导入程序全局，并安装一个 `print` 垫片，将每条记录急切地流入日志账本（使被超时或杀死的程序仍能显示其打印内容）。
- **销毁至静默** —— teardown 置 disposed，将每个活跃运行结算为 `abort`，并在解析前等待子进程真正死亡（`close`/`error`），使运行 Promise 不在基底可能仍在死亡期间结算。

## 失败类型

`CodeRunResult.error.kind` 取值为：`worker-exit`（spawn 错误或进程在 `done` 前退出）、`timeout`（挂钟上限）、`abort`（调用方信号或运行时销毁）、`output-limit`（完成值超过 `maxValueBytes`）、`exception`（程序或绑定错误回溯，或 bootstrap 崩溃）、`invalid-output`（完成值非无损 JSON）。

## Model Experience

此沙箱化执行器对模型、token 或 KV 缓存无直接影响：它产生一个 `CodeRunResult`（`{ value, logs, error? }`），从不触及请求前缀、token 流或缓存本身。其效果是间接的，经由 [`dsh-tools`](../../core/tools/README.md) 中的 Code Mode，后者在完成值放得下时渲染本后端的精确完成值（或显式的 `invalid-output` / `output-limit` 失败），加上精确的 `[dsh-code-runtime-python] log capture truncated at <maxLogBytes> bytes` 日志标记，写入一个保留的 `run_code` 结果。只有外层 `run_code` 结果进入模型上下文及其常规溢出策略；绑定流量与中间值保持执行局部。

#### KV Cache effect

无直接失效；具名消费者负责任何请求前缀变更。

## Known Limitations and Deferred Work

- **`RLIMIT_AS` 仅限 Linux，macOS 忽略 `addressSpaceBytes`** —— `setrlimit(RLIMIT_AS, …)` 在 macOS 上为空操作，故地址空间上限仅在 Linux 上强制；在 macOS 上，失控程序由 `RLIMIT_CPU` 与挂钟时钟而非地址空间约束。
- **win32 隔离退化为普通 `process`，无 rlimit** —— 在 Windows 上 `_apply_rlimits` 提前返回且 `isolation` 报告 `process`；无 CPU 秒数或地址空间上限，只有挂钟时钟与 binding-only 的 `env: {}` 遏制。
- **每次运行的 CPython 进程启动开销** —— 每次运行启动一个全新解释器（无池化），故每次运行都付出解释器启动开销；这是零跨运行状态的代价，属有意为之。
- **当解释器不在 OS 默认搜索路径时，`pythonPath` 应为绝对路径** —— 子进程以 `env: {}` 启动，故 `PATH` 未设置，裸 `python3` 只能通过 OS 默认 execvp 搜索路径解析；在解释器仅位于 `/opt/homebrew/bin` 或 `/usr/local/bin` 之下的主机上，将 `pythonPath` 设为绝对路径。解析失败在首次运行时表现为 `worker-exit` 的 'spawn error'，而非在加载时。
- **日志与值预算相互独立，但值的字节从不进入日志账本** —— 中间绑定解析无字节上限（程序可用一个永不成为外层输出的值耗尽进程内存）；`maxValueBytes` 上限是完成值的拒绝边界，而非可恢复存储，故 `output-limit` 之后外层溢出只能保存有界日志与诊断。

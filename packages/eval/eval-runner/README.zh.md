# @deepseek-ai/dsh-eval-runner

[English](README.md) | 中文

Eval 证据引擎：面向 data-agent evaluation harness 的批量执行器，支持严格 pass^k、case/reference-SQL 预检、类型化基础设施重试、可重放 execution artifact、兼容性校验后的 run 配置、结果持久化、前后差异对比与健康门禁。

候选 Agent 运行前，每个通过结构解析的 case 都会检查评分内容。有 executor 时会执行已解析的 reference SQL：环境失败归 `infra_failure`，reference SQL 无效或结果与已声明 expected 不一致归 `case_defect`，两者都不进入模型错误分母。每个 `CaseVerdict` 都携带对应 preflight evidence，以及离线重评分需要的 source path、schema version、scope、expected 字段、metadata 和 resolved reference SQL。基础设施重试只作用于一次模型响应之后的 SQL execution，因此一个 `pass_k` attempt 不会静默变成多次模型采样。

## 模型体验

无。该 eval runner 与模型无关，所有模型调用均委托给注入的 responder 与 judge。

#### KV Cache 效果

该包不注册任何面向模型的内容，因此不延伸或失效任何 KV-cache 前缀。

## 已知限制与待办工作

- 仅 `pass_k` 判定语义：此处无 best-of-k 回退。
- 健康门禁仅在运行前执行；运行中无重新检查。
- 基础设施重试受 run 选项 `max_infra_retries` 约束；抛出的基础设施错误和返回的类型化可重试 outcome 共用该上限。
- 持久化 artifact 因行数上限缺少 comparator 所需数据时，离线重评分返回 `not-measured`；Provider 未物化完整结果时返回 `environment-blocked`。

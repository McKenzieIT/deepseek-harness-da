# Durable trace cut 与 replay 语义：一手基础研究

日期：2026-09-11

## 结论先行

一手来源支持把正式评分建立在持久化、可寻址的 evidence cut 上，但不支持把“有一份 trace”直接等同于“可以重现原执行”。Temporal 的 replay 从持久化 Event History 重建确定性的 Workflow 状态，已完成 Activity 不会在 replay 中重新执行；Flink 的 checkpoint 只在 source、state 和 sink 都参与对应协议时提供端到端保证；OpenTelemetry 明确允许 sampling、span/event/link 丢弃、队列溢出和部分接收；OCI 与 in-toto 只对 digest 实际覆盖的 immutable bytes 建立身份。因此，持久化事件最多支持其记录范围内的 projection rebuild、审计和 rescore。重新调用模型、重新执行 query/pipeline，或声称外部世界与原运行相同，都需要新的运行或冻结的 Environment、Context、artifact 和 Provider 状态。

对 DSH 的直接约束是：`SessionEvidenceCut` 必须绑定一个已经通过 `SessionStore.flush()` 进入持久化后端、随后从同一稳定 revision 读取并按明确 canonical encoding 计算 digest 的完整 session-log prefix；`EvaluationEvidenceCut` 必须独立绑定 Environment completion、artifact descriptors、Observer evidence 和 measurement inputs。OpenTelemetry 只能作为导出投影，不能作为正式 cut 的唯一存储。两份 cut 与 `GradingMaterialRef`、`ResolvedGradingPlan` 共同形成 rescore 输入；model rerun 和 Environment re-execution 必须生成新的 attempt identity。

## 范围与方法

本文只研究与 DSH 当前问题直接相关的事件历史、workflow replay、checkpoint、observability export、content-addressed manifest 和 existing-log rescoring。来源限于官方规范、官方文档和官方仓库，并固定到 2026-09-11 核验的提交；Flink 与 RFC 链接使用该日可访问的官方发布页。

本文把“来源事实”和“DSH 建议”分开。外部系统证明一种语义或实现模式存在，不自动决定 DSH 的接口。

## 一手来源事实

### Temporal：replay 重建 Workflow 状态，不重新执行已完成的外部工作

Temporal 将 Event History 定义为 Workflow Execution 生命周期的完整持久日志。Workflow 发出的 Command 由 Temporal Service 转换为持久化 Event；Worker 崩溃后，Workflow code 读取历史并恢复到失败前的状态。[Temporal Event History][temporal-event-history]

Temporal 对 Workflow logic 施加 deterministic execution 约束，并要求 Workflow 通过 SDK API 与 Workflow 外部的应用代码交互。[Temporal TypeScript workflow basics][temporal-workflow-basics] 官方 replay 文档进一步说明：replay 从 Event History 开始重建 Workflow state，只有当新的 Workflow Definition 与历史保持确定性兼容时才成功；不兼容会报错。[Temporal replay testing][temporal-replay]

Activity 代表容易失败并可重试的外部业务逻辑。Temporal 明确指出，已经完成的 Activity 不会在 Workflow Replay 中重新执行；Activity 只有在返回结果或错误后才写入 Event History，未向 server 报告的执行可能被重试，因此 Activity 应设计为幂等。[Temporal Activity idempotency][temporal-activity]

这些事实允许作出的结论是：当影响 Workflow 决策的外部结果已经以 history event 固定下来时，replay 可以重建 Workflow 的确定性状态，并检查代码与旧历史是否兼容。它不重新访问当时的数据库、文件、网络或服务，也不证明这些外部资源今天仍然相同。Activity retry 甚至可能在 history 记录结果前重复产生外部 side effect。

### Flink：checkpoint 的保证取决于 source 和 sink 是否参与

Flink checkpoint 保存 managed state 和对应 stream positions，并要求 durable source 能重放数据、durable storage 能保存 state。[Flink checkpointing][flink-checkpointing] Flink 的官方 connector guarantee 页面明确区分内部 state consistency 与端到端 delivery：source 必须参与 snapshotting 才能提供 exactly-once state update；sink 必须参与 checkpointing，端到端 exactly-once 才成立。[Flink connector guarantees][flink-guarantees]

因此，一个内部 checkpoint 或 durable event-log cut 不能单独证明外部 output 已经 exactly once 地提交，也不能证明 external source 仍可从同一位置重放。对 DSH 而言，Session cut 只能证明 session facts 已持久化；query、pipeline、object store、model artifact 或外部 job 的 finality 和 snapshot identity 必须由 Evaluation Environment 与具体 Provider evidence 另行证明。

### OpenTelemetry：trace export 允许缺失，`ForceFlush` 不是 durable cut

OpenTelemetry Trace SDK 的 sampling 模型允许 span 不记录或不导出：`IsRecording=false` 时 attributes、events 和 status 等 tracing data 被丢弃，未设置 `Sampled` 的 span 通常不会交给 exporter。[OpenTelemetry sampling][otel-sampling] SDK 还允许超过配置上限的 span events 和 links 被丢弃；BatchSpanProcessor 队列达到 `maxQueueSize` 后会丢弃 span。[OpenTelemetry span limits][otel-limits] [OpenTelemetry batch processor][otel-batch]

`TracerProvider.ForceFlush()` 要求调用所有 registered SpanProcessor 的 `ForceFlush()`，但 operation 可以失败或超时。[OpenTelemetry provider ForceFlush][otel-provider-flush] SpanProcessor 的 flush 在超时存在时可以跳过或中止 export；Exporter 的 flush 只是要求此前收到的 spans 尽快完成 export。[OpenTelemetry processor ForceFlush][otel-processor-flush] [OpenTelemetry exporter ForceFlush][otel-exporter-flush]

OTLP 接收方可以只接受部分 spans，并在 response 中报告 rejected count；完整接收和部分接收都属于协议允许的结果。[OTLP partial success][otlp-partial]

所以一份 OTel trace 不能在没有额外 capture policy、drop counters、export acknowledgement 和 backend-retention evidence 时声称完整。即使 `ForceFlush()` 成功，它证明的也是 SDK/exporter 定义下的 drain/export 结果，不是 DSH session backend 的 append-only durability，也不是 collector 后端已经形成不可变、可按 digest 读取的 cut。

### Content-addressed manifest：digest 只绑定被引用的 bytes

OCI Descriptor 使用 `mediaType`、`digest` 和 `size` 描述 content。消费者应独立计算 digest 验证内容，size 不匹配时不应信任内容；digest 由 collision-resistant hash 对 bytes 计算，是 content identifier。[OCI descriptor properties][oci-descriptor-properties] [OCI digest verification][oci-digest]

OCI Image Manifest 通过 descriptor 引用 config 和 layers，并允许以 subject descriptor 关联另一份 manifest。[OCI manifest][oci-manifest] in-toto Statement 同样要求每个 subject 带 digest，并假设 subject artifact immutable；它还警告 subject 匹配只看 digest，不自动检查 content type。[in-toto Statement][in-toto-statement]

这些规范支持用一个 root manifest 绑定多个 evidence artifact，但保证只覆盖 manifest 实际引用且能按 digest 取回的 bytes。数据库 endpoint、mutable path、对象名、URL、table name 或时间戳标签如果没有对应 immutable snapshot descriptor，就不在 digest 的保证范围内。`mediaType`、schema version 和 canonicalization algorithm 仍需显式记录，否则相同 bytes 的解释可能不同。

JSON object 在计算结构性 digest 前需要确定的 serialization。RFC 8785 定义了 JSON Canonicalization Scheme，通过受限 JSON、确定性 primitive serialization 和 property sorting 产生可 hash 的一致表示。[RFC 8785][rfc8785]

### Inspect AI：existing-log rescoring 与重新运行 solver 是不同操作

Inspect AI 的 `score(log, scorers, ...)` API 接收既有 `EvalLog` 和新的 scorer，并返回带新 scores 的 log；可选 scoring model 从 log header 重建或由 caller 覆盖。[Inspect score API][inspect-score-api] 这是一种 rescore：它读取已经记录的 samples/transcripts，并不重新执行原 solver 或原 Environment。

Inspect 日志有明确 status；官方文档要求分析结果前检查 `status == "success"`，并指出默认 sample reader 会拒绝 incomplete log，因为无法读取全部 samples。[Inspect eval-log status][inspect-log-status] Inspect 也允许减少 model API logging、对 media 使用 attachment 或保留 unresolved runtime reference，说明“有 eval log”仍不等于它包含所有原始 API bytes 或所有外部资源。[Inspect logging controls][inspect-log-controls]

Inspect 的实现证明 existing-log rescoring 是可行的一等操作，但也说明 scorer 是否可运行取决于 log 保存了 scorer 所需的数据。若新的 scorer 还需要调用 judge model，这个 judge call 是新的 grading execution，必须记录新的 grader/model identity；它仍不是 subject rerun。

## 什么可以从 persisted events 声称

| 操作或结论 | 仅靠完整 persisted event cut | 还需要什么 |
| --- | --- | --- |
| 重建 session surface、messages 和纯 projection | 可以，前提是 fold implementation 与 format version 兼容 | projection code/version；未知 required event 必须拒绝 |
| 检查新 projection 或 workflow code 能否 deterministic replay | 可以 | 固定 code identity；不得执行未记录的外部操作 |
| 使用新 comparator/rubric rescore | 可以，前提是 cut 已含 scorer 所需 observation/artifact | 新 `ResolvedGradingPlan`、grader/model identity、private material |
| 重算 aggregate、CI、`pass@n` | 可以，前提是 raw observations 与 replicate identity 完整 | estimand、aggregation spec、inclusion/exclusion policy |
| 重新生成相同模型回答 | 不可以 | 新 model execution；即使配置相同也产生新 attempt |
| 重新执行 query、pipeline、notebook | 不可以 | frozen Environment/Context/input snapshots 与新的 execution evidence |
| 声称外部世界与原运行相同 | 不可以 | content-addressed artifacts 或 Provider-specific immutable snapshot receipts |
| 声称 attempt 已 final、isolated、clean | 不可以，仅 Session Log 不足 | `EvaluationEvidenceCut` 中的 finality、separation、cleanup receipts |
| 声称 OTel trace 无缺失 | 不可以 | capture policy、sampling/drop/limit evidence、export/retention acknowledgement；正式 DSH cut 仍应来自 durable stores |

## DSH 当前事实

### Session 的内存提交和持久化提交是两个边界

`Session.append()` 将 JSON-safe event 接受进 append-only in-memory log 后立即视为 committed；hot path 不等待 I/O，persistence plugin 异步缓冲。[`Session.append()`](../../../packages/core/session/src/index.ts) `L568-L601`。`session/event` 也是 post-commit、fire-and-forget observer feed，observer failure 不回滚 event。[session event contract](../../../packages/core/session/src/index.ts) `L57-L72`。

`SessionStore.flush()` 是唯一公开 durability checkpoint。它等待所有 scoped `session/flush` listeners，任一 listener 失败则拒绝，并通过 boolean 表明是否至少有一个 durability listener 参与。[`SessionStore.flush()`](../../../packages/core/session/src/index.ts) `L1008-L1037`。Persistence coordinator 的 listener 会 drain 当前 write-behind queue。[persistence flush](../../../packages/session/session-persistence/src/coordinator.ts) `L1326-L1337`。

因此，`session.events` 的 immutable snapshot 是内存一致性 cut，不是 durable cut；`flush()` 返回 `false` 也不能产生正式 `SessionEvidenceCut`。

### Persistence revision 是 change token，不是 content digest

`SessionPersistenceRevision` 是 backend-owned、source-qualified opaque revision。[persistence revision](../../../packages/session/session-persistence/src/revision.ts) `L1-L17`。JSONL provider 用 stat-derived revision，并在读取前后 revision 相同时才接受 bytes，避免并发 append 产生 torn read。[JSONL stable read](../../../packages/session/session-persistence-jsonl/src/index.ts) `L284-L303`。SQLite provider 在 append transaction 中更新 per-session revision。[SQLite persistence](../../../packages/session/session-persistence-sqlite/README.md) `L17-L19`。

这类 revision 适合检测“存储是否变化”，但不能作为跨 backend、跨拷贝或长期审计的 cryptographic content identity。正式 cut 需要在稳定 logical prefix 上另算 content digest，并保留 backend revision 作为 capture-race 和 provenance evidence。

### DSH 的 OTel telemetry 已经不是 durability listener

`session-telemetry-otel` 明确不实现 optional `flush()`；其 shutdown 负责 SDK drain，但超时后仍可能丢失 tail records。[OTel telemetry provider](../../../packages/session/session-telemetry-otel/src/index.ts) `L265-L281`。这与 OTel 规范的 sampling、queue、timeout 和 partial-success限制一致，进一步支持把 telemetry 视为可查询投影，而不是 session/evaluation canonical store。

## 对 `SessionEvidenceCut` 的约束

以下是基于来源事实的 DSH 设计建议，不是外部规范原文。

1. `SessionEvidenceCut` 绑定从 seq `0` 到 `lastSeq` 的完整 logical prefix，不绑定一个可能缺少前文的随意 suffix。大日志可以分片，但 root manifest 必须覆盖全部 shard 及其顺序。
2. Capture 前必须停止给 Agent 新输入并等待 session-owned work quiescent；否则一次成功 flush 后仍可能 append 新 event，cut 的完成条件不清楚。
3. 必须调用 `SessionStore.flush(session)`，并要求返回 `true`。失败或没有 durability listener 时，attempt 只能是 incomplete/invalid。
4. Flush 后必须从 persistence backend 的稳定 read boundary 读取 logical events，不能直接 hash `session.events`。新 cut API 应在同一个 backend operation 中返回 events 与 revision，避免 `listSnapshots()` 后再 `inspect()` 的 TOCTOU race。
5. Digest 输入应包含 canonical header、`SESSION_FORMAT_VERSION`、完整 ordered events、`lastSeq` 和 canonicalization identifier。建议对 DSH 已验证的 lossless JSON value 使用一份冻结的 canonical encoder；若采用 RFC 8785，必须验证 DSH number/string rules 与 JCS 前提完全一致后再声明兼容。
6. Cut 同时保存 cryptographic `contentDigest` 和 opaque `persistenceRevision`：前者证明内容，后者证明采集时观察到哪个 backend revision。二者职责不同。
7. Physical raw artifact digest 与 logical event digest应分开。JSONL、compressed JSONL 和 SQLite 可以表达相同 logical log；正式 rescore 通常依赖 logical digest，forensics 可额外保留 physical artifact descriptor。
8. Cut 必须记录 persistence provider identity、schema/format version、event count 和 supported-event reader identity。未来 build 如果遇到 unknown required event，应按现有 session version机制拒绝，不得静默忽略。

建议的最小语义如下；字段名不是本票对 TypeScript API 的最终裁定：

```text
SessionEvidenceCut
├── sessionId
├── headerDigest
├── sessionFormatVersion
├── firstSeq = 0
├── lastSeq
├── eventCount
├── logicalMediaType
├── canonicalization
├── contentDigest
├── persistenceProviderIdentity
└── persistenceRevision
```

## 对 `EvaluationEvidenceCut` 的约束

`EvaluationEvidenceCut` 与 Session cut 分开，因为很多评测事实不应进入模型可见或 resume 所需的 session log。

1. Cut 必须引用 `SessionEvidenceCut`，而不是复制一份 evaluator-owned transcript。
2. Cut 应以 content-addressed root manifest 引用 Observer evidence、Environment completion、artifact descriptors、metric observations和任何 component evidence。每个 descriptor至少包含 media type、schema version、size和digest。
3. Mutable external references 不能单独支撑 replay/rescore。URL、path、table、dataset name、job id 或 model registry tag 必须配 immutable version/digest/snapshot receipt；无法冻结的资源明确标为 external-observational，并限制可作出的结论。
4. Environment finality 与 session durability 是不同 barrier。Agent/session 结束不证明 query、pipeline、stream job、file flush 或 remote write 已 final；`EvaluationEvidenceCut` 只有在 Environment Service 给出 `final` 或明确的 `unresolved` completion 后才能封闭。
5. Evaluation evidence store 需要自己的 awaited durability barrier。OTel export success、event callback完成或内存 queue 为空都不能替代该 barrier。
6. Manifest digest只证明 manifest及其引用内容。它不能自动证明未引用的 external state、secret、Provider config 或 code tree；这些必须作为 content-addressed descriptor、resolved identity 或 assurance receipt进入 manifest。
7. Grading output 不应回写并改变输入 cut。Grade result形成新的 immutable artifact，引用 input cut digest、`ResolvedGradingPlan` digest、grader identity和private material digest/opaque reference。
8. Cleanup receipt可以在 grade computation之后形成，但正式 independent-trial measurement只有在 cleanup/separation policy满足后才可发布。保留不可发布的 grade evidence有助于诊断，不应把 cleanup failure归因为模型错误。

建议的 root 关系如下：

```text
EvaluationEvidenceCut
├── subjectIdentity
├── runIdentity
├── attemptIdentity
├── sessionCutDescriptor?        # product-composition subject
├── componentCutDescriptor?      # component subject
├── observerEvidenceDescriptors
├── environmentCompletionDescriptor
├── artifactDescriptors
├── rawMeasurementDescriptors
├── manifestMediaType
├── manifestSchemaVersion
└── manifestDigest
```

## Operation 术语约束

研究支持在 G10 中固定以下语义，避免把所有后处理都称为 replay：

| Operation | 是否调用 subject model | 是否执行外部 action | 输入 identity | 产物 |
| --- | ---: | ---: | --- | --- |
| `reproject` | 否 | 否 | 同一 persisted cut + 新 projection identity | 新 derived projection |
| `rescore` | 否；grader 可另调 judge model | 否 | 同一 cut + 新 grading plan/grader identity | 新 grade artifact |
| `workflow-replay` | 否 | 否 | recorded history + deterministic-compatible workflow code | reconstructed state/compatibility result |
| `model-rerun` | 是 | 可能 | 同一或新 task/run plan | 新 attempt 与新 cuts |
| `environment-reexecution` | 取决于 subject | 是 | frozen or newly resolved Environment plan | 新 attempt 与新 Environment evidence |
| `trace-export` | 否 | 否 | 已有 canonical cut | OTel/analytics projection，不是新 canonical truth |

若 rescore 使用 LLM judge，它仍然是 rescore，因为被测 subject 没有重跑；但 judge request、response、model revision、sampling和failure必须成为新的 grading evidence，不能假装为纯函数。

## 推荐的 authoritative cut 流程

来源共同支持的最小流程是：

```text
freeze subject input
→ wait for Agent-owned work to quiesce
→ request Environment finality or record unresolved
→ SessionStore.flush() and require a durability participant
→ atomically/stably capture persisted session prefix + revision
→ flush Evaluation Evidence Store
→ capture evaluation manifest + referenced artifact digests
→ verify every descriptor
→ freeze SessionEvidenceCut and EvaluationEvidenceCut
→ grade/rescore from the frozen cuts
→ cleanup and decide whether the measurement is publishable
```

“authoritative”只表示这些 bytes 和 identities是本次评分的固定输入，不表示外部 Environment 可以由 trace 单独重建。Re-execution equivalence需要 Benchmark 声明所需 external snapshots，并由 Environment assurance证明它们被满足。

## 对 Question 14 的研究回答

研究支持以下收敛表述：

> 正式 grade 必须引用已经持久化并以 digest 封闭的 evidence cut；live trace 只能产生 provisional diagnostics。该规则保证评分输入可审计和可 rescore，但不赋予 trace 其未记录的外部世界状态。任何 model rerun 或 Environment re-execution 都产生新的 attempt，而不是对旧 cut 的 replay。

需要避免更强但没有来源支持的说法：

- 不能声称一个 Session cut 足以完整重放 data-agent 的外部执行。
- 不能声称 `flush()` 本身产生 cryptographic snapshot；它只是 durability barrier，仍需 stable read 与 digest。
- 不能声称 OTel `ForceFlush()` 形成完整 trace 或 durable evidence cut。
- 不能声称相同 task、seed、model name 和 config 可以复现相同 LLM output。
- 不能声称 manifest digest覆盖没有被 descriptor引用的数据库、文件、Context或Provider状态。

## 来源缺口与后续决策

一手来源没有替 DSH 决定 logical event canonicalization、Evaluation Evidence Store API、Artifact Store、Environment receipt schema 或 publishability policy。这些仍由 G10/package-topology和后续实现票裁定。

在进入实现前还需回答：是否新建原子 `captureSessionCut()` persistence method；Evaluation evidence manifest采用单文件还是分片 Merkle manifest；哪些 artifact允许只记录 Provider snapshot receipt；grader output和cleanup receipt如何组成最终 publication record。这些问题不改变本文的核心结论：正式评分输入必须持久化并可按 digest验证，外部 re-execution能力必须由 cut之外的冻结状态与assurance证明。

[temporal-event-history]: https://github.com/temporalio/documentation/blob/01c99ad49289ccd45519f113dcd05b5f6503a331/docs/encyclopedia/event-history/event-history.mdx#L13-L17
[temporal-workflow-basics]: https://github.com/temporalio/documentation/blob/01c99ad49289ccd45519f113dcd05b5f6503a331/docs/develop/typescript/workflows/basics.mdx#L115-L128
[temporal-replay]: https://github.com/temporalio/documentation/blob/01c99ad49289ccd45519f113dcd05b5f6503a331/docs/develop/java/best-practices/testing-suite.mdx#L694-L751
[temporal-activity]: https://github.com/temporalio/documentation/blob/01c99ad49289ccd45519f113dcd05b5f6503a331/docs/encyclopedia/activities/activity-definition.mdx#L183-L217
[flink-checkpointing]: https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/dev/datastream/fault-tolerance/checkpointing/
[flink-guarantees]: https://nightlies.apache.org/flink/flink-docs-release-2.3/docs/connectors/datastream/guarantees/
[otel-sampling]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L300-L331
[otel-limits]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L844-L888
[otel-batch]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L1095-L1130
[otel-provider-flush]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L176-L188
[otel-processor-flush]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L1050-L1074
[otel-exporter-flush]: https://github.com/open-telemetry/opentelemetry-specification/blob/21d378b078ac09df61d568a0ba563fc2d08fa8c5/specification/trace/sdk.md#L1214-L1230
[otlp-partial]: https://github.com/open-telemetry/opentelemetry-proto/blob/09f8394ecb171e889029fcd0036a3ab856c9b801/opentelemetry/proto/collector/trace/v1/trace_service.proto#L43-L67
[oci-descriptor-properties]: https://github.com/opencontainers/image-spec/blob/af26a05fba5ee648512f4ea3c9fda1fcc1b6d6dc/descriptor.md#L19-L55
[oci-digest]: https://github.com/opencontainers/image-spec/blob/af26a05fba5ee648512f4ea3c9fda1fcc1b6d6dc/descriptor.md#L69-L139
[oci-manifest]: https://github.com/opencontainers/image-spec/blob/af26a05fba5ee648512f4ea3c9fda1fcc1b6d6dc/manifest.md#L1-L103
[in-toto-statement]: https://github.com/in-toto/attestation/blob/2dcd055e9f72e746687c306e35f4e59720ff45be/spec/v1/statement.md#L34-L55
[rfc8785]: https://www.rfc-editor.org/info/rfc8785/
[inspect-score-api]: https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/src/inspect_ai/_eval/score.py#L81-L114
[inspect-log-status]: https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L189-L205
[inspect-log-controls]: https://github.com/UKGovernmentBEIS/inspect_ai/blob/52b30883d1bf11a183fa82640429728595ea8d6f/docs/eval-logs.qmd#L138-L176

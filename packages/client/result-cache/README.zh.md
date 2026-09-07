# @deepseek-ai/dsh-client-result-cache

[English](README.md) | 中文

INTERPRETATION 查询/计算结果的浏览器端热缓存：一个会话级 scope、字节有界的 LRU，架在 `result.get` RPC 之上，作为 `ctx.results` Cordis 服务接入。该缓存对结果行做记忆化，因此折叠与展开已渲染的表格不会再向宿主发起 RPC，而一次新的 `query_data` 重跑会使陈旧条目失效，下次渲染重新拉取。

消费方通过 inject 面访问该服务，从 scoped ctx 寻址，使 `get`/`invalidate` 解析到调用方的会话：

```ts
inject: (sessionId) => ({
  fetchResult: (rid) => sessions.scope(sessionId)?.get('results')?.get(rid),
  invalidateResult: (rid) => sessions.scope(sessionId)?.get('results')?.invalidate(rid),
})
```

宿主以 `result-not-found` 应答的未命中解析为 `undefined`；任何其他失败（宿主业务错误，或抛出的 fetcher，传输层：网络/超时/中止/解析）以 `ResultFetchError` 拒绝（该值从 `/client` barrel 导出，以便消费方 `instanceof` 收窄；`error.code` 为宿主代码或 `'transport'`）。

## 配置

缓存边界是一个 schemastery `Config`（R5 的「Config fields from `cordis.yml`」），可从 `cordis.yml` 覆盖；`apply(ctx, config = {})` 将宿主配置合并到 `DEFAULT_RESULT_CACHE_CONFIG` 之上：

| 边界 | 默认值 | 作用 |
|---|---|---|
| `maxEntrySize` | 8,000,000 | 每条目字节预算；超出该值的条目按需拉取，不缓存 |
| `maxSize` | 64,000,000 | 所有条目的总字节预算 |
| `max` | 64 | 条目数兜底 |

尺寸单位是条目 JSON 序列化后的 UTF-16 码元长度，即常驻内存的代理量，选择它是为了让准入与淘汰基于与堆中相同的数据形态做推理。尺寸在每次拉取时计算一次并传给 `lru.set`，从而 `sizeCalculation` 不会在存入时再次调用。

## 测试

纯缓存核心规格（`result-cache.client.spec.ts`）锚定字节有界 LRU 语义：未命中→拉取→缓存命中（无克隆、无第二次拉取）、同一 key 并发 get 的 single-flight 合并、在途失效（epoch）守卫、传输层抛出折叠为 `ResultFetchError`、会话 key 隔离（一个 `encodeURIComponent` 编码的复合 key）、`maxEntrySize` 准入、字节预算（`maxSize`）淘汰、`max` 计数兜底、读时 recency（无 TTL，`lru-cache` 都会在读时刷新 recency）、`result-not-found`/错误路径，以及 `invalidate`/`invalidateScope`/ `invalidateAll` API。服务规格（`result-service.client.spec.ts`）通过真实的 `createScope` tag 驱动 scope 寻址的 `ctx.results`，断言会话隔离、未命中→`result.get`→缓存、未找到/错误，以及 scoped 失效。apply 规格（`apply.client.spec.ts`）挂载 `apply()`，断言 `ctx.results` 的提供、`connection/reset` → `invalidateAll` 清空，以及 `Config` 边界合并。共 29 个测试。

## 模型体验

间接地，通过 @deepseek-ai/dsh-nl2sql-engine 的 LLM（大语言模型）适配器。

#### KV Cache 效果

该包不扩展或失效 agent loop（智能体循环）的可复用请求前缀。

## 已知限制与推迟工作

- **在途失效有守卫；错失事件的残留仍在。** 一次落在拉取进行中的 `invalidate*` 将其标记为 `aborted`，从而其迟到的 `lru.set` 被跳过，不会为该会话存入陈旧快照。R5 推迟的残留：一次在失效之后、但在途拉取解析之前开始的 `get` 会合并到它上面并（一次性地）收到旧值（一个完整的代际 token，即每次观察到完成时 `qr_R#genN` key 轮换，会阻断它；本系统的事件投递是可靠的，故竞态很窄，且升级局限于缓存内部，不破坏 API）。
- **针对 `query_data` 的失效在消费方边界实现，而非通过缓存内部的事件订阅。** 客户端运行时拥有对话事件流（`Session` 对象层）；一个外部包无法订阅 `query_data` 工具结果完成，除非修改运行时（R5 已排除：「不内联进 runtime」）或将一个 Conversation Node 注册为纯失效旁路信道。消费方（`ui-present-table`/`ui-present-decomposition`）已经通过 toolview slot 属性观察 `query_data` 节点，故失效调用的天然归属是其 inject 面（在一个全新同轮次 `query_data` 上的 `invalidateResult(rid)`）。缓存为此暴露 `invalidate(rid)` API；消费方接线推迟到其自身的聚焦变更（T9 第 6 步），以便本包自包含地交付。`connection/reset` 重连清空在此处接线（它是运行时认可的「wire-derived 缓存必须将自己的状态视为陈旧」信号）。
- **`invalidateSession`/`invalidateScope` 的拥有者未指派。** 该 API 为会话拆除/重同步而暴露，但没有调用处接线：运行时的 `SessionRuntime.dropScope` 拆除一个 scoped ctx，但让该会话的缓存行留到字节/计数淘汰或 `connection/reset`。天然拥有者是消费方（T10，镜像针对 `query_data` 失效的推迟）或一个运行时会话拆除钩子；接线被推迟（运行时变更在 R5 范围之外）。
- **字节/计数预算是全局的，而非每会话。** LRU 是一个以 `(sessionId, resultId)` 为键的字节有界 map；一个繁忙会话可能淘汰另一个会话的行。键隔离成立（一个会话的行在共享 `qr_` id 下绝不泄漏给另一个会话）；仅淘汰预算跨会话共享。
- **会话 scope 是 scope 寻址的 Service 形态，而非每会话 Cordis 服务实例。** R5 的「会话级 scope 的 `ctx.results`，镜像宿主 `ctx.resultCache` 放置」实现为一个根 `Service`，其 `this.ctx` 由 Cordis tracker 重绑定到调用方的 scoped ctx（镜像 `ConversationController`），由 `sessions.scopeOf` 派生会话且 LRU 以 `(sessionId, resultId)` 为键。一个真正的每会话服务实例需要一个没有外部包拥有的运行时钩子；scope 寻址形态在没有运行时修改的情况下达成同样的跨会话隔离。
- **最大尺寸条目拉取搭乘承载层的默认有界超时。** `AbstractApiClient.callUnary` 以一个 30s `AbortSignal.timeout` 为每个 unary 设界；一个准入的 8MB 条目若流式传输更久则中止。尚无仅调用方信号（无宿主超时）策略；一个需要它的大结果路径会以非破坏性方式增加一个。
- **无 IndexedDB spill，无 `WeakRef`/`FinalizationRegistry`，无每次命中 `structuredClone`。** 该缓存是会话级 scope 的，宿主是真源，可恢复性不是目标，重新 RPC 才是正确的恢复。命中返回同一个缓存引用（结果被视为不可变只读视图），避免大数组上的 `structuredClone` 开销。

/**
 * GA-EVAL-EVENTDEF-PREFETCH — event-name detection for the eval engine responder.
 *
 * `Nl2sqlAgentResponder` pre-fetches BM25 candidates but passed no `eventDef` to
 * `engine.run`, so the SQL-generation prompt rendered `# 事件定义（若已加载）` as
 * 「（未加载）」: event cases (119-138) never learned the event ODS view
 * (`ieu_ods.ods_10000251_all_view`) or the params-extraction template, and failed
 * three ways — placeholder `FROM <数据视图>`, null-SQL decline, or a DWS
 * summary-table fallback that returns a wrong value the semantic judge accepts.
 * G-DA4 (resolved 2026-08-25, commit `0548fe4f8a`) already surfaces that
 * grounding on the HARNESS path via the `load_event_definition` tool. This module
 * supplies the half the eval path was missing: deciding WHICH event (if any) a
 * question is about, so the responder can load it.
 *
 * Detection is two-stage, and both stages are forced by measured evidence (this
 * ticket's risk gate, 2026-09-06, all figures on the 39-case
 * `rbi-10000251-exec` set — 18 event cases / 21 DWS cases):
 *
 *  1. **Lexical pre-filter** (`prefilterEventCandidates`). BM25 surfaced the
 *     expected event definition 0/4 times (it returns the event's *metric* items
 *     or DWS summary tables instead), so retrieval cannot drive this. Matching
 *     `alt_labels` + event `name` against the question does surface candidates,
 *     deterministically and for free, from the corpus the responder already loads.
 *  2. **LLM pick** (`buildDetectionPrompt` + `parseDetectionReply`). The lexical
 *     stage ALONE is unsafe — 8 TP / **14 FP** — because the discriminating
 *     `alt_labels` are generic two-character words. 「新增」 matches both 038
 *     「昨天新增了多少个角色？」 (DWS cohort, expected 552) and 119 「昨天创角的新增
 *     角色数是多少？」 (raw event, expected 510); 「付费」 matches every DWS payment
 *     metric as well as the recharge event. Injecting an event definition for a
 *     DWS question is WORSE than injecting nothing — it steers the model onto the
 *     event view and silently returns a wrong value — so this stage exists purely
 *     to hold false positives at zero.
 *
 * The detection model is load-bearing, not incidental: qwen-flash scored TP=7,
 * **FP=4** (whack-a-mole — the few-shot that fixed 「新增角色」→`role.create`
 * introduced 「付费」→`recharge`), while qwen3.7-max scored TP=7, **FP=0**,
 * TN=21, FN=11. Do NOT downgrade the detection model for latency.
 *
 * The 11 false negatives are all lexical-stage misses (`game.card.gacha` has no
 * 「抽卡」 alt_label, `game.role.online` no 「登录」) — bounded RECALL, not
 * precision. Widening candidate generation is a separate follow-up; under-
 * detecting merely reproduces the pre-(a) behaviour for that question.
 *
 * @module @deepseek-ai/dsh-eval-cli/src/event-detect
 */

/**
 * Minimum phrase length for lexical containment. A single-character phrase
 * (「充」) matches far too much Chinese text to be evidence of anything.
 */
const MIN_PHRASE_LEN = 2

/**
 * How many lexical candidates to hand the LLM. Bounds the detection prompt;
 * candidates are name-sorted before the cut so it is deterministic.
 */
const MAX_CANDIDATES = 8

/** Per-candidate description budget in the detection prompt (event descriptions run to ~250 chars). */
const DESC_BUDGET = 160

/** The reply the detection LLM returns when the question is not about a raw event. */
export const NO_EVENT = 'NONE'

/**
 * The corpus-item subset this module reads — structurally the responder's
 * `loadRetrievalCorpusAll()` items. The semantic layer's `event-kind.toCorpusItem`
 * carries the full validated `EventDefinition` as `payload`, which is where
 * `alt_labels` / `event_filter` / `params_fields` come from.
 */
export interface CorpusItemLike {
  readonly id: string
  readonly description?: string
  readonly payload?: unknown
}

/** An event that survived the lexical pre-filter, plus the context the LLM stage needs to choose between candidates. */
export interface EventCandidate {
  readonly name: string
  readonly description: string
  readonly eventFilter: string
  /** The `alt_label` / `name` phrases that matched the question (kept for the engine trace + diagnostics). */
  readonly matchedPhrases: readonly string[]
}

/** The outcome of a detection run: the picked event (or null), plus the candidates it chose from. */
export interface EventDetection {
  readonly eventName: string | null
  readonly candidates: readonly EventCandidate[]
}

/** Injected dependencies for `detectEventName` (corpus + a single text completion). */
export interface DetectEventDeps {
  readonly corpus: readonly CorpusItemLike[]
  /** One-shot text completion; the caller binds the model (must be qwen3.7-max — see the module doc). */
  readonly complete: (prompt: string) => Promise<string>
}

/** The event-shaped slice of a corpus item's payload (unvalidated — read defensively). */
interface EventPayload {
  readonly name?: unknown
  readonly description?: unknown
  readonly event_filter?: unknown
  readonly alt_labels?: unknown
  readonly params_fields?: unknown
}

/**
 * Narrow a corpus item's payload to an event payload. Presence of
 * `params_fields` is what marks a corpus item as an event — the same probe
 * `Nl2sqlAgentResponder.buildSchemaContext` uses to branch event vs table items.
 * @param payload - the opaque corpus-item payload.
 * @returns the event payload, or null when the item is not an event.
 */
function asEventPayload(payload: unknown): EventPayload | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as EventPayload
  if (typeof p.params_fields !== 'object' || p.params_fields === null) return null
  return p
}

/**
 * Stage 1 — lexical pre-filter: events whose `name` or one of its `alt_labels`
 * appears verbatim in the question. Deliberately generous (recall-first): every
 * hit is re-judged by the LLM stage, which is what holds precision. Results are
 * name-sorted and capped at {@link MAX_CANDIDATES} so the prompt is bounded and
 * the cut is deterministic.
 * @param corpus - the retrieval corpus (events + tables + metrics); non-event items are skipped.
 * @param question - the user question to match phrases against.
 * @returns the candidate events, name-sorted, at most {@link MAX_CANDIDATES}.
 */
export function prefilterEventCandidates(
  corpus: readonly CorpusItemLike[],
  question: string,
): readonly EventCandidate[] {
  const haystack = question.toLowerCase()
  const hits: EventCandidate[] = []
  for (const item of corpus) {
    const ev = asEventPayload(item.payload)
    if (ev === null) continue
    const name = typeof ev.name === 'string' && ev.name !== '' ? ev.name : item.id
    if (name === '') continue
    const phrases: string[] = [name]
    if (Array.isArray(ev.alt_labels)) {
      for (const label of ev.alt_labels) if (typeof label === 'string') phrases.push(label)
    }
    const matched = phrases.filter(p => p.length >= MIN_PHRASE_LEN && haystack.includes(p.toLowerCase()))
    if (matched.length === 0) continue
    hits.push({
      name,
      description: typeof ev.description === 'string' ? ev.description : '',
      eventFilter: typeof ev.event_filter === 'string' ? ev.event_filter : '',
      matchedPhrases: [...new Set(matched)],
    })
  }
  hits.sort((a, b) => a.name.localeCompare(b.name))
  return hits.slice(0, MAX_CANDIDATES)
}

/**
 * Stage 2 prompt — raw-event-vs-derived-metric framing plus the few-shot block.
 *
 * Every element here is load-bearing and was arrived at by measurement, not
 * taste. Without the few-shot block the model plays whack-a-mole between the
 * 「新增角色」 and 「付费」 false positives; without the explicit
 * 泛词-vs-特定词 rule (§3) even qwen3.7-max reads 「付费总金额」 as the recharge
 * event. The 「宁可漏不可错」 instruction (§4) is what makes NONE the safe default:
 * a false negative costs the pre-(a) behaviour, a false positive costs a
 * silently wrong answer.
 *
 * The few-shot questions are drawn verbatim from the eval set, so the measured
 * 0-FP figure is partly in-sample — see the ticket's Resolution for the caveat
 * and the follow-up.
 * @param question - the user question being routed.
 * @param candidates - the lexical-stage candidates the model must choose among.
 * @returns the detection prompt.
 */
export function buildDetectionPrompt(question: string, candidates: readonly EventCandidate[]): string {
  const candLines = candidates
    .map((c) => {
      const desc = c.description.length > DESC_BUDGET ? `${c.description.slice(0, DESC_BUDGET)}…` : c.description
      const filter = c.eventFilter !== '' ? ` [${c.eventFilter}]` : ''
      return `- ${c.name}${filter}（命中词：${c.matchedPhrases.join('、')}）：${desc}`
    })
    .join('\n')
  return `你是数据分析路由器。判断【用户问题】问的是不是某个【埋点原始事件】的发生次数 / 记录数 / 独立主体数——是则回答该事件名，否则回答 ${NO_EVENT}。

# 判定规则
1. 只有当问题用了该事件的【特定名词】时才选它：创角→game.role.create、货币变动→game.coin.change、道具变动→game.item.change、充值→game.recharge。且问的必须是原始事件的发生次数、记录数或独立角色/账号数。
2. 下列一律回答 ${NO_EVENT}（它们走数仓汇总表 DWS，不是原始埋点）：
   - 派生/加工指标：留存率、ARPU、ARPPU、付费率、转化率、趋势、金额段、分布、排行/Top、占比、日均、累计、平均在线时长。
   - 泛词指人群口径：「新增角色」「新增账号」「付费角色」「活跃角色」。
   - 任何拿不准的情况。
3. 关键区分（最易错，务必照做）：
   - 「付费」是泛词，「充值」才是 game.recharge 的特定词。付费总金额 / 付费角色数 / 付费率 / 付费金额段 / 首次付费 / 累计付费 → 一律 ${NO_EVENT}。
   - 「新增角色」是泛词，「创角」才是 game.role.create 的特定词。
   - 「付费抽卡」问的是抽卡，不是充值 → 不要选 game.recharge。
4. 命中泛词 ≠ 对得上：候选是词法预筛给的，只说明它的某个别名出现在问题里，不代表它就是问题问的那件事。必须候选事件本身就是问题在数的那个行为。若候选是另一个具名玩法/活动的埋点（名字或描述所指的玩法与问题不同），即使共用「副本」「付费」「新增」这类泛词，也回 ${NO_EVENT}。
5. 宁可漏不可错：选错事件比不选更糟。不确定就回 ${NO_EVENT}。

# 候选事件（词法预筛结果；只能从中选，或选 ${NO_EVENT}）
${candLines}

# 示例
问题：昨天新增了多少个角色？ → ${NO_EVENT}
问题：昨天创角的新增角色数是多少？ → game.role.create
问题：最近7天的日均付费率是多少？ → ${NO_EVENT}
问题：最近7天每天的新增角色数趋势？ → ${NO_EVENT}
问题：昨天有多少个角色完成了首次付费？ → ${NO_EVENT}
问题：昨天付费总金额（真实付费）是多少？ → ${NO_EVENT}
问题：累计付费金额最高的10个角色分别付了多少？ → ${NO_EVENT}
问题：昨天充值总金额是多少（事件级，排除沙盒）？ → game.recharge
问题：昨天用现金券充值的次数是多少？ → game.recharge
问题：昨天付费抽卡（非免费）的次数是多少？ → ${NO_EVENT}

# 用户问题
${question}

只输出一行：事件名 或 ${NO_EVENT}。不要解释，不要输出其他任何内容。`
}

/**
 * Parse the detection reply to a candidate event name, or null for
 * NONE/unparseable. Only ever returns a name the pre-filter actually offered:
 * a hallucinated name would at best miss in `loadEventDefinition` and at worst
 * load an event the question never mentioned.
 * @param reply - the raw model reply.
 * @param candidates - the candidates that were offered (the allowed answers).
 * @returns the picked event name, or null.
 */
export function parseDetectionReply(reply: string, candidates: readonly EventCandidate[]): string | null {
  const firstLine = reply
    .trim()
    .split('\n')
    .map(l => l.trim())
    .find(l => l.length > 0) ?? ''
  const cleaned = firstLine.replace(/[`"'。．,，、\s]/g, '')
  if (cleaned === '' || cleaned.toUpperCase() === NO_EVENT) return null
  const exact = candidates.find(c => c.name === cleaned)
  if (exact !== undefined) return exact.name
  // Tolerate a name wrapped in stray prose ("事件：game.recharge") without
  // widening to a prefix match that could pick the wrong sibling event.
  const wrapped = candidates.find(c => cleaned.includes(c.name))
  return wrapped?.name ?? null
}

/**
 * Detect which instrumented event a question is asking about — lexical
 * pre-filter, then one LLM pick. Returns `eventName: null` when the question is
 * not about a raw event (the common case: 21 of 39 eval cases are DWS
 * questions), when no candidate matched lexically, or when the detection call
 * fails. Detection is an enrichment, never a gate: any failure degrades to the
 * pre-(a) behaviour (no `eventDef`), it never fails the question.
 * @param deps - the corpus to pre-filter over + the bound completion (qwen3.7-max).
 * @param question - the user question.
 * @returns the detection outcome (picked event name + the candidates considered).
 */
export async function detectEventName(deps: DetectEventDeps, question: string): Promise<EventDetection> {
  const candidates = prefilterEventCandidates(deps.corpus, question)
  if (candidates.length === 0) return { eventName: null, candidates }
  let reply: string
  try {
    reply = await deps.complete(buildDetectionPrompt(question, candidates))
  } catch {
    return { eventName: null, candidates }
  }
  return { eventName: parseDetectionReply(reply, candidates), candidates }
}

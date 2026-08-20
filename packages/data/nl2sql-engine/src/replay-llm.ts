/**
 * P13b NL→SQL engine — dsh-llm-replay stand-in (deterministic LLM, no key,
 * reproducible; P13 grilling Q1/Q4). Production: `@deepseek-ai/dsh-llm-replay`
 * via runtime cordis.yml record/replay (G2 review G: language-agnostic). This
 * stub returns preset SQL by question substring + attempt (scripted; the eval
 * scenarios control it); on `attempt > 0` it reads feedback and rewrites.
 *
 * @module @deepseek-ai/dsh-nl2sql-engine/src/replay-llm
 */

export interface LlmFeedback {
  readonly failureKind: string
  readonly error: string
}

export interface LlmGenerateArgs {
  readonly question: string
  readonly attempt?: number
  readonly feedback?: LlmFeedback | null
}

export interface LlmGenerateResult {
  readonly sql: string
  readonly toolCalls?: unknown[]
}

/** The LLM contract the engine consumes; `ReplayLlm` (eval) satisfies it, production uses dashscope/replay via the agent loop. */
export interface Llm {
  generate(args: LlmGenerateArgs): Promise<LlmGenerateResult>
}

export type ScriptedGen =
  | LlmGenerateResult
  | ((ctx: { attempt: number; feedback: LlmFeedback | null }) => LlmGenerateResult)

export class ReplayLlm implements Llm {
  private readonly scripted: Record<string, ScriptedGen>
  public callCount = 0

  constructor(scripted: Record<string, ScriptedGen> = {}) {
    this.scripted = scripted
  }

  async generate({ question, attempt = 0, feedback = null }: LlmGenerateArgs): Promise<LlmGenerateResult> {
    this.callCount += 1
    for (const [sub, gen] of Object.entries(this.scripted)) {
      if (question.includes(sub)) {
        return typeof gen === 'function' ? gen({ attempt, feedback }) : gen
      }
    }
    // default: rewrite on feedback (simulate LLM reading the error + rewriting), else initial generate
    if (feedback) {
      return {
        sql: `SELECT COUNT(*) AS cnt FROM dws_pay_order_di WHERE ds=20260819 /* rewritten after ${feedback.failureKind} */`,
        toolCalls: [],
      }
    }
    return { sql: 'SELECT COUNT(*) AS cnt FROM dws_pay_order_di WHERE ds=20260819', toolCalls: [] }
  }
}

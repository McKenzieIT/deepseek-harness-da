// P13 prototype — dsh-llm-replay stub（确定性 LLM，无 key 可复现，grilling Q1/Q4）。
// 生产：@deepseek-ai/dsh-llm-replay 经 runtime cordis.yml 录制/回放 LLM 流（G2 审查 G：语言无关）。
// prototype：按 question 子串 + attempt 返预设 SQL（脚本化，scenarios 控制）；attempt>0 时读 feedback 重写。

export class ReplayLlm {
  constructor(scripted = {}) {
    this.scripted = scripted; // { questionSubstring: { sql } | (ctx)=>{sql} }
    this.callCount = 0;
  }
  async generate({ question, attempt = 0, feedback = null }) {
    this.callCount += 1;
    for (const [sub, gen] of Object.entries(this.scripted)) {
      if (question.includes(sub)) {
        return typeof gen === 'function' ? gen({ attempt, feedback }) : gen;
      }
    }
    // 默认：feedback 时重写（模拟 LLM 读错重写），否则初始生成
    if (feedback) {
      return {
        sql: `SELECT COUNT(*) AS cnt FROM dws_pay_order_di WHERE ds=20260819 /* rewritten after ${feedback.failureKind} */`,
        toolCalls: [],
      };
    }
    return { sql: 'SELECT COUNT(*) AS cnt FROM dws_pay_order_di WHERE ds=20260819', toolCalls: [] };
  }
}

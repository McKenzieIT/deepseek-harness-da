// P7 harness-stub — fake Cordis ctx simulating the harness event seams the phase-gate plugin
// hooks (NOT the real vendored Cordis — that's packages/core/{tools,session,agent-loop}).
// Mirrors p8-audit/harness-stub.mjs. Seams simulated:
//   tools/pre-execute → ctx.tools.guard() → tools/execute → tools/post-execute → tools/result
//   agent/turn-stopping (serial, no next())   agent/request (waterfall)   system-prompt/assemble (waterfall)
//   llm/stream (counter + pre-call budget reject)   turn/start
import { STUB_TOOLS } from './tools.mjs';

export class FakeHarness {
  constructor(plugin) {
    this.plugin = plugin;
    this.tools = new Map(Object.entries(STUB_TOOLS));
    this.log = [];
  }

  // tool execution pipeline (packages/core/tools/README.zh.md §2.5):
  // pre-execute → guard() → execute → post-execute → result. guard() is monotone (un-flippable).
  async callTool(sessionId, name, args = {}) {
    const exec = { sessionId, name, arguments: args };
    // ctx.tools.guard() — phase-gate hard whitelist + pre-execute exec-budget reject (monotone)
    const deny = this.plugin.guard(exec);
    if (deny) {
      this.log.push(`guard DENY ${name}: ${deny}`);
      return { isError: true, error: { message: deny }, content: `deny: ${deny}` };
    }
    const handler = this.tools.get(name);
    if (!handler) {
      this.log.push(`no handler ${name}`);
      return { isError: true, error: { message: `no handler ${name}` } };
    }
    const result = handler(args);
    // tools/post-execute — phase-gate: count + store + same-source check (decisions live at turn-stopping)
    const post = this.plugin.onPostExecute({ sessionId, name, result, args });
    if (post.kind === 'block') {
      this.log.push(`post-execute BLOCK ${name}: ${post.reason}`);
      return { isError: true, error: { message: post.reason }, content: `block: ${post.reason}` };
    }
    this.log.push(`tool/result ${name} ok`);
    return { isError: false, value: result, content: JSON.stringify(result) };
  }

  // llm/stream — a "model response" = canned tool calls the scenario scripts per phase.
  // M1: onLlmStream returns undefined=allow, or an honest_decline decision if the llm budget is
  // exhausted pre-call (rbi rejects the (limit+1)th llm call pre-call). If declined, abort the stream
  // (no tool calls run — the budget is enforced BEFORE the cost is incurred).
  async llmStream(sessionId, modelToolCalls) {
    const decline = this.plugin.onLlmStream({ sessionId });
    if (decline) {
      this.log.push(`llm/stream REJECT (pre-call budget): ${decline.reason}`);
      return [['<llm-stream>', { isError: true, decision: decline }]];
    }
    const results = [];
    for (const [name, args] of modelToolCalls) {
      results.push([name, await this.callTool(sessionId, name, args)]);
    }
    return results;
  }

  // agent/request waterfall — phase-gate sets per-phase reasoning effort
  request(sessionId, seedConfig) {
    return this.plugin.onRequest({ sessionId, proposedConfig: seedConfig });
  }

  // system-prompt/assemble waterfall — phase-gate injects _PHASE_INSTRUCTIONS
  assemble(sessionId, baseSections) {
    return this.plugin.onAssemble({ sessionId, sections: baseSections });
  }

  // turn driver: turnStart → [steps: assemble → request → llmStream(toolCalls)] → turnStopping
  async runTurn(sessionId, steps) {
    this.plugin.onTurnStart({ sessionId });
    const baseSections = [{ id: 'persona', order: 0, text: '<base persona — preset static section>' }];
    for (const toolCalls of steps) {
      this.assemble(sessionId, baseSections); // system-prompt/assemble (persona option C)
      this.request(sessionId, { provider: 'dashscope', model: 'qwen-plus' }); // agent/request
      await this.llmStream(sessionId, toolCalls); // llm/stream + tool pipeline
    }
    // model naturally stopped (no more tool calls) → agent/turn-stopping serial fires
    return this.plugin.onTurnStopping({ sessionId });
  }

  dump() {
    return this.log.slice();
  }
}

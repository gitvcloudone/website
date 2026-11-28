// The design copilot: a conversation about the design, where the model reads it and runs what-ifs only
// through the tools, and proposes changes for the architect to apply. Stand-in names go out; real names
// come back. No DOM: the connector is passed in, so tests use a stand-in API.
import type { Design } from "../../../engine/src/index.ts";
import type { Connector, AiMessage, ContentBlock } from "./connector.ts";
import { TOOLS, toolSpecs } from "./tools.ts";
import type { Suggestion, ToolCtx } from "./tools.ts";
import type { Redactor } from "./redact.ts";

export const COPILOT_SYSTEM = `You are the design copilot in VCF Design Studio, a tool that helps architects design VMware Cloud Foundation (VCF) deployments on their own hardware. You are talking with an experienced architect about the design open in the tool.

How you work:
- Read the design with get_design before answering anything about it. Never guess the design.
- Every number you state (hosts, cores, licences, capacity, counts) must come from a tool result in this conversation. Never work out sizing or licensing yourself. If you need a number, call a tool.
- To test an idea, call what_if. To suggest a change, call propose_changes: the architect reviews it and applies it. Never say a change was made; say it's proposed.
- You can only change design choices listed by list_settings. Customer facts (workload, DNS and NTP, addresses, ASNs, identity provider, roles, break-glass, the IP plan) are the architect's to enter; say what's needed instead.
- Best practices come from the tool's rules (check_rules), each with a source. Cite the rule by its title when it applies. Beyond the rules, give your own engineering view, clearly as yours.
- Names may be stand-ins (Customer A, Workload group 1, VM-1, example.internal) to protect the customer. Use them as they are.

How you write:
- Plain, direct, natural English for a senior architect. Short paragraphs; a short list when comparing options. No headings, no tables, no emoji.
- Lead with the answer, then the reason. Mention trade-offs that matter: availability, cost and licensing, operations.
- Keep it brief unless asked for depth.`;

export interface CopilotResult { history: AiMessage[]; reply: string; steps: string[]; usage: { input: number; output: number } }
const MAX_ROUNDS = 10, KEEP = 24;
const STEP_LABEL: Record<string, string> = { get_design: "Read the design", list_settings: "Looked up settings", what_if: "Ran a what-if", check_rules: "Checked the best practices", explain_cluster: "Explained a cluster", propose_changes: "Proposed a change" };

/** Older turns dropped (whole user turns only, so tool calls stay paired with their results). */
export function trimHistory(h: AiMessage[], keep = KEEP): AiMessage[] {
  if (h.length <= keep) return h;
  const starts = h.map((m, i) => (m.role === "user" && typeof m.content === "string" ? i : -1)).filter(i => i >= 0);
  const from = starts.find(i => h.length - i <= keep) ?? starts[starts.length - 1] ?? 0;
  return h.slice(from);
}

/** One question to the copilot. `history` is the API-level conversation so far (stand-in names). */
export async function ask(conn: Connector, model: string, design: Design, red: Redactor, history: AiMessage[], question: string,
  suggestions: Suggestion[], nextId: () => string, signal?: AbortSignal, onStep?: (label: string) => void): Promise<CopilotResult> {
  const msgs: AiMessage[] = [...trimHistory(history), { role: "user", content: red.out(question) }];
  const ctx: ToolCtx = { design, red, suggestions, nextId }, steps: string[] = [], usage = { input: 0, output: 0 };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await conn.send({ model, max_tokens: 2000, system: COPILOT_SYSTEM, messages: msgs, tools: toolSpecs() }, signal);
    usage.input += res.usage?.input_tokens || 0; usage.output += res.usage?.output_tokens || 0;
    msgs.push({ role: "assistant", content: res.content });
    const calls = res.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !calls.length) {
      const text = res.content.filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text").map(b => b.text).join("\n\n").trim();
      return { history: msgs, reply: red.back(text) || "(No answer.)", steps, usage };
    }
    const results: ContentBlock[] = calls.map(c => {
      const tool = TOOLS.find(t => t.name === c.name);
      if (tool) { steps.push(STEP_LABEL[c.name] || c.name); onStep?.(STEP_LABEL[c.name] || c.name); }
      try {
        if (!tool) throw new Error(`No tool ${c.name}.`);
        const out = tool.run(c.input || {}, ctx);
        return { type: "tool_result", tool_use_id: c.id, content: red.out(typeof out === "string" ? out : JSON.stringify(out)) };
      } catch (e) { return { type: "tool_result", tool_use_id: c.id, content: red.out((e as Error).message), is_error: true }; }
    });
    msgs.push({ role: "user", content: results });
  }
  return { history: msgs, reply: "I ran out of steps on that one. Try a narrower question.", steps, usage };
}

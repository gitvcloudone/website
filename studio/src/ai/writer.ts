// The HLD writer: drafts the executive summary, the design rationale and the risk mitigations from the
// design's own facts (the engine's numbers, the decisions and risks). The draft is stored with the design,
// labelled as AI-drafted, editable, and flagged when the design changes. No DOM; tested.
import type { Design, Narrative, NarrativeTarget } from "../../../engine/src/index.ts";
import { sizeDesign } from "../store.ts";
import { evaluate, decisionRegister, riskRegister, scorable } from "../rules.ts";
import { designSnap } from "../hld.ts";
import { designSummary } from "./tools.ts";
import type { Connector } from "./connector.ts";
import type { Redactor } from "./redact.ts";

export const TARGETS: Record<NarrativeTarget, { title: string; where: string; brief: string }> = {
  summary: { title: "Executive summary", where: "Executive summary",
    brief: "Write the executive summary of this high-level design for the customer's IT leadership: two or three short paragraphs. What is being built and for what workload; why it is shaped this way (the main decisions); what it takes (hosts and licensed cores, exactly as given); and what is still open before deployment. No marketing language." },
  rationale: { title: "Design rationale", where: "Design decisions",
    brief: "Write the design rationale: three to six short paragraphs explaining the key decisions in this design and their trade-offs (topology and domains, host choice, storage policy, networking model, identity, add-ons), tied to the decisions and best practices given. Say plainly where a choice was a default accepted rather than a deliberate decision." },
  mitigations: { title: "Risk mitigations", where: "Risks and open items",
    brief: "For each risk and each open item given, write one short paragraph: the risk in plain words, then a practical mitigation and who would own it. Start each paragraph with the risk's name. If there are none, write one paragraph saying so and what to keep an eye on." },
};

export const WRITER_SYSTEM = `You write sections of high-level design (HLD) documents for VMware Cloud Foundation deployments, as a senior architect would. You are given the design's facts as JSON from the design tool.

Rules:
- Use only the facts given. Every number must appear in the facts exactly; never compute or estimate new ones. Don't invent requirements, dates, people or products.
- Plain, natural English: clear sentences a customer reads easily, no buzzwords, no hype, no emoji, no headings, no bullet lists, no markdown. Separate paragraphs with a blank line.
- Names may be stand-ins (Customer A, Workload group 1, example.internal). Use them exactly as given.
- Return only the section text.`;

/** The facts the writer gets: the design summary, the decision register, the risks and the open items. */
export function writerFacts(d: Design) {
  const r = sizeDesign(d), res = scorable(d, r) ? evaluate(d, r) : [];
  return { design: designSummary(d, r),
    decisions: decisionRegister(d, res).map(x => ({ area: x.step, decision: x.text, kind: x.kind, reason: x.reason || undefined })),
    risks: riskRegister(res).map(x => ({ risk: x.risk, where: x.where, bestPractice: x.rule.title, acceptedBecause: x.reason, high: x.high || undefined })),
    openItems: res.filter(x => x.status === "open" && x.rule.level !== "consider").flatMap(x => x.findings.filter(f => !f.reason).map(f => `${x.rule.level}: ${x.rule.title}: ${f.where}`)) };
}

/** Draft one section. Returns the stored form, with real names restored. */
export async function draft(conn: Connector, model: string, d: Design, red: Redactor, target: NarrativeTarget, today: string, signal?: AbortSignal): Promise<Narrative> {
  const facts = red.out(JSON.stringify(writerFacts(d)));
  const res = await conn.send({ model, max_tokens: 1800, system: WRITER_SYSTEM,
    messages: [{ role: "user", content: `${TARGETS[target].brief}\n\nThe design's facts:\n${facts}` }] }, signal);
  const text = res.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("\n\n")
    .replace(/^#+\s.*$/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("The AI returned no text. Try again.");
  return { text: red.back(text), edited: false, snap: designSnap(d), at: today };
}

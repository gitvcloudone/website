// The one way the studio talks to an AI model. Everything inside the studio speaks one request and response
// shape (the Claude Messages API). A connector carries it to a provider: the user's own key or local server,
// called from the browser (providers.ts lists them; OpenAI-style APIs are translated here), or a hosted
// backend (later) that adds sign-in, usage limits and the key. No DOM; the fetch is injectable for tests.

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export interface AiMessage { role: "user" | "assistant"; content: string | ContentBlock[] }
export interface ToolSpec { name: string; description: string; input_schema: Record<string, unknown> }
export interface AiRequest { model: string; max_tokens: number; system: string; messages: AiMessage[]; tools?: ToolSpec[] }
export interface AiResponse { content: ContentBlock[]; stop_reason: string; usage?: { input_tokens: number; output_tokens: number } }
export interface Connector { label: string; send(req: AiRequest, signal?: AbortSignal): Promise<AiResponse> }
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export const MODELS: [id: string, label: string][] = [
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (fast; recommended)"],
  ["claude-opus-5-5", "Claude Opus 5.5 (most capable, slower)"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 (fastest, lightest)"],
];
const API = "https://api.anthropic.com/v1/messages";

/** A plain-language message for what went wrong. */
export async function failure(res: Response, plug: "key" | "hosted", name = "the AI service"): Promise<Error> {
  let detail = "";
  try { const j = await res.json() as { error?: { message?: string } }; detail = j.error?.message || ""; } catch { /* not JSON */ }
  const why = res.status === 401 || res.status === 403 ? (plug === "key" ? "The API key wasn't accepted. Check it in the AI settings." : "You're not signed in to the AI service.")
    : res.status === 429 ? "Too many AI requests right now. Wait a moment and try again."
    : res.status === 529 || res.status === 503 ? "The AI service is busy. Try again in a minute."
    : res.status === 404 ? `${name} doesn't know that model or address. Check them in the AI settings.`
    : res.status === 400 ? `${name} couldn't use that request.` : `${name} answered with an error (${res.status}).`;
  return new Error(detail && (res.status === 400 || res.status === 404) ? `${why} ${detail}` : why);
}

/** Plug 1: the user's own Claude API key, from the browser. The key goes only to Anthropic. */
export function keyConnector(key: string, doFetch: Fetch = (u, i) => fetch(u, i)): Connector {
  return {
    label: "your Claude API key",
    async send(req, signal) {
      let res: Response;
      try {
        res = await doFetch(API, { method: "POST", signal, headers: {
          "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(req) });
      } catch (e) { if ((e as Error).name === "AbortError") throw e; throw new Error("Couldn't reach the Claude API. Check your connection."); }
      if (!res.ok) throw await failure(res, "key");
      return await res.json() as AiResponse;
    },
  };
}

/** Plug 2 (later): a hosted backend at `url` that takes the same request, adds the key and returns the same response. */
export function hostedConnector(url: string, doFetch: Fetch = (u, i) => fetch(u, i)): Connector {
  return {
    label: "the vCloudOne AI service",
    async send(req, signal) {
      let res: Response;
      try { res = await doFetch(url, { method: "POST", signal, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(req) }); }
      catch (e) { if ((e as Error).name === "AbortError") throw e; throw new Error("Couldn't reach the AI service. Check your connection."); }
      if (!res.ok) throw await failure(res, "hosted");
      return await res.json() as AiResponse;
    },
  };
}


// ---------- OpenAI-style chat completions (OpenAI, OpenRouter, xAI, Ollama, LM Studio, custom) ----------
interface OaToolCall { id?: string; type?: string; function: { name: string; arguments: string | Record<string, unknown> } }
interface OaMessage { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: OaToolCall[]; tool_call_id?: string }
export interface OaRequest { model: string; messages: OaMessage[]; tools?: unknown[]; max_tokens?: number; max_completion_tokens?: number }

/** Our request → an OpenAI chat-completions request. Tool results become "tool" messages; tool calls carry JSON arguments. */
export function toOpenAi(req: AiRequest, tokens: "max_tokens" | "max_completion_tokens" = "max_tokens"): OaRequest {
  const messages: OaMessage[] = req.system ? [{ role: "system", content: req.system }] : [];
  for (const m of req.messages) {
    if (typeof m.content === "string") { messages.push({ role: m.role, content: m.content }); continue; }
    const text = m.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("\n\n");
    if (m.role === "assistant") {
      const calls = m.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map(b => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of m.content) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${b.content}` : b.content });
      if (text) messages.push({ role: "user", content: text });
    }
  }
  const out: OaRequest = { model: req.model, messages, [tokens]: req.max_tokens };
  if (req.tools?.length) out.tools = req.tools.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  return out;
}

/** An OpenAI chat-completions response → our response. Missing call ids are filled in; bad JSON arguments reach the tool as an error. */
export function fromOpenAi(j: unknown): AiResponse {
  const o = j as { choices?: { message?: { content?: string | null; tool_calls?: OaToolCall[] }; finish_reason?: string }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const ch = o?.choices?.[0];
  if (!ch?.message) throw new Error("The AI service's answer wasn't in the expected form.");
  const content: ContentBlock[] = [];
  if (ch.message.content && ch.message.content.trim()) content.push({ type: "text", text: ch.message.content });
  (ch.message.tool_calls || []).forEach((c, i) => {
    let input: Record<string, unknown>;
    const a = c.function?.arguments;
    if (a && typeof a === "object") input = a;
    else { try { const p = JSON.parse(a || "{}"); input = p && typeof p === "object" ? p : {}; } catch { input = { _unreadable: String(a) }; } }
    content.push({ type: "tool_use", id: c.id || `call_${i + 1}`, name: c.function?.name || "", input });
  });
  const calls = content.some(b => b.type === "tool_use");
  const stop = calls ? "tool_use" : ch.finish_reason === "length" ? "max_tokens" : "end_turn";
  return { content, stop_reason: stop, usage: { input_tokens: o.usage?.prompt_tokens || 0, output_tokens: o.usage?.completion_tokens || 0 } };
}

/** An OpenAI-compatible chat-completions API at `base` (e.g. https://api.openai.com/v1). The key, if any, goes only there. */
export function openAiConnector(o: { name: string; base: string; key?: string; tokens?: "max_tokens" | "max_completion_tokens"; unreachable?: string }, doFetch: Fetch = (u, i) => fetch(u, i)): Connector {
  return {
    label: o.name,
    async send(req, signal) {
      let res: Response;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (o.key) headers.authorization = `Bearer ${o.key}`;
      try { res = await doFetch(`${o.base.replace(/\/+$/, "")}/chat/completions`, { method: "POST", signal, headers, body: JSON.stringify(toOpenAi(req, o.tokens)) }); }
      catch (e) { if ((e as Error).name === "AbortError") throw e; throw new Error(o.unreachable || `Couldn't reach ${o.name}. Check your connection.`); }
      if (!res.ok) throw await failure(res, "key", o.name);
      return fromOpenAi(await res.json());
    },
  };
}

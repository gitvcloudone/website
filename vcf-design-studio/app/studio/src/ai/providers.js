// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Bring any AI: the providers the AI-powered edition can use, how to set each one up, and the settings
// (kept in this browser only). Adding a provider is one entry in PROVIDERS. No DOM; fetch is injectable.
// Setup facts checked 27 Nov 2026 against each provider's docs (links in each guide).
import { keyConnector, hostedConnector, openAiConnector, MODELS } from "./connector.js";
                                                       

                                                                                                          
                                                                                                                
                           
                                              
                                 
                                                                                   
                                        
                                        
                                                                                              
                                                 
                 
                                                                                      
                                   
 

const LOCAL_NOTE = "Small local models often misuse the copilot's tools or invent numbers. Pick a model that supports tool use, and the larger the better: the sizing numbers still always come from the engine.";
const CHROME_NOTE = "Your browser may ask to let this site reach devices on your local network. Choose Allow: that's how it talks to the AI app on this computer.";

export const PROVIDERS             = [
  { id: "anthropic", name: "Claude (Anthropic)", blurb: "Claude models, called directly with your own API key. Recommended: the copilot was built and tested on Claude.",
    format: "anthropic", base: "https://api.anthropic.com/v1", key: "required", keyPattern: /^sk-ant-/, keyHint: "sk-ant-…",
    models: MODELS, tokens: "max_tokens", local: false, where: "Anthropic",
    guide: () => ({
      steps: ["Sign in or create an account in the Claude Console at platform.claude.com.",
        "Add credit under Billing. API use is billed there, separately from a Claude chat subscription.",
        "Optional but wise: set a monthly spend limit under Limits.",
        "Open API keys, choose Create key, and copy the key (it starts with sk-ant- and is shown once).",
        "Paste it here, pick a model and choose Save."],
      cost: "Pay per use from your Console credit. A typical copilot question costs a few cents; Haiku is cheapest, Opus most capable.",
      notes: [],
      links: [["Get an API key", "https://platform.claude.com/docs/en/get-api-key"], ["Claude Console", "https://platform.claude.com/"]],
    }) },
  { id: "openai", name: "OpenAI", blurb: "GPT models with your own OpenAI API key.",
    format: "openai", base: "https://api.openai.com/v1", key: "required", keyPattern: /^sk-/, keyHint: "sk-…",
    models: [], tokens: "max_completion_tokens", local: false, where: "OpenAI",
    guide: () => ({
      steps: ["Sign in at platform.openai.com. The API is separate from ChatGPT: a ChatGPT plan doesn't cover it.",
        "Add prepaid credit under Billing (the API has no pay-later billing for most accounts).",
        "Optional but wise: set a budget for your project under Limits.",
        "Create a secret key under API keys and copy it (it starts with sk-).",
        "Paste it here, choose Load models, pick a GPT model and choose Save."],
      cost: "Pay per use from prepaid credit. New accounts start with low monthly limits that rise as you use the API.",
      notes: ["Choose a chat model that supports function calling; the list only shows chat models."],
      links: [["API keys", "https://platform.openai.com/api-keys"], ["Billing and limits FAQ", "https://community.openai.com/t/faq-getting-started-with-the-openai-api-quickstart-billing-verification-prepayment-credits-429-errors/1360980"]],
    }) },
  { id: "openrouter", name: "OpenRouter", blurb: "One key for many models: Claude, GPT, Gemini, Grok, Llama, Mistral, Qwen and more.",
    format: "openai", base: "https://openrouter.ai/api/v1", key: "required", keyPattern: /^sk-or-/, keyHint: "sk-or-…",
    models: [], tokens: "max_tokens", local: false, where: "OpenRouter, and the model maker it routes your request to",
    guide: () => ({
      steps: ["Sign in at openrouter.ai and add credit.",
        "Open Keys, choose Create key, and give it a credit limit (OpenRouter recommends a limit on every key).",
        "Copy the key (it starts with sk-or-) and paste it here.",
        "Choose Load models: the list shows only models that support tools, which the copilot needs. Pick one and choose Save."],
      cost: "Pay per use from your OpenRouter credit, at each model's price. The key's credit limit caps what it can spend.",
      notes: ["This is the way to use Google Gemini here: Gemini's own API doesn't reliably accept calls from a web page.",
        "Check OpenRouter's privacy settings: some model makers may log or train on prompts."],
      links: [["Create a key", "https://openrouter.ai/settings/keys"], ["Keys and limits", "https://openrouter.ai/docs/api_reference/authentication"], ["Models that support tools", "https://openrouter.ai/models?supported_parameters=tools"]],
    }) },
  { id: "xai", name: "xAI (Grok)", blurb: "Grok models with your own xAI API key.",
    format: "openai", base: "https://api.x.ai/v1", key: "required", keyHint: "xai-…",
    models: [], tokens: "max_completion_tokens", local: false, where: "xAI",
    guide: () => ({
      steps: ["Sign in to the xAI Console at console.x.ai and add credit.",
        "Open API Keys, create a key and copy it.",
        "Paste it here, choose Load models, pick a Grok model and choose Save."],
      cost: "Pay per use from your xAI credit.",
      notes: [],
      links: [["xAI Console: API keys", "https://console.x.ai/team/default/api-keys"], ["API reference", "https://docs.x.ai/developers/api-reference"]],
    }) },
  { id: "ollama", name: "Local: Ollama", blurb: "A model running on this computer. Free, and the design never leaves your machine.",
    format: "openai", base: "http://localhost:11434/v1", key: "none",
    models: [], tokens: "max_tokens", local: true, where: "nowhere: it stays on this computer (Ollama)",
    guide: origin => ({
      steps: ["Install Ollama from ollama.com and open it.",
        "Download a model that supports tools, for example in a terminal: ollama pull qwen3 (or llama3.1). Bigger models follow the tools better if your computer can run them.",
        `Let this site talk to it. Ollama only accepts web pages it's told about, so set OLLAMA_ORIGINS to ${origin}:`,
        `Mac: in Terminal run launchctl setenv OLLAMA_ORIGINS "${origin}", then quit Ollama from the menu bar and open it again.`,
        `Windows: quit Ollama, add a user environment variable named OLLAMA_ORIGINS with the value ${origin}, then start Ollama from the Start menu.`,
        `Linux: run systemctl edit ollama.service, add Environment="OLLAMA_ORIGINS=${origin}" under [Service], then systemctl daemon-reload and systemctl restart ollama.`,
        "Here: choose Load models, pick the model and choose Save. Then Test connection."],
      cost: "Free. It uses your computer's memory and graphics card; answers are slower than the cloud services on most laptops.",
      notes: [CHROME_NOTE, LOCAL_NOTE, "The Mac setting lasts until you restart the computer; run the command again after a restart."],
      links: [["Ollama", "https://ollama.com/"], ["Ollama FAQ: environment variables", "https://docs.ollama.com/faq"]],
    }) },
  { id: "lmstudio", name: "Local: LM Studio", blurb: "A model running in LM Studio on this computer. Free, and the design never leaves your machine.",
    format: "openai", base: "http://localhost:1234/v1", key: "optional",
    models: [], tokens: "max_tokens", local: true, where: "nowhere: it stays on this computer (LM Studio)",
    guide: () => ({
      steps: ["Install LM Studio from lmstudio.ai and download a model that supports tool use.",
        "In the Developer section, start the local server and turn on Enable CORS in its settings (or run lms server start --cors). CORS is what lets this web page reach it.",
        "Check the address it shows. It's usually http://localhost:1234/v1; change the address here if yours differs.",
        "If you turned on authentication in LM Studio, paste its key here; otherwise leave the key blank.",
        "Choose Load models, pick the model and choose Save. Then Test connection."],
      cost: "Free. It uses your computer's memory and graphics card.",
      notes: [CHROME_NOTE, LOCAL_NOTE, "Enable CORS lets any web page you open reach the LM Studio server while it runs. Turn it off when you're done, or turn on LM Studio's authentication."],
      links: [["LM Studio", "https://lmstudio.ai/"], ["Server settings", "https://lmstudio.ai/docs/developer/core/server/settings"], ["lms server start", "https://lmstudio.ai/docs/cli/server-start"]],
    }) },
  { id: "custom", name: "Other OpenAI-compatible service", blurb: "Any service that speaks the OpenAI chat-completions API with tool calling: vLLM, LiteLLM, llama.cpp server, Groq, Together, Mistral and others.",
    format: "openai", base: "", key: "optional",
    models: [], tokens: "max_tokens", local: false, where: "the service at the address you enter",
    guide: origin => ({
      steps: ["Enter the API address ending in /v1 (the part before /chat/completions). It must start with https://, or be http://localhost for a server on this computer.",
        "Paste a key if the service needs one.",
        "Choose Load models (or type the model name), then Save and Test connection."],
      cost: "Whatever the service charges.",
      notes: [`The service must accept calls from a web page at ${origin} (CORS). Many company gateways and Azure OpenAI don't; those will work through the vCloudOne AI service when it arrives.`,
        "The model must support tool calling, or the copilot can only chat; drafting HLD sections still works."],
      links: [],
    }) },
];
export const provider = (id        ) => PROVIDERS.find(p => p.id === id);

/** What the AI can do in the studio, whichever provider is behind it. */
export const CAPABILITIES                                  = [
  ["Explain", "Why each cluster has the hosts it has, what decided it, and what a setting does."],
  ["What-if", "Runs your idea through the sizing engine (more NICs, another CPU ratio, a different host) and reports the engine's numbers."],
  ["Review", "Checks the design against the best-practice rules and explains what's open."],
  ["Suggest changes", "Proposes design choices with their before-and-after effect. Nothing changes until you apply one, and an applied one is recorded as AI-suggested."],
  ["Draft the HLD", "Writes the executive summary, design rationale and risk mitigations from the design's own facts, marked as AI drafts for you to edit."],
];

// ---------- settings (kept in this browser only) ----------
                                                                         
                             
                                  
                                                
                                                          
 
export const DEFAULT_AI             = { provider: "anthropic", cfg: {}, remember: false, standIns: true, hostedUrl: "" };
const STORE_KEY = "vcfStudio.ai";
                                                                                                                       

/** A provider's settings, with its defaults filled in. */
export function cfgOf(s            , id            )              {
  const p = provider(id) , c = s.cfg[id];
  return { key: c?.key ?? "", base: c?.base || p.base, model: c?.model || (p.models[0]?.[0] ?? "") };
}
const str = (v         , max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

/** Reads the settings, including the first AI release's shape ({ plug, key, model }). */
export function loadAi(st              )             {
  try {
    const o = JSON.parse(st?.getItem(STORE_KEY) || "null");
    if (!o || typeof o !== "object") return structuredClone(DEFAULT_AI);
    const s             = { ...structuredClone(DEFAULT_AI), remember: o.remember === true, standIns: o.standIns !== false, hostedUrl: str(o.hostedUrl) };
    if ("plug" in o && !("provider" in o)) {        // first release: Claude only
      s.provider = o.plug === "hosted" ? "hosted" : "anthropic";
      if (o.key || o.model) s.cfg.anthropic = { key: str(o.key), base: "", model: MODELS.some(m => m[0] === o.model) ? o.model : "" };
      return s;
    }
    s.provider = o.provider === "hosted" || provider(o.provider) ? o.provider : "anthropic";
    for (const p of PROVIDERS) {
      const c = o.cfg?.[p.id]; if (!c || typeof c !== "object") continue;
      s.cfg[p.id] = { key: str(c.key), base: str(c.base), model: str(c.model, 200) };
    }
    return s;
  } catch { return structuredClone(DEFAULT_AI); }
}
/** Saved without keys unless the user asked to remember them on this device. */
export function saveAi(st              , s            ) {
  const cfg                    = {};
  for (const [id, c] of Object.entries(s.cfg)) if (c) cfg[id              ] = { ...c, key: s.remember ? c.key : "" };
  try { st?.setItem(STORE_KEY, JSON.stringify({ ...s, cfg })); } catch { /* storage blocked: settings last for this visit */ }
}

const okBase = (u        ) => /^https:\/\/[^\s/]+/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(u);
/** What's missing before this provider can be used, in plain words; "" when ready. */
export function problem(s            , id                        = s.provider)         {
  if (id === "hosted") return /^https:\/\//.test(s.hostedUrl) ? "" : "The vCloudOne AI service isn't available yet.";
  const p = provider(id); if (!p) return "Choose an AI provider.";
  const c = cfgOf(s, id), key = c.key.trim();
  if (!okBase(c.base.trim())) return c.base.trim() ? "The API address must start with https://, or be http://localhost for this computer." : "Enter the service's API address.";
  if (p.key === "required" && !key) return `Add your ${p.name} API key.`;
  if (key && p.keyPattern && !p.keyPattern.test(key)) return `That doesn't look like a ${p.name} key (they start with ${p.keyHint}).`;
  if (!c.model.trim()) return "Choose a model (Load models lists them).";
  return "";
}
export const aiReady = (s            ) => problem(s) === "";

const unreachable = (p          , base        ) => p.id === "ollama"
  ? `Couldn't reach Ollama at ${base}. Check it's running, that OLLAMA_ORIGINS lets this site in (see the setup steps), and that you allowed the browser's local network prompt.`
  : p.id === "lmstudio" ? `Couldn't reach LM Studio at ${base}. Check its server is running with Enable CORS on, and that you allowed the browser's local network prompt.`
  : p.local || p.id === "custom" ? `Couldn't reach ${base}. Check the address, that the service is running, and that it accepts calls from this site (CORS).`
  : `Couldn't reach ${p.name}. Check your connection.`;

/** The connector for the chosen provider, or null if it isn't set up yet. */
export function connectorFor(s            , doFetch        )                   {
  if (!aiReady(s)) return null;
  if (s.provider === "hosted") return hostedConnector(s.hostedUrl, doFetch);
  const p = provider(s.provider) , c = cfgOf(s, s.provider), base = c.base.trim().replace(/\/+$/, "");
  if (p.format === "anthropic") return keyConnector(c.key.trim(), doFetch);
  return openAiConnector({ name: p.name, base, key: c.key.trim() || undefined, tokens: p.tokens, unreachable: unreachable(p, base) }, doFetch);
}
/** The model in use. */
export const modelOf = (s            ) => (s.provider === "hosted" ? MODELS[0][0] : cfgOf(s, s.provider).model.trim());

const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcri|search|davinci|babbage|codex|sora/i;
/** The models this provider offers (for OpenRouter, only those that support tools). */
export async function listModels(s            , id            , doFetch        = (u, i) => fetch(u, i))                              {
  const p = provider(id) , c = cfgOf(s, id), base = c.base.trim().replace(/\/+$/, ""), key = c.key.trim();
  if (!okBase(base)) throw new Error(problem({ ...s, provider: id }, id));
  const headers                         = p.format === "anthropic"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
    : key ? { authorization: `Bearer ${key}` } : {};
  if (p.key === "required" && !key) throw new Error(`Add your ${p.name} API key first.`);
  let res          ;
  try { res = await doFetch(`${base}/models${id === "openrouter" ? "?supported_parameters=tools" : ""}`, { method: "GET", headers }); }
  catch { throw new Error(unreachable(p, base)); }
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "The API key wasn't accepted." : `${p.name} couldn't list its models (${res.status}).`);
  const j = await res.json()                                                                                                                                        ;
  const rows = (j.data || j.models || []).filter(m => typeof m.id === "string" && m.id)
    .filter(m => id !== "openai" || !NOT_CHAT.test(m.id ))
    .map(m => [m.id , m.display_name || m.name || m.id ]                    );
  if (!rows.length) throw new Error(p.local ? "No models found. Download one first (see the setup steps)." : "No models found.");
  return rows.sort((a, b) => a[1].localeCompare(b[1]));
}

/** A one-line round trip to check the settings work. */
export async function testConnection(s            , doFetch        )                  {
  const why = problem(s); if (why) throw new Error(why);
  const conn = connectorFor(s, doFetch) ;
  const res = await conn.send({ model: modelOf(s), max_tokens: 20, system: "Reply with the single word OK.", messages: [{ role: "user", content: "Connection test." }] });
  const text = res.content.filter(b => b.type === "text").map(b => (b                    ).text).join(" ").trim();
  return `Connected: ${modelOf(s)} answered${text ? ` "${text.slice(0, 40)}"` : ""}.`;
}

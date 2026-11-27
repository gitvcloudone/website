// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The one way the studio talks to an AI model. Two plugs, same request and response shape (the Claude
// Messages API): the user's own API key, called from the browser; or a hosted backend (later) that adds
// sign-in, usage limits and the key. Switching is configuration. No DOM; the fetch is injectable for tests.

                          
                                  
                                                                                  
                                                                                      
                                                                                           
                                                                                                      
                                                                                                                           
                                                                                                                                     
                                                                                                             
                                                                   

export const MODELS                                = [
  ["claude-sonnet-5-5", "Claude Sonnet 5.5 (fast; recommended)"],
  ["claude-opus-5-5", "Claude Opus 5.5 (most capable, slower)"],
  ["claude-haiku-5-5", "Claude Haiku 5.5 (fastest, lightest)"],
];
const API = "https://api.anthropic.com/v1/messages";

/** A plain-language message for what went wrong. */
async function failure(res          , plug                  )                 {
  let detail = "";
  try { const j = await res.json()                                    ; detail = j.error?.message || ""; } catch { /* not JSON */ }
  const why = res.status === 401 || res.status === 403 ? (plug === "key" ? "The API key wasn't accepted. Check it in the AI settings." : "You're not signed in to the AI service.")
    : res.status === 429 ? "Too many AI requests right now. Wait a moment and try again."
    : res.status === 529 || res.status === 503 ? "The AI service is busy. Try again in a minute."
    : res.status === 400 ? "The AI service couldn't use that request." : `The AI service answered with an error (${res.status}).`;
  return new Error(detail && res.status === 400 ? `${why} ${detail}` : why);
}

/** Plug 1: the user's own Claude API key, from the browser. The key goes only to Anthropic. */
export function keyConnector(key        , doFetch        = (u, i) => fetch(u, i))            {
  return {
    label: "your Claude API key",
    async send(req, signal) {
      let res          ;
      try {
        res = await doFetch(API, { method: "POST", signal, headers: {
          "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(req) });
      } catch (e) { if ((e         ).name === "AbortError") throw e; throw new Error("Couldn't reach the Claude API. Check your connection."); }
      if (!res.ok) throw await failure(res, "key");
      return await res.json()              ;
    },
  };
}

/** Plug 2 (later): a hosted backend at `url` that takes the same request, adds the key and returns the same response. */
export function hostedConnector(url        , doFetch        = (u, i) => fetch(u, i))            {
  return {
    label: "the vCloudOne AI service",
    async send(req, signal) {
      let res          ;
      try { res = await doFetch(url, { method: "POST", signal, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(req) }); }
      catch (e) { if ((e         ).name === "AbortError") throw e; throw new Error("Couldn't reach the AI service. Check your connection."); }
      if (!res.ok) throw await failure(res, "hosted");
      return await res.json()              ;
    },
  };
}

// ---------- settings (kept in this browser only) ----------
                                                                                                                                                   
export const DEFAULT_AI             = { plug: "off", key: "", remember: false, model: MODELS[0][0], standIns: true, hostedUrl: "" };
const KEY = "vcfStudio.ai";
                                                                                                                       

export function loadAi(st              )             {
  try {
    const o = JSON.parse(st?.getItem(KEY) || "null");
    if (!o || typeof o !== "object") return { ...DEFAULT_AI };
    const s = { ...DEFAULT_AI, ...o }              ;
    if (!MODELS.some(m => m[0] === s.model)) s.model = DEFAULT_AI.model;
    if (!["off", "key", "hosted"].includes(s.plug)) s.plug = "off";
    s.standIns = s.standIns !== false;
    return s;
  } catch { return { ...DEFAULT_AI }; }
}
/** Saved without the key unless the user asked to remember it on this device. */
export function saveAi(st              , s            ) {
  try { st?.setItem(KEY, JSON.stringify({ ...s, key: s.remember ? s.key : "" })); } catch { /* storage blocked: settings last for this visit */ }
}
export const aiReady = (s            ) => (s.plug === "key" && /^sk-ant-/.test(s.key.trim())) || (s.plug === "hosted" && /^https:\/\//.test(s.hostedUrl));
export function connectorFor(s            , doFetch        )                   {
  if (!aiReady(s)) return null;
  return s.plug === "key" ? keyConnector(s.key.trim(), doFetch) : hostedConnector(s.hostedUrl, doFetch);
}

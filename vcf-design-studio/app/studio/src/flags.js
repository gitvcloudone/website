// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Feature flags, editions and entitlements: the one place that decides which features are on, and for whom.
// Two editions run on the same code: "classic" (VCF Design Studio, no AI) and "ai" (VCF Design Studio:
// AI-powered). The page says which it is (data-edition on <html>). Within an edition, every feature is on
// and free for everyone today. When a Pro tier comes, move a feature's tiers to ["pro", "broadcom"] here
// and nothing else changes: the page asks `enabled()` before showing it. No DOM; tested.

/** Who is using the tool. "free" until accounts exist; "broadcom" for verified broadcom.com Google accounts. */
                                               
export const TIERS         = ["free", "pro", "broadcom"];

/** Which app this is. Classic never shows, loads or calls any AI. */
                                       
export const EDITIONS                                    = {
  classic: { name: "VCF Design Studio" },
  ai: { name: "VCF Design Studio: AI-powered" },
};

                                                                                                   
                                                                                              

/** editions: where the feature exists at all (left out: both). tiers: who gets it there. */
                                                                            
const ALL         = [...TIERS];

/** Every feature, the editions it's in and the tiers that get it. Edit here to gate a feature. */
export const FEATURES                               = {
  easyButton: { label: "Easy button", tiers: ALL },
  expertView: { label: "Expert view", tiers: ALL },
  rvtoolsImport: { label: "RVTools import", tiers: ALL },
  designFile: { label: "Save and open design files", tiers: ALL },
  designOutput: { label: "Design output page (HLD preview, diagrams, IP plan)", tiers: ALL },
  exportWord: { label: "HLD as Word", tiers: ALL },
  exportPdf: { label: "HLD as PDF", tiers: ALL },
  exportDiagrams: { label: "Diagrams as SVG, PNG and draw.io", tiers: ALL },
  exportTables: { label: "Prerequisites and IP plan as Excel", tiers: ALL },
  aiCopilot: { label: "AI design copilot (with the user's own key)", tiers: ALL, editions: ["ai"] },
  aiWriter: { label: "AI drafts of HLD sections (with the user's own key)", tiers: ALL, editions: ["ai"] },
};

let current       = "free", edition          = "classic";
let overrides                                    = {};

/** The current user's tier (set by sign-in once accounts exist). */
export const tier = () => current;
export function setTier(t      ) { current = t; }

/** This app's edition (the page sets it at start-up; classic unless it says otherwise). */
export const currentEdition = () => edition;
export function setEdition(e         ) { edition = e in EDITIONS ? e : "classic"; }
/** The app's name, for the page and the documents it makes. */
export const productName = () => EDITIONS[edition].name;

/** For tests and local previews: force features on or off. Pass {} to clear. */
export function setOverrides(o                                   ) { overrides = { ...o }; }

/** Is this feature on, in this edition, for the current user? */
export function enabled(f         , t       = current)          {
  if (overrides[f] !== undefined) return overrides[f] ;
  const x = FEATURES[f];
  return (!x.editions || x.editions.includes(edition)) && x.tiers.includes(t);
}

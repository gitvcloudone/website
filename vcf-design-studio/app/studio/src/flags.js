// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Feature flags and entitlements: the one place that decides which features are on, and for whom.
// Today every feature is on and free for everyone. When a Pro tier comes, move a feature's tiers to
// ["pro", "broadcom"] here and nothing else changes: the page asks `enabled()` before showing it.
// No DOM; tested.

/** Who is using the tool. "free" until accounts exist; "broadcom" for verified broadcom.com Google accounts. */
                                               
export const TIERS         = ["free", "pro", "broadcom"];

                                                                                                   
                                                                   

                                                      
const ALL         = [...TIERS];

/** Every feature and the tiers that get it. Edit here to gate a feature. */
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
};

let current       = "free";
let overrides                                    = {};

/** The current user's tier (set by sign-in once accounts exist). */
export const tier = () => current;
export function setTier(t      ) { current = t; }

/** For tests and local previews: force features on or off. Pass {} to clear. */
export function setOverrides(o                                   ) { overrides = { ...o }; }

/** Is this feature on for the current user? */
export function enabled(f         , t       = current)          {
  if (overrides[f] !== undefined) return overrides[f] ;
  return FEATURES[f].tiers.includes(t);
}

// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The design document: one versioned JSON object holding every choice. Everything else reads or
// writes this. Sections follow the guided flow; inside them the engine's own field names are used,
// so the mapping to the engine (designToEngine) is direct.
import { DEFAULTS } from "../knowledge.js";
                                                                       

export const FORMAT = "vcf-design";
export const FORMAT_VERSION = 7;

// Which sizing setting lives in which section. Together they are exactly the page's settings (DEFAULTS + project text).
export const SECTION_KEYS = {
  project: ["customer", "site", "notes", "version"],
  fleet: ["profile", "automation", "logs", "logReplicas", "opsNet", "opsNetNodes", "opsNetCollectors"],
  policy: ["cpuRatio", "mgmtRatio", "ramRatio", "memReserve", "vsanMem", "memFill", "vmOverhead", "growth", "uplift", "activePct", "storageBasis"],
  addons: ["vdefend", "ids", "mps", "ssp", "gwfw", "vlrOn", "vlrVms", "aviOn", "aviCtl", "aviSe", "aviSeSize", "aviSeOn", "hcxOn", "hcxNe", "hcxNeHa", "dsmOn"],
}                                                               ;
                                                    
                                                                                       

                                                                                                                                    
export const DEFAULT_SCOPE               = { includeOff: true, templatesStorage: true, exVcls: true, patterns: "", groupBy: "file" };

/** parsed: an RVTools group's values as read from the files (format 2+), so hand edits show and can be reset; null for manual groups and when not known. */
                                                                                                                                                          

/** Explicit choices on the skippable guided steps (format 3+). Whether a step is "decided" is worked out from its values. */
                                                   
export const STEP_CHOICES                        = ["recommended", "skipped"];
                                                                

/** Identity & access (format 4+). "" = not decided yet. A role's scope is "fleet" or an instance / domain id; "" when that was removed. */
                                                       
                                                                      
                           
                                                                                       
                                                                                     
 
export const newIdentity = ()           => ({ mode: "", idp: "", provisioning: "", roles: [], breakGlass: { holder: "", vault: "", rotationDays: 0, notes: "" } });

/** Host networking (format 5+). Per-cluster values are stored only where they differ from the recommendation. */
                                                                                          
/** A domain's NSX connectivity (format 6+): recommended values stored only when changed; ASNs (0 = not entered) when entered. */
                            
                                                                                                          
                                                                               
 
                          
                                           
                                                                                 
                                   
                                       
                                      
                                     
 
export const newNetwork = ()          => ({ domain: "", dns: "", ntp: "", hostNics: {}, clusters: {}, domains: {} });

/** IP / VLAN plan (format 7+): what's entered (or proposed) for each network, keyed "<instance, domain or cluster id>:<network>". */
                                                                      
                                                                                        
export const newPlan = ()       => ({ base: "", vlanStart: 0, rows: {} });

                         
                        
                        
                                                                                  
                                                                  
                            
                          
                        
                     
                            
                     
                   
             
                       
 

const pick =                        (n   , s                         ) => Object.fromEntries(SECTION_KEYS[n].map(k => [k, s[k]]))              ;

/** Split flat page settings into design sections. */
export function sectionsFromSettings(s          ) {
  const r = s                                      ;
  return { project: pick("project", r)                     , fleet: pick("fleet", r), policy: pick("policy", r), addons: pick("addons", r) };
}

/** Flat page settings from a design (the engine's `s`). */
export function settingsFromDesign(d        )           {
  return { ...d.project, ...d.fleet, ...d.policy, ...d.addons }            ;
}

/** A new, empty design with today's defaults. */
export function newDesign()         {
  return {
    format: FORMAT, formatVersion: FORMAT_VERSION,
    ...sectionsFromSettings({ ...DEFAULTS, customer: "", site: "", notes: "" }),
    workload: { groups: [], rvtoolsScope: { ...DEFAULT_SCOPE } },
    hostTypes: [], topology: { instances: [] },
    identity: newIdentity(),
    network: newNetwork(),
    plan: newPlan(),
    decisions: { steps: {} },
  }          ;
}

/** Engine inputs for a design: exactly what the page passes to size(). A deep copy, so sizing never touches the design. */
export function designToEngine(d        ) {
  const c = structuredClone(d);
  return {
    s: { ...settingsFromDesign(c) },
    hostTypes: c.hostTypes,
    topo: c.topology,
    groups: c.workload.groups.map(g => ({ ...g }))           ,
    scope: c.workload.rvtoolsScope,
  };
}

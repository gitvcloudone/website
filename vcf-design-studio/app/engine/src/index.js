// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// VCF sizing engine: pure functions, no DOM. Design in → results, warnings out.
// Pipeline (size): workload demand after ratios → management and add-on load → hosts per cluster by
// CPU, RAM and storage (largest wins, recorded as the cluster's limiter) → minimums and spares → licensing.
export * from "./knowledge.js";
export { ramOptions, defaultHw, fixHw, hwText } from "./hardware.js";
export { isVsan, maxFor, tierMax, hostCfg, localPol, policy, policyMin, dedupeAllowed, profName, clusterFloor, sizeCluster } from "./cluster.js";
export { zeroLoad, addLoad, workloadTotals, groupDemand, flatten, size, largeVms, checks } from "./fleet.js";
export { COLS, HCOLS, parseRVTools, excludeRules, buildGroups } from "./rvtools.js";
                                
                                                                          
                                                                               
                                                                                          
export { FORMAT, FORMAT_VERSION, SECTION_KEYS, DEFAULT_SCOPE, newDesign, designToEngine, sectionsFromSettings, settingsFromDesign } from "./design/document.js";
export { loadDesign, parseHostTypesFile, mergeHostTypes, serializeDesign } from "./design/load.js";
export { MIGRATIONS, migrateDesign } from "./design/migrations.js";
                                                                                                                  
export { STEP_CHOICES, newIdentity, newNetwork, newPlan, NARRATIVE_TARGETS } from "./design/document.js";
                                                                                                                                                       
                                                                   
                                                                
                                                        
export { clusterReason, summaryLine, hostsFor } from "./explain.js";

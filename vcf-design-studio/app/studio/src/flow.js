// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// The guided flow (whiteboard "VCF guided design flow"). Required steps must be filled in; skippable
// ones offer Skip for now / Use recommended; "coming" ones are built in a later step of the plan.
                                                                                           
                                                                                             

export const STEPS         = [
  { id: "start", n: 1, title: "Start", kind: "start", blurb: "Start a new design or open one." },
  { id: "project", n: 2, title: "Project", kind: "required", blurb: "Who it's for, where, and which VCF version." },
  { id: "workload", n: 3, title: "Workload", kind: "required", blurb: "The VMs to run: RVTools exports, totals by hand, or both." },
  { id: "policy", n: 4, title: "Sizing policy", kind: "skippable", blurb: "CPU and memory ratios, reserves and growth." },
  { id: "fleet", n: 5, title: "Fleet management", kind: "skippable", blurb: "Deployment model and fleet-wide management services." },
  { id: "identity", n: 6, title: "Identity & access", kind: "coming", blurb: "Identity Broker, identity provider, roles and break-glass." },
  { id: "hosts", n: 7, title: "Host types", kind: "required", blurb: "The server models you plan to use." },
  { id: "topology", n: 8, title: "Topology", kind: "required", blurb: "Instances, workload domains and clusters." },
  { id: "storage", n: 9, title: "Cluster storage", kind: "skippable", blurb: "vSAN policy, capacity reserves, memory tiering." },
  { id: "hostnet", n: 10, title: "Host networking", kind: "coming", blurb: "VDS, uplinks and VLANs." },
  { id: "nsx", n: 11, title: "NSX & connectivity", kind: "coming", blurb: "Edges, Tier-0 / Tier-1 gateways and BGP." },
  { id: "addons", n: 12, title: "Add-ons", kind: "skippable", blurb: "vDefend, Live Recovery, Avi, HCX, Data Services Manager." },
  { id: "review", n: 13, title: "Review", kind: "review", blurb: "Everything decided, skipped and open." },
  { id: "output", n: 14, title: "Design output", kind: "output", blurb: "High-level design, diagrams and tables." },
];
export const stepById = (id        ) => STEPS.find(s => s.id === id);

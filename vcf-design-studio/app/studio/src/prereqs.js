// Built from TypeScript by studio/build.mjs. Edit the .ts source, then run npm run build.
// Prerequisites by owning team: what has to be ready before deployment, worked out from this design
// (its networks, DNS records, host types, identity choices and licences). `done` when the design already
// holds what's needed. A pure function of the design (no DOM); tested.
import { IDENTITY, isVsan } from "../../engine/src/index.js";
                                                                      
import { allClusters, effective, nicsOf } from "./hostnet.js";
import { allDomains, effectiveNsx, asns } from "./nsx.js";
import { planNets, dnsRecords } from "./ip.js";

                                                                                                                                       
export const TEAMS         = ["Network", "DNS and NTP", "Servers", "Storage", "Identity and security", "Licensing and Broadcom", "VCF team"];
                                                                                   

const nf = (n        ) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const plural = (n        , w        ) => `${nf(n)} ${w}${n === 1 ? "" : "s"}`;

export function prerequisites(d        , r              )           {
  const out           = [], add = (team      , item        , detail        , done = false) => out.push({ team, item, detail, done });
  const nets = planNets(d, r), recs = dnsRecords(d, r), net = d.network;

  // Network
  for (const n of nets.filter(x => x.kind === "vlan")) {
    const row = d.plan.rows[n.key] || {};
    add("Network", `VLAN and subnet: ${n.name} (${n.where})`, row.vlan && row.cidr ? `VLAN ${row.vlan}, ${row.cidr}${row.gw ? `, gateway ${row.gw}` : ""}, trunked to the hosts` : `At least /${n.prefix}, with a gateway; trunked to the hosts`, !!(row.vlan && row.cidr && row.gw));
  }
  for (const n of nets.filter(x => x.kind === "block")) {
    const row = d.plan.rows[n.key] || {};
    add("Network", `IP block: ${n.name} (${n.where})`, row.cidr ? row.cidr : `A /${n.prefix} block`, !!row.cidr);
  }
  const mtus = [...new Set(allClusters(d).map(({ c }) => effective(d, c).mtu))];
  if (mtus.length) add("Network", "MTU end to end", `${mtus.join(" and ")} bytes on the switch ports, VLANs and routed paths for vMotion, vSAN and TEP networks (1,500 on management)`);
  for (const h of d.hostTypes) if (r.clusters.some(x => x.c.hw.id === h.id)) {
    const speeds = [...new Set(allClusters(d).filter(({ c }) => c.hostType === h.id).map(({ c }) => effective(d, c).nicGbps))];
    add("Network", `Switch ports: ${h.name}`, `${nicsOf(d, h.id)} ports per host at ${speeds.join(" / ") || "?"} Gb/s, ${plural(r.clusters.filter(x => x.c.hw.id === h.id).reduce((a, x) => a + x.total, 0), "host")}, plus out-of-band management`);
  }
  for (const { inst, dm } of allDomains(d)) {
    const v = effectiveNsx(d, dm), a = asns(d, dm), at = d.topology.instances.length > 1 ? `${inst.name} / ${dm.name}` : dm.name;
    if (v.model === "centralized" && dm.edges.length) add("Network", `BGP peering for the Tier-0 gateway (${at})`, a.localAsn && a.peerAsn ? `Local ASN ${a.localAsn}, peer ASN ${a.peerAsn}; peering on VLANs A and B${v.bfd ? ", with BFD" : ""}` : "Local and peer ASNs, peer addresses on the two peering VLANs", !!(a.localAsn && a.peerAsn));
  }

  // DNS and NTP
  add("DNS and NTP", "DNS servers reachable from the management network", net.dns || "Not entered yet", !!net.dns);
  add("DNS and NTP", "NTP servers reachable from the management network", net.ntp || "Not entered yet", !!net.ntp);
  add("DNS and NTP", "DNS domain", net.domain || "Not entered yet", !!net.domain);
  const fqdns = recs.reduce((a, x) => a + x.fqdn, 0);
  if (fqdns) add("DNS and NTP", "Forward and reverse DNS records", `${plural(fqdns, "FQDN")} (A and PTR), resolving both ways before deployment: ${recs.map(x => `${x.label} ${x.fqdn}`).join(", ")}`);

  // Servers
  const byType = new Map                (); for (const x of r.clusters) byType.set(x.c.hw.id, (byType.get(x.c.hw.id) || 0) + x.total);
  for (const [id, n] of byType) {
    const h = d.hostTypes.find(x => x.id === id) || r.clusters.find(x => x.c.hw.id === id) .c.hw;
    const vsan = r.clusters.some(x => x.c.hw.id === id && isVsan(x.c));
    add("Servers", `${plural(n, "host")}: ${h.name}`, `${h.sockets} × ${h.cores}-core, ${nf(h.ramGB)} GB RAM${h.nvme ? `, ${h.nvme} × ${h.nvmeTB} TB NVMe` : ""}; on the Broadcom Compatibility Guide${vsan ? " as a vSAN ESA ReadyNode or certified components" : ""}`);
  }
  if (byType.size) {
    add("Servers", "Firmware, drivers and BIOS settings", "At versions supported for this VCF release, the same on every host in a cluster");
    add("Servers", `ESX ${d.project.version} installed on every host`, "With a static management IP, the DNS name, and NTP set");
  }

  // Storage
  for (const x of r.clusters.filter(c => !isVsan(c.c))) add("Storage", `${x.c.storage === "fc" ? "Fibre Channel LUNs" : "NFS exports"} for ${x.c.name}`, `${nf(x.extTiB)} TiB presented to all ${plural(x.total, "host")}, multipathed`);

  // Identity and security
  const id = d.identity;
  add("Identity and security", "Identity provider for VCF Single Sign-On", id.idp ? `${IDENTITY.providers[id.idp]?.label || id.idp}: an application registration for VCF, with the groups below` : "Not chosen yet", !!id.idp);
  add("Identity and security", "Groups for VCF roles", id.roles.length ? id.roles.map(x => x.group).filter(Boolean).join(", ") : "Not mapped yet: groups for administrators, operators and read-only users", id.roles.length > 0 && id.roles.every(x => x.group.trim()));
  add("Identity and security", "Break-glass accounts", id.breakGlass.holder && id.breakGlass.vault ? `Held by ${id.breakGlass.holder}, stored in ${id.breakGlass.vault}${id.breakGlass.rotationDays ? `, rotated every ${id.breakGlass.rotationDays} days` : ""}` : "A named holder and a vault for local admin credentials", !!(id.breakGlass.holder && id.breakGlass.vault));
  add("Identity and security", "Certificates", "Decide on VMCA or an enterprise CA; if enterprise, the CA and signing process ready");

  // Licensing and Broadcom
  if (r.clusters.length) {
    add("Licensing and Broadcom", "VCF licences", `${nf(r.lic.licCores)} cores${r.lic.addOnTiB ? `, plus ${nf(r.lic.addOnTiB)} TiB vSAN add-on` : ""}${r.lic.vdefendCores ? `, ${nf(r.lic.vdefendCores)} vDefend cores` : ""}${r.lic.aviSU ? `, ${nf(r.lic.aviSU)} Avi service units` : ""}${r.lic.vlrVms ? `, ${nf(r.lic.vlrVms)} Live Recovery VMs` : ""}`);
  }
  add("Licensing and Broadcom", "Broadcom Support Portal access", "A Site ID with the entitlements, and a download token for the online depot");
  add("Licensing and Broadcom", "Software depot", "Internet access to the online depot (through a proxy if needed), or an offline depot");

  // VCF team
  add("VCF team", "Passwords and service accounts", "Agreed password policy and the service accounts the deployment needs");
  add("VCF team", "Design sign-off", "This design reviewed and its open items closed or accepted");
  return out;
}

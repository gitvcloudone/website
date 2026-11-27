// Fake RVTools exports, generated deterministically as the sheet rows SheetJS produces
// (XLSX.utils.sheet_to_json(sheet, { defval: null })): one object per row, every header present.
// No real customer data. Each export exercises a different part of parseRVTools / buildGroups.

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const uuid = (r) => "4201" + Array.from({ length: 28 }, () => Math.floor(r() * 16).toString(16)).join("");

const OS = ["Microsoft Windows Server 2022 (64-bit)", "Red Hat Enterprise Linux 9 (64-bit)", "Ubuntu Linux (64-bit)", "Microsoft Windows Server 2019 (64-bit)"];

// Build VMs for one vCenter. Returns plain VM specs; the sheets are derived from them below.
function makeVms(r, vc, clusters, n) {
  const vms = [];
  for (const cl of clusters) for (let i = 1; i <= 3; i++) vms.push({ name: `vCLS-${cl}-${i}`, cl, cpus: 1, memMiB: 128, disksMiB: [2048], usedMiB: 300, on: true, tpl: false });
  for (let i = 1; i <= n; i++) {
    const cl = clusters[i % clusters.length];
    const big = i % 37 === 0, small = i % 3 === 0;
    const cpus = big ? pick(r, [24, 32, 48, 64]) : small ? pick(r, [1, 2]) : pick(r, [2, 4, 4, 8, 8, 16]);
    const memMiB = (big ? pick(r, [256, 384, 512, 768]) : pick(r, [4, 8, 8, 16, 16, 32, 64])) * 1024;
    const disks = 1 + Math.floor(r() * 3), disksMiB = Array.from({ length: disks }, () => pick(r, [40, 60, 100, 200, 500, 1000]) * 1024);
    const alloc = disksMiB.reduce((a, b) => a + b, 0);
    const name = i % 29 === 0 ? `test-app${String(i).padStart(3, "0")}` : i % 31 === 0 ? `web${String(i).padStart(3, "0")}-old` : `${vc.split(".")[0]}-vm${String(i).padStart(4, "0")}`;
    vms.push({ name, cl, cpus, memMiB, disksMiB, usedMiB: Math.round(alloc * (0.2 + r() * 0.6)), on: r() > 0.12, tpl: false, noPartition: i % 11 === 0 });
  }
  for (let i = 1; i <= 3; i++) vms.push({ name: `tpl-${["win2022", "rhel9", "ubuntu"][i - 1]}`, cl: clusters[0], cpus: 2, memMiB: 4096, disksMiB: [61440], usedMiB: 15000, on: false, tpl: true });
  return vms.map(v => ({ ...v, uuid: uuid(r), os: pick(r, OS) }));
}

// Sheets for one export. style "mib" = current RVTools headers; "mb" = older headers (MB units, alternate names).
function sheets(r, vc, vms, hosts, { style = "mib", vDisk = true, vPartition = true, vCPU = true, vMemory = true, vHost = true } = {}) {
  const mb = style === "mb", toMB = (mib) => Math.round(mib * 1048576 / 1e6);
  const vInfo = vms.map(v => mb ? {
    "VM": v.name, "Power state": v.on ? "poweredOn" : "poweredOff", "Template": v.tpl ? "True" : "False", "# CPU": v.cpus, "Memory MB": toMB(v.memMiB),
    "Provisioned MB": toMB(v.disksMiB.reduce((a, b) => a + b, 0) + v.memMiB), "In Use MB": toMB(v.usedMiB + (v.on ? v.memMiB : 0)),
    "SMBIOS UUID": v.uuid, "VI SDK Server type": vc, "Cluster": v.cl, "OS according to the VMware Tools": v.os,
  } : {
    "VM": v.name, "Powerstate": v.on ? "poweredOn" : "poweredOff", "Template": v.tpl, "CPUs": v.cpus, "Memory": v.memMiB,
    "Provisioned MiB": v.disksMiB.reduce((a, b) => a + b, 0) + v.memMiB, "In Use MiB": v.usedMiB + (v.on ? v.memMiB : 0),
    "VM UUID": v.uuid, "VI SDK Server": vc, "Cluster": v.cl, "OS according to the configuration file": v.os,
  });
  const out = { vInfo };
  const srv = mb ? "VI SDK Server type" : "VI SDK Server";
  if (vDisk) out.vDisk = vms.flatMap(v => v.disksMiB.map(d => ({ "VM": v.name, [mb ? "Capacity MB" : "Capacity MiB"]: mb ? toMB(d) : d, [srv]: vc })));
  if (vPartition) out.vPartition = vms.filter(v => !v.noPartition && !v.tpl).map(v => ({ "VM": v.name, [mb ? "Consumed MB" : "Consumed MiB"]: mb ? toMB(v.usedMiB) : v.usedMiB, [srv]: vc }));
  if (vCPU) out.vCPU = vms.map(v => ({ "VM": v.name, "Overall": v.on ? Math.round(v.cpus * 2600 * (0.05 + r() * 0.4)) : 0, [srv]: vc }));
  if (vMemory) out.vMemory = vms.map(v => ({ "VM": v.name, "Active": v.on ? Math.round(v.memMiB * (0.05 + r() * 0.3)) : 0, "Consumed": v.on ? Math.round(v.memMiB * (0.4 + r() * 0.5)) : 0, [srv]: vc }));
  if (vHost) out.vHost = hosts.map((h, i) => ({ "Host": h.name, "# Cores": h.cores, "# Memory": h.memMiB, "CPU Model": h.model, "Cluster": h.cl,
    "Speed": h.mhz, "CPU usage %": 20 + (i * 7) % 50, "Memory usage %": 40 + (i * 11) % 45 }));
  return out;
}

const hostsFor = (vc, clusters, per, model, cores, memGiB, mhz) => clusters.flatMap(cl => Array.from({ length: per }, (_, i) => ({ name: `esx${String(i + 1).padStart(2, "0")}-${cl}.${vc}`, cl, cores, memMiB: memGiB * 1024, model, mhz })));

export function fakeExports() {
  // A: current headers, every sheet, 2 clusters, 180 VMs
  const ra = rng(11), vcA = "vc-a.lab.example";
  const vmsA = makeVms(ra, vcA, ["prod-cl01", "prod-cl02"], 180);
  const A = { fileName: "RVTools_export_all_fake-a.xlsx", ...sheets(ra, vcA, vmsA, hostsFor(vcA, ["prod-cl01", "prod-cl02"], 6, "Intel(R) Xeon(R) Gold 6338 CPU @ 2.00GHz", 64, 1024, 2000)) };
  // a VM with an empty name and one with a null name (skipped by the parser)
  A.vInfo.push({ ...A.vInfo[5], "VM": "" }, { ...A.vInfo[6], "VM": null });

  // B: older headers (MB units), no vPartition / vCPU / vMemory; 12 VMs copied from A with the same UUID (duplicates)
  const rb = rng(22), vcB = "vc-b.lab.example";
  const vmsB = [...makeVms(rb, vcB, ["dr-cl01"], 70), ...vmsA.slice(20, 32).map(v => ({ ...v, cl: "dr-cl01" }))];
  const B = { fileName: "RVTools_export_all_fake-b.xlsx", ...sheets(rb, vcB, vmsB, hostsFor(vcB, ["dr-cl01"], 4, "AMD EPYC 7543 32-Core Processor", 64, 768, 2800), { style: "mb", vPartition: false, vCPU: false, vMemory: false }) };

  // C: no vHost sheet, no vDisk (storage falls back to vInfo)
  const rc = rng(33), vcC = "vc-c.lab.example";
  const vmsC = makeVms(rc, vcC, ["edge-cl01"], 25);
  const C = { fileName: "RVTools_export_all_fake-c.xlsx", ...sheets(rc, vcC, vmsC, [], { vHost: false, vDisk: false }) };

  // D: not an RVTools export (no vInfo); E: vInfo without a CPUs column
  const D = { fileName: "not-rvtools.xlsx", vInfo: null };
  const E = { fileName: "RVTools_broken.xlsx", vInfo: C.vInfo.map(({ ["CPUs"]: _, ...rest }) => rest) };
  return { A, B, C, D, E };
}

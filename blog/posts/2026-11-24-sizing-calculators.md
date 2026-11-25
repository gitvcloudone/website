---
title: New on vCloudOne: sizing calculators
date: 2026-11-24
type: update
product: site
topics: vmware, cloud
sources:
  - EVS Sizing | /evs-sizing/
  - VMC Sizing | /vmc-sizing/
  - VCF Sizing | /vcf-sizing/
---
I've added three sizing calculators to the site, one each for Amazon EVS, VMware Cloud on AWS and on-prem VCF.

All three take the same input: RVTools exports, or workload totals typed in by hand. From there they work out how many hosts you need for CPU, memory and storage, add the management overhead the platform runs, apply growth and headroom, and tell you which resource sets the host count.

- **EVS Sizing:** hosts and clusters for Amazon EVS, including VCF core counts for licensing.
- **VMC Sizing:** SDDCs, clusters and hosts, with workload groups you can place in a specific SDDC or protect to another one for DR, a topology diagram, and a memory tiering estimate per cluster.
- **VCF Sizing:** fleets, instances, workload domains and clusters on your own hardware, with licensing and the overhead of add-ons like VCF Operations and NSX Edges.

Everything runs in your browser, so customer data never leaves your machine. Hover over any default to see why it's set that way. The Excel export keeps your settings, so you can load a sizing again later and change it.

I built them for architects and partners who need a first sizing they can defend in a meeting. Confirm with the official tools before anything goes into a quote.

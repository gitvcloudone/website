---
title: Multiple NSX Tier-0 gateways on Amazon EVS
date: 2026-01-23
type: update
product: evs
topics: hyperscalers, vmware
diagram: multiple-tier0
sources:
  - AWS What's New: Amazon EVS now supports multiple VMware NSX Edge Gateways | https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-evs-multiple-vmware-nsx-edge-gateways/
---
You can now run more than one NSX Tier-0 gateway in an EVS environment, each on its own Edge cluster.

That gives you two things. You can spread north-south traffic across gateways for more throughput, and you can keep production and non-production, or different tenants, on separate routing and security policies. If you've been running separate environments just to keep routing apart, this may let you consolidate.

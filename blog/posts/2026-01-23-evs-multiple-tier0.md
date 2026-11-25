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
## What
You can now run more than one Tier-0 gateway in an EVS environment, each on its own Edge cluster.

## Why it matters
You can split north-south traffic for throughput, and keep environments like production and non-production (or different tenants) on separate routing and security policies.

## Who it's for
EVS customers who need separate routing domains, more north-south throughput, or tenant isolation.

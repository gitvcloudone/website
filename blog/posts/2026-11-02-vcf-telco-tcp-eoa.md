---
title: VMware Telco Cloud Platform SKUs end, VCF Telco takes over
date: 2026-11-02
type: update
product: vcf
topics: vmware
sources:
  - Broadcom blog: Introducing VMware Cloud Foundation Telco: Unified Platform for Telco-Grade Infrastructure | https://blogs.vmware.com/cloud-foundation/2026/11/02/introducing-vmware-cloud-foundation-telco/
---
Standalone VMware Telco Cloud Platform (TCP) licensing SKUs reached end of availability on November 2, 2026. Telco deployments are now licensed under the standard VMware Cloud Foundation (VCF) SKU, using the name VCF Telco.

TCP is no longer a separate product line. Current and upcoming telco features fold into the standard VCF SKU, putting VNFs, CNFs, IT workloads, and AI on one VCF operating model from data center to edge instead of separate network and IT stacks. The main technical details worth noting are 2-year LTS on every minor Kubernetes release, NVMe memory tiering without a hardware RAID requirement, compression with global deduplication, and optional vDefend micro-segmentation.

If you already run TCP, nothing changes immediately. Current subscriptions and all of their components stay supported through the transition, and the SKU change shows up at renewal when your environment moves onto the VCF SKU. Ahead of renewal, verify how your existing TCP entitlements map to VCF.

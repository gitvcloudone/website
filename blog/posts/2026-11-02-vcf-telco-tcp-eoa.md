---
title: VMware Telco Cloud Platform SKUs end, VCF Telco takes over
date: 2026-11-02
type: update
product: vcf
topics: vmware
sources:
  - Broadcom blog: Introducing VMware Cloud Foundation Telco: Unified Platform for Telco-Grade Infrastructure | https://blogs.vmware.com/cloud-foundation/2026/11/02/introducing-vmware-cloud-foundation-telco/
  - Broadcom KB 460517: End of Availability of VMware Telco Cloud Platform | https://knowledge.broadcom.com/external/article/460517/end-of-availability-of-vmware-telco-clou.html
---
Standalone VMware Telco Cloud Platform (TCP) licensing SKUs reached end of availability on November 2, 2026. Telco deployments are now licensed under the standard VMware Cloud Foundation (VCF) SKU, using the name VCF Telco.

TCP was a separate, telecom-focused bundle with its own standalone SKU, validated bill of materials, and release cadence, sold in Essentials and Advanced tiers alongside a separate TCP RAN line. While standard enterprise VCF focused on IT workloads, TCP packaged vSphere, vSAN, NSX, VMware Cloud Director, Tanzu Kubernetes Grid (TKGm), and Telco Cloud Automation (TCA) for ETSI-style VNF and CNF orchestration, Kubernetes lifecycle, and carrier data-plane tuning. That tuning covered NSX Enhanced Data Path with DPDK, SR-IOV, Multus secondary networks, real-time kernels, and vCPU pinning, plus PTP and GNSS timing on RAN. Because of that packaging split, many operators ended up running two separate VMware stacks: TCP for network functions and standard VCF for enterprise IT.

TCP is no longer a separate product line. Current and upcoming telco features fold into the standard VCF SKU, putting VNFs, CNFs, IT workloads, and AI on one VCF operating model from data center to edge. Under Broadcom KB 460517, TCP maps to VCF Telco, TCA maps to VCF Telco Services, TKGm maps to VKS, and VMware Cloud Director maps to VCF Automation. On the platform side, VCF Telco includes 2-year LTS on every minor Kubernetes release, NVMe memory tiering without a hardware RAID requirement, compression with global deduplication, and optional vDefend micro-segmentation.

If you already run TCP, nothing changes immediately. Current subscriptions and all of their components stay supported through the transition, and the SKU change shows up at renewal when your environment moves onto the VCF SKU. Ahead of renewal, verify how your existing TCP entitlements and components map to VCF.

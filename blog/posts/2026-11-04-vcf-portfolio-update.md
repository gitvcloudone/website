---
title: vSphere Express, Live Recovery and DR built into VCF
date: 2026-11-04
type: update
product: vcf
topics: vmware
diagram: vsphere-express
sources:
  - Broadcom blog: VCF portfolio update | https://blogs.vmware.com/cloud-foundation/?p=35885
  - Network World: Broadcom expands VMware Cloud Foundation with AI, security, and recovery capabilities | https://www.networkworld.com/article/4244653/broadcom-expands-vmware-cloud-foundation-with-ai-security-and-recovery-capabilities.html
---
Broadcom announced three changes to the VCF portfolio in early November.

**vSphere Express.** A new entry edition built on vSphere 9, for customers with up to 128 cores across all their environments. It includes vMotion, High Availability (VMs restart on another host if one fails), the Distributed Switch, vCenter Quick Patch, and TPM 2.0 and vTPM support. It's aimed at small sites and smaller businesses that need solid virtualization without the full VCF stack.

**Two new Advanced Services for VCF:**
- **VMware Live Recovery** focuses on cyber recovery. When ransomware hits, you can't simply fail over, because the replicas may be infected too. Live Recovery gives you an isolated clean room to bring up recovery points, scan them and find a clean one before restoring to production.
- **VMware Compliance and Configuration Management** checks workloads continuously against benchmarks like CIS or your own standards, and fixes drift automatically.

**Native disaster recovery.** Broadcom plans to build DR orchestration into VCF and VVF themselves, covering recovery of thousands of workloads after outages, hardware failures or human error. It's planned for the next VCF release, with GA estimated for Broadcom's fiscal Q1 2027.

The native DR is the one I'm watching. Today DR on VCF usually means an add-on product with its own licensing. If basic DR orchestration comes built in, recovery designs for both on-prem and EVS get simpler and cheaper.

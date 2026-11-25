---
title: Amazon EVS gets r7i hosts, external principal storage and an Agent Skill
date: 2026-11-17
type: update
product: evs
topics: hyperscalers, vmware, ai
diagram: r7i-fsxn
sources:
  - AWS What's New: Amazon EVS launches support for r7i.metal instances, external principal storage, and an Agent Skill | https://aws.amazon.com/about-aws/whats-new/2026/11/amazon-evs-r7i-agent-skill-support/
  - GitHub: Solutions for Amazon EVS release v1.1.0 | https://github.com/aws/solutions-for-amazon-evs/releases/tag/v1.1.0
  - Amazon EC2 R7i instances | https://aws.amazon.com/ec2/instance-types/r7i/
---
Amazon EVS now supports r7i.metal-24xl and r7i.metal-48xl hosts for VCF 9.x, external principal storage on Amazon FSx for NetApp ONTAP, and an Agent Skill for AI assistants.

**r7i hosts.** These are memory-optimized hosts on 4th Gen Intel Xeon (Sapphire Rapids):
- **r7i.metal-24xl:** 48 cores, 768 GiB.
- **r7i.metal-48xl:** 96 cores, 1,536 GiB.

Unlike i4i and i7i, they have no local NVMe drives at all.

**External principal storage.** Every VCF cluster needs a principal datastore, the main datastore where its VMs live. Until now on EVS that was always vSAN, built from the NVMe in each host. That meant storage only grew by adding hosts, and you paid for drives whether you needed them or not. With external principal storage, the cluster's main datastore is an FSx for ONTAP volume instead. Hosts without disks, like r7i, become possible, and compute and storage can be sized and scaled separately.

The EVS Deployment Orchestrator can create the FSx file system for you (Single-AZ, in the stack's VPC) or use an existing volume. With FSx, a simple deployment needs only two hosts. ONTAP also brings its own tools, such as snapshots, SnapMirror replication to another Region for DR, and storage efficiency.

**Who should look at it.** Memory-heavy workloads like databases and in-memory analytics, where vSAN hosts would leave you paying for unused NVMe. Estates that need lots of storage but not much compute. Teams already running FSx for ONTAP.

**Agent Skill.** AWS also released an Amazon EVS Agent Skill in the Solutions for Amazon EVS repo. Copy it into your AI agent's skills folder and the agent can answer EVS questions from the documentation, citing the page. It can also run EDO deployments in four phases: prepare a validated blueprint and plan, run it after you approve, monitor it and diagnose failures, then handle day-two tasks like adding hosts. It asks before every change and never reads secret values. If you're automating EVS builds, it's worth trying.

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
---
Amazon EVS now supports r7i.metal-24xl and r7i.metal-48xl for VCF 9.x. These are memory-optimized hosts with no local NVMe, so AWS also added support for external principal storage. In practice that means Amazon FSx for NetApp ONTAP instead of vSAN. The EVS Deployment Orchestrator can create the FSx file system for you, and with FSx a simple deployment needs only 2 hosts.

Until now you bought compute and vSAN storage together. With r7i and FSx you can size them separately, so memory-heavy workloads don't pay for NVMe they won't use, and storage can grow without adding hosts. If you already run FSx for ONTAP, this is the easiest way to get storage off the hosts.

The same launch included an Amazon EVS Agent Skill. You point your AI agent at the skill file in the EVS GitHub repo, and it can answer planning questions, suggest designs, write blueprints and run deployments through the orchestrator. If you're automating EVS builds, it's worth trying.

---
title: Amazon EVS, one year in
date: 2026-11-24
type: article
featured: true
product: evs
topics: hyperscalers, vmware
summary: Amazon EVS went GA a little over a year ago. Here's what changed since, what I think matters most, and what to look at if you're planning a move.
sources:
  - AWS blog: A year of expanding choice for VMware customers on AWS | https://aws.amazon.com/blogs/migration-and-modernization/a-year-of-expanding-choice-for-vmware-customers-on-aws/
  - AWS What's New: Amazon EVS VCF 9.0 and 9.1 support | https://aws.amazon.com/about-aws/whats-new/2026/07/amazon-evs-vcf9/
  - AWS What's New: Amazon EVS enables support for 32 hosts per environment | https://aws.amazon.com/about-aws/whats-new/2026/05/amazon-evs-32-hosts/
  - AWS What's New: Amazon EVS launches support for r7i.metal instances, external principal storage, and an Agent Skill | https://aws.amazon.com/about-aws/whats-new/2026/11/amazon-evs-r7i-agent-skill-support/
  - AWS blog: Increase your cluster density with Memory Tiering in Amazon EVS | https://aws.amazon.com/blogs/migration-and-modernization/increase-your-cluster-density-with-memory-tiering-in-amazon-elastic-vmware-service/
---
Amazon EVS went GA a little over a year ago. At launch it was a fairly narrow service: VCF 5.2 on i4i hosts, deployed into your own VPC, with a limit of 16 hosts per environment. A year later it looks quite different. Here's what changed, and what I'd pay attention to if you're planning a move.

## VCF 9 is the big one

In July, EVS added support for VCF 9.0 and 9.1. EVS still sets up the hosts and the VPC networking, but you install VCF yourself with Broadcom's VCF Installer. That's a real change from the VCF 5.2 experience, where EVS ran the whole deployment for you.

{{diagram:vcf9-on-evs}}

The trade-off is worth it. VCF 9 brings memory tiering, the newer operations stack, and a clear upgrade path. If you want the deployment automated anyway, the EVS Deployment Orchestrator (EDO) builds the networking, hosts and VCF 9 from one CloudFormation stack in about four to seven hours.

My advice: sort out your VCF subscription and the installer steps before the hosts arrive. Evaluation mode is supported, which helps for proofs of concept.

## Bigger environments

The limit went from 16 hosts per environment to 32. That sounds like a small change, but it means fewer environments to run, and fewer copies of vCenter, NSX and the other management appliances. It's a service quota, so ask for it early.

{{diagram:evs-32-hosts}}

## More hosts to choose from

EVS started with i4i only. This year it added:

- **i7i.metal-24xl** in April, a smaller host on a newer CPU.
- **i7i.metal-48xl** in August, twice the size, for bigger clusters.
- **r7i.metal-24xl and 48xl** in November, memory-optimized hosts with no local NVMe.

The r7i launch is the one I find most interesting. Because those hosts have no local disks, EVS now supports external principal storage, which means Amazon FSx for NetApp ONTAP instead of vSAN. For the first time on EVS you can size compute and storage separately. Memory-heavy workloads don't have to pay for NVMe they won't use, and storage can grow without adding hosts.

## Memory tiering changes the sizing math

With VCF 9, ESX can use local NVMe as a second tier of memory. AWS says a cluster can address up to twice the effective memory with the same number of hosts, and it works on both i4i and i7i.

There's a catch that's specific to EVS: NVMe you give to memory tiering comes out of vSAN. So you can't size tiering and storage separately. Plan them together, and keep active memory well inside DRAM.

## More Regions

EVS added fourteen Regions in twelve months: seven in December, three in July (Seoul, Zurich, Stockholm) and four in September (Osaka, Taipei, Spain, Tel Aviv). That matters for data residency, and for DR designs that need a second Region nearby.

{{diagram:evs-regions}}

## The smaller things that add up

- **Windows Server licensing** from AWS, per vCPU-hour, for VMs without license portability.
- **Broadcom support** for VCF software issues, alongside AWS Support.
- **Multiple NSX Tier-0 gateways** for separate routing domains and more north-south throughput.
- **VCF and ESX version selection** when you create environments or add hosts.
- **NSX Federation** design guidance for multi-site networking and DR.

## Where I'd start

If you're looking at EVS today, I'd start on VCF 9.1, size with memory tiering in mind, and decide early whether vSAN or FSx for ONTAP should hold your data. If you're coming from VCF 5.x on-prem, the deployment guide and sizers on this site are a good first step.

Views here are my own.

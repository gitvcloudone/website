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
  - AWS blog: Deploying VCF 9 on Amazon EVS with the EVS Deployment Orchestrator | https://aws.amazon.com/blogs/migration-and-modernization/one-stack-full-vcf-deploying-vmware-cloud-foundation-9-on-amazon-evs-with-the-evs-deployment-orchestrator/
  - Amazon EC2 I7i instances | https://aws.amazon.com/ec2/instance-types/i7i/
---
Amazon EVS went GA a little over a year ago. At launch it was a fairly narrow service: VCF 5.2 on i4i hosts, deployed into your own VPC, with a limit of 16 hosts per environment. A year later it looks quite different. Here's what changed, why it matters, and what I'd pay attention to if you're planning a move.

## VCF 9 is the big one

In July, EVS added support for VCF 9.0 and 9.1, and the way you deploy changed with it.

With VCF 5.2, EVS did everything. You described the environment, and EVS built the hosts, the networking, and the whole VCF stack on top. With VCF 9, the work is split. EVS provisions the bare-metal hosts running ESX 9, places them in your VPC and connects them to the VLANs that make up the VCF underlay. Then you run Broadcom's VCF Installer and deploy VCF the same way you would on-premises.

{{diagram:vcf9-on-evs}}

That split is deliberate. EVS now runs standard VCF 9, installed the standard way, so the runbooks, skills and Broadcom documentation you already have apply as they are. New VCF releases don't have to wait for EVS to rework its automation either.

If you'd rather not run the installer by hand, the EVS Deployment Orchestrator (EDO) does it all. You write one YAML blueprint and launch one CloudFormation stack. It builds the AWS networking (Route 53, the Resolver endpoint, DHCP, VPC Route Server and BGP), creates the hosts, then deploys vCenter, vSAN, NSX, SDDC Manager, VCF Operations and an NSX Edge cluster. A full run takes about four to seven hours, unattended.

My advice either way: sort out your VCF subscription, depot access and installer steps before the hosts come up, because that's when host billing starts. Evaluation mode is supported, which helps for proofs of concept.

## Bigger environments

The limit went from 16 hosts per environment to 32.

An EVS environment is one VCF instance, with its own management domain: vCenter, NSX Manager, SDDC Manager, VCF Operations and NSX Edges. Every environment you run means another set of those to patch, back up and keep certificates current on, and another slice of capacity spent on management VMs. Doubling the limit means a lot of estates now fit in one environment instead of two. It's a service quota, so ask for it early, and check your EC2 vCPU quota at the same time, since bare-metal hosts count against it too.

{{diagram:evs-32-hosts}}

## More hosts to choose from

EVS launched with one host type. Now there are five:

- **i4i.metal:** 64 cores, 1,024 GiB, eight 3.75 TB NVMe drives. The original.
- **i7i.metal-24xl** (April): 48 cores on 5th Gen Xeon, 768 GiB, six NVMe drives.
- **i7i.metal-48xl** (August): 96 cores, 1,536 GiB, twelve NVMe drives.
- **r7i.metal-24xl and 48xl** (November): 48 or 96 cores, 768 or 1,536 GiB, and no local drives at all.

AWS says i7i gives up to 23% better compute and more than 10% better price performance than i4i. The host choice matters more on EVS than you might expect, because VCF is subscribed per physical core. Your bill is the EC2 hosts plus the VCF cores on them, so fewer, faster cores can save on both.

The r7i launch is the one I find most interesting. Because those hosts have no disks, EVS now supports external principal storage: the cluster's main datastore can be an Amazon FSx for NetApp ONTAP volume instead of vSAN. Until now, the only way to add storage on EVS was to add hosts, and every host came with NVMe whether you needed it or not. Now compute and storage scale separately. Memory-heavy workloads stop paying for drives they don't use, and a big storage estate doesn't need extra hosts just for capacity. With FSx, a simple deployment can be as small as two hosts.

## Memory tiering changes the sizing math

VCF 9 can use local NVMe as a second tier of memory. A tiering engine watches which memory pages each VM actually touches. Busy pages stay in DRAM, and idle ones move to NVMe once the host passes about 80% memory use. Most VMs actively use only a fraction of the memory they're given, so a host can run far more VMs than its DRAM alone would allow.

On EVS the default ratio is 1:1, so each host gets as much NVMe memory as it has DRAM. AWS's example is four hosts with 1 TB of DRAM each. Without tiering that's 4 TB of memory. With tiering it's 8 TB, enough to roughly double the VM count, as long as active memory stays well inside DRAM. The rule of thumb is to keep active memory under about half of DRAM, and to size against active memory, not consumed memory.

There's a catch specific to EVS. At deployment, vSAN claims all the NVMe in each host. To use a drive for tiering, you evacuate it from vSAN first, and that capacity comes out of your datastore. So you can't size tiering and storage separately: every drive you give to memory is storage you lose. Plan them together, or pair tiering with an FSx for ONTAP datastore to make up the difference.

## More Regions

EVS added fourteen Regions in under a year: seven in December, three in July (Seoul, Zurich, Stockholm) and four in September (Osaka, Taipei, Spain, Tel Aviv). An EVS environment lives in one Availability Zone, so protecting against a Regional outage means a second environment in another Region. More Regions make it easier to find a DR pair that's close by and still inside the same country.

{{diagram:evs-regions}}

## The smaller things that add up

- **Windows Server licensing from AWS:** for VMs without license portability, billed per vCPU-hour while each VM runs. It removes a common blocker for Windows-heavy migrations.
- **Broadcom support:** VCF software cases can go straight to Broadcom. AWS still covers the whole stack.
- **Multiple NSX Tier-0 gateways:** separate routing domains and more north-south throughput, each on its own Edge cluster.
- **Version selection:** pick the VCF and ESX versions when you create an environment or add hosts, so EVS can match what you run on-prem.
- **Design guidance:** AWS published deep dives on NSX Federation, DR patterns from cold standby to hot, and memory tiering.

## Where I'd start

If you're looking at EVS today, I'd start on VCF 9.1 and decide three things early: which host type fits your CPU-to-memory ratio, whether memory tiering is part of the plan, and whether your data belongs on vSAN or FSx for ONTAP. Those three choices drive the host count, and so the bill, more than anything else. If you're coming from VCF 5.x on-prem, the deployment guide and the sizers on this site are a good place to start.

Views here are my own.

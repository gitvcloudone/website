---
title: Three good reads: NSX Federation, DR and memory tiering on EVS
date: 2026-08-21
type: update
product: evs
topics: hyperscalers, vmware
diagram: nsx-federation
sources:
  - AWS blog: Amazon EVS with NSX Federation for Disaster Recovery and Multi-site Networking | https://aws.amazon.com/blogs/migration-and-modernization/amazon-evs-with-nsx-federation-for-disaster-recovery-and-multi-site-networking/
  - AWS blog: Disaster Recovery for VMware Workloads on Amazon EVS | https://aws.amazon.com/blogs/migration-and-modernization/disaster-recovery-for-vmware-workloads-on-amazon-evs/
  - AWS blog: Increase your cluster density with Memory Tiering in Amazon EVS | https://aws.amazon.com/blogs/migration-and-modernization/increase-your-cluster-density-with-memory-tiering-in-amazon-elastic-vmware-service/
---
In one week in August, AWS published three design posts for Amazon EVS. Together they cover the questions that come up once a migration is done.

**NSX Federation (Aug 18).** Federation joins several NSX deployments under one Global Manager. You define segments, gateways and distributed firewall rules once, and they apply at every site, whether on-premises or on EVS. Adding a site means registering it with the Global Manager and deploying local Edge nodes, after which existing segments and rules extend to it. For DR, AWS describes Active-Standby Tier-0 gateways with network failover in under a minute, if you automate the NSX and AWS route changes. The firewall rules are already in place at the recovery site when VMs arrive. It's the option for stretching many networks across sites. For a handful of VLANs across two sites, HCX Network Extension is simpler.

**DR options (Aug 19).** The post lays out four patterns, from cheapest and slowest to most expensive and fastest:
- **Cold:** nothing deployed until disaster. Recovery takes 8+ hours, and you lose data back to the last backup.
- **Pilot light:** a small EVS environment of 2 to 4 hosts that scales out on failover. About 4+ hours to recover, with minutes of data loss.
- **Warm standby:** a smaller cluster sized for critical workloads. About 2+ hours, minutes of data loss.
- **Hot:** a full copy of production, recovering in about 15 minutes. Infrastructure-level hot DR needs vSAN stretched clusters, which EVS doesn't have yet.

For tooling, VMware Live Recovery with vSphere Replication gets you about a five-minute RPO, FSx for ONTAP SnapMirror about five minutes, and Veeam CDP a few seconds. A useful tip: run non-critical workloads at the DR site day to day and shut them down in a disaster to free capacity.

**Memory tiering (Aug 21).** With VCF 9.1, ESX keeps hot memory pages in DRAM and moves cold ones to local NVMe once host memory use passes about 80%. On EVS the default ratio is 1:1, so each host gets as much NVMe memory as it has DRAM, and effective memory doubles. Size against active memory, not consumed memory, and keep active memory under about half of DRAM. Don't combine tiering with memory overcommit.

The EVS-specific catch: vSAN claims all of a host's NVMe at deployment. To use a drive for tiering, you have to evacuate it from vSAN first, and that capacity comes out of your datastore. Plan tiering and storage together, or add an FSx for ONTAP datastore to make up the difference.

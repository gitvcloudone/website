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
AWS put out three design posts for Amazon EVS in one week:

- **Aug 18:** NSX Federation on EVS. One Global Manager spans on-prem and EVS sites, with shared segments and firewall policy.
- **Aug 19:** A walk-through of DR options for VMware workloads on EVS, from nothing pre-deployed to a full standby cluster.
- **Aug 21:** Using VCF 9 memory tiering to fit more VMs on each host.

These answer the questions that usually come up once the migration is done: how to stretch networks and security across sites, how much standby capacity DR really needs, and how far tiering can push density. One thing to remember on EVS is that NVMe you give to memory tiering comes out of vSAN, so size tiering and storage together.

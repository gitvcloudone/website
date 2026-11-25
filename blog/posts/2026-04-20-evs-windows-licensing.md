---
title: Windows Server licenses on Amazon EVS
date: 2026-04-20
type: update
product: evs
topics: hyperscalers, vmware
diagram: evs-windows-licensing
sources:
  - AWS What's New: Amazon EVS now offers Microsoft Windows Server Licensing | https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-evs-windows-server-licensing/
  - AWS blog: Windows Server licensing step-by-step guide | https://aws.amazon.com/blogs/migration-and-modernization/whats-new-amazon-evs-now-offers-windows-server-licensing-for-your-vmware-migrations/
---
You can now license Windows Server through AWS for VMs running on Amazon EVS, and pay per vCPU-hour while each VM runs.

**Why it's needed.** Running Windows Server on dedicated hosts in the cloud depends on license portability. Licenses with portability rights can be brought to EVS (BYOL), and AWS doesn't charge extra for those VMs. Many customers have VMs whose licenses can't move. Until now, those needed a separate licensing arrangement before they could migrate.

**How it works.**
- **Connector:** you create an EVS connector to vCenter. It's a read-only link: a vCenter SSO user in the ReadOnly group, with its credentials in Secrets Manager. EVS uses it to watch VM power state and vCPU count.
- **Entitlements:** you create entitlements listing which VMs are licensed through AWS, up to 100 VMs each.
- **Billing:** by vCPU-hour, only while the VM is powered on.
- **Activation:** the VMs activate against an AWS KMS host. You create a VPC interface endpoint for the EVS Windows activation service, allow TCP 1688 from the VMs, then point each VM at it with `slmgr /skms` and `slmgr /ato`. Group Policy or a script handles that at scale.

**Why it matters.** Licensing is often what blocks a Windows-heavy migration, and this removes that blocker without a new agreement. Because billing follows power state and vCPU count, right-sizing VMs and switching off idle ones now saves licence cost directly.

If you have Windows VMs without portability rights, this is probably the simplest way to cover them on EVS. Run BYOL VMs alongside them if you have eligible licenses, since those carry no extra AWS charge.

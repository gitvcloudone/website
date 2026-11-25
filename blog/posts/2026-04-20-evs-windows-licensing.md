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
You can now get Windows Server licenses from AWS for VMs running on Amazon EVS, whether you migrate them in or build them new. You add an entitlement per VM through an EVS vCenter connector, and billing is per vCPU-hour while the VM runs.

This solves a real gap. VMs without license portability rights used to need a separate licensing plan, and now you can cover them inside EVS and drop the entitlement when you don't need it. VMs where you bring your own license don't cost anything extra from AWS.

---
title: Pick your VCF and ESX versions on Amazon EVS
date: 2026-01-20
type: update
product: evs
topics: hyperscalers, vmware
sources:
  - AWS What's New: Amazon EVS now supports VCF and VMware ESX software version selection | https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-evs-vcf-vmware-esx-software-version/
---
When you create an EVS environment or add hosts, you can now pick a supported VCF and ESX version combination, from the console or the CreateEnvironment API.

This helps most during a migration, when you want EVS on the same version you run on-prem. It also means hosts you add later can stay on the same build as the ones you already have, instead of whatever is newest.

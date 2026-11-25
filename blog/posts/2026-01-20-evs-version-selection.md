---
title: Pick your VCF and ESX versions on Amazon EVS
date: 2026-01-20
type: update
product: evs
topics: hyperscalers, vmware
sources:
  - AWS What's New: Amazon EVS now supports VCF and VMware ESX software version selection | https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-evs-vcf-vmware-esx-software-version/
---
Amazon EVS now lets you pick a supported combination of VCF and ESX versions instead of always getting whatever EVS deploys by default. This launch also added VCF 5.2.2 for new environments.

It works through three APIs. GetVersions lists the combinations EVS supports. CreateEnvironment takes the VCF version when you build a new environment. CreateEnvironmentHost takes the ESX version when you add hosts to an existing one.

Why it matters: a migration goes more smoothly when the target runs the same version as the source. HCX, vMotion compatibility and your runbooks all behave more predictably when on-prem and EVS match. It also matters on day two. When you add hosts months after the first build, you want them on the same ESX build as the rest of the cluster, not a newer one that leaves the cluster running mixed builds until you upgrade it.

If you automate EVS builds, call GetVersions first and pin the version in your templates rather than relying on the default.

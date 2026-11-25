---
title: VMware Cloud on AWS SDDCs will move to version 9.1
date: 2026-11-03
type: update
product: vmc
topics: hyperscalers, vmware
sources:
  - Broadcom blog: What's Coming Next: VMware Cloud on AWS SDDC Upgrade to Version 9.1 | https://blogs.vmware.com/cloud-foundation/2026/11/03/whats-coming-next-vmware-cloud-on-aws-sddc-upgrade-to-version-9-1/
---
The SDDC software on VMware Cloud on AWS is being upgraded to version 9.1. This is an upgrade of the SDDC software components themselves, not another 1.26 release. Broadcom is still finalizing feature details and will share them in later communications.

The rollout comes in three phases, and the timelines are still being worked out:

- **Early Access:** By nomination only, for testing applications in a non-production organization. You ask through your account team or the VMware Cloud on AWS product team, and Broadcom decides who gets in.
- **General Availability:** Expected sometime in calendar year 2027. From that point, new SDDCs deploy on 9.1 by default.
- **Fleet Upgrades:** Soon after GA, the Fleet Upgrades phase is expected to begin, moving existing SDDCs, including those on 1.26, to 9.1. All new and existing SDDCs, including those on 1.26, are planned to move to 9.1 throughout 2027.

Some rules are already settled. You can't stay on 1.26. This is a managed service, so Broadcom performs the upgrade with advance notice and no action needed on your side. You also can't mix 9.1 and 1.26 clusters in one SDDC, since every cluster in an SDDC has to run the same version. What you can do, once GA is out, is deploy a new 9.1 SDDC next to your existing 1.26 SDDCs until those are upgraded.

The operating model stays the same. Broadcom still handles patching and lifecycle, the uptime SLA stays at 99.9% (99.99% on a stretched cluster), and 24/7 global support and SRE coverage continue. Until your SDDC is upgraded, 1.26 releases keep shipping as usual. Version 9.1 is expected to be supported on i4i, i3en and i7i instances, plus future instance types added to the service.

If you run production on VMC, ask about Early Access now so you can test your applications in a non-production org before fleet upgrades begin. Plan around 2027 but don't treat it as fixed, since the announcement is marked forward-looking and subject to change.

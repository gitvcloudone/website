---
title: VMware Cloud on AWS SDDCs will move to version 9.1
date: 2026-11-03
type: update
product: vmc
topics: hyperscalers, vmware
sources:
  - Broadcom blog: What's Coming Next: VMware Cloud on AWS SDDC Upgrade to Version 9.1 | https://blogs.vmware.com/cloud-foundation/2026/11/03/whats-coming-next-vmware-cloud-on-aws-sddc-upgrade-to-version-9-1/
---
Broadcom says the SDDC software on VMware Cloud on AWS will be upgraded to version 9.1. That's a change of the managed stack itself, not another 1.26 patch. Feature-level details are still being finalized and will come in later communications.

The rollout is planned in three phases, with timelines still in development:

- **Early Access:** nomination only, for application testing in a non-production organization. Ask your account team or the VMware Cloud on AWS product team; Broadcom decides who gets in.
- **General Availability:** expected sometime in calendar year 2027. From then on, new SDDCs will be deployed on 9.1 by default.
- **Fleet Upgrades:** soon after GA, existing SDDCs, including those on 1.26, move to 9.1. Broadcom says all new and existing SDDCs will go through this during 2027.

A few rules are already set. There is no option to stay on 1.26; this is a managed service, and Broadcom performs the upgrade with advance notice and no customer action required. You cannot mix 9.1 and 1.26 clusters in the same SDDC, because every cluster in an SDDC has to run the same version. You can, once GA is out, deploy a new 9.1 SDDC alongside existing 1.26 SDDCs until those older ones are upgraded.

The operating model does not change. Broadcom still handles patching and lifecycle, the uptime SLA stays at 99.9% (99.99% on a stretched cluster), and 24/7 global support and SRE coverage continue. Until your SDDC is upgraded, 1.26 releases keep shipping as usual. Broadcom anticipates 9.1 will run on i4i, i3en and i7i hosts, and on later instance types added to the service.

If you have production on VMC, I'd ask about Early Access so you can test applications in a non-prod org before fleet upgrades start. Treat the 2027 timing as a plan, not a fixed date: Broadcom marks this announcement as forward-looking and subject to change.

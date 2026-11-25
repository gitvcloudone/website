---
title: You can now raise the Elastic DRS storage warning
date: 2026-11-20
type: update
product: vmc
topics: hyperscalers, vmware
sources:
  - VMware Cloud on AWS release notes: November 20, 2026 | https://techdocs.broadcom.com/us/en/vmware-cis/cloud/vmware-cloud-on-aws/SaaS/vmware-cloud-on-aws-release-notes.html
---
## What
The Elastic DRS storage warning used to be fixed at 65%. You can now move it up to 75% through the Autoscaler API.

## Why it matters
If your SDDCs run storage-heavy, that 65% warning can go off during normal operation. Now you can set it closer to the point where you'd actually act. Because it's an API setting, it's easy to apply across several SDDCs.

## Who it's for
Customers with storage-heavy SDDCs, and whoever automates their Elastic DRS policies.

---
title: You can now take EVS VCF issues straight to Broadcom
date: 2026-05-26
type: update
product: evs
topics: hyperscalers, vmware
diagram: evs-support
sources:
  - AWS blog: Amazon EVS expands support options with Broadcom | https://aws.amazon.com/blogs/migration-and-modernization/amazon-evs-expands-support-options-with-broadcom/
---
Until now every Amazon EVS support case went through AWS, whatever the problem was. Now customers with an active VCF subscription can also open VCF software cases directly with Broadcom.

**How the two paths split:**
- **AWS Support** still covers everything: EC2 hosts, VPC networking, the EVS service and API, and the VCF software. It stays the single point of contact if you want one. EVS requires a Business or Enterprise support plan, so you already have it.
- **Broadcom Support** covers only the VCF software: vCenter, ESX, NSX, vSAN, SDDC Manager and the rest. You open cases on the Broadcom Support Portal with your VCF subscription entitlements, the same way you would for on-prem VCF.

**Why it matters.** For a pure VCF software issue, say a vSAN health alarm or an NSX Edge bug, going straight to Broadcom skips a hop and puts you in front of the engineers who own that code. For anything that touches AWS, start with AWS.

Agree on this internally before you need it. Decide which kinds of issues go where, and make sure the people on call have access to the Broadcom portal under the right site.

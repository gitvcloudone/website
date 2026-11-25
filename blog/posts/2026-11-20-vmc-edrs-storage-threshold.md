---
title: You can now raise the Elastic DRS storage warning
date: 2026-11-20
type: update
product: vmc
topics: hyperscalers, vmware
sources:
  - VMware Cloud on AWS release notes: November 20, 2026 | https://techdocs.broadcom.com/us/en/vmware-cis/cloud/vmware-cloud-on-aws/SaaS/vmware-cloud-on-aws-release-notes.html
  - Broadcom KB 320749: vSAN cluster disk space usage is approaching capacity | https://knowledge.broadcom.com/external/article/320749/vmc-vsan-cluster-disk-space-usage-is-app.html
---
You can now raise the Elastic DRS storage warning on VMware Cloud on AWS from 65% up to 75%.

**What Elastic DRS does.** Elastic DRS watches each cluster's CPU, memory and storage and adds or removes hosts based on policy. Storage is the one with a hard edge: vSAN needs free space for rebuilds and policy changes. So VMC adds a host automatically when a cluster's storage reaches 80%, whatever your policy says. The warning threshold sends a notification before that point, so you have time to clean up or plan capacity yourself.

**The change.** The warning used to be fixed at 65%. You can now set it anywhere from 65 to 75 by putting `storage_utilization_warning_threshold` in the `edrs_policy_options_overrides` of the cluster's Elastic DRS policy, through the Autoscaler API. KB 463122 has example request bodies.

**Why it matters.** On storage-heavy clusters, 65% can be normal day-to-day use, so the warning fires constantly and people learn to ignore it. That's the worst outcome for an alert. Setting it closer to where you'd actually act keeps it meaningful. Leave enough room between the warning and the 80% automatic scale-out to respond, especially on clusters that grow fast.

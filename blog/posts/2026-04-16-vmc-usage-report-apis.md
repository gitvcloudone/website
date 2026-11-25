---
title: Usage Report APIs for VMware Cloud on AWS
date: 2026-04-16
type: update
product: vmc
topics: hyperscalers, vmware
sources:
  - Broadcom blog: VMware Cloud on AWS: Introducing the Usage Report APIs | https://blogs.vmware.com/cloud-foundation/2026/04/16/vmware-cloud-aws-usage-report-apis/
  - VMware Cloud on AWS release notes: April 16, 2026 | https://techdocs.broadcom.com/us/en/vmware-cis/cloud/vmware-cloud-on-aws/SaaS/vmware-cloud-on-aws-release-notes.html
---
VMware Cloud on AWS now has three usage report APIs, so you can pull consumption data into your own tools instead of waiting for the invoice.

They all follow the same pattern, `GET /activityanalytic/{org_id}/<type>/{freq}/usage-report`, return daily data, and accept up to 31 days per call:

- **Host usage** (`/hosts/`): the daily maximum number of hosts per instance type and Region group across all your SDDCs, with your subscription count next to it and any overage. Data goes back to February 2025.
- **Microsoft SPLA usage** (`/spla/`): daily Windows Server Datacenter and SQL Server Enterprise license usage per instance type and SDDC. SKUs look like `VOD-I4I-MSFT-SQL`. Data from January 2026.
- **Miscellaneous usage** (`/misc/`): the charges that aren't hosts, like internet egress, cross-Region transfer, Direct Connect data, Elastic IPs and Transit Connect. Data from January 2026.

The host report is the useful one for most people. Comparing actual hosts against subscribed hosts every day shows overage as it happens, which is when you can still do something about it. The misc report is where surprises usually come from, especially egress and Transit Connect.

If you run FinOps dashboards, wire these into the same place as the rest of your cloud spend. If you just want a readable report, Broadcom has a command-line tool that turns all three into an HTML report (KB 437094).

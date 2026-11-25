---
title: Amazon EVS adds seven Regions
date: 2025-12-15
type: update
product: evs
topics: hyperscalers, vmware
sources:
  - AWS What's New: Amazon EVS is now available in additional Regions | https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-evs-available-in-additional-regions
---
Amazon EVS is now in seven more Regions: US West (N. California), Asia Pacific (Hyderabad), Asia Pacific (Malaysia), Canada West (Calgary), Europe (Milan), Mexico (Central) and South America (São Paulo).

A quick reminder of how EVS uses a Region. An EVS environment runs on bare-metal EC2 hosts in your own VPC, inside one Availability Zone, so the Region decides where your VMs and their data physically live. It also decides what's close by: the AWS services your VMs will talk to, and the Direct Connect locations you'll use to reach on-premises.

That makes Region coverage a real factor for three kinds of projects: data residency, where data has to stay in a country; latency, where apps need to sit near users or other systems; and disaster recovery, where you want a second environment in a nearby Region. Before you plan on one of these Regions, check that the host type you want is offered there. Not every Region carries every EC2 metal instance.

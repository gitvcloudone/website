---
title: Multiple NSX Tier-0 gateways on Amazon EVS
date: 2026-01-23
type: update
product: evs
topics: hyperscalers, vmware
diagram: multiple-tier0
sources:
  - AWS What's New: Amazon EVS now supports multiple VMware NSX Edge Gateways | https://aws.amazon.com/about-aws/whats-new/2026/01/amazon-evs-multiple-vmware-nsx-edge-gateways/
  - AWS re:Post: Deploying multiple NSX Edge clusters in Amazon EVS | https://repost.aws/articles/ARUttZpYUrSIKLLyaR3txGkA
---
Amazon EVS now supports more than one NSX Tier-0 gateway in an environment, each on its own NSX Edge cluster.

Some background first. In NSX, VMs connect to overlay segments, and segments attach to Tier-1 gateways, which handle routing between those segments. The Tier-0 gateway sits above them and is the way in and out: it routes traffic between the overlay and everything outside it. On EVS, that means the Tier-0 exchanges routes with your VPC over BGP, through VPC Route Server. A Tier-0 runs on Edge nodes, the VMs that do the actual packet forwarding and services like NAT.

Until now, all of an environment's north-south traffic went through one Tier-0 and one Edge cluster. That's a single throughput ceiling, and a single routing and security domain shared by everything.

With multiple Tier-0s you can split that up. Traffic can be spread across Edge clusters for more total throughput. Production and non-production can sit behind different gateways with different routing and firewall policies. And you can stand up a separate gateway to test a configuration change or a gateway upgrade without touching the one production uses.

The cost is more Edge nodes to run and more BGP sessions to manage, so it's worth it when you need the isolation or the throughput, not by default. AWS has a re:Post article on deploying a second Edge cluster in EVS.

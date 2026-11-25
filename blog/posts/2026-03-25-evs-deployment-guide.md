---
title: Amazon EVS deployment prerequisites guide
date: 2026-03-25
type: update
product: site
topics: hyperscalers, vmware
sources:
  - Read the guide | /evs-guide/
  - Terraform | /evs-guide/#terraform
  - Validator | /evs-guide/#validator
---
## What
I wrote up everything EVS checks before it deploys VCF 5.x, in the order you'll need it: account and support plan, IAM, IP planning, VPC and subnets, Route 53, DHCP, VPC Route Server and BGP, capacity reservations, licensing and key pairs. It comes with a Terraform kit and a prerequisite validator.

## Why it matters
EVS validates everything up front and fails fast if something is missing, so getting the prep right the first time saves a lot of back and forth. For VCF 9, use the VCF Installer or the EVS Deployment Orchestrator instead.

## Who it's for
Anyone preparing a first EVS deployment on VCF 5.x.

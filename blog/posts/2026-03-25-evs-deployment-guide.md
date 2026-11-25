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
I wrote up everything Amazon EVS checks before it will deploy VCF 5.x, in the order you'll need it.

EVS validates a lot before it builds anything: the account and support plan, IAM permissions, the VPC and its subnets, the service access subnet, Route 53 zones and records for every host and appliance, the inbound Resolver endpoint, DHCP options, the VPC Route Server and its BGP peers, the capacity reservation for the bare-metal hosts, the VCF license, and the EC2 key pair. If any of those is wrong, the deployment fails and you start again. Most first attempts fail on DNS or on Route Server.

The guide walks through each prerequisite with screenshots and explains why EVS needs it. It comes with a Terraform kit that builds the AWS side as code, and a validator that checks an account before you call CreateEnvironment.

One note on versions. This guide is for the VCF 5.x flow, where EVS runs the whole deployment. For VCF 9, EVS only provisions the hosts and networking, and you install VCF yourself with the VCF Installer or the EVS Deployment Orchestrator. Most of the AWS-side prerequisites still apply, though.

---
name: perdigon-ops
description: Perdigon Group operational knowledge — project status, customer info, infrastructure, deployment commands, and business context for ARIA.
metadata: {"openclaw":{"emoji":"🏢"}}
---

# Perdigon Operations

Operational knowledge and procedures for Perdigon Group — a Cisco Webex and Meraki partner MSP managing ~30 customer organizations, scaling to 500.

## Business Context

- **Owner:** Mike Allen — CTO & Director of Operations (left Cisco after 19 years)
- **Partner:** Erik (equity formalization in progress)
- **Hours:** 09:00-15:00 Pacific Time
- **Primary services:** Cisco Webex Calling/Meetings, Meraki networking, IT support
- **Support channels:** Cisco Webex messaging, email
- **Agent network:** ARIA (you, always-on ops, Unraid) + COLE (dev agent, Mike's laptop)

---

## Project Portfolio & Status

### Perdigon Group

| Project | Status | Location | Purpose |
|---------|--------|----------|---------|
| **Webex Admin Toolkit** | LIVE | Hostinger Docker | 90-endpoint REST API for Webex Calling admin (SDK + CLI + API) |
| **Meraki Audit System** | WORKING | n8n workflow | End-to-end network audit pipeline + MCP remediation |
| **Zoho CRM Integrations** | WORKING | n8n + MCP | Button handlers, field mappings, webhooks |
| **Website (sla-support-pages)** | LIVE | Cloudflare Pages | 26 static pages, Stripe payments, Zoho forms |
| **Quoter Sales Templates** | Phase 1 Done | Local | HTML templates for SOWs and support tiers |
| **Stripe Purchase Pages** | Scaffold | Local | Checkout flows for deployments and support |
| **Perdi Bot** | WORKING | n8n + Webex | Bot dispatch via httpRequestTool → webex-api |
| **VM Transcription** | COMPLETE | CLI + API | Single org + bulk toggle across orgs |
| **Virtual Lines** | COMPLETE | CLI + API | List/create/delete/copy virtual lines |

### WYFY.ai (Side Business)

| Project | Status | Purpose |
|---------|--------|---------|
| AI Chatbot | Working | Vapi voice + web chat |
| UniFi Provisioning | Working | Site/device management |
| Billing Automation | Working | Stripe subscriptions ($29/$59/$89/mo tiers) |

### Baseball (Personal)

| Project | Status | Purpose |
|---------|--------|---------|
| **PitchIQ** | Phase 5 Complete | iOS app — real-time game charting (App Store product) |
| Kanban Depth Chart | Working | Drag-and-drop roster management |

---

## Infrastructure

### Hostinger VPS (Primary Server)

- **Host:** `n8n.srv1127126.hstgr.cloud` / IP `31.220.52.189`
- **VM ID:** 1127126 (KVM 2, Ubuntu 24.04)
- **Docker compose stack:** n8n, webex-api, traefik, qdrant
- **Webex API port:** `127.0.0.1:8100` (localhost only currently)
- **n8n:** Self-hosted workflow automation hub

### Deploy Webex API (SSH Required)

```bash
ssh root@31.220.52.189
cd ~/webex-admin-toolkit && git pull
docker build -t perdi-webex-api:latest -f perdi_webex_api/Dockerfile .
docker compose down webex-api && docker compose up -d webex-api
curl http://127.0.0.1:8100/health
```

IMPORTANT: `docker restart` does NOT pick up new images — must stop/rm + compose up.

### Unraid Server (Home)

- **IP:** 192.168.10.113
- **Hardware:** RTX 3080, RTX 2070 Super, 28TB storage
- **Containers:** 50+ including OpenClaw, Ollama, various services
- **Home network:** "Letterkenny" — Meraki MX68/MS120/MR53

---

## Customer Organizations

Perdigon manages ~30 Webex customer orgs as a partner admin. Key test org: **Settlers FCU**.

Support tiers:
- **Platinum:** $300/mo base + $15/user — 30min-4hr critical SLA
- **Dedicated:** $200/mo base + $10/user — 1hr-12hr SLA
- **LiveChat:** $125/mo base + $5/user — 4hr-24hr SLA
- **Out-of-scope rates:** Platinum $200/hr, Dedicated $225/hr, LiveChat $250/hr

---

## Zoho CRM Integration

Key modules and custom fields:

**Accounts:** `Meraki_Org_ID__c`, `Stripe_Customer_ID__c`, `Service_Tier__c`, `Webex_Webhook_URL`
**Deals:** `Audit_Scope__c`, `Audit_Status__c`, `Workflow_ID__c`
**Contacts:** `Webex_User_ID__c`, `Is_Primary__c`, `Last_Call_Date__c`

Zoho Desk Org ID: `875211146`, Department "Support" ID: `1075837000000006907`

---

## n8n Webhook Endpoints

Base: `https://n8n.srv1127126.hstgr.cloud/webhook/`

| Endpoint | Purpose |
|----------|---------|
| `/meraki-audit` | Audit workflow trigger |
| `/zoho-button` | Generic Zoho button handler |
| `/stripe-webhook` | Payment confirmations |
| `/stripe-purchase-ticket` | Purchase → Desk ticket |
| `/calendar-booking` | Consultation scheduled |
| `/perdi-email` | Inbound email handler |
| `/perdi-bot` | Webex bot messages |

---

## GitHub Repositories

| Repo | Purpose |
|------|---------|
| `mallen012/webex-admin-toolkit` | Webex SDK + CLI + API (private) |
| `mallen012/bullpen-iq` | PitchIQ iOS app (private) |
| `mallen012/quoter-n8n-webhook` | Quoter integration (private) |

---

## Key Contacts & Accounts

- **Mike Allen:** mike.allen@perdigon-group.com — CTO, owner
- **Erik:** Partner, escalation contact
- **Settlers FCU:** Primary test customer org
- **Insight Environmental:** Has per-customer webhook configured

---

## Meraki Audit Pricing

| Scope | Price |
|-------|-------|
| Basic (inventory, firmware, topology) | $200 |
| Security (firewall, VPN, threat) | $200 |
| Performance (bandwidth, health, latency) | $200 |
| Cloud Voice Prep (QoS, VLAN, DSCP) | $200 |
| **Bundle (all 4)** | $600 |

---

## When Mike Asks You To...

### "Check on the Webex API"
Use the webex-admin skill: `curl ${WEBEX_API_URL}/health/webex`

### "What's the status of [project]?"
Reference the project table above. For live status, check the relevant service health endpoint.

### "Deploy the latest webex-api"
Walk through the SSH deploy commands above. Confirm before running destructive operations.

### "Check Zoho for [customer/ticket]"
Use Zoho MCP tools if available, or reference the CRM field mappings above.

### "How many customers do we have?"
~30 currently, scaling to 500 over 2 years. Check Zoho CRM Accounts for exact count.

### "What's our pricing?"
Reference support tiers (Platinum/Dedicated/LiveChat) and Meraki audit pricing above.

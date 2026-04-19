---
name: webex-admin
description: Manage Cisco Webex Calling users, devices, and settings across Perdigon customer orgs via the Webex Admin Toolkit REST API on Hostinger.
metadata: {"openclaw":{"emoji":"📞","requires":{"bins":["curl"],"env":["WEBEX_API_URL","WEBEX_API_KEY"]},"primaryEnv":"WEBEX_API_KEY"}}
---

# Webex Admin Toolkit

Manage Cisco Webex Calling infrastructure for Perdigon Group's ~30 customer organizations. This skill connects to the Webex Admin Toolkit REST API (FastAPI, 90 endpoints) running on Hostinger.

## Authentication

Every request requires two headers:

```
X-API-Key: ${WEBEX_API_KEY}
X-Caller-Email: mike.allen@perdigon-group.com
```

Base URL: `${WEBEX_API_URL}` (e.g., `https://n8n.srv1127126.hstgr.cloud/webex-api`)

All responses return: `{"success": true/false, "data": {...}, "error": "..." or null}`

---

## Health Check

Verify API and Webex connectivity:

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" "${WEBEX_API_URL}/health"
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" "${WEBEX_API_URL}/health/webex"
```

---

## User Lookup

### Search users by name or email

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/?search=mike"
```

### Get user by email (preferred — most natural for voice/chat requests)

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}"
```

Replace `{email}` with the user's email address (URL-encoded if needed).

### Get user by person ID

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/{person_id}"
```

---

## Call Forwarding

### Get forwarding rules

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}/forwarding"
```

### Set call forwarding

Use the dispatch endpoint (simplest for bot/agent use):

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=set_forwarding&email={email}&forward_type=always&destination=9165551234&enabled=true"
```

**forward_type options:** `always`, `busy`, `noAnswer`
**destination:** Phone number or extension
**enabled:** `true` or `false`
**ring_reminder:** `true` or `false` (optional, plays reminder ring)

### Disable all forwarding

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=set_forwarding&email={email}&forward_type=always&enabled=false"
```

---

## Voicemail

### Get voicemail settings

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}/voicemail"
```

### Reset voicemail PIN to org default

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=reset_vm_pin&email={email}"
```

### Set custom voicemail PIN

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=reset_vm_pin&email={email}&new_pin=123456"
```

PIN must be 6+ digits and meet org complexity requirements.

---

## Do Not Disturb

### Get DND status

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}/dnd"
```

### Toggle DND

```bash
curl -s -X PUT -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  -H "Content-Type: application/json" -d '{"enabled": true}' \
  "${WEBEX_API_URL}/api/users/{person_id}/dnd"
```

---

## Call Intercept

Intercept redirects ALL incoming/outgoing calls. Used for termed employees or temporary call blocks.

### Get intercept status

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}/intercept"
```

### Enable/disable intercept via dispatch

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=set_intercept&email={email}&intercept_enabled=true&intercept_type=INTERCEPT_ALL"
```

**intercept_type options:** `INTERCEPT_ALL` (plays announcement), `BLOCK_ALL` (busy tone)

---

## Devices

### Get person's devices

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/users/by-email/{email}/devices"
```

### Get device online/offline status

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/devices/{device_id}/status"
```

Returns `connectionStatus`: `connected`, `disconnected`, or `connected_with_issues`.

### Push config to device (after making changes)

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/devices/{device_id}/apply-changes"
```

### Restart RoomOS device

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/devices/{device_id}/restart"
```

---

## Caller ID

### Get caller ID settings

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=get_caller_id&email={email}"
```

### Set caller ID

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=set_caller_id&email={email}&caller_id_number_type=ORG_NUMBER&caller_id_number=+19165551234"
```

**caller_id_number_type:** `DIRECT_LINE`, `LOCATION_NUMBER`, `ORG_NUMBER`, `CUSTOM`
**caller_id_name_policy:** `DIRECT_LINE`, `LOCATION`, `OTHER` (with `caller_id_name` for custom)

---

## Organization Info

### List all managed orgs

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/org/orgs"
```

### List locations in org

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/org/locations"
```

### License inventory

```bash
curl -s -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/org/licenses"
```

---

## Bulk Operations (Multi-Org)

### Audit VM rules across all orgs

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_audit_vm_rules"
```

### Full org settings audit

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_audit"
```

### License audit

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_license_audit"
```

### Set VM policy across orgs

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_set_vm_policy&passcode=123456&expire_days=180"
```

### Rebuild phones across orgs

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_rebuild_phones"
```

### Async: Reset all user PINs (returns job_id)

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_reset_user_pins&passcode=123456"
```

### Async: Set intercept for all users in an org

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_set_intercept&org_id=ORG_ID&intercept_enabled=true&intercept_type=INTERCEPT_ALL"
```

### Check async job status

```bash
curl -s -X POST -H "X-API-Key: ${WEBEX_API_KEY}" -H "X-Caller-Email: mike.allen@perdigon-group.com" \
  "${WEBEX_API_URL}/api/dispatch?action=bulk_job_status&job_id=JOB_ID"
```

---

## Dispatch Endpoint (Preferred for Bot/Agent Use)

The dispatch endpoint accepts ALL parameters as query strings — no request body needed:

```
POST ${WEBEX_API_URL}/api/dispatch?action={action}&email={email}&{other_params}
```

This is the simplest way to call any action. All per-user actions require `email`. All bulk actions are admin-only.

**Available actions:** `get_user`, `get_forwarding`, `set_forwarding`, `reset_vm_pin`, `get_devices`, `get_caller_id`, `set_caller_id`, `set_intercept`, `bulk_set_vm_policy`, `bulk_audit_vm_rules`, `bulk_audit`, `bulk_license_audit`, `bulk_rebuild_phones`, `bulk_device_settings`, `bulk_reset_user_pins`, `bulk_set_intercept`, `bulk_set_caller_id`, `bulk_job_status`

---

## Common Workflows

### "Is Mike's phone online?"
1. Get devices: `dispatch?action=get_devices&email=mike@example.com`
2. For each device_id, check status: `GET /api/devices/{device_id}/status`

### "Forward Lisa's calls to her cell"
1. `dispatch?action=set_forwarding&email=lisa@example.com&forward_type=always&destination=9165551234&enabled=true`

### "Reset voicemail for the new hire"
1. `dispatch?action=reset_vm_pin&email=newhire@example.com&new_pin=654321`

### "Block all calls for termed employee"
1. `dispatch?action=set_intercept&email=termed@example.com&intercept_enabled=true&intercept_type=BLOCK_ALL`

### "How many licenses do we have?"
1. `GET /api/org/licenses`

---

## Important Notes

- All write operations require admin tier access
- The API handles org context automatically — no need to specify org_id for per-user operations
- After changing calling features, push config to devices for immediate effect
- Async bulk jobs return a `job_id` — poll with `bulk_job_status` until complete
- PIN must meet org complexity requirements (typically 6+ digits, no repeated/sequential)

# OctoWP — WhatsApp Cloud API Migration (Design Spec)

**Date:** 2026-06-18
**Status:** Approved (design) — pending implementation plan

## Summary

Replace the unofficial Baileys (WhatsApp Web reverse-engineered) engine with the
**official Meta WhatsApp Cloud API**, used **directly** (no BSP). The app becomes
an **outbound-only** template campaign sender. All socket/webhook-dependent
features are removed. Contacts/Lists/Import (including the region-split feature)
and template-based campaign sending are kept.

Motivation: the user's WhatsApp number was restricted for bulk sending over
Baileys. The Cloud API is the legitimate, non-bannable (if compliant) path.

## Decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | WhatsApp backend | Remove Baileys, add official Cloud API mode |
| 2 | Provider | **Direct Meta** Cloud API (no BSP/360dialog/Twilio) |
| 3 | Webhook (inbound + delivery/read) | **None — outbound-only** |
| 4 | Templates | Created in **Meta WhatsApp Manager**; app **fetches approved** templates and uses them |
| 5 | Drip sequences | **Removed** (v1) |

### Forced consequences of "outbound-only"
Removed because they require inbound (webhook) or have no Cloud API equivalent:
- **Inbox** (incoming conversations)
- **Auto-reply** rules
- **Group number harvesting**
- **WhatsApp address-book contact sync**
- **Delivered / read / replied** tracking in campaign results
- **Poll** and **vCard** campaign content types
- Campaign audience filter **replied / not_replied**
- Inbound-driven **auto opt-out** (manual opt-out list stays)

## Goals / Non-goals

**Goals**
- Send approved-template marketing campaigns (with optional image header) to
  imported contact lists, mapping list columns to template variables.
- Configure Cloud API credentials in-app and verify the connection.
- Honest pacing/limit handling aligned with Cloud API rate limits and messaging tiers.
- Provide a step-by-step Meta setup guide.

**Non-goals (v1)** — Webhook, Inbox, Auto-reply, delivery/read receipts, group
harvesting, contact sync, drip sequences, poll/vCard, in-app template creation.

## Architecture

### 1. WhatsApp port redefinition
Replace `WhatsAppPort` ([electron/wa-engine/port.ts](../../../electron/wa-engine/port.ts))
with a Cloud-API-shaped interface (name: `CloudApiPort`):

```ts
interface CloudApiPort {
  verifyConnection(): Promise<{ ok: boolean; name?: string; phone?: string; quality?: string; error?: string }>
  listTemplates(): Promise<WaTemplate[]>           // APPROVED only
  uploadMedia(filePath: string, mime: string): Promise<{ id: string } | { error: string }>
  sendTemplate(input: SendTemplateInput): Promise<SendResult>
}
```

Removed methods: `connect/disconnect/onStatus/onIncoming/onAck/onContacts/getContacts/resyncContacts/exists/listGroups/groupParticipants/sendText/sendMedia/sendPresence/sendPoll/sendVCard`.

`SendResult` keeps `{ ok, id?, error?, banned? }` where `banned` is repurposed to
mean "account restricted → halt".

### 2. CloudApiAdapter (new)
`electron/wa-engine/cloud-api-adapter.ts` — implements `CloudApiPort` via Node
`fetch` against `https://graph.facebook.com/{GRAPH_VERSION}` (default `v21.0`,
stored as a constant, overridable in settings).

| Op | Request |
|---|---|
| Verify | `GET /{PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating` |
| List templates | `GET /{WABA_ID}/message_templates?limit=200` → filter `status === 'APPROVED'` |
| Upload media | `POST /{PHONE_NUMBER_ID}/media` (multipart: `messaging_product=whatsapp`, `file`, `type`) → `{ id }` |
| Send template | `POST /{PHONE_NUMBER_ID}/messages` (see payload below) |

All requests send `Authorization: Bearer {ACCESS_TOKEN}`.

**Send payload:**
```jsonc
{
  "messaging_product": "whatsapp",
  "to": "905xxxxxxxxx",
  "type": "template",
  "template": {
    "name": "promo_lastik",
    "language": { "code": "tr" },
    "components": [
      { "type": "header", "parameters": [ { "type": "image", "image": { "id": "<MEDIA_ID>" } } ] },
      { "type": "body",   "parameters": [ { "type": "text", "text": "Ahmet" }, { "type": "text", "text": "BOLGE07" } ] }
    ]
  }
}
```
Header component included only when the chosen template has a media header.

`baileys-adapter.ts` is deleted. `fake.ts` is rewritten to implement
`CloudApiPort` for tests (in-memory templates + recorded sends).

### 3. Campaign engine ([electron/campaign-engine/engine.ts](../../../electron/campaign-engine/engine.ts))
- Drop the `exists()` pre-check — attempt the send; Meta returns an error for
  non-WhatsApp numbers → mark `failed` (no charge).
- Drop typing simulation (`sendPresence`).
- `sendOnce` → builds components from the campaign's variable mapping + recipient
  `vars`, then calls `sendTemplate`.
- Result mapping:
  - HTTP 2xx → `sent` (= "submitted to Meta"; store returned message id).
  - Error → `failed` with Meta error message logged.
- Keep manual opt-out re-check, daily cap gate, active-hours gate, batch pauses,
  inter-send delay (now repurposed as rate-limit-safe pacing).
- **Error → action mapping** (refined during implementation, representative codes):
  - Account restricted / locked (`131031`, `368`, `131045`) → set campaign
    `halted`, stop loop (circuit breaker).
  - Rate limit (`130429`, `131049`) → backoff + retry (do not fail the recipient
    permanently on first hit).
  - Invalid/undeliverable recipient (`131026`, `1006`, etc.) → `failed`, continue.
  - Auth/token invalid (`190`) → halt with a clear "token geçersiz" message.

### 4. Screens & navigation
- **Account** ([src/screens/Account.tsx](../../../src/screens/Account.tsx)): QR/connect UI replaced
  with a credentials form — Access Token, Phone Number ID, WABA ID — plus
  "Bağlantıyı test et" (calls `verifyConnection`) showing verified name, phone,
  and quality rating.
- **Campaigns** ([src/screens/Campaigns.tsx](../../../src/screens/Campaigns.tsx)): composer changes from
  free-text/spintax to:
  1. Pick an approved template (fetched live).
  2. Map each body variable `{{n}}` → a list column **or** static text.
  3. If the template has an image header → pick a local photo (uploaded once,
     media id reused for all recipients).
  4. Audience: list or tag (replied/not_replied filter removed).
  - Poll/vCard options removed.
- **Removed screens + sidebar entries:** Inbox, Auto-reply, Groups; and the
  "Kişileri senkronize et" action on Contacts.
- **Kept:** Dashboard, Contacts (Rehber), Campaigns, Logs, Settings, Account.

### 5. Settings / pacing ([src/screens/Settings.tsx](../../../src/screens/Settings.tsx))
- Add Cloud API credential fields (also editable from Account).
- Reframe throttle: inter-send delays = rate-limit-safe pacing (can be small);
  "Günlük tavan" = your **messaging tier** ceiling (new numbers 250/24h, ramps
  automatically with quality). Remove warmup-ramp and typing-simulation UI.
- Keep active-hours window (optional but harmless).

### 6. Data model
- **Settings type** ([shared/types.ts](../../../shared/types.ts)): add `waToken`, `phoneNumberId`,
  `wabaId`, optional `graphVersion`. Token is sensitive → stored in the settings
  table (already covered by the encrypted backup). (OS-keychain storage noted as
  a future hardening, not v1.)
- **Campaign**: add template fields — `templateName`, `templateLang`,
  `variableMapping` (JSON: per-variable `{ kind: 'column' | 'static', value }`),
  and header media (`headerMediaPath` local file + cached `headerMediaId`).
  Existing `messageTemplate`/`poll*`/`vcard*` columns are left in the table but
  no longer used.
- **Tables for inbox/autoreply/sequences/groups are kept** (no destructive
  migration); all their **code paths, IPC channels, handlers, repo methods, and
  screens are removed**. Contacts/lists/tags/campaigns data is preserved.

### 7. Setup guide (deliverable)
`docs/whatsapp-cloud-api-setup.md` — step by step:
1. Meta Business account + (recommended) Business Verification.
2. Meta for Developers → create App → add WhatsApp product.
3. Add & verify a phone number (must not be active on a normal WhatsApp app).
4. Collect **Phone Number ID**, **WABA ID**, and a **System User permanent token**.
5. Create a marketing template in WhatsApp Manager (with optional image header) → submit for approval.
6. Enter credentials in OctoWP → Hesap → test connection.
7. Build the first campaign: pick template, map columns, choose photo, send a test.
8. Notes: per-message marketing pricing, messaging tiers (250→1K→10K→…), quality rating.

## Testing
- `cloud-api-adapter` unit tests with mocked `fetch`: correct send payload
  (header/body components), media upload multipart, error→failed mapping,
  rate-limit→backoff, account-restricted→halt, template list filtering to APPROVED.
- Engine tests updated to use the new fake `CloudApiPort`.
- Import/region tests and other unaffected suites remain green.

## File-level change list (indicative)
- **Add:** `electron/wa-engine/cloud-api-adapter.ts`, `electron/wa-engine/cloud-api-types.ts`, `docs/whatsapp-cloud-api-setup.md`, adapter tests.
- **Rewrite:** `port.ts` (→ `CloudApiPort`), `fake.ts`, `engine.ts` (send path),
  `Account.tsx`, `Campaigns.tsx`, relevant IPC channels/handlers/preload, Settings.
- **Remove:** `baileys-adapter.ts`; Inbox/Auto-reply/Groups/Sequences screens, IPC,
  handlers, repo methods; Contacts WhatsApp-sync action; poll/vCard campaign code.
- **Update:** `shared/types.ts` (Settings + Campaign + OctoApi surface), sidebar,
  presets/throttle reframing.

## Risks / open notes
- Graph API version may need bumping past `v21.0`; kept as a constant.
- Exact Meta error-code→action table refined against live responses during build.
- Cold marketing still incurs per-message cost and quality-rating risk; mitigated
  by good templates, opt-in where possible, and respecting the messaging tier.

## Out of scope (YAGNI, v1)
Webhook, Inbox, Auto-reply, delivery/read receipts, group harvesting, contact
sync, drip sequences, poll/vCard, in-app template creation, OS-keychain token storage.

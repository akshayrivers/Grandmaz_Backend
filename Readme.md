# Grandma's Launcher — Backend

REST API built with Fastify + TypeScript. Powers the caretaker web app and the Android launcher device.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js (ESM) |
| Framework | Fastify v5 (+ `@fastify/cors`, `@fastify/rate-limit`) |
| Database | PostgreSQL (via `pg`, raw SQL) |
| Auth | Firebase Admin SDK (caretakers) + device challenge/response tokens (launcher) |
| Email | Nodemailer over SMTP (magic-link invitations) |
| Validation | Zod v4 |
| Tests | Vitest |

## Project Structure

```
src/
├── server.ts / app.ts      # Entry + app factory (CORS allowlist, rate limit, error handler)
├── routes.ts               # Mounts modules under /api
├── config/env.ts           # Zod-validated env vars
├── middleware/
│   ├── authenticate.ts         # Firebase Bearer token → request.user / getCurrentUser()
│   ├── authenticate-device.ts  # Device token (Bearer dt_…) → request.device
│   └── authorize.ts            # requireDeviceAccess({param|bodyField|resolve, roles}), requireSameDevice
├── modules/
│   ├── auth/          # verify, me, accept-invitation (pairing code)
│   ├── users/         # profile (name, phoneE164)
│   ├── invitations/   # preview, primary-created invitations, revoke
│   ├── caretakers/    # list, role change, transfer primary, remove
│   ├── devices/       # register / challenge / verify-signature + caretaker device views
│   ├── device-api/    # launcher-facing /api/device/* (device token)
│   ├── device-config/ # versioned per-device config (If-Match)
│   ├── commands/      # typed command union, caretaker create/list
│   ├── shared-state/  # snapshots (read)
│   ├── help-requests/ # list / resolve
│   └── audit-logs/    # automatic audit trail (read)
└── infra/
    ├── database/      # pg Pool, withTransaction, queries/*.queries.ts, migrations/
    ├── firebase/      # Admin SDK init + token verify
    └── email/         # Nodemailer transport + magic-link template
```

## Setup

```bash
cp .env.example .env    # fill in your values
npm install
# Apply the schema (there is no db:init script):
psql "$DATABASE_URL" -f src/infra/database/migrations/001_initial_schema.sql
psql "$DATABASE_URL" -f src/infra/database/migrations/002_security.sql
psql "$DATABASE_URL" -f src/infra/database/migrations/003_device_config.sql
# (fresh databases can instead run src/infra/database/queries/schema.sql, which equals 001+002+003)
npm run dev             # :3000 with hot reload
npm run typecheck && npm test
./tests/integration-flow.sh   # device-side flow against a running server (needs jq + openssl)
```

Migrations are idempotent; never edit an applied one — add `00N_<name>.sql` and keep `schema.sql` in sync.

## Auth model

| Caller | Header | How it's obtained |
|---|---|---|
| Caretaker web app | `Authorization: Bearer <Firebase ID token>` | Firebase sign-in (Google or email link) on the caretaker's own device |
| Launcher | `Authorization: Bearer dt_<random>` | `register` → `challenge` → `verify-signature` |
| Public | none | Only register/challenge/verify, invitation preview, `auth/verify`; all rate-limited |

**Device bootstrap.** The launcher keeps an EC P-256 key in Android Keystore and sends the SPKI public
key with `keyAlgorithm: "EC_P256"` (legacy `"RSA"` still accepted). A registered `deviceId` is never
re-keyed: a different key gets `409 DEVICE_KEY_MISMATCH` and the launcher must pick a new `deviceId`.
Challenges are 32 random bytes (hex), stored as SHA-256 hashes, valid 5 minutes and consumed atomically
on verify. Verification issues a 30-day `dt_` token; only its SHA-256 is stored (`device_tokens`).

**Authorization.** Every caretaker route scoped to a device goes through `requireDeviceAccess`, which
requires an *active* `device_caretakers` row with an allowed role. Roles: `primary` (exactly one active
per device — enforced by a partial unique index), `caretaker`, `viewer`. Non-linked users get `403`.

**Pairing.** On grandma's phone a helper enters only the caretaker's email → `POST /api/device/invitations`
returns a 6-digit pairing code (shown on the phone) and emails a magic link. The caretaker opens the link,
signs in with Firebase (verified email must match the invitation), and enters the code (5 attempts, then
locked). The first linked caretaker becomes `primary`. Logging in never links devices by itself.
The raw link token and the pairing code are only stored as hashes. The launcher's caretaker PIN lives
only on the phone; there is no backend path to read or reset it.

## Response format

- Success: `{ "success": true, "data": … }` (204 for deletes / push token)
- Error: `{ "statusCode", "error", "message", "code"?, "details"? }` — branch on `code`.
  500s never include internal messages.

## API routes

### Public (rate-limited)

| Method | Path | Body | Response `data` |
|---|---|---|---|
| POST | `/api/devices/register` | `{ deviceId, publicKey, keyAlgorithm: "EC_P256"\|"RSA", deviceMetadata? }` | `{ deviceId, isVerified, keyAlgorithm, challenge, challengeExpiresAt }` (201 new / 200 same key / 409 `DEVICE_KEY_MISMATCH`) |
| POST | `/api/devices/challenge` | `{ deviceId }` | `{ challenge, expiresAt }` (404 `DEVICE_NOT_FOUND`) |
| POST | `/api/devices/verify-signature` | `{ deviceId, challenge, signature (base64) }` | `{ deviceId, deviceToken, expiresAt }` (401 `INVALID_SIGNATURE`/`CHALLENGE_INVALID`/`CHALLENGE_EXPIRED`/`CHALLENGE_USED`) |
| POST | `/api/invitations/preview` | `{ token }` | `{ email, deviceName, role, status, expiresAt }` |
| POST | `/api/auth/verify` | Firebase header or `{ idToken }` | `User` |

### Launcher — `/api/device/*` (device token)

| Method | Path | Body | Response `data` |
|---|---|---|---|
| GET | `/api/device/me` | — | `{ deviceId, isVerified, displayName, caretakers: [{ caretakerId, name, role, phoneE164 }] }` |
| POST | `/api/device/invitations` | `{ email }` | `{ invitationId, pairingCode, expiresAt }` (409 `PRIMARY_EXISTS` once a primary is linked) |
| GET | `/api/device/invitations/:id` | — | `{ invitationId, status: pending\|accepted\|expired\|revoked\|locked, expiresAt, acceptedAt }` |
| PUT | `/api/device/push-token` | `{ fcmToken }` | 204 |
| GET | `/api/device/commands?status=pending` | — | `[{ id, type, payload, status, createdAt, expiresAt }]` (marks delivered) |
| PATCH | `/api/device/commands/:id/status` | `{ status: running\|completed\|failed, result? }` | command (409 `COMMAND_FINISHED`) |
| POST | `/api/device/snapshot` | `{ batteryLevel?, batteryStatus?, wifiSsid?, storageFreeMb?, installedApps?, settings?, snapshotData? }` | `Snapshot` |
| POST | `/api/device/help-requests` | `{ title, description?, type: general\|sos\|medical\|tech_support }` | `HelpRequest` |
| GET | `/api/device/config` | — | `DeviceConfig` (version 0 + defaults when nothing is saved yet). `ETag` is the version |
| PUT | `/api/device/config` | `Config` body, `If-Match: <version>` | `DeviceConfig`. 409 `CONFIG_VERSION_CONFLICT` (`details.currentVersion`) when the version moved. 400 `PRECONDITION_REQUIRED` when `If-Match` is missing |

### Caretaker web (Firebase)

| Method | Path | Role | Body / notes |
|---|---|---|---|
| GET | `/api/auth/me`, `/api/users/me` | — | `User = { id, email, name, avatarUrl, phoneE164, emailVerified, createdAt, updatedAt }` |
| PATCH | `/api/users/me` | — | `{ name?, phoneE164? (E.164 or null) }` |
| POST | `/api/auth/accept-invitation` | — | `{ invitationToken, pairingCode }` → `{ deviceId, role }`; errors `EMAIL_NOT_VERIFIED`, `EMAIL_MISMATCH`, `INVALID_PAIRING_CODE` (`details.attemptsRemaining`), `INVITATION_LOCKED`, `INVITATION_EXPIRED`, `INVITATION_USED`, `INVITATION_REVOKED`, `INVITATION_NOT_FOUND` |
| GET | `/api/devices` | linked | `DeviceSummary[]` |
| GET | `/api/devices/:deviceId` | any | `DeviceSummary` |
| PATCH | `/api/devices/:deviceId` | primary | `{ displayName }` |
| GET | `/api/devices/:deviceId/config` | any | `DeviceConfig` |
| PUT | `/api/devices/:deviceId/config` | primary, caretaker | `Config` body + `If-Match` (same 409 rule as the device route). Viewers cannot write |
| POST | `/api/invitations/device/:deviceId` | primary | `{ email, role?: caretaker\|viewer }` → `{ invitationId, email, role, pairingCode, expiresAt }` |
| GET | `/api/invitations/device/:deviceId` | primary | `Invitation[]` |
| DELETE | `/api/invitations/:id` | primary | 204 |
| GET | `/api/caretakers/device/:deviceId` | any | `[{ caretakerId, email, name, avatarUrl, phoneE164, role, status, linkedAt, isMe }]` |
| PATCH | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | primary | `{ role: caretaker\|viewer }` |
| POST | `/api/caretakers/device/:deviceId/transfer-primary` | primary | `{ caretakerId }` (single transaction) |
| DELETE | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | primary | 204 (`PRIMARY_CANNOT_LEAVE` for self) |
| POST | `/api/commands` | primary, caretaker | `{ deviceId, command: { type, …fields }, expiresInMinutes? (1–1440, default 60) }` |
| GET | `/api/commands/device/:deviceId?status=` | any | `CommandRecord[]` |
| GET | `/api/commands/:id` | any | `CommandRecord` |
| GET | `/api/shared-state/device/:deviceId/latest` | any | `Snapshot \| null` |
| GET | `/api/shared-state/device/:deviceId/history?limit=` | any | `Snapshot[]` |
| GET | `/api/help-requests/device/:deviceId` | any | `HelpRequest[]` |
| PATCH | `/api/help-requests/:id/resolve` | primary, caretaker | `{ status }` |
| GET | `/api/audit-logs/device/:deviceId` | any | `AuditLog[]` |

**Commands** (`command.type` → fields): `ring_device`, `sync_now`, `report_location` (none);
`show_message { text (1–500), voiceClipId? }`; `set_volume { level 0–100 }`;
`update_emergency_number { e164 }`. Statuses: `pending → running → completed|failed`, or `expired`.

**Device config** is one JSON document per device (`device_configs.version`, history in
`device_config_history`). Shape: `locale`; `contacts[]` (`id`, `name`, `phones[{id, label, e164, whatsapp, isDefault}]`,
`order`, `pinned`, `photoAssetId`, `nameClipId`); `emergency` (`primaryCaretakerUserId`, `smsFallback`);
`home.pinnedContactIds` (max 4, same set as contacts with `pinned: true`); `home.weather` (`mode: city|location`,
`city`, `lat`, `lon`); `home.inactivityReturnSec` (15–600); `reminders[]` (`id`, `label`, `hour`, `minute`, `days`,
`enabled`); `voice` (`clips[{id, slot, assetId}]`, `ttsRate`); `apps.visible`. First write uses `If-Match: 0`.
The response `version` is also the `ETag`. The caretaker PIN is not in this document and there is no remote PIN reset.

**Audit log actions** (written automatically): `caretaker.linked`, `caretaker.role_changed`,
`caretaker.primary_transferred`, `caretaker.removed`, `invitation.created`, `invitation.revoked`,
`command.created`, `config.updated` (version only — contact phone numbers are not copied into the audit row).

## Email

Invitations are sent with Nodemailer over SMTP (`SMTP_*`, `EMAIL_FROM`). The link is
`{APP_BASE_URL}/accept-invitation?token=…`. When `SMTP_HOST` is empty and `NODE_ENV` isn't
`production`, the link is printed to the server console instead (dev only); it is never returned by the API.
In production, missing SMTP config makes invitation creation log an error (the invitation can be revoked and re-sent).

## Environment variables

See `.env.example`. New in Phase 0: `APP_BASE_URL` (required in production; `CARETAKER_WEB_URL` is a
legacy fallback), `CORS_ORIGINS` (comma-separated allowlist), `PUBLIC_RATE_LIMIT_PER_MINUTE` (default 20).

# Grandma's Launcher — Backend

HTTP API for [Grandma's Launcher](https://github.com/akshayrivers/sys-launcher). One product, three repos:

| Repo | Where it runs | Role |
|---|---|---|
| `sys-launcher` | Grandma's Android phone | Launcher. Registers the device, polls commands, posts snapshots, help requests, and SOS events. |
| **this repo** (`dadi's Backend`) | A Node process you host | Fastify + Postgres. Devices, caretaker links, queued commands, config, snapshots. |
| `Dadi's Caretaker` | The caretaker's own browser | Web app. Signs in with Firebase and calls the caretaker routes below. |

Sibling checkouts sit next to each other: `../sys-launcher` and `../Dadi's Caretaker`. Grandma never signs in with Google on her phone. A helper types a caretaker email on the phone; the caretaker finishes linking on their own device.

The server speaks plain HTTP. Put TLS in front of it before anyone but you can reach it. There is no Dockerfile or compose file in this repo.

An early sketch of the first-install flow is in [`.excalidraw`](.excalidraw). It still says "Maybe Resend". Mail is Brevo or SMTP, described below. Trust this file and the code over that sketch.

## What works today

A caretaker who is linked can, with a Firebase ID token:

- See the phone's name, battery, wifi, and last snapshot.
- Edit a versioned config document (contacts, home screen, reminders, weather *settings*, voice clips, which apps are visible).
- Upload a contact photo or a short voice clip (stored on this machine's disk).
- Queue a command: ring, sync, ask for a location, show a message, set volume, or change the emergency number. The phone must poll to pick it up.
- Invite another caretaker or a viewer, change roles, transfer who is primary, or remove someone.
- List help requests and mark them resolved.
- List SOS events and acknowledge one.
- Read the audit log for that device.

The phone, with a device token, can register, poll commands, post snapshots, config, media, help requests, reminder events, and SOS locations, and ask for a short-lived Gemini token when `GEMINI_API_KEY` is set.

## What is not done

These routes exist as storage only. Nothing in this process sends them onward:

- **Push.** `PUT /api/device/push-token` saves an FCM token on the device row. This server never calls Firebase Cloud Messaging. Commands move only when the phone polls.
- **SOS and help fan-out.** Starting an SOS or a help request writes a row and an audit entry (SOS only). It does not email or push caretakers. The phone call itself is the launcher's job, not this API.
- **Live screen.** No WebRTC, signaling, or TURN.
- **Weather data.** The config can store a city or a lat/lon. This API does not call a weather service.
- **Caretaker PIN.** There is no column, command, or config field for it. It stays on the phone.
- **Assistant without a key.** `POST /api/device/ai/session` returns `503 AI_NOT_CONFIGURED` until `GEMINI_API_KEY` is set. The phone does not upload audio here.

## Prerequisites

- Node.js and npm. `package.json` does not pin an engine. `.npmrc` sets `include=dev` so a production install still has the TypeScript compiler (needed because the start command builds with `tsc`).
- PostgreSQL you can reach from this machine.
- A Firebase project, if caretakers will sign in for real. The laptop-only bypass below skips Firebase.
- Optional: a [Brevo](https://www.brevo.com/) API key or an SMTP account, if invitation email should actually arrive.

## Setup

```bash
cp .env.example .env   # fill in values; never commit .env
npm install
npm run migrate        # needs DATABASE_URL; applies every file in src/infra/database/migrations
npm run dev            # http://localhost:3000
```

`npm run migrate` runs `scripts/migrate.mjs`. It requires `DATABASE_URL` (the `PG*` variables are not enough for the script). It has no history table: every run re-applies `001` through `006`. The SQL uses `IF NOT EXISTS` and guarded `ALTER`s so a second run is safe.

The running server uses `DATABASE_URL` when it is set, otherwise `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` (defaults: localhost, 5432, postgres, postgres, `grandma_backend`). Create that database before the first request.

`src/infra/database/queries/schema.sql` is a combined snapshot of the same tables, including SOS and reminder events. The comment at the top of that file still says it stops at migration 004. Prefer `npm run migrate`.

```bash
npm run typecheck
npm test
./tests/integration-flow.sh   # device flow against a running server; needs curl, jq, openssl
```

| Script | What it runs |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` (pretty logs when `NODE_ENV=development`) |
| `npm run build` | `tsc` into `dist/` |
| `npm start` | `node dist/server.js` |
| `npm run migrate` | Apply `src/infra/database/migrations/*.sql` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |

Default listen address is `0.0.0.0:3000` (`HOST`, `PORT`). `GET /health` returns `{ status: "ok", timestamp }` with no auth.

## Environment variables

Copy [`.env.example`](.env.example). Names only:

`NODE_ENV` `PORT` `HOST` `DATABASE_URL` `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE` `FIREBASE_PROJECT_ID` `FIREBASE_CLIENT_EMAIL` `FIREBASE_PRIVATE_KEY` `GOOGLE_APPLICATION_CREDENTIALS` `BREVO_API_KEY` `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` `APP_BASE_URL` `CARETAKER_WEB_URL` `CORS_ORIGINS` `PUBLIC_RATE_LIMIT_PER_MINUTE` `MEDIA_DIR` `GEMINI_API_KEY`

Read directly from the process, not the validated list above: `LOCAL_FLOW` and `AUTH_BYPASS`. Leave both unset. See [Laptop-only bypass](#laptop-only-bypass).

`APP_BASE_URL` is required when `NODE_ENV=production`. `CARETAKER_WEB_URL` is only a fallback for the link origin. `CORS_ORIGINS` is a comma-separated allowlist (default `http://localhost:5173`).

## Auth model

| Caller | Header | How it is obtained |
|---|---|---|
| Caretaker web app | `Authorization: Bearer <Firebase ID token>` | Firebase sign-in on the caretaker's own device |
| Launcher | `Authorization: Bearer dt_…` | `register` → `challenge` → `verify-signature` |
| Public | none | Register, challenge, verify-signature, invitation preview, `POST /api/auth/verify`. Rate-limited per IP (`PUBLIC_RATE_LIMIT_PER_MINUTE`, default 20). |

**Device bootstrap.** The launcher sends an EC P-256 SPKI public key with `keyAlgorithm: "EC_P256"` (`"RSA"` is still accepted). A known `deviceId` is never re-keyed: a different key gets `409 DEVICE_KEY_MISMATCH`. Challenges are 32 random bytes as hex, stored as SHA-256, valid 5 minutes, and consumed once. Verification returns a 30-day `dt_` token. Only the token's SHA-256 is stored.

**Caretakers.** `requireDeviceAccess` requires an active `device_caretakers` row. Roles are `primary`, `caretaker`, and `viewer`. A partial unique index allows one active primary per device. The first person linked from the phone becomes primary. Later invites from the phone are `caretaker`. Viewers can read; they cannot change config, send commands, resolve help requests, or acknowledge SOS. Non-linked users get `403`.

**Pairing.** The phone or the primary calls the invitation route with an email. The response includes a 6-digit pairing code (5 attempts, then the invitation locks). The caretaker opens `{APP_BASE_URL}/accept-invitation?token=…`, signs in with Firebase, and the verified email must match the invitation. Logging in does not link a device by itself. The link token and the pairing code are stored only as hashes.

### Laptop-only bypass

If `LOCAL_FLOW=1` or `AUTH_BYPASS=1` **and** `NODE_ENV` is not `production`, the process seeds a device `local-device` and a caretaker `local-caretaker@localhost`, and it accepts the fixed bearer token `local-caretaker` plus a fixed `dt_` device token. The process throws on startup if either flag is `1` while `NODE_ENV=production`.

Do not set the flag on a machine other people can reach. The default bind is all interfaces, and the tokens are constants in `src/config/local-flow.ts`. `npm start` does not turn the flag on.

## Response format

- Success: `{ "success": true, "data": … }` (204 for deletes and for saving a push token).
- Error: `{ "statusCode", "error", "message", "code"?, "details"? }`. Branch on `code`. A 500 does not include the internal message.

## API routes

### Public (rate-limited)

| Method | Path | Body | Response `data` |
|---|---|---|---|
| POST | `/api/devices/register` | `{ deviceId, publicKey, keyAlgorithm: "EC_P256"\|"RSA", deviceMetadata? }` | `{ deviceId, isVerified, keyAlgorithm, challenge, challengeExpiresAt }` (201 new / 200 same key / 409 `DEVICE_KEY_MISMATCH`) |
| POST | `/api/devices/challenge` | `{ deviceId }` | `{ challenge, expiresAt }` (404 `DEVICE_NOT_FOUND`) |
| POST | `/api/devices/verify-signature` | `{ deviceId, challenge, signature (base64) }` | `{ deviceId, deviceToken, expiresAt }` (401 `INVALID_SIGNATURE` / `CHALLENGE_INVALID` / `CHALLENGE_EXPIRED` / `CHALLENGE_USED`) |
| POST | `/api/invitations/preview` | `{ token }` | `{ email, deviceName, role, status, expiresAt }` |
| POST | `/api/auth/verify` | Firebase header or `{ idToken }` | User profile |

### Launcher — `/api/device/*` (device token)

| Method | Path | Body | Response `data` |
|---|---|---|---|
| GET | `/api/device/me` | — | `{ deviceId, isVerified, displayName, caretakers: [{ caretakerId, name, role, phoneE164 }] }` |
| POST | `/api/device/invitations` | `{ email }` | `{ invitationId, email, role, pairingCode, expiresAt, acceptPath? }` |
| GET | `/api/device/invitations/:id` | — | `{ invitationId, status, expiresAt, acceptedAt }` |
| PUT | `/api/device/push-token` | `{ fcmToken }` | 204. Stored only. No push is sent. |
| GET | `/api/device/commands?status=pending` | — | Pending commands. The poll marks them delivered. |
| PATCH | `/api/device/commands/:id/status` | `{ status: running\|completed\|failed, result? }` | Command (409 `COMMAND_FINISHED`) |
| POST | `/api/device/snapshot` | battery, wifi, storage, installed apps, settings | Snapshot |
| POST | `/api/device/help-requests` | `{ title, description?, type: general\|sos\|medical\|tech_support }` | Help request. No notification. |
| GET | `/api/device/config` | — | Config. `ETag` is the version. Version 0 plus defaults when nothing is saved. |
| PUT | `/api/device/config` | Config body, `If-Match: <version>` | Config. 409 `CONFIG_VERSION_CONFLICT`. 400 `PRECONDITION_REQUIRED` if `If-Match` is missing. |
| POST | `/api/device/media` | `{ kind: photo\|audio, contentType, dataBase64, durationMs? }` | `{ assetId, kind, contentType, byteSize, durationMs }` |
| GET | `/api/device/media/:assetId` | — | File bytes |
| POST | `/api/device/sos` | `{ latitude?, longitude?, accuracyM? }` | SOS event (201). No email or push. |
| POST | `/api/device/sos/:id/location` | a fix | Updates the active alert |
| POST | `/api/device/sos/:id/cancel` | — | Stops the alert record. Does not hang up a phone call. |
| POST | `/api/device/reminders/events` | `{ reminderId, status: taken\|snoozed\|missed }` | Reminder event |
| POST | `/api/device/ai/session` | — | See [Assistant](#assistant) |

`acceptPath` is present only when the invitation email was not delivered. It is `/accept-invitation?token=…` (path and token, not a full URL). The first phone invite is `role: "primary"`. A later one is `role: "caretaker"`. `409 ALREADY_LINKED` if that email is already a caretaker. Creating an invite revokes other still-pending invites that the phone created.

### Caretaker web (Firebase)

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/api/auth/me`, `/api/users/me` | signed in | User profile |
| PATCH | `/api/users/me` | signed in | `{ name?, phoneE164? }` (E.164 or null) |
| POST | `/api/auth/accept-invitation` | signed in | `{ invitationToken, pairingCode }` → `{ deviceId, role }` |
| GET | `/api/devices` | linked | Devices for this caretaker |
| GET | `/api/devices/:deviceId` | any linked role | One device |
| PATCH | `/api/devices/:deviceId` | primary | `{ displayName }` |
| GET / PUT | `/api/devices/:deviceId/config` | read: any; write: primary or caretaker | Same `If-Match` rule as the phone |
| POST / GET | `/api/devices/:deviceId/media` | write to upload; any linked role to read | Same body as the phone |
| GET | `/api/devices/:deviceId/reminder-events` | any | Reminder events |
| POST | `/api/invitations/device/:deviceId` | primary | `{ email, role?: caretaker\|viewer }` |
| GET | `/api/invitations/device/:deviceId` | primary | Invitation list |
| DELETE | `/api/invitations/:id` | primary | 204 |
| GET | `/api/caretakers/device/:deviceId` | any | Linked people |
| PATCH | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | primary | `{ role: caretaker\|viewer }` |
| POST | `/api/caretakers/device/:deviceId/transfer-primary` | primary | `{ caretakerId }` in one transaction |
| DELETE | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | primary | 204 (`PRIMARY_CANNOT_LEAVE` for self) |
| POST | `/api/commands` | primary, caretaker | `{ deviceId, command, expiresInMinutes? }` (1–1440, default 60) |
| GET | `/api/commands/device/:deviceId` | any | Optional `status` filter |
| GET | `/api/commands/:id` | any | One command |
| GET | `/api/shared-state/device/:deviceId/latest` | any | Latest snapshot or null |
| GET | `/api/shared-state/device/:deviceId/history` | any | `limit` query |
| GET | `/api/help-requests/device/:deviceId` | any | Help requests |
| PATCH | `/api/help-requests/:id/resolve` | primary, caretaker | `{ status }` |
| GET | `/api/sos/device/:deviceId` | any | SOS events |
| POST | `/api/sos/:id/ack` | primary, caretaker | Acknowledge |
| GET | `/api/audit-logs/device/:deviceId` | any | Audit rows |

Accept-invitation errors include `EMAIL_NOT_VERIFIED`, `EMAIL_MISMATCH`, `INVALID_PAIRING_CODE` (`details.attemptsRemaining`), `INVITATION_LOCKED`, `INVITATION_EXPIRED`, `INVITATION_USED`, `INVITATION_REVOKED`, `INVITATION_NOT_FOUND`.

Caretaker-created invites use the same `acceptPath` rule. `409 ALREADY_LINKED` if that email is already linked. The primary chooses `caretaker` or `viewer` (not a second primary).

**Commands** (`command.type`): `ring_device`, `sync_now`, `report_location` (no extra fields); `show_message` `{ text (1–500), voiceClipId? }`; `set_volume` `{ level 0–100 }`; `update_emergency_number` `{ e164 }`. Status path: `pending` → `running` → `completed` or `failed`, or `expired`.

**Device config** is one JSON document (`device_configs.version`), with history in `device_config_history`. Shape: `locale`; `contacts[]` (`id`, `name`, `phones[{id, label, e164, whatsapp, isDefault}]`, `order`, `pinned`, `photoAssetId`, `nameClipId`); `emergency` (`primaryCaretakerUserId`, `smsFallback`); `home.pinnedContactIds` (max 4); `home.weather` (`mode: city|location`, `city`, `lat`, `lon`); `home.inactivityReturnSec` (15–600); `reminders[]`; `voice` (`clips`, `ttsRate`, `model`); `apps.visible`. First write uses `If-Match: 0`. `voice.model` defaults to `gemini-3.8-flash` when omitted. A `models/` prefix is stripped. The caretaker PIN is not in this document.

**Media** (`MEDIA_DIR`, default `data/media`, local disk only): photos are jpeg, png, or webp up to 2 MB. Audio is up to 5 MB and must declare `durationMs` from 1 to 30000.

**Audit actions written by the server:** `caretaker.linked`, `caretaker.role_changed`, `caretaker.primary_transferred`, `caretaker.removed`, `invitation.created`, `invitation.revoked`, `command.created`, `config.updated` (version only), `media.created`, `sos.started`, `sos.cancelled`, `sos.acknowledged`, `reminder.reported`. Help-request create/resolve, command status changes, snapshots, and push-token updates are not audit rows.

### Assistant

`POST /api/device/ai/session` (device token):

- No `GEMINI_API_KEY`: `503` `AI_NOT_CONFIGURED`.
- Key set: `{ mode: "text", model, token, expiresInSec: 60, generateContentUrl }`. `model` comes from the device config. `token` is the `name` returned by Google's auth-token endpoint. The long-lived key is not in the response. The request to Google sets `uses: 1`, an expire time 30 minutes out, and a new-session expire time 60 seconds out. If Google rejects it, the route returns `503` `AI_UNAVAILABLE`.

## Email

Invitation mail prefers Brevo's HTTPS API (`https://api.brevo.com/v3/smtp/email`) when `BREVO_API_KEY` starts with `xkeysib-`. Before sending, the server checks Brevo's sender list and refuses an `EMAIL_FROM` address that is not an active verified sender. A 201 from the send call is not treated as proof on its own.

Otherwise it uses Nodemailer (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). Render's free instance blocks SMTP ports 25, 465, and 587; Brevo's SMTP relay also listens on 2525.

The link is `{APP_BASE_URL}/accept-invitation?token=…`.

If neither Brevo nor SMTP is configured and `NODE_ENV` is not `production`, the link is printed to the server console and the create-invitation response includes `acceptPath`. In production, missing mail config throws; that error is logged, the invitation row is kept, and `acceptPath` is still returned to the caller because delivery did not succeed. When a send reports success, `acceptPath` is omitted.

## Layout

`src/server.ts` listens. `src/app.ts` builds Fastify (CORS allowlist, opt-in rate limit, error handler). `src/routes.ts` mounts modules under `/api`. Each module is routes → controller → service → SQL in `src/infra/database/queries/`. Firebase Admin verifies caretaker ID tokens only (`src/infra/firebase/`). Mail is `src/infra/email/`. File bytes are `src/infra/storage/` (local disk).

## License

[`LICENSE`](LICENSE) is MIT, copyright 2026 vinod akshat. `package.json` still says `"license": "ISC"`. The `LICENSE` file is the grant in the tree.

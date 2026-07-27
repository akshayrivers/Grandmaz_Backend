# Grandma's Launcher — Backend

REST API built with Fastify + TypeScript. Powers the caretaker PWA and the Android launcher device.

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js (ESM) |
| Framework | Fastify v5 |
| Database | PostgreSQL (via `pg`) |
| Auth | Firebase Admin SDK (ID token verification) |
| Email | Resend (magic-link invitations) |
| Validation | Zod v4 |
| Language | TypeScript (strict) |

## Project Structure

```
src/
├── server.ts              # Entry point
├── app.ts                 # Fastify app factory
├── routes.ts              # Route registry (maps prefixes to modules)
├── config/
│   └── env.ts             # Zod-validated env vars
├── middleware/
│   └── authenticate.ts    # Firebase Bearer token verification
├── modules/
│   ├── auth/              # Token verify, invitation accept, /me
│   ├── users/             # User profile CRUD
│   ├── invitations/       # Magic-link email invitations
│   ├── caretakers/        # Caretaker-device linking
│   ├── devices/           # Device register + challenge-response
│   ├── commands/          # Remote task execution
│   ├── shared-state/      # Device state snapshots
│   ├── help-requests/     # Help requests from device/caretaker
│   └── audit-logs/        # Audit trail
└── infra/
    ├── firebase/          # Firebase Admin SDK init + token verify
    ├── database/          # pg Pool, schema, all queries
    └── email/             # Resend client + magic-link template
```

## Setup

```bash
cp .env.example .env   # fill in your values
npm install
npm run db:init         # runs schema.sql against your Postgres
npm run dev             # starts server on :3000 with hot reload
```

## Auth Model

There are two separate auth mechanisms:

1. **Caretaker PWA** — authenticates via Firebase Auth on the client, sends a Firebase ID token in `Authorization: Bearer <token>`. The backend verifies it with Firebase Admin SDK. No session/JWT is issued by this API.

2. **Android Launcher Device** — authenticates via a challenge-response scheme using RSA keys. The device registers its public key, receives a challenge, signs it, and the server verifies the signature. No bearer token needed.

A handful of endpoints are intentionally public (device registration, invitation handling, device state posting, help request creation) because the launcher device doesn't have a Firebase account.

## API Routes

Base URL: `http://localhost:3000`

### Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | None | Returns `{ status: "ok" }` |

---

### Auth — `/api/auth`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/verify` | None | `{ idToken: string }` | Verifies a Firebase ID token and syncs the user to PostgreSQL. Returns the user profile. |
| POST | `/api/auth/accept-invitation` | None | `{ idToken: string, invitationToken: string }` | Accepts a caretaker invitation. Verifies the Firebase token, validates the invitation (not expired, email match), creates user if needed, links to device. |
| GET | `/api/auth/me` | Firebase | — | Returns the authenticated user's profile. |

---

### Users — `/api/users`

| Method | Endpoint | Auth | Body | Description |
|--------|----------|------|------|-------------|
| GET | `/api/users/me` | Firebase | — | Get full profile (includes role). |
| PATCH | `/api/users/me` | Firebase | `{ name?: string, avatarUrl?: string }` | Update profile fields. |

---

### Devices — `/api/devices`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/devices/register` | None | `{ deviceId: string, publicKey: string, deviceMetadata?: object }` | Register a new launcher device. Upserts if `deviceId` already exists. Returns device record. |
| POST | `/api/devices/challenge` | None | `{ deviceId: string }` | Get a fresh 32-byte random hex challenge for a device. |
| POST | `/api/devices/verify-signature` | None | `{ deviceId: string, challenge: string, signature: string }` | Verify the device's RSA signature against the challenge. Marks device as verified on success. |
| GET | `/api/devices/:deviceId` | None | — | Fetch device details and verification status. |

**Device verification flow:**
```
Device                          Server
  │                               │
  │──── POST /devices/register ──>│  (sends deviceId + publicKey)
  │<─────── device record ────────│
  │                               │
  │──── POST /devices/challenge ─>│  (sends deviceId)
  │<─────── challenge string ─────│
  │                               │
  │  (signs challenge with privkey)
  │                               │
  │── POST /devices/verify-sign ─>│  (sends deviceId + challenge + signature)
  │<─────── is_verified: true ────│
```

---

### Invitations — `/api/invitations`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/invitations` | None | `{ deviceId: string, email: string, deviceName?: string }` | Creates an invitation token, stores it in DB (expires in 7 days), sends a magic-link email via Resend. |
| GET | `/api/invitations/:token` | None | — | Preview invitation details. Returns validity, email, deviceId, expiry. |

---

### Caretakers — `/api/caretakers`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| GET | `/api/caretakers/device/:deviceId` | Firebase | — | List all caretakers linked to a device. |
| POST | `/api/caretakers/link` | Firebase | `{ deviceId: string, email: string, role?: string }` | Directly link an existing user to a device by email. |
| PATCH | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | Firebase | `{ role: string }` | Update a caretaker's role (`primary`, `secondary`, `admin`). |
| DELETE | `/api/caretakers/device/:deviceId/caretaker/:caretakerId` | Firebase | — | Remove a caretaker from a device. |

---

### Commands — `/api/commands`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/commands` | Firebase | `{ deviceId: string, title: string, command: string, description?: string, payload?: any, scheduledAt?: ISO datetime }` | Create a remote task for a device. |
| GET | `/api/commands/:id` | Firebase | — | Get a specific task. |
| GET | `/api/commands/device/:deviceId` | Firebase | `?status=` (optional) | List all tasks for a device. Optionally filter by status. |
| PATCH | `/api/commands/:id/status` | None | `{ status: string, result?: any }` | Update task status. Used by the launcher device to report back (`pending` → `sent` → `running` → `completed`/`failed`). |

---

### Shared State — `/api/shared-state`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/shared-state/snapshot` | None | `{ deviceId: string, batteryLevel?: number, batteryStatus?: string, wifiSsid?: string, storageFreeMb?: number, installedApps?: any, settings?: any, snapshotData?: any }` | Device posts a state snapshot. Also updates `last_active_at`. |
| GET | `/api/shared-state/device/:deviceId/latest` | Firebase | — | Get the most recent snapshot for a device. |
| GET | `/api/shared-state/device/:deviceId/history` | Firebase | `?limit=N` (default 20) | Get historical snapshots. |

---

### Help Requests — `/api/help-requests`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/help-requests` | None | `{ deviceId: string, title: string, description?: string, type?: "general" \| "sos" \| "medical" \| "tech_support" }` | Raise a help request from the launcher or caretaker side. |
| GET | `/api/help-requests/device/:deviceId` | Firebase | — | List all help requests for a device. |
| PATCH | `/api/help-requests/:id/resolve` | Firebase | `{ status: "resolved" \| "in_progress" \| "cancelled" \| "pending" }` | Update help request status. Sets `resolvedBy` from the auth user. |

---

### Audit Logs — `/api/audit-logs`

| Method | Endpoint | Auth | Body / Params | Description |
|--------|----------|------|---------------|-------------|
| POST | `/api/audit-logs` | Firebase | `{ action: string, deviceId?: string, userId?: string, details?: any }` | Create an audit log entry. IP is captured automatically. |
| GET | `/api/audit-logs/device/:deviceId` | Firebase | — | List logs for a device (max 100, newest first). |
| GET | `/api/audit-logs/user/:userId` | Firebase | — | List logs for a user (max 100, newest first). |

---

## Email Flow

Invitation emails are sent through [Resend](https://resend.com) when a caretaker is invited to a device.

**Current state:** The plumbing works end-to-end, but the email domain / sender needs to be set up in Resend before real emails land in inboxes. In dev, emails are logged to the console instead of sent.

### How it works

```
Caretaker PWA                    Backend                         Resend              Caretaker Email
     │                              │                              │                      │
     │── POST /api/invitations ────>│                              │                      │
     │   { deviceId, email }        │                              │                      │
     │                              │── generates token ──> DB     │                      │
     │                              │                              │                      │
     │                              │── sendInvitationEmail() ────>│                      │
     │                              │                              │── delivers email ───>│
     │                              │                              │   (magic link)       │
     │                              │                              │                      │
     │                              │                              │   User clicks link   │
     │                              │                              │                      │
     │<──── PWA opens /accept-invitation?token=xxx ────────────────────────────────────────│
     │                              │                              │                      │
     │── POST /api/auth/accept-invitation ──>│                     │                      │
     │   { idToken, invitationToken }        │                     │                      │
     │                                       │── validates token    │                      │
     │                                       │── creates user       │                      │
     │                                       │── links to device    │                      │
     │<──── done ────────────────────────────│                     │                      │
```

**What happens on `/api/invitations`:**
1. Looks up the device by `deviceId`
2. Generates a random 32-byte hex token
3. Stores it in `caretaker_invitations` with a 7-day expiry
4. Builds a magic-link URL: `{CARETAKER_WEB_URL}/accept-invitation?token={token}`
5. If `RESEND_API_KEY` is set → sends the email via Resend
6. If `RESEND_API_KEY` is not set → logs the URL to console (dev mode)

**What happens on `/api/auth/accept-invitation`:**
1. Verifies the Firebase ID token from the request body
2. Looks up the invitation by token — checks it's not expired and not already accepted
3. Verifies the Firebase user's email matches the invitation email
4. Upserts the user into the `users` table
5. Links the user to the device in `device_caretakers`
6. Marks the invitation as accepted

### Dev mode (no Resend key)

When `RESEND_API_KEY` is absent from `.env`, the server prints this to stdout instead of sending an email:

```
--------------------------------------------------
💌 [DEV MODE - NO RESEND API KEY]
To: test@example.com
Subject: You're invited to manage a device
Magic Link URL: http://localhost:5173/accept-invitation?token=abc123...
--------------------------------------------------
```

Grab the URL from the logs and open it in a browser to continue the flow.

### What needs to happen before going live

1. **Verify a domain in Resend** — you need a domain you control (e.g. `grandmaz.app`) so Resend can send on your behalf
2. **Set `EMAIL_FROM`** to an address on that verified domain
3. **Set `CARETAKER_WEB_URL`** to the deployed PWA URL (currently defaults to `http://localhost:5173`)
4. The magic-link template lives at `src/infra/email/templates/magic-link.ts` — tweak copy/layout as needed

## Database Schema

```
users
├── id (UUID, PK)
├── firebase_uid (VARCHAR, unique)
├── email (VARCHAR, unique)
├── name, avatar_url, role
└── created_at, updated_at

devices
├── id (UUID, PK)
├── device_id (VARCHAR, unique) ← the string ID used in API calls
├── public_key (TEXT)
├── device_metadata (JSONB)
├── is_verified (BOOLEAN)
└── status, last_active_at, created_at, updated_at

device_caretakers
├── id (UUID, PK)
├── caretaker_id → users.id
├── device_id → devices.id
├── role (primary / secondary / admin)
└── status, created_at, updated_at

caretaker_invitations
├── id (UUID, PK)
├── device_id → devices.id
├── email, token (unique)
├── expires_at, created_by → users.id
└── accepted_at, created_at

tasks
├── id (UUID, PK)
├── device_id → devices.id
├── created_by → users.id
├── title, command, description, payload (JSONB)
├── status, result (JSONB)
└── scheduled_at, completed_at, created_at, updated_at

help_requests
├── id (UUID, PK)
├── device_id → devices.id
├── title, description
├── type (general / sos / medical / tech_support)
├── status, resolved_by → users.id
└── resolved_at, created_at, updated_at

audit_logs
├── id (UUID, PK)
├── device_id → devices.id (nullable)
├── user_id → users.id (nullable)
├── action, details (JSONB)
└── ip_address, created_at

device_state_snapshots
├── id (UUID, PK)
├── device_id → devices.id
├── battery_level, battery_status
├── wifi_ssid, storage_free_mb
├── installed_apps (JSONB), settings (JSONB)
├── snapshot_data (JSONB)
└── created_at
```

**Important:** All foreign key `device_id` columns reference `devices.id` (UUID), not `devices.device_id` (VARCHAR). The API accepts the string `device_id` everywhere and resolves it internally via subquery.

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | No | `development` | |
| `PORT` | No | `3000` | |
| `HOST` | No | `0.0.0.0` | |
| `DATABASE_URL` | Yes | — | Postgres connection string (preferred over individual vars) |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | Fallback | — | Used if `DATABASE_URL` is not set |
| `FIREBASE_PROJECT_ID` | Yes | — | From Firebase service account |
| `FIREBASE_CLIENT_EMAIL` | Yes | — | From Firebase service account |
| `FIREBASE_PRIVATE_KEY` | Yes | — | PEM format, with `\n` literals |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alt | — | Path to service account JSON (alternative to above 3) |
| `RESEND_API_KEY` | For email | — | Without this, emails are logged to console |
| `EMAIL_FROM` | No | `Grandma's Launcher <noreply@grandmaz.app>` | Must be on a verified Resend domain |
| `CARETAKER_WEB_URL` | No | `http://localhost:5173` | Base URL for magic links |

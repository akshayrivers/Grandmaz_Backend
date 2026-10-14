# AGENTS.md — dadi's Backend (Fastify API)

Guidance for AI coding agents working in this repo. Authorization is the most important open
problem here — read "Security rules" and "Known issues" before touching any route.

## System overview (shared across all three repos)

One product, three sibling repos. The user is a Dogri/Hindi-speaking grandmother who cannot read,
has low vision and a hand tremor. Family caretakers configure and watch her phone remotely.

| Repo | Path (from any repo root) | Role |
|---|---|---|
| sys-launcher | `../sys-launcher` | Android launcher (Kotlin, XML Views) on grandma's phone |
| dadi's Backend | `../dadi's Backend` | Fastify + Postgres API: devices, caretaker links, commands, snapshots, help requests |
| Dadi's Caretaker | `../Dadi's Caretaker` | Caretaker web app (React Router SSR); must become an installable PWA with push |

Core flows (all under `/api`):
1. **Device registration** — launcher creates an RSA-2048 key pair, `POST devices/register`
   `{deviceId, publicKey, deviceMetadata}` → gets `challenge` (fallback `POST devices/challenge`) →
   signs it SHA256withRSA, base64 → `POST devices/verify-signature`.
2. **Caretaker linking** — on grandma's phone a helper enters only the caretaker's email →
   `POST invitations` → backend emails a magic link to `CARETAKER_WEB_URL/accept-invitation?token=…`
   → caretaker signs in with Firebase on *their own* device → `POST auth/accept-invitation` creates a
   `device_caretakers` row. Pending invitations are also auto-accepted on `auth/verify` / `GET devices`.
3. **Commands** — caretaker `POST commands` → `tasks` row (`pending`) → launcher polls
   `GET commands/device/:deviceId?status=pending` → executes → `PATCH commands/:id/status`
   (`running` → `completed`/`failed`, with `result`).
4. **Snapshots** — launcher `POST shared-state/snapshot` (battery, wifi, storage, apps, settings);
   caretaker reads `shared-state/device/:id/latest|history`.
5. **Help requests** — launcher `POST help-requests` `{deviceId, title, type: general|sos|medical|tech_support}`;
   caretaker lists and resolves them.

API contract rule: when an endpoint changes, update the backend, the launcher (`remote/*Repository`,
`network/ApiClient.kt`) and the caretaker app (`app/lib/api.ts`, `app/lib/types.ts`) in the same change.
Known mismatch: device requests use camelCase; backend rows are snake_case and some services return
both (`deviceId` + `device_id`, `isVerified` + `is_verified`). Don't add more dual-key responses — pick
camelCase for new fields and convert old ones deliberately across all three repos.

## Stack & commands

Node ESM (`"type": "module"`), TypeScript (very strict: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`), Fastify 5, `pg` with raw SQL, Zod 4,
firebase-admin, Nodemailer (SMTP). Tests: Vitest (no config file; defaults). No ESLint/Prettier configured.

```bash
npm run dev          # tsx watch src/server.ts (pino-pretty logs when NODE_ENV=development)
npm run build        # tsc → dist/
npm start            # node dist/server.js
npm run typecheck    # tsc --noEmit   ← treat as the lint step
npm test             # vitest run (tests/unit/*.test.ts)
npm run test:watch
./tests/integration-flow.sh   # end-to-end curl flow; needs running server, jq, openssl
```

Schema setup: there is **no** `db:init` script (README is stale and also mentions Resend — email is
Nodemailer/SMTP). Apply `src/infra/database/migrations/001_initial_schema.sql` with `psql`, or call
`initializeSchema()` from `src/infra/database/queries/index.ts` (runs `queries/schema.sql`).

Env vars (validated in `src/config/env.ts`; copy `.env.example` → `.env`, never commit `.env`):
`NODE_ENV PORT HOST DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY GOOGLE_APPLICATION_CREDENTIALS SMTP_HOST SMTP_PORT SMTP_USER
SMTP_PASS EMAIL_FROM CARETAKER_WEB_URL`. Add new vars to both `env.ts` (Zod) and `.env.example`.

## Architecture map (`src/`)

| Path | Responsibility |
|---|---|
| `server.ts` / `app.ts` | Entry; `buildApp()` registers CORS, sensible, routes |
| `routes.ts` | Mounts each module at `/api/<module>`; `/health` |
| `config/env.ts` | Zod-validated env (`env` export) |
| `middleware/authenticate.ts` | `authenticateFirebaseUser` preHandler → sets `request.user` |
| `middleware/authorize.ts` | **Empty** — caretaker↔device authorization belongs here |
| `modules/<name>/` | `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schemas.ts` (Zod), `*.types.ts` |
| `infra/database/client.ts` | `pg` Pool + `query<T>(text, params)` helper |
| `infra/database/queries/*.queries.ts` | Raw SQL functions per table, typed `XxxRow` interfaces |
| `infra/database/migrations/` | Numbered SQL files (`001_initial_schema.sql`) |
| `infra/firebase/` | Admin SDK init + `verifyFirebaseIdToken` |
| `infra/email/` | Nodemailer transporter + `templates/magic-link.ts` |
| `tests/unit/` | Service/query tests with `vi.mock` of `infra/database/client.js` |

Tables: `users`, `devices` (`device_id` text + `id` UUID), `device_caretakers` (role
`primary|secondary|admin`, status), `caretaker_invitations`, `tasks`, `help_requests`, `audit_logs`,
`device_state_snapshots`.

Modules: `auth`, `users`, `invitations`, `caretakers`, `devices`, `commands`, `shared-state`,
`help-requests`, `audit-logs`.

## Code conventions

- Layering: **routes** (wire path + preHandlers) → **controller** (Zod `safeParse`, map errors to
  HTTP) → **service** (business logic, row→record mapping) → **queries** (SQL only). Some services
  (e.g. `device.service.ts`) still call `query()` inline — new SQL goes in `infra/database/queries/`.
  `*.repository.ts` files and `shared/`, `plugins/` files are empty stubs; don't add to them unless you
  make them real and remove the duplication.
- Controllers: either exported functions (`createTaskHandler`) or a class singleton
  (`deviceController`); match the module you're in. Services are classes exported as singletons
  (`export const commandsService = new CommandsService()`).
- Imports use `.js` extensions (NodeNext) and `import type` for types.
- SQL: always parameterised (`$1, $2`), explicit column lists in `SELECT`/`RETURNING`, JSON columns
  via `JSON.stringify`. Devices may be looked up by `device_id` or `id::text` — be explicit in new code.
- Errors: services `throw new Error(msg)`; controllers return `{ statusCode, error, message }` (devices,
  auth) or `{ error, details }` (commands). Prefer the `{ statusCode, error, message }` shape for new
  code and don't leak internal error messages on 500s.
- Migrations: add a new numbered file `00N_<description>.sql` (idempotent, `IF NOT EXISTS`), and keep
  `queries/schema.sql` in sync (it currently duplicates `001`). Never edit an applied migration.
- Tests: Vitest `describe/it`, mock `query` with `vi.mocked(dbClient.query).mockResolvedValueOnce(...)`
  in call order. Add a test per new service function.
- Logging: use `request.log` (pino), not `console.*`. Never log tokens, keys, emails or phone numbers.

## Product context for the API

- Help requests of type `sos` must fan out to **all** linked caretakers with live location (push via
  FCM to the caretaker PWA + email fallback); the launcher calls the primary caretaker itself
  immediately (a cancel window may stop alerts, never the call) and falls back to SMS without data.
- **Primary caretaker:** whoever links first gets `role = 'primary'`; the primary can transfer it.
  Enforce exactly one primary per device in the DB (partial unique index on
  `device_caretakers(device_id) WHERE role = 'primary' AND status = 'active'`) and do transfers in one
  transaction. Expose the primary's phone number to the device for SOS.
- **Caretaker PIN is device-only.** Never store, sync, expose or provide a reset for it — no column,
  command, endpoint or snapshot field.
- **Remote access model:** the server is the intermediary. Per-device config is a **versioned document**
  (contacts with multiple numbers, voice clips, settings; reject stale writes by version); commands are
  queued in `tasks`; FCM data messages only wake the device to sync. Everything is offline-tolerant
  and written to `audit_logs`. Later: WebRTC live screen viewing with the server doing signaling + TURN
  fallback only; full remote control deferred.
- **Gemini:** production clients get short-lived ephemeral tokens minted by this backend; the
  long-lived key lives only in backend env.
- **Budget:** near-zero — prefer free tiers and open-source, self-hostable components. Hosting and
  storage are undecided: put file storage (photos, voice clips) behind a `StorageDriver` interface
  (local disk first) and keep all provider details in env.
- Grandma's phone never signs in to Google; it only submits caretaker emails. Linking is completed
  by the caretaker on their own device via invitation + Firebase.

## Security rules

- Never commit `.env`, Firebase service-account JSON, `FIREBASE_PRIVATE_KEY`, SMTP credentials.
  Never paste real values into docs, tests or fixtures.
- **Every device-scoped route** (`:deviceId` params, `deviceId` bodies, task/help-request ids) must
  check that `request.user` is an active caretaker of that device (implement in `middleware/authorize.ts`
  and reuse). Admin-only actions (role changes, removal) need a role check.
- **Device-originated calls must authenticate** (device token issued after signature verification,
  or per-request signature). Don't add new public write endpoints.
- Challenges must be stored server-side with expiry and single use; verify against the stored value.
- Don't log PII; return minimal data (public keys and installed-app lists only to authorized caretakers).
- Never return the Gemini API key (or any provider key) to clients — only scoped, short-lived tokens.
- No endpoint may set or reset the device's caretaker PIN.

## Known issues / current state (to be fixed — do not copy these patterns)

- `middleware/authorize.ts` is empty: authenticated users can read/write any device's caretakers,
  commands, snapshots, help requests and audit logs by ID.
- Unauthenticated writes: `POST /api/invitations`, `POST /api/help-requests`,
  `POST /api/shared-state/snapshot`, `PATCH /api/commands/:id/status`; `GET /api/devices/:deviceId`
  is public.
- Device gets no token after `verify-signature`, so its `GET /api/commands/device/:id` poll 401s.
- `createChallenge` doesn't persist the challenge; `verifySignature` accepts any signed string.
- Help requests don't notify caretakers; no FCM push, config document, `StorageDriver` or ephemeral tokens yet.
- No one-primary constraint: `device_caretakers.role` defaults to `'primary'` and every link path
  (invitation accept, auto-accept, `caretakers/link`) inserts `'primary'`, so all caretakers become primary.
- Responses mix snake_case and camelCase (see System overview).

## Workflow rules

- Small, focused changes; one concern per change.
- Before finishing: `npm run typecheck` and `npm test` must pass.
- Cross-repo API changes ship together (see System overview).
- Git commits must never include `Co-authored-by` trailers for Cursor / Cursor Agent; author as the user only.

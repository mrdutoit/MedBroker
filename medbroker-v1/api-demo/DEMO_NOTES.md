# MedBroker Demo Backend — Notes

This is a **demo backend**, not the client production system. Purpose:
a genuinely working end-to-end slice (frontend → API → real database) to
demonstrate the application, while the Azure stack (Profile A) remains the
production target for a real customer. See Project_Context.md / Status.md
for the Azure architecture — this document only covers what's different here
and why.

Everything in this folder was built by porting the equivalent Azure file
1:1 where possible, and is commented inline pointing back at its Azure
source. Read a file's header comment before assuming it matches the Azure
version exactly.

---

## 1. Stack

| Layer | Demo (this folder) | Azure production target |
|---|---|---|
| Frontend | Vercel (already deployed, unchanged) | Vercel preview → Azure Static Web Apps |
| Backend | Vercel Functions (Node.js, `/api`) | Azure Functions v4 |
| Database | Neon Postgres, free tier | Azure SQL Serverless, `southafricanorth` |
| Auth | Local email/password (JWT), + header bypass for quick testing | Entra ID External JWT |
| Encryption | Local AES-256-GCM master key (`DEMO_ENCRYPTION_KEY`) | Azure Key Vault envelope encryption |
| WAF | None — not needed for synthetic demo data | Cloudflare Pro |

Both Vercel Hobby and Neon's free tier are legitimately usable here — this
is non-commercial demo use, not a paying client's production system, so
the ToS restriction that ruled out "Vercel for the real client" doesn't
apply. See the earlier conversation for that reasoning; it stands.

---

## 2. IMPORTANT FINDING — A1–A4 security fixes are not actually in the repo

Status.md (18 June session) states that Supervisor team-scoping, `isActive`
enforcement, and AuditLog writes were fixed in `functions/leads.js`,
`services/leadService.js`, and `middleware/auth.js` on the Azure side.

**Hydrating fresh from GitHub for this port, none of that is actually
present in `main`.** `functions/leads.js` has no Supervisor-scoping logic
at all (only the Agent-scoping that predates the 18 June session).
`services/leadService.js` has no `isDirectReport()`/`getActiveUserById()`
helper — it doesn't exist anywhere in the repo. `middleware/auth.js`
validates JWT claims (exp, aud, iss, scp, signature) but never checks
`User.isActive`. Nothing calls `writeAuditLog()` from any route.

This is either an uncommitted/unmerged fix, or the Status.md entry was
written without the code landing. Either way — **the Azure repo currently
does not have the access-control fixes it's documented as having.** This
needs resolving on the Azure side independently of this demo work; don't
assume it's done.

For this demo, the A1–A4 patterns are implemented as Status.md specifies
them (the spec itself is clear and well-reasoned, only the code was
missing): `src/services/userService.js` is new (`getActiveUserById`,
`getDirectReportIds`), Supervisor scoping is applied in the route handlers,
`assignLead()` validates the target agent is active, and
`services/auditService.js` is wired into create/assign/delete. All of it
is covered by the test pass described in §5 below. Port this same code
(dialect-converted back to T-SQL/mssql) to the Azure repo rather than
re-deriving it.

---

## 3. Real fix, not a guess — the `leadSource` / `assignedBrokerId` bug

Status.md flags this as a known outstanding item without a resolution.
Tracing it against the actual schema and frontend:

- `Lead` has never had a `leadSource` or `assignedBrokerId` column.
  `assignedBrokerId` is Appointment-only by design (schema.sql §7 comment).
  The original `leadService.js` queries referenced both anyway — they would
  have failed against the real schema the moment they ran.
- `LeadImport.jsx` already sends `manualSourceName` on create (both the CSV
  and Manual Entry tabs) — a real column, but `CreateLeadSchema` never
  declared it, so Zod silently stripped it before it reached the database.
- `LeadList.jsx` reads/filters on `sourceLabel` and sends `source` as its
  filter query param — `leadService.js` never computed or filtered on either.

Fix applied (`models/lead.js`, `services/leadService.js`): `manualSourceName`
is now a declared, stored field; `sourceLabel` is computed as
`COALESCE(event.name, subscription.name, lead.manualSourceName)` via joins;
`source` is a working list filter against that computed label. Verified
against real data in §5. This is worth porting back to the Azure version
verbatim (T-SQL COALESCE/JOIN syntax is the same shape).

---

## 4. Postgres gotcha worth knowing about

Unquoted column names fold to lowercase in Postgres — `SELECT firstName`
returns a row with key `firstname`, not `firstName`. This bit the first
draft of this port silently: `lead.assignedAgentId` read as `undefined`
in three route handlers, and `current?.pipelineStatus` inside
`logCallAttempt` did too, both defaulting to fallback values that happened
to produce the same output as the correct path in casual testing — a
false pass. Only caught by running the actual queries against a real
Postgres instance and asserting on the specific fields, not by reading the
code or running mocked queries.

Fix: every SELECT list column that isn't already all-lowercase has an
explicit `AS "camelCaseName"` alias, in every query in `leadService.js` and
`userService.js`. If you add a new query against this schema, alias any
mixed-case column you intend to read back — this is not optional, and it's
the one dialect difference that fails silently instead of throwing.

---

## 5. What's been verified, and how

No live Neon instance exists yet, so verification used a local Postgres 16
instance (installed in-sandbox) standing in for Neon — same engine, same
SQL dialect, meaningfully equivalent for this purpose:

- `db/schema.postgres.sql` and `db/feature-flags.postgres.sql` both run
  clean against real Postgres 16 — every `CREATE TABLE`/`CREATE INDEX`,
  all seed data (9 regions, 2 portfolios, 13 products, 3 subscriptions,
  16 feature flags).
- `leadStatusService.test.js` — the original 28-test Vitest suite — passes
  unmodified (pure logic, no DB, no changes needed).
- The `@param` → `$1, $2...` placeholder rewrite in `db.js` was verified in
  isolation, including the repeated-parameter case (`@organisationId`
  appearing multiple times in one query).
- `leadService.js` and `userService.js` were exercised end-to-end against
  the real local Postgres instance: create → read → assign → log a call →
  soft-delete, plus the specific security/fix scenarios — Supervisor sees
  their direct report's lead but not a lead assigned outside their team
  (A1), `assignLead` rejects an inactive/unknown target agent (A2), the
  `sourceLabel`/`source` fix, ID-number encryption round-trips and blind-
  index dedup both work.
- Every route handler (`api/leads/index.js`, `api/leads/[id]/index.js`,
  `api/leads/[id]/assign.js`, `api/leads/[id]/calls.js`, `api/health.js`)
  was exercised with mock `req`/`res` objects covering: missing auth,
  role gates, validation failures, UUID format checks, CORS preflight, and
  the full happy path for each verb.

**Not yet verified: an actual Neon connection.** `pg`'s pooled TLS
connection behaviour against Neon specifically (vs local Postgres) hasn't
been exercised. `api/health.js` exists specifically to check this the
moment `DATABASE_URL` points at a real Neon project — run that first.

---

## 6. Setup — first run

1. **Create the database from inside Vercel** (this replaced "Vercel Postgres" — there's no separate Neon signup needed):
   - Vercel dashboard → your team → **Storage** tab → Marketplace Database Integrations → **Neon**.
   - Click Install/Create. Choose the **Vercel-Managed Integration** (creates a Neon account for you, billing stays inside your Vercel invoice — simplest if you don't have a Neon account already). Pick a region, name it.
   - This auto-provisions the Postgres database AND injects `DATABASE_URL` (and a couple of related vars) into your Vercel project's environment variables automatically — no manual copy-paste of a connection string needed for the deployed environment.
   - For local dev, run `vercel env pull .env.development.local` to pull the same values down, or copy `DATABASE_URL` from the Storage tab into your own `.env`.
2. Run the schema against it. Supported Marketplace Postgres integrations expose a **Query tab directly in the Vercel dashboard** (Storage → your database → Query) — paste and run:
   ```
   db/schema.postgres.sql
   db/feature-flags.postgres.sql
   ```
   Alternatively, click "Open in Neon" for the full Neon SQL editor, or use `psql` with the pulled connection string.
3. Set `JWT_SIGNING_SECRET` and `BOOTSTRAP_SECRET` (see .env.example) as Vercel project env vars alongside the auto-injected DB ones.
4. Set `DEMO_ENCRYPTION_KEY` and `ID_NUMBER_INDEX_KEY` the same way (see .env.example for how to generate them).
5. `npm install`
6. Deploy: **new, separate Vercel project**, Root Directory =
   `medbroker-v1/api-demo`. This has to be a second Vercel project — the
   existing frontend project's Root Directory is `frontend/`, and Vercel
   Functions have to live under `<root>/api/`.
7. `curl https://<your-new-project>.vercel.app/api/health` — should return
   `{ "ok": true, "db": "connected" }`.
8. **Bootstrap yourself in as GlobalAdmin** — this is the first real user in the system, there's no UI for it yet (chicken-and-egg):
   ```
   curl -X POST https://<your-project>.vercel.app/api/auth/bootstrap-admin \
     -H "Content-Type: application/json" \
     -d '{"bootstrapSecret":"<your BOOTSTRAP_SECRET value>","displayName":"Mark du Toit","email":"mark@yourcompany.co.za","password":"<a real password, 12+ chars, mixed case + digit + symbol>"}'
   ```
   Works exactly once — refuses once any GlobalAdmin exists. Same call on
   every fresh instance you stand up going forward.
9. Log in: `POST /api/auth/login` with `{"email":"...","password":"..."}` returns a JWT. Use it as `Authorization: Bearer <token>` on every other request.
10. Point the frontend at it: set `VITE_API_BASE_URL` to the new backend's
    URL, and build a real Login page (currently still the role-switcher
    bypass — see Status.md §21 / §22 for what's built vs. not). **Not done
    yet** — the frontend still runs entirely on mock data with no real
    fetch calls.

---

## 7. What exists vs. what doesn't (yet)

Built and verified: the Lead domain end-to-end — list, get, create, assign,
log call, soft-delete, plus Supervisor scoping and audit logging on all of
it. Local auth end-to-end — bootstrap the first GlobalAdmin, log in, get a
real JWT, use it on protected routes, admin-configurable password rotation
and lockout policy, lockout enforcement. See §9.

Not built: Appointments, Flags, Config, Reports APIs — same gap that
exists on the Azure side per Status.md §4/§5, now also not built here.
Same pattern (service file + Vercel route handlers + this same test
discipline) carries forward directly to each of those. Users API (create/
list/deactivate users, portfolio assignment) specifically not built either —
`userService.js` has the pieces login needs, but there's no "create a new
user under User Management" endpoint yet. UserAdmin.jsx's frontend also
still shows the Entra-only "SSO invite notice" flow — needs a real
create-user-with-password form for the standalone-auth path.

Not done: frontend wiring to actually call this backend (see §6 step 10),
including an actual Login page (there isn't one — the frontend still uses
the role-switcher, which doesn't call any of this).

---

## 8. Lift-and-shift back to Azure, when a real customer needs it

Ports unchanged, no rework: `leadStatusService.js` (pure logic),
`context/tenant.js`, the A1/A2 authorization *logic* (only the SQL syntax
inside `userService.js`'s two queries needs converting), Entra ID auth
*design* (this demo's bypass gets replaced by the real
`middleware/auth.js` that already exists in the Azure repo — nothing else
changes because every route calls `validateToken`/`requireRole` through
the same two function names).

Needs mechanical, bounded rework: schema DDL (Postgres → T-SQL, reverse of
this port), query placeholder syntax (`$1` → `@param`, reverse of the
`db.js` shim), `NOW()` → `GETUTCDATE()`, `"User"` → `[User]`, the HTTP
adapter layer (Vercel handler → Azure Functions v4 `app.http(...)`
wrapper), and `encryption.js` (local master key → Key Vault envelope,
already exists in the Azure repo, just needs re-wiring).

The local-auth system (§9) is a genuinely new feature for the Azure side
too, not demo-only — it completes `auth.sso.enabled=false`, which was
already designed and flagged, just never built anywhere. Port
`authService.js`, the `User`/`SystemConfig` column additions, and the three
new routes (login, bootstrap-admin, system-config) the same way as
everything else — dialect conversion only, no redesign.

---

## 9. Local auth — how it actually works

Two coexisting auth paths on every protected route, both handled inside
`middleware/auth.js`:

- **Local JWT** (real, new this session): `Authorization: Bearer <token>`,
  issued by `POST /api/auth/login`. Verified with a hand-rolled HMAC-SHA256
  check (`services/authService.js`'s `signJwt`/`verifyJwt`) — deliberately
  not a library, matching the manual-JWT-parsing style the real Entra
  `middleware/auth.js` already uses, so the two are easy to compare and the
  demo doesn't pick up a JWT library dependency it'll never need once real
  Entra auth replaces it. After signature/expiry checks pass, the user's
  current `isActive` status is re-checked against the database — a
  still-valid token isn't proof of *current* access, same principle as the
  Azure A3 finding.
- **Header bypass** (unchanged, kept as a fallback): `x-demo-user-id` /
  `x-demo-role`, only used when no `Authorization` header is present. Useful
  for quickly testing a route as a role you haven't created a real user
  for yet.

**Password policy is admin-configurable, not hardcoded** — both
`passwordRotationDays` and `passwordLockoutAttempts` live on `SystemConfig`
(defaults 90 and 5) and are read fresh on every login attempt via
`GET/PUT /api/system-config`. `0` means "off" for either. The frontend
should present this as a dropdown (30/60/90/180 days; 3/5/10 attempts) plus
a custom numeric option, per Mark's direction — the API just takes any
non-negative integer, it doesn't enforce which presets the UI offers.

**Rotation doesn't block login** — a user whose password has aged past the
configured period still logs in successfully; the response carries
`passwordMustChange: true` so the frontend can force a change-password
screen immediately after. **Lockout does block login** — once
`failedLoginAttempts` reaches the threshold, `isLocked` is set and even the
correct password is rejected (423) until an admin calls `unlockUser()`
(`services/userService.js` — no route wired to it yet, needs the Users API).

**Bootstrap** (`POST /api/auth/bootstrap-admin`) creates the first
GlobalAdmin. Gated by `BOOTSTRAP_SECRET` (an env var only you know) AND a
check that zero active GlobalAdmins currently exist — belt and braces, not
just one or the other. Designed to be the same one call on every fresh
instance ("every version of the app we build" — this is meant to be a
standing pattern, not a one-off script). Full verification of the whole
flow — wrong secret, weak password, successful bootstrap, refusal on a
second attempt, login, JWT on a protected route, tampered-token rejection,
config update, lockout after 3 failed attempts, locked-account rejecting
even the correct password, rotation forcing `passwordMustChange` after the
configured period — all run against a real local Postgres instance this
session, not just reviewed.

**Not built yet**: password change endpoint (self-service), admin
password-reset/unlock endpoints, and the Users API generally. Needed next
for "create a user under User Management, assign a role, log in" to be
fully demoable — right now you can bootstrap yourself in and log in, but
there's no way to create a *second* user without inserting a row directly.

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
   `medbroker-v1/api-vercel`. This has to be a second Vercel project — the
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

---

## 10. CORS bug found and fixed (22 July 2026, deploying Mark bootstrapped in)

`src/http/helpers.js`'s `applyCors()` originally hardcoded
`Access-Control-Allow-Origin` to `FRONTEND_ORIGIN` (default
`http://localhost:5173`). This silently breaks any caller whose origin
doesn't match that exact value — including `bootstrap-admin.html` (§11)
opened as a local `file://` page, whose origin is the literal string
`"null"`. Caught by testing the actual page against a real Chromium browser
via Playwright, not by code review — the failure mode is a clean-looking
`Failed to fetch` in the browser with no indication it's a CORS problem
specifically unless you check the console.

Fixed: `applyCors()` now reflects whatever `Origin` header the request
actually sent, rather than checking it against one hardcoded value. Also
added `Authorization` to the allowed-headers list, which was missing
entirely — every JWT-bearing request (real login, not just this bootstrap
page) would have hit the same preflight failure the first time anything
called it from a browser rather than a mock/test harness, since a
`Bearer` token can't be sent without it. Neither of these routes use
cookies, so reflecting the origin isn't a loosened security boundary —
every route here is authorized by an explicit bearer token or a request-
body secret, neither of which a browser attaches automatically the way it
would a cookie, so there's no cross-site-cookie risk this was protecting
against in the first place.

**If you deployed api-vercel before this fix**: replace
`src/http/helpers.js` with the current version and redeploy. Nothing else
changed.

## 11. bootstrap-admin.html — browser-based bootstrap utility

A standalone, no-build-step HTML page (open directly via `file://`, no
server needed to run it) for calling `POST /api/auth/bootstrap-admin`
without curl or Postman. Lives outside the repo — it's a one-off utility
for Mark, not part of the deployed application. Form fields: backend URL
(pre-filled to the Vercel deployment), bootstrap secret, display name,
email, password. Shows the raw response either way, success or error, so
failures are diagnosable rather than a silent dead end.

Verified end-to-end with a real Chromium browser via Playwright — not just
reviewed — against a mock server replicating the actual deployed CORS and
validation behaviour: successful creation renders correctly, and a wrong
bootstrap secret renders the 403 cleanly rather than an unhandled error.
This exercise is what surfaced the CORS bug in §10.

---

## 12. Users API (22 July 2026)

New: `models/user.js`, extended `services/userService.js`, `api/users/index.js`
(GET list + POST create, with `?supervisors=true` for the lightweight
dropdown list), `api/users/[id]/index.js` (GET one + PUT update/deactivate).

Built by reading the actual frontend (`UserAdmin.jsx`) first, not guessed —
portfolios and products are accepted and returned as **names**, not ids
(`["Discovery"]`, `["Life Insurance"]`), matching the frontend's checkbox
state exactly; resolved to `Portfolio`/`Product` ids server-side and synced
into the `UserPortfolio`/`BrokerProduct` junction tables via a replace-all
pattern (delete then re-insert) on every create/update — the simplest
correct match for a checkbox UI that always sends its full current state.

GlobalAdmin is excluded from `listUsers()` — bootstrap-only, matches the
frontend's own `ROLES` constant which never lists it as creatable.

Password is optional on create: present → local-auth user (hashed via the
same `authService.hashPassword` bootstrap uses); absent → SSO-style user,
no local password, same as the original mock-only page assumed for every
user. The frontend now decides which to show based on the `auth.sso.enabled`
flag, which already existed and already defaulted to `false` — this isn't
a new behaviour, it's wiring up what that flag was always meant to control.

Verified against real Postgres (not just reviewed): create Supervisor,
Agent (region + supervisor + portfolio), Broker (multiple portfolios +
products), duplicate email returns a clean 409 (not a raw 500), password-
less SSO-style creation, list/role-filter/search, single-user fetch,
updating portfolios/products (re-sync, not accumulate), deactivate, and
confirmed a deactivated user can no longer log in — full circle back to
the A3 enforcement in `middleware/auth.js`. Also re-ran the earlier Leads
and auth verification suites against this same updated codebase to confirm
the `userService.js` additions didn't regress anything already working.

Frontend (`UserAdmin.jsx`): real data via `useFetch`, with `MOCK_USERS` kept
as the preview-mode fallback exactly as every other page already does —
verified via a real-browser Playwright build+click-through in preview mode
specifically to confirm zero regression there. Demo mode verified
separately: login → real user list loads → create a user with password +
region + supervisor + portfolio checkbox → appears in the table → edit →
deactivate → status updates. One thing worth flagging for future testing
in this codebase: ambiguous text-based Playwright locators (e.g.
`text=Add User` matching both a button and a modal heading) will give
false negatives — scope to a specific element (`h2:has-text(...)`) instead.

**Still not built**: self-service change-password, admin password
reset/unlock routes (the underlying `userService.unlockUser()` exists,
no route calls it yet), and the Users API doesn't yet expose editing an
existing user's email (matches the frontend, which doesn't offer that
field in edit mode either).

---

## 13. Renamed from `api-demo` to `api-vercel` (22 July 2026)

Mark's call — `api-demo` read as though it might be the "Self-Hosted" profile
from the app-builder skill's architecture taxonomy (Docker/VPS, no cloud
dependency), when it's actually the existing **Vercel** profile from that
same taxonomy, just with local email/password auth on top. Renaming to
match the profile it actually is, rather than inventing a new, overlapping
name. Nothing about the code changed — folder name and `package.json`
name only. If you're mid-migration: the Vercel project's **Root Directory**
setting needs to change from `medbroker-v1/api-demo` to
`medbroker-v1/api-vercel` to match, or the next deploy will fail to find
anything to build.

## 14. Feature Flags API (22 July 2026)

New: `services/flagService.js`, `api/flags/index.js` (`GET`, no auth — flags
are app config, not user data, and the frontend needs them before/
regardless of login state), `api/flags/[key].js` (`PATCH`, Admin+).

This completes something that was already designed but never wired:
`FeatureFlags.jsx`'s own header comment already said *"In production,
changes are persisted via PATCH /api/flags/:key"* — but `handleSave()`
literally simulated the call with `setTimeout` and never actually reached
a backend. Flipping a flag in the UI did nothing durable. Fixed on both
ends: the routes now exist, and `FeatureFlags.jsx`/`FlagContext.jsx` call
them for real.

Also found and fixed while in this territory: `FlagContext.jsx` was doing
a raw `fetch('/api/flags')` that bypassed `services/api.js` entirely —
same class of bug as the earlier CORS issue, since a bare relative fetch
never reaches the real backend in demo mode (it hits the frontend's own
origin). Routed through `flagsApi` instead, which respects
`VITE_API_BASE_URL` correctly.

Server-side validation on `PATCH`: boolean flags reject non-boolean
values, enum flags are checked against `allowedValues`, and Phase2 flags
are rejected outright (403) even if someone bypasses the frontend's
disabled toggle and calls the endpoint directly — the frontend disabling
the control is a UX convenience, not the actual security boundary.

**`SingleSignOn.jsx` — two real fixes, not cosmetic:**
- Its "SSO is active" banner was hardcoded `true` regardless of the actual
  flag value. Now reads the real flag and shows an accurate "not currently
  enabled" state with a pointer to Feature Flags, or the original active
  banner when it's genuinely on.
- The page (and its nav item) were only reachable **when the flag was
  already true** — `showSso = flag('auth.sso.enabled') && isAdminOrAbove`
  and the matching route guard in `App.jsx`. That's backwards: an admin
  needs to reach this page specifically to learn about and turn on SSO,
  not only see it afterward. Both now gate on `isAdminOrAbove` alone.

**Verified against real Postgres and a real Chromium browser, not just
reviewed:** GET with no auth, PATCH without auth rejected (401), a real
boolean flip persisting and being read back correctly, invalid enum value
rejected (400), Phase2 flag rejected (403), unknown flag key (404) — all
against real Postgres. Separately, full browser click-through: toggle
Single Sign-On in Feature Flags, save, reload the page entirely and
navigate to a different route, confirm the flag is still on (real
persistence, not optimistic local state), then confirm the SSO settings
page now shows the enabled banner instead of the not-enabled one.

**The real boundary, stated plainly:** none of this makes an actual
"Sign in with Microsoft" or "Sign in with Google" button work. Toggling
this flag changes what UserAdmin.jsx shows when creating a user (password
field vs. SSO-invite message) and what SingleSignOn.jsx's banner says —
it does not implement an OAuth handshake. Actually authenticating someone
via a real identity provider requires a real external app registration
(an Entra tenant app, or a Google Cloud OAuth client) with real
credentials that only Mark can create — there is no way to simulate an
external identity provider, and building a fake one would misrepresent
what's actually been verified. This is Azure/Google production-target
work (Entra ID External is already the plan for the Azure profile), not
something the free demo stack can responsibly claim to deliver.

---

## 15. Collapsed into one Vercel project (22 July 2026)

Mark's call, for two reasons: the separate `api-vercel` project's name kept
having "demo" baked into it no matter what it was renamed to internally,
and running two separate projects was the direct cause of most of the
deployment confusion this build has hit — uploading files to the wrong
one, testing the wrong URL, coordinating env vars and CORS across two
origins. One project removes the whole class of mistake.

**What changed structurally**: `api-vercel/api/` → `api/` (unchanged
internally — Vercel Functions still just need to live under `<root>/api/`).
`api-vercel/src/` → `api-lib/`, sibling to the frontend's own `src/` —
kept out of `src/` deliberately so backend-only Node code (pg, bcrypt,
server secrets) never sits in the same tree a bundler globs for the
browser build. Every route file's imports were mechanically rewired
(`../../src/` → `../../api-lib/`, and the one-level-up files `health.js`
and `system-config.js` similarly) — internal cross-references between
backend files (e.g. `middleware/auth.js` importing `../services/userService.js`)
needed no changes at all, since those stayed at the same relative distance
from each other.

**The one thing that had to be fixed, not just moved**: the frontend's
`vercel.json` had a catch-all SPA rewrite —
`{ "source": "/(.*)", "destination": "/index.html" }` — which would have
swallowed every `/api/*` request too once both lived in one project.
Verified this against Vercel's own current documentation (a near-identical
example is in their live docs as of June 2026) and against a real
compiled `path-to-regexp` pattern before shipping it, not assumed:
```json
{ "source": "/((?!api/).*)", "destination": "/index.html" }
```
This explicitly excludes anything starting with `api/` from the SPA
rewrite, letting Vercel's filesystem-based function routing handle those
paths directly.

**`VITE_API_BASE_URL` changes meaning**: it used to be a full cross-origin
URL (`https://med-broker-demo.vercel.app/api`) pointing at the separate
backend project. Now it's just `/api` — same origin, no CORS needed at
all for any of it. `services/api.js`'s DEMO_MODE detection logic (checks
whether this variable is set) needed zero code changes; only the value
changes.

**Verified with a from-scratch local server built specifically to
replicate Vercel's actual routing model** (static file serving + the
fixed SPA rewrite + dynamic dispatch to the real `api/**/*.js` handler
files, including `[id]`-style dynamic segments) — not just separately
testing frontend and backend and assuming they'd combine correctly. Real
Chromium browser, one origin, one port: Login page shown, real login
against real Postgres, real user's name in the sidebar, User Admin and
Feature Flags both loading and working with zero CORS errors of any kind
(there's nothing to reflect an Origin header for anymore — same-origin
requests don't send meaningful cross-origin headers), and a hard reload on
a nested route (`/admin/sso`) still resolving correctly, confirming the
rewrite fix holds under the exact scenario that would break it if wrong.

**Migration, once merged**: everything from `api-vercel/` gets deleted from
the repo — its contents now live inside `frontend/` (folder deliberately
NOT renamed — the existing Vercel project's Root Directory is already
`medbroker-v1/frontend` and stays that way, which is one fewer setting to
get wrong on an already-error-prone deployment history). The `med-broker-
demo` Vercel project gets retired entirely once the merged one is verified
working — that's what actually removes "demo" from Mark's Vercel
dashboard for good, rather than renaming a project that's about to stop
being used.

---

## 16. Leads pages wired to real data (22 July 2026)

The Leads pages (`LeadList.jsx`, `LeadDetail.jsx`, `LeadImport.jsx`) were
already written *speculatively* against a `leadsApi` client that assumed
backend capabilities that didn't fully exist — built during the original
"all pages built" phase, before any backend existed at all. Reading them
first (not guessing) surfaced exactly what was missing:

**Backend additions**: `GET /api/leads/sources` (didn't exist —
`leadsApi.sources()` was already calling it), `excludeStatuses` and
`occupation` filters on `listLeads()` (frontend already sent both,
backend ignored them), `GET /api/leads/:id/calls` (call history could be
written but never read back — `logCallAttempt()` persisted correctly,
nothing ever fetched it, so "Recent Calls" only reflected whatever was
logged in the current browser tab).

**`leadsApi.reassign()` fix**: pointed at a `/leads/:id/reassign` URL that
never existed. Now calls the same `/assign` endpoint `assign()` uses — the
backend already distinguishes first-assignment from reassignment
internally (checks for a previous agent) and logs the right audit action
either way, so there's no need for a second nearly-duplicate route.

**Real bug #1, found by testing, not guessed**: `GlobalAdmin` was missing
from the allowed roles on three Lead routes — create, delete, assign. The
one account you can actually log in with (the bootstrapped GlobalAdmin)
couldn't create or manage a single lead. All three fixed
(`api/leads/index.js`, `api/leads/[id]/index.js`, `api/leads/[id]/assign.js`).
Worth checking for this same gap in any future domain — the pattern was
`requireRole(claims, ['Admin', ...])` without `GlobalAdmin` alongside it.

**Real bug #2, found by testing the actual form, not guessed**: submitting
the Manual Entry lead form with only the required fields filled in — the
completely normal case — failed with a 400. Two optional fields
(`yearOfAttendance`, `mobileNumber`) were sent as empty strings rather than
omitted, and Zod's `.optional()` only skips validation for a genuinely
absent key, not an empty string that then fails the underlying type/regex
check. Fixed with a general `stripEmpty()` helper in `LeadImport.jsx`,
applied before every lead-creation call (both CSV and Manual), which
protects every optional field going forward, not just the two that broke
first.

**Real bug #3, same class, different file**: logging a call with a plain
outcome (anything except "Callback requested") failed with a 400 for the
identical reason — `callbackDateTime` defaults to `''` in `callForm`'s
initial state and only gets a real value when the callback fields are
shown. Fixed in `LeadDetail.jsx`'s `handleLogCall` the same way.

**Real bug #4, found by testing the callback path specifically once the
pattern was established**: even *with* a real value, `callbackDateTime`
failed validation — HTML `<input type="datetime-local">` produces
`"2026-08-01T14:30"` with no timezone offset, and Zod's default
`z.string().datetime()` requires one. Confirmed by testing the actual
value the input produces against the schema directly before shipping a
fix, not assumed. Fixed with `z.string().datetime({ local: true })` in
`models/lead.js`.

**Testing note for future sessions**: an ambiguous Playwright locator
(`button:has-text('Save Call')`) matched both the real form-submit button
and a *different*, intentionally-still-mocked "Save call & Book
Appointment →" button that only appears for the "Client contacted"
outcome (Book Appointment depends on the Appointments API, which doesn't
exist yet — correctly out of scope, not a bug). The ambiguous locator
silently clicked the wrong one and made a real failure look like a pass.
Scope Playwright locators to `button[type=submit]` or similar when a
page has multiple buttons with overlapping text.

**Verified against real Postgres and a real Chromium browser**, full
chain, not in isolation: create a lead with only required fields filled →
appears in the list → source filter dropdown populated from real backend
data → open the lead → log a plain call → status updates → log a second,
callback-dated call → **hard reload the page** → both calls and the
updated status are still there, fetched fresh from the server, not an
optimistic local echo that would have disappeared. Also re-ran the full
cross-domain regression (auth, leads, users, flags) as GlobalAdmin
specifically after the role fixes, to confirm nothing else had the same
gap.

**Still not built**: `LeadImport.jsx`'s Subscription tab remains fully
simulated (`setTimeout`, no real API call) — it was never functional even
as a mockup beyond the UI, and building real subscription-linked bulk
import is a separate, larger piece of work, not part of this pass.
`LeadDetail.jsx`'s "Book Appointment" flow is correctly still local-only —
it depends on the Appointments API, which is next per the agreed
sequence.

---

## 17. Lead intake fields matched to the client's real form (22 July 2026)

Mark's ask: the client's actual Appointment Tracking sheet has Title,
First Name, Last Name, Date of Birth, Job Title (was "Occupation"),
Contact Number, and Email as its intake fields — these needed to exist on
lead creation. Since these represent the client's real required intake
fields, all seven — including `mobileNumber` and `occupation`, previously
optional — became REQUIRED on create. Stated as an explicit assumption at
the time, not silently decided.

**Schema**: `title VARCHAR(10)` and `dateOfBirth DATE` added to `Lead`,
both nullable at the column level (schema stays permissive) with the
required-on-create rule enforced at the validation layer instead — same
pattern as every other required field in this schema. A `CK_Lead_Title`
check constraint restricts stored values to Dr/Mr/Mrs/Ms even if something
ever bypasses application-level validation.

**Since Mark's Neon database already exists live**, `schema.postgres.sql`
alone doesn't reach it — `CREATE TABLE IF NOT EXISTS` does nothing to a
table that's already there. New: `db/migrations/002_add_lead_title_dob.sql`,
using `ADD COLUMN IF NOT EXISTS` (native, safe-to-rerun Postgres syntax)
plus a guarded `DO` block for the check constraint. Verified against a
database deliberately built from the *old* schema (title/dateOfBirth
columns stripped out first) to confirm the migration actually does what
it claims against a genuinely pre-migration table, not just a fresh one
that already has the columns.

**Job Title is a fixed list, not free text** — `JOB_TITLES` in the new
`src/constants/leadOptions.js` is the single shared source both
`LeadImport.jsx`'s create form and `LeadList.jsx`'s filter dropdown import
from, and `api-lib/models/lead.js`'s `JobTitle` enum enforces the same
list server-side. Previously `LeadList.jsx` had its own separately
hardcoded copy of this list — real, if minor, drift risk between the
filter and the (until now, free-text) create field. Fixed by having one
list feed both places instead of two copies staying in sync by hand.

**Real bug caught mid-edit, not shipped**: an early pass at wiring
`title`/`dateOfBirth` into `listLeads()`'s SELECT accidentally deleted the
entire rest of the column list in the process (mobileNumber, occupation,
sourceLabel, status, everything) and left a dangling comma before `FROM`
— a straightforward copy-paste mistake, caught immediately by the next
syntax check and Postgres test run before it went anywhere near a
delivered file. Restored properly, re-verified end to end afterward.

**Verified against real Postgres and a real Chromium browser**, full
chain: missing any of the new required fields → clean 400 naming exactly
which fields; an invalid Title or Job Title value → 400; a fully valid
submission → 201, persists correctly, reads back correctly. Migration
script tested against a genuinely old-shaped table, not just a fresh one.
Browser: all four new/relabelled form elements present with correct
labels (Title, Date of Birth, Job Title, Contact Number — not
"Occupation" or "Mobile"), submitting with fields missing shows inline
validation without crashing, a full valid submission creates the lead and
redirects, the Leads list shows the new "Job Title" column header, and
the Lead Detail page shows the real `title` value in the header (Dr Priya
Naidoo) instead of the old hardcoded "Dr" — a genuine, if small,
correctness improvement the new field enabled — plus Date of Birth,
relabelled Job Title, and relabelled Contact Number all displaying
correctly. Also re-ran the full cross-domain regression (health, auth,
leads, users, flags) to confirm nothing else regressed.

**Kept unchanged, per Mark's explicit instruction**: every field not on
his list — WhatsApp, University Attended, Year of Attendance, Degree
Attained, Hospital/Practice, existing cover, policies, medical aid,
medical aid provider, ID number, all of it. Only Title, Date of Birth
were added; only Job Title and Contact Number were relabelled (the
underlying `occupation`/`mobileNumber` field names in the schema/API were
deliberately NOT renamed, to avoid unnecessary churn — only the
user-facing label text changed to match the client's terminology).

**CSV import**: template download and the required-columns check both
updated to match (`title,firstName,lastName,dateOfBirth,occupation,
mobileNumber,email`). The Subscription tab remains unaffected —
still fully simulated, as noted previously.

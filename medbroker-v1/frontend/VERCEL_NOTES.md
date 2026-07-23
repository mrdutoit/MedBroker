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

---

## 18. Appointments built — assign model (22 July 2026)

Scope: the ASSIGN model only (`appointments.claimModel = 'assign'`, the
flag's current default). The CLAIM model — brokers self-serving from an
available-appointments pool, plus the token economy (`TokenLedger`,
`TokenTransaction`, Stripe payment via `BuyTokensModal`) — is a separate,
larger feature with a real external payment dependency, and stays fully
mocked in `AppointmentList.jsx`, same boundary reasoning as the SSO/OAuth
work earlier: not something to half-build.

**New backend**: `models/appointment.js`, `services/appointmentService.js`
(list/get/create/assignBroker/reassign/returnToLeads/saveOutcome),
`services/appointmentStatusService.js` — a pure-logic status machine
mirroring `leadStatusService.js`'s pattern exactly, with its own 17-test
suite testing the rules directly, not through the API — plus
`services/brokerMatchingService.js`, ported from the Azure reference
implementation (`api/src/services/brokerMatchingService.js`) with only
dialect changes, same three-step algorithm: region + product filtering,
Calendly availability with a circuit breaker, ranked by fewest upcoming
appointments. Routes: `api/appointments/{index,[id]/index,[id]/assign,
[id]/reassign,[id]/return,[id]/outcome}.js`, `api/broker-matching/index.js`.

**Calendly**: this demo has no real Calendly account connected, so broker
matching runs in degraded mode by default (ranked by workload only, no
live slot confirmation) — the *original* Azure design already treats
degraded mode as a first-class, correct outcome for exactly this
situation, not an error state standing in for something broken. Added
`config.calendly` (both vars optional, `CALENDLY_API_TOKEN` /
`CALENDLY_BASE_URL`) and `User.calendlyEventTypeUri` (nullable) so the
live path is ready if Mark ever connects a real account — nothing here
claims to have built working Calendly integration.

**Real bug found before any UI work, via testing**: `User.region` (the
single-value field the Users API already sets) was never synced to
`BrokerRegion` (the multi-region-capable junction table
`brokerMatchingService.js` actually reads) — meaning no broker created
through the existing Users API could ever have matched a single lead.
Fixed with a new `syncBrokerRegion()` helper in `userService.js`, called
from both `createUserFull()` and `updateUserFull()` for Broker-role users
only. The junction table itself is left multi-region-capable in case a
future UI wants to assign a broker to more than one region.

**Serious finding, not a build issue — a delivery/deployment one**: at
the start of this session, re-hydrating fresh from GitHub showed that
several fixes from the *earlier* Leads-wiring session had reverted:
`GlobalAdmin` missing again from three Lead routes (create/delete/assign),
`api/leads/sources.js` missing entirely, and `api/leads/[id]/calls.js`
reverted to its pre-session, POST-only state (also missing `GlobalAdmin`).
Everything under `api-lib/` and `src/` from that same session was
correctly present — only the actual Vercel Function files under
`api/leads/` were affected. All re-applied and re-verified here, but the
underlying cause is unknown from this side — worth Mark checking what
happened with that specific delivery on his end, since this could recur
with future deliveries touching the same files if the cause isn't found.

**Frontend — `LeadDetail.jsx`'s Book Appointment modal**, previously
entirely static (no `value`/`onChange` on any field, "Confirm Booking"
read nothing and did nothing but flip local flags), fully rewritten:
portfolio -> products-interested checkboxes -> region -> live broker
search (calling the real matching endpoint) -> broker selection -> date/
time/address/insurer -> real `POST /api/appointments`. Region is
collected at booking time (matches the client, not the agent — a
broker should be found near where the *client* is) and used only to
query broker matching; it isn't persisted anywhere, since neither Lead
nor Appointment has a region column.

**`AppointmentList.jsx`**: real data fetching added, `AssignBrokerModal`
fixed to use real broker ids instead of hardcoded name strings (same
class of fix as the Users/Leads work), and a latent bug in the row-level
Broker filter — `if (isBroker && a.brokerCode !== 'SB')`, comparing
against a fixed mock string that could never match a real user — fixed
to compare against the logged-in user's actual id. Source and broker
filter dropdowns now reflect real data.

**`AppointmentDetail.jsx`**: added the `GET /api/appointments/:id` fetch
that was missing entirely (the file called `reassign`/`returnToLeads`/
`saveOutcome` already, but never actually loaded the appointment for real
— always started from `MOCK_APPOINTMENT` and never fetched). Backend
returns meetings as flat fields (`meeting1Date`, `meeting1Status`, ...);
transformed into the `{ meetings: [...] }` array shape the rest of this
650-line file already expects, so nothing else needed touching. Also
fixed `ReassignBrokerModal` the same way as the list page's modal.

**Real pre-existing bug found and fixed, unrelated to this session's
wiring**: `PRODUCTS_BY_PORTFOLIO[appt.portfolio]` was looking up
`'Discovery'` directly, but that object's actual keys are `'disc'`/`'mm'`
— meaning the "products sold" checkboxes have silently rendered empty
since this page was first built, even in the original mock-only version.
Fixed the mapping. Also fixed the Return to Leads confirmation copy,
which said the appointment "will be archived" — the schema has no
archive/soft-delete column for Appointment, and the `UNIQUE leadId`
constraint means a lead can't get a new appointment while an old row
exists, so this has always been a genuine delete; the copy was wrong,
not the implementation. Also wired `onReturned` to navigate away after a
successful return, since the appointment row (and thus this very page)
no longer exists afterward — closing the modal and leaving the user on a
now-deleted appointment's page would have been a real, if minor, bug.

**Verified against real Postgres and a real Chromium browser, full
chain**: broker creation with region -> broker matching finds them
correctly, excludes non-matching regions -> agent books an appointment
via the real Book Appointment modal (portfolio, products, region, live
broker search, date/time/address) -> appears correctly in
`AppointmentList.jsx` with a resolved source label -> Assign flow on an
unassigned appointment, persists across reload -> Reassign flow on the
detail page, persists across reload -> first meeting marked Seen ->
status becomes In Progress, persists -> customer signed Yes with
products sold -> status becomes Closed Won, persists, Return to Leads
button correctly disappears -> Return to Leads on a separate, unsigned
appointment -> navigates away correctly, lead is confirmed back in the
unassigned queue via a direct API check. Row-level access control
verified — a non-owning agent gets a 403 trying to view someone else's
appointment. Re-ran the full 23-check backend regression on a completely
fresh database as the final step.

**Testing note for future sessions, cost real time working out**: several
Playwright locator ambiguities specific to this build — `text=Assign`
matches both the "Assign" button and the word "Unassigned" (substring
match); a bare `select` locator can match the page's own background
filter dropdown instead of a modal's field if both happen to list the
same option text (e.g. a broker's name appearing in both the row filter
and the Assign modal) — none were app bugs, all were locator scoping
issues in the test itself. Scope to `get_by_role(..., exact=True)` or the
last-added element in DOM order (`.last`) rather than a bare text or
tag-name locator when a page has more than one plausible match.

Files changed this session — backend: `db/schema.postgres.sql`,
`db/migrations/003_add_calendly_uri.sql` (new),
`api-lib/models/appointment.js` (new),
`api-lib/services/appointmentService.js` (new),
`api-lib/services/appointmentStatusService.js` (new, + test),
`api-lib/services/brokerMatchingService.js` (new),
`api-lib/services/userService.js`, `api-lib/config.js`,
`api/appointments/*` (new, 6 files), `api/broker-matching/index.js` (new),
`api/leads/index.js`, `api/leads/[id]/index.js`, `api/leads/[id]/assign.js`
(all three: re-applied reverted fixes), `api/leads/[id]/calls.js`
(restored), `api/leads/sources.js` (restored, was missing). Frontend:
`src/constants/leadOptions.js`, `src/pages/UserAdmin.jsx` (import shared
REGIONS), `src/pages/LeadDetail.jsx`, `src/pages/AppointmentList.jsx`,
`src/pages/AppointmentDetail.jsx`.

---

## 19. Consolidated to 8 Vercel Functions (22 July 2026)

Mark hit Vercel Hobby's 12-Serverless-Functions-per-deployment limit — the
build had grown to ~20 separate route files, each one its own deployed
function on a plain (non-Next.js) Vercel Functions project, where Vercel's
automatic multi-file bundling is currently Next.js-only (confirmed against
Vercel's own current docs, not assumed).

Fix: collapsed each domain's separate route files into one dispatcher
file per domain, using Vercel's catch-all file-naming convention
(`[...slug].js` for domains with no bare-path route, `[[...slug]].js`
where the bare path — e.g. `GET /api/flags` — also needs to match).
20 files -> 8:

| Domain | Before | After |
|---|---|---|
| auth | 2 | 1 (`api/auth/[...slug].js`) |
| leads | 5 | 1 (`api/leads/[[...slug]].js`) |
| users | 2 | 1 (`api/users/[[...slug]].js`) |
| flags | 2 | 1 (`api/flags/[[...slug]].js`) |
| appointments | 6 | 1 (`api/appointments/[[...slug]].js`) |
| broker-matching, health, system-config | 3 | 3 (unchanged) |

**Lowest-risk approach, deliberately**: every handler's actual business
logic is byte-for-byte unchanged from its original file — only the export
style (named, not default) and location changed. Each original file's
logic moved to `api-lib/handlers/<domain>Handlers.js` (outside `api/`, so
never separately deployed as a function); the new `api/<domain>/
[[...slug]].js` files are thin dispatchers that inspect `req.query.slug`
(the array of path segments Vercel's catch-all convention provides) and
`req.method`, then call the appropriate already-tested handler function.
Nothing about the actual request handling, validation, or business rules
changed — only how a request finds its way to that code.

**One thing worth being honest about — the single piece of this whole
build I could not fully verify from this sandbox**: Vercel's catch-all
file-naming convention (`[...slug].js`, `[[...slug]].js`) is thoroughly
documented for Next.js; confirmation it works identically for a *plain*
(non-Next.js) Vercel Functions project — which is what this is — is
thinner. Strong supporting evidence: this project has already used
Vercel's single-dynamic-segment convention (`[id].js`) successfully and
verifiably throughout this entire build, and catch-all is a direct
extension of the same underlying file-system routing primitive, not a
Next.js-specific feature bolted on separately. But it's real infrastructure
behavior only an actual Vercel deployment can fully confirm — everything
else in this refactor was verified in this sandbox; this one piece
couldn't be.

**Verified, everything that could be**: built a from-scratch local server
specifically extended to replicate Vercel's exact file-resolution rules
for catch-all patterns (required vs. optional, array of segments, literal
paths like `/api/leads/sources` correctly NOT being swallowed by the `:id`
dynamic pattern) — not reused from an earlier session, built fresh for
this. Two full passes: first, every consolidated handler function called
directly with a manually-constructed `req.query.slug` array (26 checks,
covering every domain and every route shape) to confirm the business
logic and dispatch logic are correct in isolation. Second, real HTTP
requests against the actual running server for every routing pattern —
bare paths, one-segment, two-segment, and the literal-vs-dynamic
disambiguation specifically (16 checks) — to confirm the full chain
resolves correctly end to end, not just the logic sitting behind it.

**Migration is a DELETE-and-ADD this time, not the usual overwrite-only.**
The old individual route files must actually be removed from GitHub, not
just left alongside the new ones — leaving both would mean Vercel deploys
BOTH old and new files as separate functions, making the count worse, not
better, and could create routing ambiguity between an old
`api/leads/index.js` and the new `api/leads/[[...slug]].js` covering the
same path. See Status.md for the exact file list Mark needs to delete.

Frontend needs zero changes — every URL path the frontend calls
(`/api/leads`, `/api/leads/:id`, etc.) is identical; only which backend
file answers that URL changed.

---

## 20. Consolidation fix — bracket catch-all files don't work here, switched to vercel.json rewrites (22 July 2026)

The consolidation in §19 broke login and everything else in production
immediately after deploy. Diagnosed by testing the live deployment
directly rather than guessing: `/api/health` (a plain file) returned 200;
`/api/flags` (the simplest possible case of the new pattern — zero
segments) and `/api/auth/login` both returned 404. Confirmed conclusively:
Vercel does not recognize the `[...slug].js` / `[[...slug]].js`
catch-all file-naming convention as a route on this (non-Next.js) Vercel
Functions project — exactly the one risk flagged, in writing, at the time
§19 was delivered, now confirmed rather than theoretical.

FIX: replaced the 5 bracket-named dispatcher files with 5 plain files
(`api/auth-router.js`, `api/leads-router.js`, `api/users-router.js`,
`api/flags-router.js`, `api/appointments-router.js`) and added matching
`rewrites` entries to `vercel.json`:
```
{ "source": "/api/auth/:slug*", "destination": "/api/auth-router?slug=:slug*" }
```
(and one per domain). This uses the SAME mechanism already proven working
on this exact live deployment — the existing SPA-fallback rewrite — so
confidence here is much higher than the bracket-file approach was.
Function count is unchanged at 8; only the routing mechanism changed, not
the count or the handler logic.

One detail genuinely couldn't be confirmed either way even with this
fix: the exact format Vercel serializes a multi-segment wildcard capture
into when substituted into a destination query string (a single
slash-joined string? comma-joined? something else?). Rather than guess
once and risk being wrong twice, `parseSlug()` (new, in
api-lib/http/helpers.js) parses the `slug` query param defensively —
handles array, slash-separated string, comma-separated string, single
segment, and the empty/bare-path case, so the exact serialization detail
doesn't matter as long as it's some recognizable delimited form.

Verified: extended the local test server to actually simulate the
vercel.json rewrite step (not just file resolution, which is all it did
before) — 17 real-HTTP checks covering bare paths, single segments,
two-segment sub-routes, and literal-vs-dynamic disambiguation, all
passing, run twice (once before and once after a further hardening tweak
to parseSlug). The rewrite mechanism itself is proven on the real
deployment already (it's what serves the SPA); this closes the loop on
everything downstream of it.

Files changed: `vercel.json` (5 new rewrite rules added, existing SPA
rewrite untouched), `api-lib/http/helpers.js` (added `parseSlug()`), 5
new router files replacing the 5 bracket-named ones from §19 (which
must be deleted — see delivery notes).

---

## 21. Mock-data flash on real pages, plus unreadable validation errors (22 July 2026)

Two separate, real bugs found after the routing fix landed and Mark
started testing against his live, genuinely-empty database — both
pre-existing, both just newly visible now that real data (or its
absence) actually reaches the UI.

**Mock data flashing then vanishing on Appointments and Users** (and,
latently, Leads — just not visibly, since Mark already had real lead
data): every wired page's fallback logic checked whether the fetched
data was *truthy* to decide between real and mock — `apiData?.appointments
? real : MOCK`. That condition is true for "still loading" and "genuinely
no data" alike, not just "preview mode with no backend at all". Since
`useFetch` starts with `data: null` until the fetch resolves, every page
briefly rendered mock data on first paint, then swapped to real data
(here, correctly empty) once the fetch completed — reading as data having
been wiped rather than a page still loading. Fixed by checking
`apiMode.PREVIEW_MODE` directly instead of data truthiness in
LeadList.jsx, UserAdmin.jsx, and AppointmentList.jsx (both the
appointments list and the broker-options list). UserAdmin.jsx and
LeadList.jsx already had a proper "Loading…" notice gated on the fetch's
own `loading` flag; AppointmentList.jsx didn't, so one was added matching
the same pattern. Verified against a real, empty Postgres database and a
real browser polling page content every 100ms for the first second after
navigation — no mock name ever appeared, on either page.

**Validation errors displayed as literal `[object Object]`**: found via
Mark's own lead-creation attempt. The backend sends validation failures
as `{ error: <Zod .flatten() output> }` — an object (`{ fieldErrors: {...},
formErrors: [...] }`), not a string — and `ApiError`'s constructor was
storing that object directly as `.message`. Every form that displays
`err.message` after a failed submission was affected by this, not just
Lead Import — it just hadn't been hit yet elsewhere. Root actual cause of
Mark's specific test: the phone number he entered ("234234344") doesn't
match the required South African format (`saMobile` regex requires a
leading `0` or `+27`) — correct, intentional validation, just impossible
to see because of the display bug. Fixed once, at the source, in
api.js's `request()`: a new `formatErrorBody()` helper extracts a
readable message from Zod's flatten shape (`"mobileNumber: Mobile number
must be a valid South African number"`), falling back to the plain string
or a generic message for every other error shape. Fixing it here means
every existing and future form benefits, not just the one that surfaced
it. Verified both as a direct unit-style test of the formatting logic
against Mark's exact error shape, and end-to-end through a real browser
submitting the same invalid number and then a corrected one.

Files changed: `src/services/api.js` (new `formatErrorBody()`, used at
the `ApiError` throw site), `src/pages/LeadList.jsx`,
`src/pages/UserAdmin.jsx`, `src/pages/AppointmentList.jsx`.

---

## 22. Assign Lead modal completely unwired, plus Lead Detail flash (22 July 2026)

Found via Mark's own testing, explicitly flagged as pre-fix — testing
the earlier mock-flash fix surfaced a different, more serious bug in an
adjacent component: the "Assign Lead" / "Reassign Lead" modal on the
Leads page (and the agent filter dropdown beside it) had never been
wired to real data at all, at any point before this session — not a
timing/loading issue like the others, a complete absence of wiring. The
dropdown always listed a hardcoded array of five mock agent names
(`AGENTS = ['Thabo Molefe', 'Naledi van Wyk', ...]`), and selecting one
and saving would have sent that NAME STRING to `leadsApi.assign()` /
`leadsApi.reassign()`, which the backend expects to receive as a real
agent UUID (`assignLead(leadId, agentId)` validates it via
`getActiveUserById`). Would have either silently failed or, worse,
written a non-existent placeholder value into `assignedAgentId`.

Root cause once found: the page already had a correctly-fetched real
`agents` list at the top of the file (feeding the page's own agent
filter — wait, no: the FILTER also used the same broken mock fallback,
just gated on `agents.length > 0` rather than being fully unwired like
the modal — see below), but the modal itself was a separate component
that never received it as a prop and used the module-level `AGENTS`
mock constant directly instead.

FIX: `ReassignLeadModal` now takes `agents` as a prop (the same
correctly-fetched real list already used elsewhere on the page),
selects/submits real agent ids instead of name strings, and calls
`onSaved` (the list's own `refetch`) after a successful save so the row
updates without a manual page reload. Display text for "currently
assigned to X" now reads `lead.agentName` (a real joined display field)
separately from the value used for the select itself
(`lead.assignedAgentId` — confirmed this is the actual field name
returned by the backend by checking leadService.js directly, not
assumed from the frontend's own prior naming).

Two more findings from the same investigation, fixed alongside:
- The agent FILTER dropdown (separate from the modal) had the same
  "fall back to mock when real data happens to be empty" bug as the
  earlier session's fix — `agents.length > 0 ? real : MOCK` instead of
  gating on `apiMode.PREVIEW_MODE`. Fixed the same way as everywhere
  else this pattern was found.
- The real `agents` fetch itself was gated `isAdmin ? ... : null` —
  meaning a Supervisor, who this same file's own role-behaviour comment
  says should also get Reassign access, would always see an empty list
  regardless of any of the above fixes. Widened to `isAdmin ||
  isSupervisor`.
- LeadDetail.jsx had the identical "flash of mock data while loading"
  bug as the pages fixed in the previous session, just not yet
  encountered — both the main lead record (`baseLead`) and the call
  history (`calls`) fall back to mock data whenever real data isn't
  present yet, not just in true preview mode. Rather than touch every
  individual field-fallback (this page uses `baseLead` extensively
  throughout a long render, and swapping its mock fallback for an empty
  object risked scattering `undefined` through the page), added a
  page-level loading gate instead: while a real fetch is in flight in
  DEMO_MODE, the page shows a plain "Loading…" state and returns early,
  never rendering the MOCK_LEAD-seeded content at all. Once loading
  finishes, real data is guaranteed to be in place before anything
  renders.

Deliberately NOT fixed here, flagged as a separate, larger piece of
work: the "Medical Subscription" import tab's dropdown
(`SUBSCRIPTIONS` in LeadImport.jsx) is also a hardcoded list, but no
backend endpoint for listing real MedicalSubscription records exists
yet — confirmed by searching the whole codebase, not assumed. Fixing
this needs a new endpoint, not just frontend rewiring; better scoped as
its own task.

VERIFIED against real Postgres and a real browser, replicating Mark's
exact scenario end to end: create a Supervisor, create an Agent under
that Supervisor, create a Lead, open Assign Lead — dropdown correctly
shows the real agent and correctly does NOT show any of the five old
mock names — select and save — confirmed via a direct database check
(not just the UI) that the lead's `assignedAgentId` matches the real
agent's actual id, not a name string. LeadDetail.jsx's fix verified by
polling page content every 100ms for a full second after navigation —
no mock name ever appears; real data renders once ready.

Files changed: `src/pages/LeadList.jsx` (ReassignLeadModal wiring,
agent filter dropdown, agents fetch scope), `src/pages/LeadDetail.jsx`
(loading gate).

---

## 23. Preview mode removed from the 4 wired domains (22 July 2026)

Mark confirmed the app always runs against a real backend now, so the
original preview/mock mode — a leftover from before any backend
existed, letting every page render from inline fake data with zero
setup — was removed from Leads, Users, Flags, and Appointments (the 4
domains with a real backend already built). Going forward, new pages
get built without this pattern from the start rather than added and
cleaned up later.

**api.js**: `PREVIEW_MODE` removed entirely, including the `if
(PREVIEW_MODE) return null` early-return in `request()` that used to
make every call silently resolve to nothing. `DEMO_MODE`/`ENTRA_MODE`
simplified from three possible states to two, mutually exclusive and
exhaustive (`ENTRA_MODE` if Entra is configured, `DEMO_MODE` otherwise)
— there's no longer a possible "neither" state to account for.

**FlagContext.jsx / FeatureFlags.jsx**: comment-only changes.
`DEFAULT_FLAGS` was never purely a preview-mode fallback — it's also a
legitimate resilience fallback for when the real flags API is
unreachable, which is good practice on its own merits regardless of
preview mode's existence. Left the actual mechanism untouched; only
cleaned up wording that referenced a concept that no longer exists.
`FeatureFlags.jsx`'s `apiMode.DEMO_MODE` check in `handleSaveFlag`
turned out not to be about preview mode at all — it's the separate
Demo-vs-Entra-production distinction, correctly out of scope here.

**LeadList.jsx**: `MOCK_LEADS`, `AGENTS`, `LEAD_SOURCES` removed. Every
fallback (`data`, the agent filter dropdown, `sourceOptions`) simplified
to real-data-only.

**LeadDetail.jsx**: `MOCK_LEAD`, `MOCK_CALLS` removed. `baseLead`
simplified now that the loading gate (already added in the previous
session) fully protects against ever rendering with incomplete data.
Found and fixed a real, separate bug while in here, unrelated to mock
data removal directly but found via the same investigation: the
call-logging error handler had a bare `catch {}` that silently applied
the same optimistic "call logged successfully" update regardless of
whether the real save actually succeeded — meaning a genuine backend
failure (validation, auth, network) would show as a success with no
indication anything was wrong. Now shows the real error via the
already-existing `submitError` display instead of masking it.

**UserAdmin.jsx**: `MOCK_USERS`, `MOCK_SUPERVISORS` removed.
`allUsers`/`supervisors` simplified to real-data-only.

**AppointmentList.jsx**: `SOURCES` (confirmed dead code — no longer
referenced anywhere) and `BROKERS` (only used by the now-removed
preview fallback) removed. `ALL_APPOINTMENTS`, `AVAILABLE_TO_CLAIM`, and
`MY_APPOINTMENTS` were NOT removed — these are still genuinely needed
for the claim-model tabs, a separate, deliberately-still-mocked feature
(real token/payment economy, out of scope, documented since the
Appointments build). Re-commented to make that narrower, ongoing purpose
explicit rather than leave them looking like leftover preview-mode
debris. `sourceData`/`brokerOptions` (the assign-model's own data)
simplified to real-data-only.

**AppointmentDetail.jsx**: `MOCK_APPOINTMENT` removed, along with a
`BROKERS` constant confirmed dead since an earlier session's fix. This
page had never gotten the loading-gate treatment the previous session
gave LeadDetail.jsx — it would have flashed fake appointment data on
every load exactly the same way, just not yet caught. Fixed the same
way: real neutral placeholder shape (same fields, empty values, no fake
names) for the brief window before data loads, with a loading gate that
means that placeholder is never actually shown.

VERIFIED against real Postgres and a real browser: created a real
broker, agent, lead, and appointment, then visited all 6 affected pages
(Leads, Lead Detail, User Admin, Feature Flags, Appointments, Appointment
Detail) checking for the presence of any of the 13 known mock/demo names
used throughout the app's history — none appeared on any page. Confirmed
real data displays correctly on every page it should.

Files changed: `src/services/api.js`, `src/context/FlagContext.jsx`,
`src/pages/FeatureFlags.jsx`, `src/pages/LeadList.jsx`,
`src/pages/LeadDetail.jsx`, `src/pages/UserAdmin.jsx`,
`src/pages/AppointmentList.jsx`, `src/pages/AppointmentDetail.jsx`.

NOT touched, deliberately out of scope: Events, Notifications, Tasks,
App Admin's audit log and subscriptions list, and LeadImport.jsx's
Medical Subscription tab — these have no real backend at all yet, so
their mock data isn't "preview mode", it's simply unbuilt functionality.
Removing it without building the real thing first would break those
pages entirely. Flagged for whenever each is actually built.

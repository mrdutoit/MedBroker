MedBroker Lead Management System — Project Status (VERCEL VERSION)
==================================================
Last updated: 30 July 2026
Scope: this file tracks ONLY the Vercel + Neon Postgres deployment —
frontend/api/ + frontend/api-lib/ + frontend/src/. It does NOT cover the
separate Azure Functions/Azure SQL codebase (api/src/, infra/), which is
frozen and out of scope for this project going forward (Mark will start
a separate Claude project for any future Azure customer build). Read
alongside Project_Context_Vercel.md — that one is architecture and
standing conventions; this one is current build state and full session
history.

Split from the original (mixed) Status.md/Project_Context.md on 30 July
2026, after the same confusion happened twice in one week: a stale
"not built" claim about the Azure target was read as being about this
one. Everything from here down (§21 onward) is the actual, accurate
session history for this build, carried forward unchanged from the
original file — only this summary block at the top is newly written.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0. CURRENT STATE — READ THIS FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FULLY BUILT AND WORKING (real backend, real Neon Postgres, not mock data):
  Auth            Local email/password, JWT, 8-hour expiry
  Leads           Full CRUD, assignment, call logging, reopen, audit log,
                  real duplicate detection (check-duplicates batch
                  endpoint + create-time 409), CSV/Excel/JSON bulk import
                  via SheetJS, formula-injection hardening
  Appointments    Full CRUD, assign/reassign broker & agent, return-to-
                  leads, outcome recording, broker matching, Appointment
                  History card on Lead Detail (surfaces the full
                  one-to-many set, not just the most recent)
  Users           Admin CRUD + real self-service profile (PUT /users/me
                  — theme/avatar/timezone, structurally separate schema
                  from the admin-editing-someone-else route)
  Flags           Full GET/PATCH, tiered (Core/Operational/Phase2)
  Reports         Pipeline + broker-activity, server-enforced Supervisor
                  team-scoping
  Events          Full backend — registration, dual QR codes
                  (registration vs attendance), walk-in check-in
  Lead Portal     Public self-service registration + venue check-in,
                  own separate auth (ProspectAuthContext, own JWT secret)
  Tasks           Full REST API, all five generation rules event-driven
                  off real actions (no scheduled job needed), cascade
                  reassign/delete when the Lead/Appointment a task is
                  about changes owner or closes out, manual creation +
                  deletion (Admin/GlobalAdmin, manual-type only), real
                  sidebar badge (own incomplete-task count), creator
                  tracking (createdById, §69) — a creator's own tasks
                  are always visible to them regardless of who they're
                  assigned to, plus a "Created by me" filter
  Notifications   All 5 real-data-driven types now generate for real:
                  LeadAssigned + AppointmentAssigned (action-driven, §61)
                  and AppointmentReminder + CallbackReminder +
                  LeadAutoReturned (daily Vercel Cron scan, §68). Only
                  needs CRON_SECRET set in Vercel's env vars to actually
                  fire — see §68.
  Settings        Real backend for theme/name/avatar/timezone, plus a
                  Security card (§72) for self-service password change.
                  Photo upload is an honest disabled "coming soon" stub.
  Password policy (§72) — fully real now: rotation (30/60/90/180/custom
                  days), lockout, and calendar-year reuse prevention are
                  all admin-configurable (AppAdmin -> System Settings)
                  and actually enforced. Manually created users are
                  always forced to set their own password on first
                  login. AppAdmin's whole System Settings tab is now
                  real-wired too, not just the password fields — it was
                  entirely mock before this.
  Audit Log (§76) — AppAdmin's Audit Log tab is real now, paginated,
                  org-wide. Was showing ten hardcoded fake entries
                  unconditionally before this. Filters (date range,
                  Entity, Action, Performed By) + CSV/JSON export (§77).
  Email notifications (§78) — real, built on standard SMTP
                  (nodemailer) rather than any provider's proprietary
                  API, deliberately, so it's swappable for a customer's
                  own mail server or M365 later without a rewrite. Needs
                  SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM set in
                  Vercel's env vars AND notifications.email.enabled
                  switched on (AppAdmin -> Feature Flags) before
                  anything actually sends — neither is done yet.

GATED OFF BY DEFAULT (built, working, just not switched on):
  tasks.enabled — flip in FeatureFlags.jsx (AppAdmin) to see Tasks in
  the nav/routes at all.

DELIBERATELY NOT BUILT (real gaps, not yet scoped or blocked on
something outside this session's control):
  - Token economy: claim model works; Stripe not connected.
  - POPIA Subject Access Request endpoint: flag exists, nothing built.
  - "Medical Subscription" lead import tab: UI mockup only, no backend.
  - Org-wide entity display for Event/EventAttendee/Task in the Audit
    Log (§76) — shows a raw id rather than a resolved name, a real but
    lower-priority gap than Lead/Appointment/User, which do resolve.

CURRENT SECURITY / DEPENDENCY STATE (as of 30 Jul 2026):
  - react-router: migrated 6->7 (7.18.2). The open-redirect + SSR-
    hydration CVEs are closed. One remaining npm audit entry (RSC Mode
    CSRF Bypass) is confirmed NOT applicable — this app has no RSC usage
    anywhere. Real fix is v8, a separate future decision.
  - xlsx: pinned to 0.18.5 in package.json (npm registry's ceiling), but
    Mark bumped the ACTUAL deployed repo to patched 0.20.3 via a GitHub
    Codespace, since neither npm nor SheetJS's own GitHub tags carry
    anything newer (SheetJS moved post-0.18.5 releases to their own CDN
    only). If this sandbox re-hydrates from GitHub, expect to see 0.20.3
    in the real package.json even though this file's own history
    (§63 onward) still says 0.18.5 at the point each entry was written.
  - engines.node: pinned to "24.x" (current Active LTS, supported
    through April 2028). Was briefly, incorrectly, pinned to "20.x" —
    fixed same day it was caught, see §66.
  - WAF: Vercel's own built-in Firewall — included on every plan
    (Hobby: DDoS mitigation + Attack Mode on by default, IP blocking +
    Custom Rules up to 3 each; Pro: up to 100/40; rate limiting is
    Pro-and-above only). No separate Cloudflare/Azure Front Door
    needed — see Project_Context_Vercel.md §12 for the full decision
    and why NOT to also add Cloudflare in front of Vercel.
  - DB connection TLS: db.js sets ssl: { rejectUnauthorized: false } on
    the pg Pool — encrypts the connection to Neon but doesn't verify
    Neon's certificate. Low practical risk (same trusted cloud
    infrastructure), not the strictest possible config. Tracked, not
    urgent — see §70 for the full finding and how to tighten it later.
  - Still queued, lowest priority (dev-tooling only, zero production
    exposure): ESLint v10 + the still-missing eslint.config.js (lint
    genuinely cannot run at all right now); Vite v8 + Vitest v4 major
    bump (higher risk than ESLint since Vite is the actual build tool).

VERCEL FUNCTION COUNT: exactly 12/12 (Hobby's hard ceiling), zero
headroom. Check the real count before adding any new top-level API
surface — `find frontend/api -type f -name "*.js" | wc -l` (nested files
count too; this is exactly how a deploy failure happened once already).
system-config.js folding into flags-router.js is the natural next
consolidation if/when headroom is needed.

PERMANENT PATTERNS worth re-reading before touching adjacent code:
  - GlobalAdmin missing from requireRole() allow-lists is a recurring
    real bug on new routes — check every new route explicitly includes it.
  - Empty-string optional fields break Zod .optional() — apply a
    stripEmpty()-style helper to new create/update payloads.
  - HTML datetime-local inputs need z.string().datetime({ local: true }).
  - Client hides, server enforces — every permission/lock boundary in
    this app follows this split; new gates should too.
  - Backend date serialization: .toISOString().slice(0, 10) on a raw pg
    Date object, never String(dateObj).slice(0, 10) — see Project_
    Context_Vercel.md's CRITICAL IMPLEMENTATION RULES for the full story
    (a real bug, "Overdue 9129d" on a task due in 3 days).
  - When something gets built, go back and correct every stale "not
    built yet" claim about it, not just the newest summary — a
    disclaimer alone didn't stop this exact confusion happening twice.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
21. DEMO BACKEND (Vercel + Neon) — added 21 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

21.1 PURPOSE AND SCOPE
  Mark wants a genuinely working demo — real backend, real database, not
  just the mock-data frontend preview — to show as proof the application
  works, separate from the client's eventual production deployment. Azure
  (Profile A) remains the confirmed production target; nothing about that
  changed. New folder: medbroker-v1/api-vercel/ — full detail in
  api-vercel/VERCEL_NOTES.md, summarised here.

  Stack: Vercel Functions (Node.js) + Neon Postgres, both free tier.
  Legitimate here because this is non-commercial demo use, not the paying
  client's production system — the Vercel Hobby ToS restriction that ruled
  out "Vercel for the real client" doesn't apply to a demo.
  Auth: kept the existing role-switcher bypass (x-demo-user-id /
  x-demo-role headers) rather than wiring real Entra SSO — Mark's call,
  faster iteration on the API build; SSO is independent, portable work.
  Repo layout: new folder in the same repo (api-vercel/), not a branch —
  Mark's call.

21.2 FINDING — A1-A4 SECURITY FIXES NOT ACTUALLY IN THE AZURE REPO
  Hydrating fresh from GitHub to start this port surfaced that the A1-A4
  fixes this document (§0, §4 area, and the 18 June entries above) describe
  as complete are NOT present in main. functions/leads.js has no
  Supervisor-scoping logic. services/leadService.js has no
  isDirectReport()/getActiveUserById() helper — doesn't exist anywhere in
  the repo. middleware/auth.js validates JWT claims but never checks
  User.isActive. Nothing calls writeAuditLog() from any route.
  Cause unknown (uncommitted fix vs. Status.md written ahead of the code) —
  needs resolving on the Azure side independently. Do not assume A1-A4 are
  live in the Azure codebase without checking the actual files first.
  The demo backend implements A1-A4 as this document specifies them (see
  api-vercel/src/services/userService.js, new — doesn't exist on Azure side
  either). Port it back (T-SQL dialect) when doing the Azure Appointments
  API work or reconciling this finding.

21.3 REAL FIX — leadSource / assignedBrokerId (was a known outstanding item)
  Root-caused, not guessed: Lead never had a leadSource or assignedBrokerId
  column (assignedBrokerId is Appointment-only by design). LeadImport.jsx
  already sends manualSourceName on create; CreateLeadSchema never declared
  it so Zod silently stripped it. LeadList.jsx reads/filters on sourceLabel
  and sends a `source` query param; leadService never computed or filtered
  on either. Fixed in the demo's models/lead.js + leadService.js:
  manualSourceName is now stored, sourceLabel is computed via
  COALESCE(event.name, subscription.name, manualSourceName), source filter
  works. Same fix applies verbatim (T-SQL COALESCE/JOIN, same shape) on the
  Azure side — worth porting back rather than re-deriving.

21.4 VERIFICATION PERFORMED
  No live Neon instance exists yet. Verified against a real local
  Postgres 16 instead (same engine/dialect) — not just syntax-reviewed:
    - schema.postgres.sql + feature-flags.postgres.sql run clean, full
      seed data lands correctly.
    - leadStatusService.test.js (28 tests) passes unmodified.
    - leadService.js + userService.js exercised end-to-end: create, read,
      assign, log call, soft-delete, plus the A1 (Supervisor scoping) and
      A2 (inactive-agent rejection) scenarios specifically.
    - Every api/leads/* route handler exercised with mock req/res: auth
      failures, role gates, validation, CORS preflight, full happy path.
    - One real bug caught this way and fixed: Postgres folds unquoted
      column names to lowercase in results, so several camelCase field
      reads (lead.assignedAgentId, current.pipelineStatus, user.displayName)
      were silently reading undefined. Fixed by aliasing every mixed-case
      SELECT column explicitly. Flagged in DEMO_NOTES.md §4 as the one
      dialect gotcha that fails silently — check for it in any new query.
  NOT yet verified: an actual Neon connection (TLS/pooling behaviour may
  differ from local Postgres). api/health.js exists specifically to check
  this first once DATABASE_URL points at a real Neon project.

21.5 WHAT'S BUILT VS NOT, IN THE DEMO
  Built: Lead domain end-to-end (list/get/create/assign/log call/delete),
  with Supervisor scoping and audit logging. Local auth end-to-end (§21.6).
  Not built: Appointments/Flags/Config/Reports APIs — same gap as the Azure
  side, now also open here. Same file pattern carries forward. Users API
  specifically not built either (create/list/deactivate a user, portfolio
  assignment) — userService.js has what login needs, but there's no route
  to create a second user without inserting a row directly. UserAdmin.jsx
  still shows the Entra-only "SSO invite notice" flow, not a real
  create-user-with-password form.
  Not done: frontend wiring (services/api.js) to call this backend instead
  of mock data, including an actual Login page (still the role-switcher);
  creating the second Vercel project (Root Directory = medbroker-v1/api-vercel)
  — both are manual steps for Mark, documented in DEMO_NOTES.md §6.

21.6 LOCAL AUTH — added 21 July 2026 (same session, Mark's follow-up)
  Mark asked how auth was handled, wanted local email/password with company
  password policy, a GlobalAdmin bootstrap for every version of the app,
  and how to create the DB from inside Vercel.

  Local auth completes auth.sso.enabled=false, which the FeatureFlag seed
  data already described ("users log in with a standalone email and
  password managed within MedBroker") but nothing had ever implemented —
  not demo-only scope, a real gap on the Azure side too. Coexists with
  Entra SSO, doesn't replace it.

  Built: services/authService.js (bcryptjs hashing, hand-rolled HMAC-SHA256
  JWT sign/verify — matches the manual-JWT style middleware/auth.js already
  uses for Entra, no JWT library dependency picked up). POST /api/auth/login
  (email/password -> JWT). POST /api/auth/bootstrap-admin (creates the
  first GlobalAdmin — gated by BOOTSTRAP_SECRET env var AND zero-GlobalAdmin
  check; refuses permanently once one exists; same call works on every
  fresh instance, per Mark's "every version of the app" request).
  GET/PUT /api/system-config, extended with passwordRotationDays and
  passwordLockoutAttempts (both admin-configurable, 0 = off — Mark wants a
  preset dropdown: 30/60/90/180 days, 3/5/10 attempts, plus custom; the API
  just takes any non-negative integer). middleware/auth.js now checks
  Authorization: Bearer first, falls back to the x-demo-user-id/x-demo-role
  header bypass only when no Authorization header is present.

  User table gained (demo schema only, v2.5 — not yet ported to Azure
  infra/schema.sql): passwordHash, passwordSetAt, passwordMustChange,
  failedLoginAttempts, isLocked.

  Rotation doesn't block login — expired-age password still logs in, but
  the response carries passwordMustChange:true for the frontend to act on.
  Lockout does block login — locked account rejects even the correct
  password (423) until an admin unlocks it (userService.unlockUser() exists,
  no route wired to it yet).

  Verified against real local Postgres: wrong bootstrap secret, weak
  password rejected, successful bootstrap, second bootstrap attempt refused,
  wrong-password login rejected, correct login returns a working JWT,
  that JWT works on a real protected Leads route, a tampered JWT is
  rejected, system-config read/update (including custom rotation value),
  3-failed-attempts lockout, locked account rejects the correct password,
  and rotation correctly flags passwordMustChange after backdating
  passwordSetAt past the configured period.

  Still needed: self-service change-password endpoint, admin reset/unlock
  endpoints, and the Users API generally — no way yet to create a second
  user without inserting a row directly. DB creation from inside Vercel:
  Storage tab -> Marketplace -> Neon (Vercel-Managed Integration) auto-
  injects DATABASE_URL, no manual neon.com signup needed — see
  DEMO_NOTES.md §6 (corrected this session — the earlier note describing a
  direct neon.com signup was the long way round).

21.7 DEPLOYMENT — Mark's first live deploy, 22 July 2026, plus a real bug found
  Walked Mark through his first live api-vercel deployment. Two Vercel-specific
  snags worth remembering for next time:
  - The Neon "Connect Project" prefix field, if filled in, prefixes EVERY
    injected variable (DATABASE_URL became medBroker_DATABASE_URL) — the
    app only reads the exact name DATABASE_URL. Leave the prefix field
    blank unless multiple databases are attached to the same project.
  - Env var changes never apply to an already-built deployment — always
    needs an explicit Redeploy (Deployments -> ... menu -> Redeploy ->
    confirm in the dialog) afterward, and it's easy to only complete the
    first click and think it's done.

  Real bug found via testing, not review: src/http/helpers.js's
  applyCors() hardcoded Access-Control-Allow-Origin to FRONTEND_ORIGIN —
  silently broke any caller from a different origin, including a file://
  page (origin "null"). Also missing Authorization from the allowed-headers
  list, which would have broken real JWT login calls from a browser the
  same way. Fixed to reflect the actual request origin instead of a fixed
  value — safe here specifically because none of these routes use cookies,
  so there's no cross-site-cookie exposure to protect against; every route
  is authorised by an explicit bearer token or request-body secret. Full
  detail in api-vercel/VERCEL_NOTES.md §10. If any api-vercel deployment predates
  this fix, it needs src/http/helpers.js replaced and redeployed.

  New: api-vercel/bootstrap-admin.html (lives outside the repo — a one-off
  utility, not part of the app) — browser-based form for calling
  POST /api/auth/bootstrap-admin without curl/Postman, since Mark's work PC
  has neither. Verified end-to-end with a real Chromium browser via
  Playwright (success and wrong-secret-error paths both), not just
  reviewed — that testing is what surfaced the CORS bug above. Detail in
  DEMO_NOTES.md §11.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
22. FRONTEND AUTH WIRING — added 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

First real backend calls from the actual React frontend (medbroker-v1/
frontend/) — everything before this was the demo backend + standalone test
pages, not the app itself. Mark's goal: something demoable, not just a
backend proven to work in isolation. Sequence agreed: auth wiring (this) ->
Users API + UserAdmin creation flow -> wire Leads pages to the real backend
-> Appointments -> Reports.

NEW MODE, ADDITIVE — zero change to existing behaviour:
  api.js already had PREVIEW_MODE (no backend, mock data — the original
  default) and an Entra production mode (never fully wired). Added a third,
  DEMO_MODE, active when VITE_API_BASE_URL is set and VITE_ENTRA_CLIENT_ID
  is NOT — i.e. exactly the api-vercel backend case. Preview mode is
  completely unaffected when VITE_API_BASE_URL is unset; verified by a full
  Vite production build + real-browser Playwright click-through in preview
  mode after these changes — role switcher, navigation, GlobalAdmin nav
  items all behave identically to before.

FILES — new: src/services/authStore.js (plain module, JWT + user in
sessionStorage, so services/api.js can read the token without prop-drilling
it through every call), src/context/AuthContext.jsx (React layer over
authStore — login()/logout()/isAuthenticated), src/pages/Login.jsx (styled
per tokens.js — s.formGroup/formLabel/formInput/errorBox/primaryBtn,
matching Settings.jsx's existing form conventions).
FILES — modified: src/services/api.js (DEMO_MODE detection, authApi.login,
JWT attached to every authenticated call, 401 auto-clears the session),
src/context/RoleContext.jsx (in DEMO_MODE with a real logged-in user, role/
persona come from that user instead of the preview switcher; setRole
becomes a no-op in that case — preview-mode behaviour is byte-for-byte
unchanged when not in DEMO_MODE), src/App.jsx (AuthProvider wraps
RoleProvider — required, since RoleContext now calls useAuth(); renders
Login instead of the app when DEMO_MODE and not authenticated; sidebar
footer shows a real "Signed in" + Log out control in DEMO_MODE instead of
the preview role switcher, which stays exactly as it was otherwise).

VERIFIED — real Chromium browser via Playwright, not just code review, in
BOTH modes:
  Preview mode (no env vars): full build, role switcher present and
  functional, GlobalAdmin nav gating unchanged — confirms zero regression.
  Demo mode (VITE_API_BASE_URL set, mock backend standing in for api-vercel):
  shows Login (not the app) on load; wrong password shows an inline error
  and stays on Login; correct login renders the real app; sidebar shows the
  real logged-in user's name and role (not a preview persona) with a
  working Log out button; Log out returns to Login.

DEPLOYMENT NOTE for Mark: this needs VITE_API_BASE_URL set as an
environment variable on the FRONTEND Vercel project (not api-vercel) —
pointing at the api-vercel backend's URL, e.g.
https://med-broker-demo.vercel.app/api. Same redeploy-after-env-var-change
rule as api-vercel applies here too.

NOT YET DONE: Users API (no way to create a second user — still the single
bootstrapped GlobalAdmin only), UserAdmin's create-user form (still shows
the Entra-only SSO-invite message), and every page besides the login flow
itself still reads mock data — LeadList/LeadDetail/etc. are not yet wired
to leadsApi even though that backend is fully built and tested. Next
session per the agreed sequence: Users API + UserAdmin first (it's what
actually lets "create a user, assign a role, they log in" be demoed), then
wire Leads.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
23. USERS API — added 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Built by reading UserAdmin.jsx first, not guessed. New: models/user.js;
extended services/userService.js (listUsers, getUserForAdmin,
listSupervisors, createUserFull, updateUserFull, plus the portfolio/
product junction-table sync helpers); new api/users/index.js (GET list +
?supervisors=true dropdown, POST create) and api/users/[id]/index.js
(GET one, PUT update/deactivate).

Portfolios/products travel as NAMES end to end (["Discovery"],
["Life Insurance"]), not ids — matches the frontend's existing checkbox
state exactly, resolved to Portfolio/Product ids server-side, synced into
UserPortfolio/BrokerProduct via delete-then-reinsert on every save.
GlobalAdmin excluded from the list — bootstrap-only, matches the
frontend's own ROLES constant.

Password is optional on create — present means a real local-auth user
(hashed the same way bootstrap-admin does); absent means an SSO-style user
with no local password. UserAdmin.jsx now shows a password field OR the
original SSO-invite notice based on the auth.sso.enabled flag — that flag
already existed and already defaulted to false; this wires up behaviour it
was always meant to control, not new scope.

Verified against real Postgres: create Supervisor/Agent/Broker (region,
supervisor, portfolios, products all persist correctly), duplicate email
-> clean 409 not a raw 500, password-less SSO-style creation, list/role-
filter/search, single-user fetch, portfolio/product re-sync on update
(not accumulation), deactivate, and a deactivated user correctly can no
longer log in (ties back to the A3 enforcement). Re-ran the earlier Leads
and auth suites against this same updated codebase too — clean, nothing
regressed from the userService.js additions.

Frontend (UserAdmin.jsx) rewired to the real API via the existing useFetch
hook, MOCK_USERS kept as the preview-mode fallback exactly like every
other page — verified via a real Vite build + Playwright click-through in
preview mode specifically to confirm zero regression, and separately in
demo mode: login -> real list loads -> create with password + region +
supervisor + portfolio checkbox -> appears in table -> edit -> deactivate
-> status updates, all against a real backend (mocked server standing in
for api-vercel in this test, same as previous sessions).

One process note for future sessions in this project: a Playwright text
locator like `text=Add User` will match both a button and a modal heading
on this page and give a false "still open" reading — scope to a specific
element (e.g. `h2:has-text(...)`) instead. Cost real time working out this
was a test bug, not an app bug, before confirming it.

Net result: "create a user, assign a role, they log in" — the scenario
Mark asked to be able to demo — now genuinely works end to end. What that
logged-in user then SEES is still mock data (Leads/Appointments/Reports
pages not yet wired) — that's the next piece, not this one.

Still not built: self-service change-password, admin password reset/
unlock routes (unlockUser() exists in userService.js, no route calls it
yet), editing an existing user's email (matches the frontend, which
doesn't offer that field in edit mode either).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
24. RENAMED TO api-vercel, THEN MERGED INTO ONE PROJECT — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two changes in the same session, second one supersedes the folder-location
part of the first.

24.1 RENAME api-demo -> api-vercel
  Mark's call — "api-demo" read as though it might be the Self-Hosted
  profile from the app-builder skill's own architecture taxonomy
  (Docker/VPS, no cloud dependency), when it's actually the existing
  Vercel profile from that same taxonomy, just with local auth on top.
  Worth encoding into the app-builder skill itself (separate project, not
  actioned here): default build-first-on-Vercel-profile pattern should use
  "Vercel" consistently, not introduce an overlapping "Local" concept —
  local-vs-SSO auth is an independent axis (already the auth.sso.enabled
  flag) from which cloud profile is being used.

24.2 MERGED into a single Vercel project
  Then Mark asked to also drop "demo" from the Vercel PROJECT name (not
  just the folder) and asked whether frontend + backend could just be one
  application instead of two separate Vercel projects. Yes to both, and
  doing the second thing resolves the first automatically — see below.

  Structural changes: api-vercel/api/ -> frontend/api/ (unchanged
  internally). api-vercel/src/ -> frontend/api-lib/ (sibling to the
  frontend's own src/, deliberately not merged into it — keeps backend-
  only Node code, pg/bcrypt/server-secrets, out of the tree a bundler
  globs for the browser build). Every route file's imports mechanically
  rewired (../../src/ -> ../../api-lib/); internal cross-references
  between backend files needed zero changes, same relative distance.
  frontend/'s existing vercel.json had a catch-all SPA rewrite that would
  have swallowed every /api/* request once merged — fixed using Vercel's
  own currently-documented negative-lookahead pattern
  ("/((?!api/).*)" -> "/index.html"), verified against real compiled
  path-to-regexp before shipping, not assumed. VITE_API_BASE_URL changes
  meaning: was a full cross-origin URL, now just "/api" (same origin, no
  CORS needed for any of it — services/api.js's DEMO_MODE detection logic
  needed zero code changes, only the env var's value changes).

  Verified with a from-scratch local server built specifically to
  replicate Vercel's actual routing model (static files + the fixed SPA
  rewrite + dynamic dispatch to the real api/**/*.js handlers, including
  [id]-style dynamic segments) — not just testing frontend and backend
  separately and assuming they'd combine correctly. Real browser, one
  origin: Login page, real login against real Postgres, real user's name
  in the sidebar, User Admin and Feature Flags both working with zero CORS
  errors (nothing to reflect an Origin header for anymore), and a hard
  reload on a nested route (/admin/sso) still resolving correctly —
  confirms the rewrite fix holds under the exact scenario that breaks if
  it's wrong.

  Migration: frontend/ keeps its name and its existing Vercel project's
  Root Directory setting (medbroker-v1/frontend) unchanged — one fewer
  setting to get wrong on an already error-prone deployment history.
  api-vercel/ gets deleted from the repo once merged in. The med-broker-
  demo Vercel project gets retired entirely once the merged one is
  verified working — that's what actually removes "demo" from Mark's
  Vercel dashboard, not a rename of a project about to stop being used.
  Same Neon database gets a second Storage "Connect Project" pointed at
  the surviving (frontend) project — no new database needed.

24.3 FEATURE FLAGS API + SSO SETTINGS FIX (same session, built alongside the merge)
  Prompted by Mark asking how local auth and SSO should coexist and
  whether settings should "cater for the change." Two real answers:
  local-vs-SSO coexistence was already correct by design (a user created
  with a password keeps logging in with it regardless of what the flag
  says later; the flag only sets the default for new users going
  forward) — nothing to build there. But FeatureFlags.jsx's own header
  comment already said flag changes are "persisted via PATCH
  /api/flags/:key" and never actually were — handleSave() faked a 400ms
  delay and only updated local React state. That's now built for real:
  new services/flagService.js, GET /api/flags (no auth — app config, not
  user data), PATCH /api/flags/:key (Admin+, validates type/allowedValues
  server-side, rejects Phase2 flags even if the frontend's disabled toggle
  is bypassed directly).

  Also found and fixed: FlagContext.jsx was doing a raw fetch('/api/flags')
  that bypassed services/api.js entirely — same class of bug as the CORS
  issue from an earlier session, never reaching the real backend in demo
  mode. Routed through flagsApi instead.

  SingleSignOn.jsx had two real bugs, not cosmetic: its "SSO is active"
  banner was hardcoded true regardless of the actual flag value, and the
  page (plus its nav item) were only reachable once SSO was ALREADY
  enabled — backwards, since an admin needs to reach it to turn SSO on in
  the first place. Both fixed; gating is isAdminOrAbove alone now, and the
  banner reflects the real flag.

  The explicit boundary stated to Mark and worth restating here: none of
  this makes a real "Sign in with Microsoft/Google" button work. It
  changes what the app shows based on the flag. Actually authenticating
  via a real identity provider needs a real external OAuth app
  registration with real credentials only Mark can create — Azure/Google
  production-target work (Entra ID External is already the plan for the
  Azure profile), not something the free demo stack can responsibly claim
  to deliver.

  Verified against real Postgres: GET with no auth, PATCH without auth
  rejected (401), a real boolean flip persisting and reading back
  correctly, invalid enum rejected (400), Phase2 flag rejected (403),
  unknown key (404) — then re-verified as part of the full merged-app
  browser test above (toggle SSO, save, reload the whole page and
  navigate elsewhere, confirm still on from the real backend not
  optimistic local state, confirm SingleSignOn.jsx now shows the enabled
  banner).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
25. LEADS PAGES WIRED TO REAL DATA — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Session started by re-hydrating from GitHub and confirming the merge
migration (§24.2) had already landed correctly — folder structure, merged
package.json, the fixed vercel.json rewrite, all present and correct.
Confirms the migration instructions from that session worked as written.

LeadList.jsx, LeadDetail.jsx, LeadImport.jsx were already written
speculatively against a leadsApi client assuming backend capabilities
that didn't fully exist yet (built during the original mock-only phase).
Reading them first surfaced exactly what was missing rather than
guessing:

BUILT: GET /api/leads/sources (leadsApi.sources() already called it, it
just didn't exist), excludeStatuses + occupation filters on listLeads()
(frontend already sent both), GET /api/leads/:id/calls (call history was
written but never read back — "Recent Calls" only reflected the current
browser session). leadsApi.reassign() fixed to call the same /assign
endpoint as assign() rather than a /reassign URL that never existed — the
backend already distinguishes them internally.

FOUR REAL BUGS FOUND BY TESTING, NOT REVIEW — worth remembering the
pattern for future domains:
  1. GlobalAdmin was missing from requireRole() on three Lead routes
     (create, delete, assign) — the one account you can actually log in
     with couldn't manage a single lead. Check every new route explicitly
     includes GlobalAdmin; it does not follow automatically from Admin
     being allowed.
  2. Submitting a form with only required fields filled — the normal
     case — sent empty strings for untouched optional fields rather than
     omitting them. Zod's .optional() only skips validation for a
     genuinely absent key, not '' failing a type/regex check underneath.
     Fixed with a reusable stripEmpty() helper (LeadImport.jsx), applied
     before every create/update call with optional fields.
  3. Same bug, different file — LeadDetail.jsx's call-logging form had
     the identical callbackDateTime-defaults-to-'' issue. Same fix
     pattern applied.
  4. Even a real callbackDateTime value failed — HTML datetime-local
     inputs produce timezone-less strings, and Zod's default
     z.string().datetime() requires an offset. Confirmed by testing the
     actual input value against the schema directly, not assumed; fixed
     with z.string().datetime({ local: true }).

VERIFIED — real Postgres, real Chromium browser, full chain: create a
lead with only required fields -> appears in list -> source filter
populated from real data -> open lead -> log a plain call -> status
updates -> log a second, callback-dated call -> hard reload the whole
page -> both calls and the status are still there from the server, not
an optimistic echo that would have vanished. Re-ran the full cross-domain
regression (auth/leads/users/flags) as GlobalAdmin after the role fixes
to confirm nothing else has the same gap.

One process note logged for future sessions: an ambiguous Playwright
locator (button:has-text('Save Call')) matched both the real submit
button and a different, correctly-still-mocked "Save call & Book
Appointment" button (Client Contacted outcome only — depends on
Appointments API, not built yet, correctly out of scope). Cost real time
working out a false pass was a locator bug, not an app bug, before
finding the real one underneath it.

STILL NOT BUILT: LeadImport.jsx's Subscription tab (always fully
simulated, never functional even as UI-only mockup — separate, larger
piece of work). LeadDetail.jsx's Book Appointment flow (correctly still
local-only, depends on Appointments API — next up).

Files changed this session (backend): api-lib/services/leadService.js,
api-lib/models/lead.js, api/leads/index.js, api/leads/[id]/index.js,
api/leads/[id]/assign.js, api/leads/[id]/calls.js, api/leads/sources.js
(new). Files changed (frontend): src/services/api.js,
src/pages/LeadDetail.jsx, src/pages/LeadImport.jsx. LeadList.jsx needed
no changes — it was already correctly wired, only the backend it was
calling was incomplete.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
26. LEAD INTAKE FIELDS MATCHED TO CLIENT'S REAL FORM — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's ask: the client's real Appointment Tracking sheet has Title, First
Name, Last Name, Date of Birth, Job Title (was "Occupation" in this
build), Contact Number, and Email as intake fields. Since these represent
the client's actual required fields, all seven became REQUIRED on lead
creation — including mobileNumber and occupation, previously optional.
Stated as an explicit assumption at the time, not silently decided.

Schema: title VARCHAR(10) and dateOfBirth DATE added to Lead, nullable at
the column level (required-ness enforced at the validation layer, same
pattern as every other required field here). CK_Lead_Title restricts
stored values to Dr/Mr/Mrs/Ms.

IMPORTANT — Mark's Neon database already exists live, so
schema.postgres.sql alone doesn't reach it (CREATE TABLE IF NOT EXISTS
does nothing to an existing table). New:
db/migrations/002_add_lead_title_dob.sql, ADD COLUMN IF NOT EXISTS +
guarded DO block for the constraint. Verified against a database built
from a deliberately old, pre-migration schema (title/dateOfBirth
stripped) to confirm the migration genuinely adds them, not just
confirmed present on an already-current database.

Job Title is now a fixed list, not free text — new
src/constants/leadOptions.js is the single shared source LeadImport.jsx's
create form and LeadList.jsx's filter both import from, matching
api-lib/models/lead.js's JobTitle enum server-side. LeadList.jsx
previously had its own separately hardcoded copy of this list — real,
if minor, drift risk fixed by having one list feed both places.

Real mistake caught mid-edit, not shipped: an early pass at adding
title/dateOfBirth to listLeads()'s SELECT accidentally deleted the entire
rest of the column list (mobileNumber, occupation, sourceLabel, status,
everything) and left a dangling comma before FROM — caught by the next
syntax check and Postgres run before it went anywhere near a delivered
file, restored properly, re-verified.

Verified against real Postgres and a real Chromium browser, full chain:
missing any new required field -> clean 400 naming which fields; invalid
Title or Job Title value -> 400; valid submission -> 201, persists and
reads back correctly; migration script tested against a genuinely
old-shaped table. Browser: all relabelled/new form elements present with
correct labels, missing-field submission shows inline validation without
crashing, valid submission creates and redirects, Leads list shows "Job
Title" column header, Lead Detail shows the real title in the header
("Dr Priya Naidoo") instead of the old hardcoded "Dr" — a genuine
correctness improvement the new field enabled — plus Date of Birth and
the relabelled fields all displaying correctly. Re-ran the full
cross-domain regression afterward.

Kept unchanged per Mark's explicit instruction: every field not on his
list (WhatsApp, University Attended, Year of Attendance, Degree Attained,
Hospital/Practice, existing cover, policies, medical aid/provider, ID
number). Only title and dateOfBirth were added as new columns; only the
Job Title / Contact Number LABELS changed — the underlying
occupation/mobileNumber field names in the schema and API were
deliberately not renamed, to avoid unnecessary churn.

CSV import template and required-columns check updated to match
(title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email).
Subscription tab unaffected — still fully simulated, unchanged.

Files changed: db/schema.postgres.sql, db/migrations/
002_add_lead_title_dob.sql (new), api-lib/models/lead.js,
api-lib/services/leadService.js, src/constants/leadOptions.js (new),
src/pages/LeadImport.jsx, src/pages/LeadDetail.jsx, src/pages/LeadList.jsx.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
27. LEAD PORTAL — decided 22 July 2026, NOT YET SCOPED IN DETAIL OR STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's ask: a prospect-facing portal so MedBroker doesn't need native
iOS/Android apps — prospects scan a QR code at an event, register, and
get a real account they can log back into later (confirmed as "full
account", not a one-time registration form — see the two-option
comparison this session for what was ruled out). Deliberately queued
until AFTER Appointments and Reports are done — this is a separate app
surface from the staff-facing MedBroker app, not an extension of it, and
shouldn't be interleaved with finishing the core staff pipeline.

WHAT ALREADY EXISTS, DESIGNED BUT UNBUILT — this is not starting from
zero: Event.qrToken (UUID, unique, already in schema.postgres.sql).
EventAttendee table (eventId, leadId, rsvp, attended, attendedAt,
popiConsent, registeredAt — already has a consent flag). The original
Azure codebase had an api/src/functions/eventRegistration.js that was
never ported to this stack (api-lib/ has no equivalent yet). None of this
is wired to any frontend — EventList.jsx/EventDetail.jsx (if built) are
staff-facing event management, not a prospect-facing scan-and-register
flow.

REAL TECHNICAL FINDING FROM THIS SESSION, WORTH REMEMBERING WHEN THIS
STARTS: the native browser BarcodeDetector API — the obvious choice for
QR scanning without a native app — is NOT supported on Safari or ANY
iOS browser (all iOS browsers use WebKit underneath, so this isn't a
Safari-specific workaround, it's an iPhone problem). Since the prospects
are medical professionals, a lot of them are on iPhones. Confirmed via
search, not assumed, since this directly undermines the "no native app"
goal if built wrong. Fix: use a pure-JS/WASM decoding library (jsQR,
ZXing, html5-qrcode) that reads camera frames directly rather than
relying on the native API — works identically across Safari/Chrome/
Android. Build it this way from the start, don't reach for
BarcodeDetector first and patch iOS later.

STILL OPEN, TO NAIL DOWN WHEN THIS PHASE ACTUALLY STARTS — deliberately
not decided yet, don't guess when picking this up:
  - What can a logged-in prospect actually DO? View appointment status?
    See which broker they're matched with? Update their own contact
    details? This is the single biggest undetermined scope question and
    changes the size of the build significantly.
  - Auth model — almost certainly needs to be a genuinely separate auth
    surface from staff login (prospects aren't Users in the existing
    role sense: GlobalAdmin/Admin/Supervisor/Agent/Broker), not an
    extension of the existing local-auth system built for staff.
  - POPIA angle worth designing properly, not bolting on: a Lead record
    already stores medical aid status, existing cover, potentially an ID
    number. Giving the prospect themselves direct access to that record
    is defensible (arguably a good data-subject-rights alignment) but
    needs real design, not an afterthought.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
28. APPOINTMENTS BUILT — ASSIGN MODEL — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scope: assign model only (appointments.claimModel = 'assign', the flag's
current default). Claim model + token economy (real Stripe dependency)
deliberately stays mocked — same reasoning as the earlier SSO/OAuth
boundary, not something to half-build.

BUILT: models/appointment.js, services/appointmentService.js (list/get/
create/assignBroker/reassign/returnToLeads/saveOutcome),
services/appointmentStatusService.js (pure-logic status machine mirroring
leadStatusService.js's pattern, own 17-test suite), services/
brokerMatchingService.js (ported from the Azure reference almost
unchanged — three-step algorithm: region+product filter, Calendly
availability with a circuit breaker, rank by fewest upcoming
appointments). Routes: api/appointments/{index,[id]/index,[id]/assign,
[id]/reassign,[id]/return,[id]/outcome}.js, api/broker-matching/index.js.

CALENDLY: no real account connected in this demo, so matching runs in
degraded mode by default (workload ranking only, no live slots) — this
was ALREADY the original design's intended fallback for exactly this
case, not a stub. config.calendly (both vars optional) and
User.calendlyEventTypeUri (nullable) are ready for a real connection
later; nothing here claims working Calendly integration exists.

REAL BUG, FOUND BY TESTING BEFORE ANY UI WORK: User.region was never
synced to BrokerRegion (the table brokerMatchingService.js actually
reads) — no broker created via the existing Users API could ever have
matched anyone. Fixed with syncBrokerRegion() in userService.js, called
from createUserFull/updateUserFull for Broker role only.

SERIOUS FINDING — NOT A BUILD ISSUE, A DELIVERY ONE: re-hydrating fresh
from GitHub at the start of this session showed several fixes from the
EARLIER Leads-wiring session had reverted — GlobalAdmin missing again on
three Lead routes (create/delete/assign), api/leads/sources.js missing
entirely, api/leads/[id]/calls.js back to its pre-session POST-only
state (also missing GlobalAdmin). Everything under api-lib/ and src/ from
that session was correct; only files under api/leads/ specifically were
affected. All re-applied and re-verified here. Root cause unknown from
this side — Mark should check what happened with that delivery, since it
could recur with a future one touching the same files. Practical
implication: don't assume a prior session's "verified and delivered"
status still holds for route files without re-hydrating and checking
first.

FRONTEND — LeadDetail.jsx's Book Appointment modal, previously fully
static (no value/onChange on any field, submit did nothing but flip
local flags), completely rewritten: portfolio -> products-interested
checkboxes -> region -> live broker search (real endpoint) -> selection
-> date/time/address/insurer -> real POST /api/appointments. Region is
collected at booking time (matches the CLIENT, not the agent) purely to
query broker matching — not persisted anywhere, since neither Lead nor
Appointment has a region column.

AppointmentList.jsx: real data wired in; AssignBrokerModal fixed to use
real broker ids instead of hardcoded name strings (same class of fix as
Users/Leads); a latent bug comparing broker identity against a fixed
mock string ('SB') that could never match a real user, fixed to compare
against the logged-in user's real id.

AppointmentDetail.jsx: added the GET /api/appointments/:id fetch that
was missing entirely — the file already called reassign/returnToLeads/
saveOutcome but never actually loaded real data, always started from
MOCK_APPOINTMENT. Backend's flat meeting1Date/meeting1Status/etc. fields
transformed into the {meetings:[...]} array shape the rest of the
650-line file already expects, so nothing else needed touching.

REAL PRE-EXISTING BUG FOUND, UNRELATED TO THIS SESSION'S OWN WIRING:
PRODUCTS_BY_PORTFOLIO['Discovery'] was looked up directly, but that
object's actual keys are 'disc'/'mm' — "products sold" checkboxes have
silently rendered empty since this page was first built, even in the
original mock-only version. Fixed the mapping. Also fixed: Return to
Leads confirmation copy said "will be archived" — schema has no archive
column, UNIQUE leadId means it must be a genuine delete for the lead to
be rebookable, copy was wrong not the implementation; and wired
onReturned to navigate away after a successful return, since the
appointment row (and this very page) no longer exists afterward.

VERIFIED — real Postgres, real Chromium, full chain: broker + region
setup -> matching finds them correctly, excludes non-matching regions ->
book via the real modal (portfolio, products, region, live search,
date/time/address) -> shows correctly in AppointmentList with resolved
source label -> Assign flow on an unassigned appointment, persists across
reload -> Reassign flow on the detail page, persists -> first meeting
Seen -> In Progress, persists -> signed Yes + products sold -> Closed
Won, persists, Return to Leads button correctly disappears -> Return to
Leads on a separate unsigned appointment -> navigates away, lead
confirmed back in the queue via direct API check. Row-level access
verified (403 for a non-owning agent). Re-ran the full 23-check backend
regression on a fresh database as the final step.

Testing note for future sessions: several Playwright locator ambiguities
this build specifically (text=Assign matching "Unassigned" as a
substring; a bare select locator matching the page's own background
filter instead of a modal's field when both list the same option text)
cost real time before confirming they were test bugs, not app bugs — all
were fixed with exact-match locators or scoping to the last-added DOM
element, not app changes.

Files changed — backend: db/schema.postgres.sql,
db/migrations/003_add_calendly_uri.sql (new), api-lib/models/
appointment.js (new), api-lib/services/appointmentService.js (new),
api-lib/services/appointmentStatusService.js (new, +test),
api-lib/services/brokerMatchingService.js (new),
api-lib/services/userService.js, api-lib/config.js,
api/appointments/* (new, 6 files), api/broker-matching/index.js (new),
api/leads/index.js + [id]/index.js + [id]/assign.js (reverted fixes
re-applied), api/leads/[id]/calls.js + sources.js (restored). Frontend:
src/constants/leadOptions.js, src/pages/UserAdmin.jsx,
src/pages/LeadDetail.jsx, src/pages/AppointmentList.jsx,
src/pages/AppointmentDetail.jsx.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
29. CONSOLIDATED TO 8 VERCEL FUNCTIONS — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark hit Vercel Hobby's 12-Serverless-Functions-per-deployment limit at
deploy time — the build had grown to ~20 separate route files, each its
own deployed function. Confirmed via search that Vercel's automatic
multi-file function bundling is currently Next.js-only (this is a plain,
non-Next.js Vercel Functions project) — not assumed, checked against
Vercel's current docs directly.

Two options presented: upgrade to Vercel Pro ($20/mo, five-minute fix,
removes the limit entirely) or consolidate route files for free. Mark
chose consolidation.

FIX: collapsed each domain's separate route files into one dispatcher
file per domain using Vercel's catch-all file-naming convention —
`[...slug].js` where no bare-path route exists (auth), `[[...slug]].js`
where the bare path also needs to match (leads, users, flags,
appointments — e.g. GET /api/flags itself, not just /api/flags/:key).
20 files -> 8:
  auth: 2 -> 1 (api/auth/[...slug].js)
  leads: 5 -> 1 (api/leads/[[...slug]].js)
  users: 2 -> 1 (api/users/[[...slug]].js)
  flags: 2 -> 1 (api/flags/[[...slug]].js)
  appointments: 6 -> 1 (api/appointments/[[...slug]].js)
  broker-matching, health, system-config: 3 -> 3 (already single files,
  untouched)

LOWEST-RISK APPROACH, DELIBERATE: every handler's business logic is
byte-for-byte unchanged from its original file — only the export style
(named, not default export) and file location changed. Logic moved to
api-lib/handlers/<domain>Handlers.js (outside api/, never separately
deployed as a function); the new api/<domain>/[[...slug]].js files are
thin dispatchers reading req.query.slug (the path-segment array Vercel's
catch-all convention provides) + req.method, then calling the
already-tested handler function. Nothing about request handling,
validation, or business rules changed — only how a request finds its way
to the code that was already there.

ONE HONEST CAVEAT — the single piece of this entire build that couldn't
be fully verified from this sandbox: Vercel's catch-all convention
([...slug].js, [[...slug]].js) is thoroughly documented for Next.js;
confirmation it works IDENTICALLY for a plain, non-Next.js Vercel
Functions project (what this is) is thinner in Vercel's own docs. Strong
supporting evidence: this project has already used Vercel's related
single-dynamic-segment convention ([id].js) successfully and verifiably
throughout the ENTIRE build to date. But this is real platform behavior
that only an actual Vercel deployment can fully confirm — flagged clearly
to Mark rather than presented as certain. If it doesn't work as expected,
the documented fallback is vercel.json rewrites (already used elsewhere
in this build for the SPA routing fix) mapping each domain's URL prefix
to a single non-catch-all file instead.

VERIFIED, everything that could be: extended the local test server
(built fresh for this, not reused) to replicate Vercel's exact
catch-all file-resolution rules — required vs. optional, path segments
as an array, literal paths like /api/leads/sources correctly NOT
swallowed by the :id dynamic pattern. Two full passes: (1) every
consolidated handler called directly with a manually-constructed
req.query.slug array — 26 checks across every domain and route shape,
confirming business + dispatch logic; (2) real HTTP requests against the
actual running server for every routing pattern (bare path, one-segment,
two-segment, literal-vs-dynamic) — 16 checks, confirming the full chain
resolves correctly end to end, not just the logic behind it. Both passed
completely.

MIGRATION IS DELETE-AND-ADD, NOT THE USUAL OVERWRITE — worth being very
clear about this with Mark since every other delivery so far has been
add/overwrite only. 17 old route files must be actually removed from
GitHub:
  api/auth/login.js, api/auth/bootstrap-admin.js,
  api/flags/index.js, api/flags/[key].js,
  api/users/index.js, api/users/[id]/index.js (+ the [id] folder),
  api/leads/index.js, api/leads/sources.js, api/leads/[id]/index.js,
  api/leads/[id]/assign.js, api/leads/[id]/calls.js (+ the [id] folder),
  api/appointments/index.js, api/appointments/[id]/index.js,
  api/appointments/[id]/assign.js, api/appointments/[id]/reassign.js,
  api/appointments/[id]/return.js, api/appointments/[id]/outcome.js
  (+ the [id] folder).
Leaving old and new files both in place would make the function count
WORSE, not better, and could create routing ambiguity. New files: 5
handler files under api-lib/handlers/, 5 dispatcher files under api/.

Frontend needs zero changes — every URL path the frontend calls is
identical; only which backend file answers that URL changed.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
30. §29's FLAGGED RISK CONFIRMED REAL — FIXED WITH REWRITES — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark deployed §29 and immediately got "Not found" trying to log in.
Diagnosed by testing the LIVE deployment directly rather than guessing
from the repo:
  /api/health (plain file, untouched by §29)        -> 200, works fine
  /api/flags  (simplest case of the new pattern —
               [[...slug]].js matching ZERO segments) -> 404
  /api/auth/login (a required catch-all, one segment) -> 404
Conclusive: Vercel does not recognize the [...slug].js / [[...slug]].js
catch-all file-naming convention as a route on this plain, non-Next.js
Vercel Functions project. This is exactly the one risk §29 flagged in
writing as unverifiable from the sandbox at the time — now confirmed as
the actual cause, not a remaining theoretical concern.

FIX: replaced all 5 bracket-named dispatcher files with 5 PLAIN files —
api/auth-router.js, api/leads-router.js, api/users-router.js,
api/flags-router.js, api/appointments-router.js — and added matching
`rewrites` entries to vercel.json, e.g.:
  { "source": "/api/auth/:slug*", "destination": "/api/auth-router?slug=:slug*" }
This uses the SAME rewrite mechanism already proven working on Mark's
live deployment — it's what serves the SPA fallback — so confidence here
is substantially higher than the bracket-file approach was. Function
count unchanged at 8; only the routing mechanism changed, not the count,
not the handler logic (still byte-for-byte the same business logic from
§29, itself unchanged from the original pre-consolidation files).

One thing still not fully confirmable even with this fix: the EXACT
format Vercel serializes a multi-segment wildcard capture into (a single
slash-joined string? comma-joined? something else?) when substituting it
into the destination query string. Rather than guess once and risk being
wrong twice on the same kind of detail, added parseSlug() (new, in
api-lib/http/helpers.js) which parses the slug query param defensively —
handles array, slash-separated, comma-separated, single-segment, and
empty/bare-path shapes, so the exact serialization format doesn't matter
as long as it's some recognizable delimited form.

VERIFIED: extended the local test server to actually simulate the
vercel.json rewrite step itself (previously it only did file resolution,
which was never the part in question) — 17 real-HTTP checks covering
bare paths, single segments, two-segment sub-routes, and the
literal-vs-dynamic disambiguation, run twice (once before and once after
a further hardening pass on parseSlug), all passing both times.

MIGRATION — this SUPERSEDES §29's delivery, don't apply §29's file list:
DELETE (the 5 bracket files §29 added, which don't work):
  api/auth/[...slug].js, api/leads/[[...slug]].js,
  api/users/[[...slug]].js, api/flags/[[...slug]].js,
  api/appointments/[[...slug]].js (+ their now-empty parent folders where
  applicable — auth/, leads/, users/, flags/, appointments/ each only
  contained that one file).
ADD:
  api/auth-router.js, api/leads-router.js, api/users-router.js,
  api/flags-router.js, api/appointments-router.js (all flat, directly
  under api/, no subfolder), plus an updated vercel.json (5 new rewrite
  rules; existing SPA rewrite untouched) and an updated
  api-lib/http/helpers.js (adds parseSlug(), everything else in that file
  unchanged).
The 5 handler files under api-lib/handlers/ from §29 are UNCHANGED and
correct — nothing to touch there.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
31. MOCK-DATA FLASH + UNREADABLE VALIDATION ERRORS — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After §30's routing fix was confirmed applied and working, Mark reported
Appointments and Users still showing the original hardcoded demo data —
diagnosed by testing the live deployment directly (anonymous requests to
/api/users and /api/appointments both correctly returned 401, proving
routing itself was fine) and then, critically, by Mark clarifying a
detail I'd initially missed: the mock data flashed briefly, then was
REPLACED by an empty real result — not a permanently broken connection.

BUG 1 — mock-data flash: every wired page's fallback logic checked
whether fetched data was truthy — `apiData?.appointments ? real : MOCK` —
to decide between real and mock data. That condition is true both while
still loading (useFetch starts with data:null) and when there's
genuinely no data, not just when there's no backend configured at all
(true preview mode). So every page briefly rendered mock data on first
paint before swapping to the real (here, correctly empty) result — reads
as data being wiped, not a page loading. Confirmed as a LATENT bug on
Leads too, just invisible there since Mark already has real lead data
so the swap isn't jarring. Fixed by checking apiMode.PREVIEW_MODE
directly instead of data truthiness, in LeadList.jsx, UserAdmin.jsx, and
AppointmentList.jsx (appointments list AND broker-options list both).
UserAdmin.jsx and LeadList.jsx already had a proper loading notice gated
on the fetch's own `loading` flag; AppointmentList.jsx didn't, so one was
added matching the same pattern.

BUG 2 — separate, found via Mark's own lead-creation test: submitting a
lead showed literally "[object Object]" as the error instead of a real
message. Root cause: the backend sends validation failures as
`{ error: <Zod .flatten() output> }` — an OBJECT, not a string — and
ApiError's constructor stored that object directly as `.message`. Every
form displaying `err.message` after a failed submission was affected,
not just Lead Import — it just hadn't been hit yet elsewhere. Mark's own
specific test case: the phone number he entered ("234234344") genuinely
doesn't match the required South African format (saMobile regex needs a
leading 0 or +27) — correct, intentional validation, simply invisible
because of the display bug. Fixed once at the source in api.js's
request(): new formatErrorBody() helper extracts a readable message from
Zod's flatten shape ("mobileNumber: Mobile number must be a valid South
African number"), falling back gracefully for plain-string or malformed
error shapes. Fixing it here means every existing and future form
benefits, not just the one that surfaced it.

VERIFIED: mock-flash fix confirmed via a real, empty Postgres database
and a real browser polling page content every 100ms for a full second
after navigation — no mock name ever appeared, on Appointments or Users.
Error-message fix confirmed two ways: a direct test of formatErrorBody()
against Mark's exact error shape (produces the correct readable string),
and end-to-end through a real browser replicating his exact form
submission — shows the readable error, then succeeds once corrected to
a valid SA number format and correctly navigates to /leads. Full
regression re-run afterward (login, user/lead/appointment creation, and
the invalid-number-still-correctly-rejected case) — all passing.

MIGRATION: straightforward overwrite of 4 existing files, no deletions:
  src/services/api.js
  src/pages/LeadList.jsx
  src/pages/UserAdmin.jsx
  src/pages/AppointmentList.jsx


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
32. ASSIGN LEAD MODAL WAS NEVER WIRED AT ALL — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found via Mark's own testing of §31, explicitly flagged pre-fix — a
genuinely more serious, DIFFERENT bug than §31's timing issue. The
"Assign Lead" / "Reassign Lead" modal on the Leads page (and the agent
filter dropdown beside it) had never been wired to real data at any
point — not a loading-flash issue, a complete absence of wiring. Always
showed a hardcoded array of 5 mock agent names
(Thabo Molefe/Naledi van Wyk/Kabelo Petersen/Bongani Ntuli/Siphiwe
Mahlangu). Selecting one and saving would have sent that NAME STRING to
leadsApi.assign()/reassign(), which the backend requires as a real agent
UUID (assignLead() validates via getActiveUserById) — would have
silently failed or written garbage into assignedAgentId.

FIX: the page already had a correctly-fetched real `agents` list
elsewhere (feeding — sort of — its own filter dropdown, see below);
ReassignLeadModal just never received it. Now takes `agents` as a prop,
uses real ids for select/submit, calls `onSaved` (the list's own
refetch) after saving. Confirmed the actual backend field names by
reading leadService.js directly rather than assuming from the frontend's
prior (wrong) naming: display uses `lead.agentName` (a real joined
field), the select's value uses `lead.assignedAgentId` (not `agentId` —
this was checked, not guessed, after getting it wrong once already this
session).

Two more found in the same investigation, fixed alongside:
- The agent FILTER dropdown had the SAME "fall back to mock when real
  data happens to be empty" bug §31 already fixed elsewhere —
  `agents.length > 0 ? real : MOCK` instead of gating on
  apiMode.PREVIEW_MODE. Same fix applied here too.
- The real `agents` fetch itself was Admin-only (`isAdmin ? ... :
  null`), even though this file's own role-behaviour comment documents
  Supervisors as also needing Reassign access. Widened to `isAdmin ||
  isSupervisor`.
- LeadDetail.jsx had §31's identical mock-flash bug, just not yet
  encountered on that specific page — both the main lead record and its
  call history fall back to mock whenever real data isn't present yet,
  not only in true preview mode. Given how extensively this page uses
  the lead record's fields throughout a long render, swapping the mock
  fallback for an empty object risked scattering `undefined` through
  the page — used a page-level loading gate instead (early-return
  "Loading…" while a real fetch is in flight in DEMO_MODE), which sidesteps
  that risk entirely: real data is guaranteed in place before anything
  with fields renders.

DELIBERATELY NOT FIXED, flagged as separate future work: LeadImport.jsx's
"Medical Subscription" tab dropdown (SUBSCRIPTIONS) is also hardcoded,
but no backend endpoint for listing real MedicalSubscription records
exists yet — confirmed by searching the whole codebase for one, not
assumed absent. Needs a new endpoint, not just frontend rewiring; a
separate, appropriately-scoped task.

VERIFIED against real Postgres and a real browser, replicating Mark's
exact scenario end to end: Supervisor created -> Agent created under
that Supervisor -> Lead created -> Assign Lead opened -> dropdown
correctly shows the real agent, correctly does NOT show any mock name ->
selected and saved -> confirmed via a DIRECT DATABASE CHECK (not just
the UI) that assignedAgentId matches the real agent's actual id.
LeadDetail.jsx verified by polling page content every 100ms for a full
second after navigation — no mock name ever appears.

MIGRATION: straightforward overwrite of 2 existing files, no deletions:
  src/pages/LeadList.jsx
  src/pages/LeadDetail.jsx


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
33. PREVIEW MODE FULLY REMOVED — 4 WIRED DOMAINS — 22 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked, in the course of a question about why Leads/Users/
Appointments loaded differently, why MOCK_LEAD was still "required" at
all. Answer given: it wasn't required for the real deployment to work —
only to keep preview mode (deploy with no backend configured, whole app
renders from inline fake data, zero setup) functional as a capability.
Asked directly whether that capability was still wanted. Mark: no,
remove it, the app always runs against a real backend now — and build
everything from here on without this pattern rather than retrofitting
it out again later.

IMPORTANT SCOPE DISTINCTION surfaced and confirmed before starting:
mock data exists in two genuinely different categories in this
codebase. (1) Preview-mode fallback on domains with a REAL backend
already built (Leads, Users, Flags, Appointments) — this is what got
removed. (2) Hardcoded placeholder data on pages with NO backend built
at all yet (Events, Notifications, Tasks, App Admin's audit log and
subscriptions list, LeadImport's Medical Subscription tab) — this is
NOT preview mode, it's simply unbuilt functionality, and removing it
would break those pages entirely rather than clean anything up. Only
category (1) was touched. Category (2) needs real backends built first,
each its own separate task.

api.js: PREVIEW_MODE removed entirely, including the early-return in
request() that silently resolved every call to null. DEMO_MODE/
ENTRA_MODE simplified from three possible states to two, mutually
exclusive and exhaustive — no more possible "neither" state.

FlagContext.jsx/FeatureFlags.jsx: comment-only changes. DEFAULT_FLAGS
was never purely preview-mode-specific — it's also a legitimate
resilience fallback for an unreachable flags API, good practice
independent of preview mode, left untouched. FeatureFlags.jsx's
apiMode.DEMO_MODE check turned out to be the separate Demo-vs-Entra
distinction, not preview-mode-related at all — correctly left alone.

LeadList.jsx: MOCK_LEADS, AGENTS, LEAD_SOURCES removed, every fallback
simplified to real-data-only.

LeadDetail.jsx: MOCK_LEAD, MOCK_CALLS removed. Found and fixed a real,
separate bug while in here: the call-logging error handler had a bare
catch{} that silently applied the SAME optimistic "logged successfully"
update regardless of whether the real save actually succeeded — a
genuine backend failure would show as a success with no indication
anything was wrong. Now shows the real error via the already-existing
submitError display instead of masking it.

UserAdmin.jsx: MOCK_USERS, MOCK_SUPERVISORS removed, simplified to
real-data-only.

AppointmentList.jsx: SOURCES (confirmed dead code) and BROKERS (only
used by the removed fallback) removed. ALL_APPOINTMENTS,
AVAILABLE_TO_CLAIM, MY_APPOINTMENTS were NOT removed — still genuinely
needed for the claim-model tabs, a separate, deliberately-still-mocked
feature (real token/payment economy, out of scope since the Appointments
build, §28). Re-commented to make that narrower purpose explicit.
sourceData/brokerOptions (the assign-model's own real data) simplified.

AppointmentDetail.jsx: MOCK_APPOINTMENT removed, plus a BROKERS constant
already confirmed dead since an earlier session. This page had NEVER
gotten the loading-gate treatment LeadDetail.jsx got in §31/§32 — it
would have flashed fake appointment data on every load exactly the same
way, just not yet caught until this pass. Fixed the same way: a neutral
placeholder shape (same fields, empty values, no fake names) for the
brief window before data loads, protected by a loading gate so that
placeholder is never actually visible.

VERIFIED against real Postgres and a real browser: created a real
broker, agent, lead, and appointment, then visited all 6 affected pages
checking for any of the 13 known mock/demo names used throughout the
app's history — none appeared anywhere. Confirmed real data displays
correctly everywhere it should.

MIGRATION: straightforward overwrite, no deletions:
  src/services/api.js
  src/context/FlagContext.jsx
  src/pages/FeatureFlags.jsx
  src/pages/LeadList.jsx
  src/pages/LeadDetail.jsx
  src/pages/UserAdmin.jsx
  src/pages/AppointmentList.jsx
  src/pages/AppointmentDetail.jsx
This SUPERSEDES §32's file list — §32's LeadList.jsx/LeadDetail.jsx
changes are already included here, built on top of, not from a fresh
hydration. Don't apply §32 separately.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
34. MARK'S 14-ITEM BUG/FEATURE BATCH FROM HIS OWN TESTING — 23 July 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark tested §33's delivery before it had even finished building and came
back with 14 items from that testing. Delivered 13 of the 14; the Excel/
JSON data take-on importer is deliberately excluded — see below.

STALE STATUS.MD DISCOVERED THIS SESSION: the GitHub hydration at the start
of this session returned a Status.md last-updated 18 June, missing §28
through §33 entirely (949 lines vs this document's 2,123). The actual code
in api-lib/, api/, and src/ matched what §28-§33 describe — Appointments,
audit writes, and the preview-mode removal were all genuinely present and
correct in the hydrated source. Only Status.md and Project_Context.md
themselves were stale, meaning a prior session's rewritten versions of
these two files were apparently never pushed to GitHub. Mark should
confirm what actually landed there and push the corrected pair included in
this delivery.

WHAT SHIPPED:

1. Lead fields now editable — Contact Details / Education / Insurance
   Information cards on LeadDetail.jsx, via a new "Edit Details" button.
   Editable by: the Assigned Agent, Supervisor (if the lead's agent is a
   direct report), or Admin/GlobalAdmin — enforced server-side in
   leadHandlers.js's new PUT handler, not just hidden client-side.
   UpdateLeadSchema already existed in models/lead.js (written earlier,
   never wired to a route) — this wired it up rather than designing a new
   schema. New: leadService.updateLead(), PUT /api/leads/:id,
   leadsApi.update(). Writes a diffed LeadUpdated AuditLog entry (old →
   new per changed field, not the raw payload). Scope: exactly the fields
   already rendered as Field rows on this page — title/firstName/lastName
   (in the header, not a Field row) and idNumber (not displayed on this
   page at all) stay read-only for now; both are already on
   UpdateLeadSchema so extending this later is additive.

2. Broker-matching multi-product bug FIXED. Root cause: GET /api/
   broker-matching?products=A,B sends one comma-joined string (URLSearchParams
   coerces the array); BrokerMatchingQuerySchema wrapped a lone
   multi-product string as a single-element array (['A,B']) instead of
   splitting it, so `p.name IN (@prod0)` never matched a real product name
   once more than one product was selected — matches Mark's exact repro
   (works with one product, fails with several). Fixed in
   models/appointment.js's Zod transform; no client or SQL change needed.

3. Audit Log (Lead) and Change Log (Appointment) — both new, next to Call
   History / Meeting tracking respectively. AuditLog table was already
   write-only (LeadCreated/Assigned/Deleted, AppointmentCreated/Reassigned/
   etc. already wrote to it) — nothing ever read it back. New:
   auditService.listAuditLog(), GET /api/leads/:id/audit, GET /api/
   appointments/:id/audit, shared src/components/AuditLogList.jsx (used by
   both pages — same shape, same alternating-row request, no reason for
   two copies). Scope note: assign/reassign entries currently show the
   action label only, not resolved agent/broker names (changeDetail stores
   raw UUIDs) — flagged as a follow-up, not silently guessed at.

4. Alternating row shading — Call History and the new Audit Log (Lead),
   Change Log (Appointment). Even rows transparent, odd rows var(--panel2),
   theme-driven so it holds up on all four themes.

5. Appointment Outcome card now hidden until the First Meeting has actual
   data (date/status/notes) — previously always rendered even with nothing
   to report on yet.

6. First Appointment Date display fixed — was rendering the raw ISO
   timestamp from the DATE column directly. New src/utils/dateFormat.js
   (formatDate → DD-MM-YYYY, formatTime → HH:mm) applied to
   AppointmentDetail.jsx's "First appt date" row. New Settings page card
   (Date & Time) with a timezone selector, persisted to sessionStorage
   (mb_timezone) the same way avatar/display-name already are, pending the
   Users API. Scope note: only this specifically-flagged field was swept —
   other date displays across the app (LeadDetail's Date created,
   AppointmentList's date column) already format acceptably via date-fns/
   toLocaleDateString and weren't touched; a full sweep onto the shared
   utility is a reasonable follow-up, not bundled in here.

7. Reschedule/Cancel within the same meeting, and the Meeting Held lock —
   these turned out to be one fix, not two. Previously ANY recorded
   meeting status (including Rescheduled/Cancelled) unlocked the next
   meeting — wrong, since a rescheduled or cancelled meeting isn't
   actually done. Now: only a meeting genuinely marked Held (status
   'Seen') locks that meeting and unlocks the next one. New dedicated
   "Mark Meeting Held" button (separate from the Status dropdown) —
   immediately persists just that meeting via a scoped saveOutcome() call
   (customerSigned/productsSold/other meetings omitted from the payload so
   they can't be overwritten by whatever's currently in the rest of the
   draft form) and locks its fields read-only. Rescheduled/Cancelled leave
   the meeting's Date field open for the broker to capture a new date,
   still against the same meeting number — no new "reschedule" UI needed,
   the existing Date field just stays editable pre-lock. Server-side lock
   added too, not just UI: appointmentService.saveOutcome() now silently
   drops edits to any meeting whose persisted status is already 'Seen',
   and rejects the whole call outright once the appointment itself is
   ClosedWon/ClosedLost.

8. Appointment locked once Closed — AppointmentDetail.jsx now disables
   every outcome/meeting field and hides the Save button once
   status is ClosedWon/ClosedLost, with a "🔒 Locked" badge and notice.
   Backend enforcement described in item 7.

9. Lead no longer disappears once an appointment is booked. AppointmentScheduled
   is relabelled "Converted" in STATUS_META (tokens.js — one source, used
   by LeadList's chips/table and LeadDetail's status pill) and LeadList no
   longer force-excludes it. New Active/Closed/Converted composite tabs
   replace the old always-on EXCLUDED_STATUSES: Active = Unassigned +
   Assigned + InProgress (excludes Converted/Closed), and is now the
   default view — this is what actually keeps a working agent's queue
   clean, rather than hiding Converted leads from the list entirely.
   Mirrored on AppointmentList.jsx: new Active (Unassigned/Assigned/
   InProgress) and Closed (ClosedWon/ClosedLost) composite chips, Active
   now the default view there too.

10. Agent-on-booking bug FIXED — appointmentService.createAppointment()
    previously took the authenticated booking user's own JWT claim as
    the Appointment's agentId (a DELIBERATE, documented design at the
    time — "Agent field is always read-only, set from the JWT"). Mark's
    correction: it should be the Lead's own assignedAgentId, since a
    Supervisor or Admin booking on an agent's behalf was bumping the
    appointment onto their own name instead of the agent who actually
    owns the lead. Fixed by resolving agentId from the Lead record
    inside createAppointment() rather than accepting it as a parameter.
    The "Agent is read-only" UI rule still holds — only where it's read
    from changed. Additionally: the Reassign modal on AppointmentDetail.jsx
    previously hardcoded Agent as permanently read-only in the UI even
    though the backend (ReassignAppointmentSchema/reassignAppointment())
    already accepted an optional agentId — only the modal itself blocked
    it. Now exposes an Agent select alongside Broker, so a wrong agent-on-
    booking can be corrected via the existing Reassign action, per Mark's
    request. Modal renamed "Reassign Broker / Agent" accordingly.

11. Log Call button hidden until the lead is Assigned (was visible
    immediately on an Unassigned lead, where logging a call doesn't make
    sense — there's no agent's queue to log it into yet).

12. View in Appointments (from LeadDetail's conversion banner) now
    navigates to the actual appointment instead of the bare Appointments
    list. leadService.getLeadById() now LEFT JOINs Appointment to return
    appointmentId on the Lead record for this.

DELIBERATELY NOT BUILT — Excel/JSON data take-on importer (medical
subscriptions as Excel, plus general Lead/Appointment historical take-on
via CSV/Excel/JSON). Mark asked about this in passing alongside the 14
fixes; flagged back to him as needing its own scoping session given the
size — format detection, column mapping, validation, and how it relates
to the existing CsvImportBatch concept referenced elsewhere in this
document are all real design decisions, not something to fold into a bug-
fix batch. Not started.

BUILD VERIFICATION: full Vite production build clean (1,300 modules, zero
errors) and the existing Vitest suite (45 tests across
appointmentStatusService.test.js and leadStatusService.test.js) passes
unchanged — nothing in this batch touched status-transition logic in a
way that broke coverage. `npm run lint` currently can't run at all
(missing eslint.config.js — ESLint 9 needs the new flat-config format,
the repo still has none) — pre-existing gap, not introduced this session,
worth fixing so lint is actually part of the verification gate again.

MIGRATION — straightforward overwrite, no deletions:
  api-lib/handlers/appointmentHandlers.js
  api-lib/handlers/leadHandlers.js
  api-lib/models/appointment.js
  api-lib/services/appointmentService.js
  api-lib/services/auditService.js
  api-lib/services/leadService.js
  api/appointments-router.js
  api/leads-router.js
  src/components/AuditLogList.jsx                (NEW)
  src/pages/AppointmentDetail.jsx
  src/pages/AppointmentList.jsx
  src/pages/LeadDetail.jsx
  src/pages/LeadList.jsx
  src/pages/Settings.jsx
  src/services/api.js
  src/styles/tokens.js
  src/utils/dateFormat.js                        (NEW)
Plus this Status.md and Project_Context.md — see the staleness note above,
push these even if the code files above already landed correctly.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
35. MEETING SAVE FIX, LEAD PORTFOLIO, AND LEAD:APPOINTMENT ONE-TO-MANY — 23 July 2026 (session 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Four items from Mark, in one follow-up message right after §34: two bugs
(meeting save, Save button placement), one feature (Portfolio on Lead), and
one architecture question he explicitly asked for a recommendation on
before any code got written.

1. MEETING SAVE BUG FIXED. Root cause: "Mark Meeting Held" was the ONLY
   save action on a meeting, and it forces status to 'Seen'. A broker who
   selected Rescheduled or Cancelled and entered a new date — or just added
   notes — had no way to persist that. The general Save Outcome button
   lives on a different card, gated behind the first meeting having data,
   and isn't a place anyone would look for "save my reschedule". New: a
   "Save Changes" button on every unlocked MeetingSection, alongside Mark
   Meeting Held — persists whatever's currently drafted (date/status/notes)
   as-is, no forced status. New handleSaveMeeting() in AppointmentDetail.jsx,
   reuses the existing scoped-saveOutcome pattern Mark Meeting Held already
   used. Caught a real bug while writing it: SaveOutcomeSchema's meeting
   status accepts an enum value or '' — not null. Sending null (my first
   draft) would have 400'd on every single save; fixed before it shipped.

2. SAVE BUTTON PLACEMENT FIXED. Was at the bottom of the Insurance
   Information card — Mark's specific complaint: it should be where Edit
   Details is. Moved to the header, replacing Edit Details while editing;
   the save-error message moved up there too.

3. PORTFOLIO ON LEAD. Previously portfolio only existed on Appointment
   (NOT NULL, set at booking). LeadDetail.jsx's "Portfolio" field in the
   Lead Detail card had existed since the page was built but always
   rendered '—' — the column never existed on Lead at all, not just an
   unwired display (confirmed against the actual schema, not assumed).
   New: nullable Lead.portfolioId (migration 004_add_lead_portfolio.sql),
   optional field on CreateLeadSchema/UpdateLeadSchema, editable via the
   existing edit-mode mechanism, optional field on LeadImport.jsx's Manual
   Entry tab. Book Appointment now pre-fills its own portfolio selection
   from the Lead's, per Mark's "carries through" request — still
   overridable at booking time, not locked. resolvePortfolioId() exported
   from appointmentService.js and reused rather than duplicated.

4. LEAD:APPOINTMENT ONE-TO-MANY (the architecture question). Mark asked
   directly: "if a lead is converted, it should be locked... if closed-won,
   it should also be locked, but if closed-lost, it should allow for
   re-opening... I am thinking there is a one-to-many relationship." Before
   answering, checked the actual schema rather than reasoning from app
   logic alone: Appointment.leadId had a UNIQUE constraint — the system was
   hard 1:1 at the database level, not just by convention. Confirmed his
   instinct was right and it's the actual blocker.

   Recommended one-to-many over an archive/delete-and-recreate pattern:
   preserves full history (a lead that took two failed attempts and a
   third successful one has three Appointment rows, all visible — matters
   for Reports, not yet built, so this was the right time to decide it
   rather than after Reports gets built on the wrong assumption). Asked
   Mark one scoped question before building — automatic unlock on Closed
   Lost, or manual Reopen requiring an Admin/Supervisor action. Mark chose
   MANUAL.

   Built:
   - Migration 005_drop_appointment_lead_unique.sql — drops
     UQ_Appointment_LeadId. The existing plain index (IX_Appointment_LeadId)
     already covers the lookup, untouched.
   - leadService.getLeadById() — "the" appointment on a Lead is now
     resolved as the most recent by createdAt (LATERAL join), not assumed
     unique. Also now returns appointmentStatus, needed to decide whether
     Reopen should show.
   - New leadService.reopenLead() — validates server-side (not just
     hidden client-side) that the Lead is genuinely AppointmentScheduled
     AND its most recent Appointment is genuinely ClosedLost before
     reverting pipelineStatus to InProgress. Same agent stays assigned;
     Book Appointment becomes available again immediately (already gated
     on Assigned/InProgress — no separate change needed there).
   - New PUT /api/leads/:id/reopen (leadHandlers.handleLeadReopen) —
     Admin/Supervisor only, same team-scoping pattern as the rest of this
     file. Writes a LeadReopened audit entry.
   - Server-side edit lock: leadHandlers.js's existing PUT /leads/:id now
     rejects the edit outright if pipelineStatus === 'AppointmentScheduled'
     — the real enforcement; LeadDetail.jsx hiding Edit Details is just
     the UX layer, matching how every other permission boundary in this
     app already works (client hides, server enforces).
   - LeadDetail.jsx: canEdit gains `&& !isConverted`. Conversion banner
     now distinguishes three states instead of one generic message — still
     active (locked, no action), Closed Won (🏆 locked permanently), Closed
     Lost (🔒 locked + "↺ Reopen Lead" button for Admin/Supervisor). New
     canReopen/handleReopenLead.
   - Comments fixed in two places that asserted 1:1 as fact: the header
     comment in AppointmentDetail.jsx, and returnToLeads()'s comment in
     appointmentService.js, which had used the UNIQUE constraint as part of
     its reasoning for why Return to Leads does a genuine delete rather
     than an archive. That reasoning is now partly stale — the constraint
     is gone — but the conclusion (genuine delete) is unchanged: there's
     still no archive/soft-delete column, and nobody asked Return to Leads
     itself to start preserving history. Return to Leads and Reopen Lead
     are deliberately different tools now: Return to Leads says "this
     shouldn't have been booked" (deletes it); Reopen says "this attempt
     legitimately fell through, keep the record, try again" (preserves it).

   NOT changed: AppointmentList.jsx needed no changes — it already lists
   Appointment rows, not leads deduplicated by lead, so a lead with two
   appointments over time just shows as two rows, which is correct.
   createAppointment() needed no changes either — it already sets
   Lead.pipelineStatus = 'AppointmentScheduled' unconditionally on booking,
   which now correctly re-locks a reopened lead the moment a second
   appointment is booked, with no special-casing required.

BUILD VERIFICATION: full Vite build clean (1,300 modules), Vitest suite
unchanged and passing (45 tests). `npm run lint` still can't run at all
(missing eslint.config.js, flagged in §34, still not fixed).

MIGRATION — straightforward overwrite, no deletions. This delivery is
CUMULATIVE — Mark had not yet applied §34 when this session started, so
this is the complete current state of every file below, not a diff on top
of an already-applied §34:
  api-lib/models/lead.js
  api-lib/services/leadService.js
  api-lib/services/appointmentService.js
  api-lib/handlers/leadHandlers.js
  api/leads-router.js
  src/services/api.js
  src/pages/AppointmentDetail.jsx
  src/pages/LeadDetail.jsx
  src/pages/LeadImport.jsx
  src/components/AuditLogList.jsx
  db/schema.postgres.sql
  db/migrations/004_add_lead_portfolio.sql          (NEW)
  db/migrations/005_drop_appointment_lead_unique.sql (NEW)
Plus this Status.md and Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
36. RETURN TO LEADS NOW PRESERVES THE APPOINTMENT — 23 July 2026 (revisited)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark read §35's delivery before importing it and pushed back on one
specific design choice within it — the write-up of returnToLeads() had
described its delete-on-return behaviour as deliberate, contrasting it
with the new Reopen Lead action. Mark: "perhaps we should always keep
appointments, even if they fall through... it gets locked and that shows
in the audit log for the appointment, and that way, meaningful metrics can
be derived, and auditing is much more robust." Right call — agreed and
implemented before anything got imported, so this replaces §35's version
of returnToLeads() rather than sitting alongside it.

WHAT CHANGED: returnToLeads() no longer deletes the Appointment (or its
AppointmentProduct rows). It now sets a new terminal status,
'ReturnedToLeads', added to CK_Appointment_Status (migration
006_add_appointment_returned_status.sql — CHECK constraints can't be
altered in place in Postgres, drop and recreate). The Lead-side reset is
unchanged: pipelineStatus back to Unassigned, assignedAgentId cleared.

Worth noting explicitly: the audit write for AppointmentReturnedToLeads
already existed (added under the earlier A4 security fix) — it just wrote
to a row that then got deleted moments later, making the entry practically
unreachable (no page to view it from once the appointment was gone, even
though the AuditLog row itself technically survived). This fix makes that
existing audit write actually mean something.

'ReturnedToLeads' is deliberately its OWN status, not folded into
ClosedWon/ClosedLost — it's not a sales outcome, so lumping it in would
skew win/loss reporting. It IS included in the composite "Closed" quick-
filter tab on AppointmentList.jsx (Closed = not currently being worked,
broader than just won/lost) and has its own individual filter chip too.

LOCK SEMANTICS on AppointmentDetail.jsx: introduced isLocked (ClosedWon,
ClosedLost, or ReturnedToLeads) alongside the narrower isClosed (won/lost
only, kept for outcome-specific messaging). Every place that used to gate
on isClosed for "should this be editable" — meeting sections, the outcome
card, Reassign, Return to Leads itself — now uses isLocked. Found and
fixed a real server-side gap while doing this: saveOutcome()'s lock check
only covered ClosedWon/ClosedLost, not the new status — a returned
appointment could have been edited via a direct API call even though the
UI would never expose that path. Fixed to cover all three.

ReturnToLeadsModal's copy updated ("record is kept, locked, as history —
not deleted"), and its post-return behaviour changed: previously navigated
away to /appointments (because the appointment was about to vanish); now
refetches and stays on the page, showing the locked state immediately —
more useful now that there's something worth looking at.

FLAGGED, NOT FIXED (pre-existing, not a regression from this change):
assignBroker() and reassignAppointment() in appointmentService.js have NO
server-side status guard at all — reassigning a closed/locked appointment
today relies entirely on the frontend's canReassign check. This predates
today's session. Worth a look, but out of scope for what Mark asked this
time — flagged rather than silently fixed to avoid scope creep on an
already-large delivery.

MIGRATION — straightforward overwrite. Checked against a fresh GitHub
hydration before finalising this: §34 and §35 are already applied there,
so this is just §36's own diff, not a cumulative bundle:
  api-lib/services/appointmentService.js
  src/pages/AppointmentDetail.jsx
  src/pages/AppointmentList.jsx
  src/styles/tokens.js
  db/schema.postgres.sql
  db/migrations/006_add_appointment_returned_status.sql (NEW)
Plus this Status.md / Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
37. LEAD DETAIL BLANK-PAGE BUG DIAGNOSED, AGENT NAME FIX, ROW-CLICK NAV — 23 July 2026 (session 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark tested §36 and reported (with a screenshot) that a Lead Detail page
was showing every field blank — Status/Portfolio/Contact/Education/
Insurance/Call History/Audit Log all empty. Plus a UX request: clicking
anywhere on a row in Leads/Appointments should navigate to detail, not
just the View button.

THE BLANK-PAGE BUG — root cause chain, traced through the actual code
rather than guessed at:
  1. LeadDetail.jsx's useFetch call for the lead itself destructured
     `{ data, loading, refetch }` — NOT `error`. It never existed in this
     destructuring; not a regression from a recent session.
  2. So when GET /api/leads/:id fails for any reason, useFetch correctly
     sets its internal error state (confirmed in hooks/useFetch.js — it
     does track this properly), but LeadDetail.jsx had nowhere to read it.
  3. The page fell straight through to rendering the full layout against
     baseLead = lead ?? {} — every field '—', EXCEPT Status, which showed
     a plausible-looking "Unassigned". That's not a real value — it's
     currentStatus's own `?? 'Unassigned'` fallback, which fires
     regardless of whether the fetch actually succeeded. This is what
     made a completely broken page look like a real (if sparse) lead
     instead of an obvious error.
  FIXED: LeadDetail.jsx now captures leadError from useFetch and renders
  an explicit error card (message + Try again) instead of silently
  falling through. Also added a `!lead` guard (genuinely not found, as
  opposed to a fetch error) with its own message, previously also
  unhandled — the code had assumed a successful fetch always returns a
  lead.

  WHAT ACTUALLY TRIGGERED THE 500 in Mark's case: not confirmed with
  certainty (no direct access to his live Neon database from here), but
  the leading suspect by far is migration 004_add_lead_portfolio.sql not
  having been run — getLeadById()'s query references l.portfolioId
  directly (added in §35), which would make the query fail outright on a
  database that doesn't have that column yet. This has been an open,
  unconfirmed item across §34, §35, and §36 without ever getting a
  definitive answer — see the escalated MIGRATIONS PENDING note above.
  Worth Mark actually confirming this one way or the other, since it may
  be the source of other not-yet-reported issues too, not just this page.

SEPARATE BUG FOUND WHILE IN THERE: getLeadById() never joined "User" for
the assigned agent's display name at all — listLeads() already did
(LEFT JOIN "User" a ON ...), but the single-lead query never had this,
seemingly since the page was first built. The "Agent" field on Lead
Detail has likely never shown a name for any lead, assigned or not,
independent of the blank-page bug above. Fixed — same JOIN pattern as
listLeads(), aliased consistently.

ROW-CLICK NAVIGATION (Mark's UX request): LeadList.jsx and the main
AppointmentsTable in AppointmentList.jsx — the whole row now navigates to
detail on click, not just the View button. The actions cell (View/Assign/
Reassign buttons) calls stopPropagation so those buttons keep their own
distinct behaviour instead of also firing row navigation — matters most
for Assign/Reassign, which open a modal rather than navigate; without
stopPropagation, clicking them would have both opened the modal AND
navigated away. NOT applied to AppointmentList.jsx's second table (the
"Available to Claim" list under the claim-model tab) — that's still
mock-data-driven preview content for the deferred claim model/token
economy (see §28), has no View button to mirror, and clicking a row
there doesn't have an obvious single destination the way it does for a
real, booked appointment.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests) — nothing here touched status-transition logic.

MIGRATION — straightforward overwrite, small delta (confirmed via a
genuinely fresh GitHub diff — §34 through §36 are all already applied
there):
  api-lib/services/leadService.js
  src/pages/LeadDetail.jsx
  src/pages/LeadList.jsx
  src/pages/AppointmentList.jsx
Plus this Status.md / Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
38. USERS ROW-CLICK, AND THE REAL MEETING-HELD LOCK FIX — 23 July 2026 (session 4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confirmed via §37: Mark had simply forgotten to run the pending
migrations — running them fixed the blank Lead Detail page exactly as
diagnosed. MIGRATIONS PENDING note above is now marked resolved. Two new
items from testing after that:

1. USERS ROW-CLICK. Mark asked for the Leads/Appointments row-click
   pattern (§37) on Users too. UserAdmin.jsx doesn't have a separate
   detail page the way Leads/Appointments do — user management there is
   an Edit modal, not a route. So "click row, it opens" here means the
   row now opens that same modal the Edit button already opened. Edit
   button kept, stopPropagation added so it doesn't double-fire with the
   row's own click (harmless either way since both do the same thing, but
   cleaner).

2. MEETING-HELD LOCK — real bug, not just a design tweak. Mark: "Selecting
   Seen from the Appointment dropdown list mustn't automatically set the
   status to held and lock the Appointment. This should happen on Save
   Changes, so that Notes can be captured. If the meeting has been saved,
   a user should be able to edit it again by unlocking it."

   ROOT CAUSE, confirmed by reading the actual code rather than assumed:
   the lock (`isMeetingLocked`) was computed directly from the DRAFT form
   state — `meeting.status === 'Seen'`, where `meeting` was
   `appt.meetings[n]`, the same object the Status dropdown writes to on
   every keystroke/selection via handleMeetingChange. So selecting "Seen"
   updated that draft immediately, which recomputed `locked = true` in
   the very same render — before any save, any API call, any chance to
   type notes. This was a real bug in the §34 design, not a deliberate
   choice being reconsidered.

   FIX — separated "what's currently drafted" from "what's actually been
   saved":
   - New heldMeetingNums (Set of meeting numbers) — the TRUE, persisted
     lock state. Populated only from apptData on fetch (meetingNStatus
     === 'Seen' server-side) and updated only inside handleSaveMeeting/
     handleMarkMeetingHeld after a successful save, based on what was
     actually just persisted. Never touched by handleMeetingChange or any
     other draft-editing path.
   - MeetingSection no longer derives its own lock — it takes `held` as
     an explicit prop from the parent. Selecting "Seen" in the dropdown
     now only updates the draft (visible, editable, notes can be typed);
     the fields only actually lock once Save Changes (or Mark Meeting
     Held) persists status 'Seen'.
   - New unlockedMeetingNums (Set) + "🔓 Unlock to Edit" button, shown on
     any currently-held meeting (Mark's second ask). Purely local, no API
     call — re-enables the fields. The NEXT successful save on that
     meeting re-applies the real lock rule (held again if saved as Seen,
     open if saved as anything else) and clears the override. Fresh data
     from a refetch also clears any stale override.
   - firstMeetingComplete/secondMeetingComplete (gate Add Second/Third
     Meeting) now read heldMeetingNums directly too, not the draft —
     consistent with the rest of the fix, and deliberately NOT affected
     by an active unlock override (re-opening meeting 1 for editing
     shouldn't retroactively hide meeting 2 once it already exists).

   SERVER-SIDE CONFLICT FOUND AND FIXED WHILE DOING THIS: saveOutcome()
   had its own per-meeting guard — `if (current[meetingNStatus] ===
   'Seen') continue` — silently dropping any edit to a meeting already
   marked Seen. This was deliberate defence-in-depth added alongside the
   original (buggy) design, and it directly conflicts with Unlock to
   Edit: a save after clicking Unlock would have appeared to succeed in
   the UI while the server quietly ignored it — a worse bug than the one
   being fixed, since it would look like data loss with no error shown.
   REMOVED. The appointment-level lock (ClosedWon/ClosedLost/
   ReturnedToLeads) is now the only real server-side boundary for meeting
   edits; per-meeting locking is a frontend-only concept, matching what
   Mark actually asked for (lock is a UX state, not a data-integrity
   rule — the same meeting's true history is always in the audit log
   regardless of how many times it's unlocked and re-saved).

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

MIGRATION — straightforward overwrite, small delta (confirmed via a
genuinely fresh GitHub diff — §34 through §37 are all already applied
there):
  api-lib/services/appointmentService.js
  src/pages/AppointmentDetail.jsx
  src/pages/UserAdmin.jsx
Plus this Status.md / Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
39. LEAD AUDIT LOG FALSELY SHOWING DATE OF BIRTH CHANGED ON EVERY EDIT — 23 July 2026 (session 5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark spotted (via screenshot) that the Audit Log on Lead Detail showed
"Date of Birth: 1999-05-19T00:00:00.000Z → 1999-05-19" on every single
edit entry, regardless of what was actually changed — Portfolio, WhatsApp/
Year/Degree, Existing cover/etc. all showed this same DOB line alongside
the real change. Correctly suspected it was a display artifact rather
than a real repeated edit.

ROOT CAUSE, confirmed by reading the code (not guessed): node-postgres
parses DATE columns into JS Date objects by default — no custom type
parser is registered in db.js. So leadHandlers.js's PUT handler had
existing.dateOfBirth as a genuine Date object (from getLeadById()), while
parsed.data.dateOfBirth was always a plain 'YYYY-MM-DD' string (what the
date input sends, and it's always present in the payload — the edit form
initialises it from the lead's own DOB, never blank once set). The diff
check was a strict `existing[field] !== parsed.data[field]` — a Date
object is never === a string even for the identical calendar date, so
this comparison was true on literally every save that included
dateOfBirth, which is every save (whether or not the user touched that
field). The Date object's ISO serialisation
("1999-05-19T00:00:00.000Z") is exactly what showed in Mark's
screenshot — matches Date.prototype.toJSON() precisely, confirming the
diagnosis before any fix was written.

FIXED: normalise existing.dateOfBirth to the same 'YYYY-MM-DD' string
form before comparing, only for that one field (every other editable Lead
field is a plain string/number/boolean both sides and compares correctly
already — checked, not assumed). Purely a display/audit-log bug — the
actual saved value was never wrong, updateLead() writes
parsed.data.dateOfBirth correctly regardless of this comparison bug.

Checked for the same bug pattern elsewhere in the codebase: this diffing
logic (existing vs incoming, field by field) doesn't exist anywhere else —
Appointment's outcome audit entries log the raw payload, not a diff
against prior values, so there's no equivalent comparison to be wrong.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

MIGRATION — straightforward overwrite, single file:
  api-lib/handlers/leadHandlers.js
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
40. MEETING DATES DISAPPEARING ON RELOAD — SAME BUG CLASS AS §39, DIFFERENT SYMPTOM — 23 July 2026 (session 6)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found (via screenshot, right after §39): First Meeting's Date field
showed empty ("yyyy/mm/dd" placeholder) on reload/renavigation, even
though the meeting was genuinely saved and Held — Status ("Seen") and
Meeting Feedback both displayed correctly, only Date was blank.

ROOT CAUSE — the same underlying issue as §39 (node-postgres parsing DATE
columns into JS Date objects, no custom type parser registered), but a
different symptom because of WHERE it surfaces: appointmentService.js's
SELECT returns `a.meeting1Date AS "meeting1Date"` unformatted, so the API
response carries a full ISO timestamp ("2026-07-24T00:00:00.000Z") rather
than a plain 'YYYY-MM-DD' string. AppointmentDetail.jsx bound this
directly to `<input type="date" value={meeting.date}>` with no slicing.
Native date inputs require the value to be EXACTLY 'YYYY-MM-DD' — anything
else (including a correct date with extra time/timezone characters
appended) is treated as invalid and rendered as a blank field, silently,
with no console error. That's exactly what looked like data loss: the
value really was being saved and returned correctly, the input just
couldn't display it.

Confirmed against the actual API response shape and the exact input
binding before writing the fix, not assumed from the symptom alone.

FIXED: `.slice(0, 10)` on `apptData[meetingNDate]` when building the
meetings array — the same fix already applied to firstTime one line below
it (`.slice(0, 5)`), which is presumably why that one was never reported:
it already had this treatment, meeting dates didn't.

SWEPT the rest of the app for the same bug class rather than assuming
this was the only instance: every `type="date"` input — LeadDetail.jsx's
Date of Birth (already sliced, from the §34 Lead-editing work — safe),
LeadImport.jsx's manual-entry Date of Birth (fresh user input, never
pre-filled from a fetch — safe), the Book Appointment modal's date field
in LeadDetail.jsx (local state, starts blank for a new booking — safe),
Tasks.jsx's dueDate (still hardcoded mock data, not from a real fetch yet
— not affected today, but worth remembering if/when Tasks gets wired to
a real backend). Meeting dates were the only live instance.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

MIGRATION — straightforward overwrite, single file:
  src/pages/AppointmentDetail.jsx
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
41. LEAD PORTFOLIO: SINGLE-SELECT TO MULTI-SELECT — 23 July 2026 (session 7)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark: "I think brokers can sell products from multiple portfolios, so it
needs to support multi-select." Asked which specific screen before
building anything, since the obvious candidate (User Admin's broker
portfolio/product assignment) turned out, on inspection, to already
support multi-select correctly end-to-end — checkboxes into an array,
synced properly to the UserPortfolio/BrokerProduct many-to-many tables,
not the vestigial singular User.portfolioId column. Mark clarified: the
Leads page — specifically the Portfolio field added in §35, which was a
single dropdown backed by a single Lead.portfolioId column.

CHANGE: Lead's portfolio capture is now many-to-many, mirroring
UserPortfolio exactly (new LeadPortfolio table: leadId, portfolioId,
UNIQUE(leadId, portfolioId), same shape, no isPrimary — wasn't asked for,
kept simple). Lead.portfolioId (added §35) is now DEPRECATED — left in
place, unused by app logic going forward, same treatment as the existing
vestigial User.portfolioId. Migration 007_add_lead_portfolio_multi.sql
also carries forward any single portfolio already captured on existing
leads into the new table, so nothing entered under §35 is lost.

Backend: leadService.js gained syncLeadPortfolios() (mirrors
syncUserPortfolios() in userService.js exactly), and now imports and
reuses resolvePortfolioIds() (now exported from userService.js — same
helper the User multi-portfolio path already used, not duplicated).
createLead()/updateLead() both switched from a single portfolio name to
a portfolios array; getLeadById() aggregates via a scalar subquery
(array_agg) rather than restructuring the whole query around GROUP BY
the way userService.js's list query does — simpler for a single-row
fetch, doesn't interact with the other LEFT JOINs/LATERAL already there.

CAUGHT BEFORE SHIPPING, not after another screenshot this time: the same
audit-log false-diff bug class as §39's Date of Birth issue would have
recurred immediately — comparing two arrays with `!==` is always true
even when the contents are identical (compared by reference, not value),
so an untouched portfolios selection would have shown as "changed" on
every single save. Fixed in leadHandlers.js's diff logic with an order-
independent (sorted-join) comparison before this ever got tested, let
alone shipped.

Frontend: LeadImport.jsx's Manual Entry form and LeadDetail.jsx's
editable Portfolio field both changed from a single dropdown to
multi-select checkbox pills, matching the visual style already
established for broker portfolio assignment in User Admin. Read-only
display renders one pill per portfolio instead of one pill total. Book
Appointment's own portfolio picker is UNCHANGED and correctly still
single-select — one appointment is for one portfolio, that's a real
structural fact, not a limitation to relax. Its pre-fill logic now only
fires when the Lead has exactly one portfolio tagged; with zero or
several, it's left blank so the booker picks explicitly rather than the
form silently guessing which one this appointment is for.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

MIGRATION — straightforward overwrite:
  api-lib/handlers/leadHandlers.js
  api-lib/models/lead.js
  api-lib/services/leadService.js
  api-lib/services/userService.js
  db/schema.postgres.sql
  db/migrations/007_add_lead_portfolio_multi.sql (NEW)
  src/components/AuditLogList.jsx
  src/pages/LeadDetail.jsx
  src/pages/LeadImport.jsx
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
42. REPORTS.JSX REWIRED TO REAL DATA — 23 July 2026 (session 8)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The last remaining page on mock data (deferred since §33, repeatedly
carried forward as "THEN: Reports" in this block across many sessions).
Reports.jsx itself is done — its own header comment already documented
the intended API shape (GET /api/reports/summary|brokers|agents?period=...)
from whenever this page was originally scaffolded; this session actually
built that API rather than inventing a different one.

Two real gaps found and resolved WITH Mark before any backend code was
written, not assumed (both confirmed via ask_user_input_v0, both got a
decisive recommendation rather than an open-ended question):

1. PIPELINE BUCKETS. Mock had 7: Unassigned, Assigned, In Progress,
   Appointment Booked, Closed Won, Closed Lost, Uncontactable. Two don't
   map cleanly onto the real schema: Closed Won/Lost live on Appointment,
   not Lead (a Lead's own status only ever says Converted or Closed, and
   since §35 a Lead can have several Appointments over time — "the"
   outcome means the most recent one's); and Uncontactable has zero
   backing data anywhere — checked CallAttempt.outcome's full CHECK
   constraint (NoAnswer/Voicemail/WrongNumber/CallbackRequested/
   ClientContacted/NotInterested/AppointmentScheduled), no such value,
   and nothing tracks "no answer after N attempts" as a derived state.
   RESOLVED: 6 real buckets. Unassigned/Assigned/InProgress straight from
   pipelineStatus; Converted leads split by their most recent Appointment's
   actual status (still active -> Appointment Booked, ClosedWon -> Closed
   Won, ClosedLost/ReturnedToLeads -> Closed Lost); Leads closed via a call
   outcome without ever getting an appointment (pipelineStatus = 'Closed')
   folded into Closed Lost too — both mean "didn't convert", no reason for
   a 7th bucket. Uncontactable dropped entirely.

2. POLICY VALUE. No monetary/premium field exists anywhere in the schema —
   checked exhaustively (grepped the whole schema for policyValue/premium/
   DECIMAL/NUMERIC/MONEY), not assumed from the mock's presence of the
   column. RESOLVED: dropped Policy Value and everything derived from it
   (Avg per broker, Avg per signing) rather than inventing a new capture
   feature nobody asked for. Real KPIs substituted: org-wide, Appointments
   Booked and Active Brokers (both already derivable from real data,
   money-free); a broker's own view, Conversion Rate and Portfolios
   (count + list — genuinely available now that brokers can have several,
   see §41) instead of the two money-based KPIs.

BUILT:
  - api-lib/models/report.js — period query validation (Monthly/
    Quarterly/Yearly, matches the enum Reports.jsx's UI already used).
  - api-lib/services/reportService.js — getReportSummary() (pipeline +
    trend), getBrokerReport(), getAgentReport(). Trend chart bucketing
    (weeks for Monthly, months for Quarterly/Yearly) computed in JS, one
    pair of COUNT queries per bucket (max 12 for Yearly) rather than
    dynamic SQL date-bucketing — simpler and plenty fast enough for a
    low-traffic internal report at this org's scale.
  - api-lib/handlers/reportHandlers.js — all three endpoints open to all
    four roles; row-level scoping happens inside reportService.js, not
    via requireRole exclusion. Resolves the effective role via the SAME
    precedence helpers (isAgentOnly/isSupervisorOnly) every other handler
    in this codebase already uses — caught myself about to invent a
    claims.roles[0] pattern that doesn't exist anywhere else here, fixed
    before it shipped, not after.
  - Broker scope: Admin/GlobalAdmin/Supervisor see all brokers (brokers
    aren't in a supervisor's direct-report line the way agents are —
    matches the mock's own scoping exactly, which fell through to the
    full list for Supervisor too). Agent scope: Admin/GlobalAdmin see all,
    Supervisor sees real direct reports via getDirectReportIds() (not the
    mock's hardcoded SUPERVISOR_AGENTS = ['Thabo Molefe', 'Naledi van Wyk']).
  - api/reports-router.js + vercel.json — new /api/reports/:slug* rewrite,
    matches the existing router pattern exactly (leads/appointments/etc).
  - src/services/api.js — replaced a STALE, never-wired reportsApi
    (pipeline/broker-activity endpoints) that didn't match Reports.jsx's
    own documented API shape and was never called from anywhere — found
    while adding the real one, not something this session introduced.
  - Reports.jsx — mock data (PIPELINE_DATA/TREND_DATA/BROKER_DATA/
    AGENT_DATA, all keyed by period) replaced with three useFetch calls.
    Client-side role-filtering of mock arrays by persona name removed
    entirely — the API already returns only what the viewer may see.
    Loading/error handling follows the established pattern (§37's
    DEMO_MODE-gated notice, real error surfaced rather than silently
    swallowed — the exact bug class that caused the blank Lead Detail
    page in §37 was checked for here from the start, not retrofitted).

NOT BUILT (deliberately, per Mark's own confirmed sequencing): AgentDetail.jsx
and BrokerDetail.jsx, the two drill-down pages Reports.jsx's "View →"
buttons link to (/reports/agent/:id, /reports/broker/:id) — both still
entirely mock (257 and 249 lines respectively). Queued as the explicit
next item.

BUILD VERIFICATION: full Vite build clean (1,300 modules), Vitest suite
unchanged and passing (45 tests).

MIGRATION — no new database migration this time. New files + vercel.json
change:
  api-lib/models/report.js                (NEW)
  api-lib/services/reportService.js       (NEW)
  api-lib/handlers/reportHandlers.js      (NEW)
  api/reports-router.js                   (NEW)
  src/pages/Reports.jsx
  src/services/api.js
  vercel.json
Plus this Status.md. Flagging again in the delivery message: vercel.json
changed (new rewrite rule) — confirm the new /api/reports/* routes
actually resolve after deploy, not just that the files landed.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
43. AGENTDETAIL.JSX / BROKERDETAIL.JSX REWIRED TO REAL DATA — REPORTS FEATURE COMPLETE — 23 July 2026 (session 9)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The deferred second half of §42, built as its own item per Mark's
"continue with what's next on the list". Both pages were entirely mock —
AgentDetail.jsx keyed off 4 fake agent IDs (tm/nv/kp/bn), BrokerDetail.jsx
off 4 fake broker IDs (sb/pj/rb/ms) — reached from Reports' "View →"
buttons, which already pass real User.id values, so the pages were
completely disconnected from what actually linked to them even before
this session.

CAUGHT AND FIXED MID-SESSION, not after: a str_replace edit while adding
getAgentDetailReport()/getBrokerDetailReport() accidentally deleted
getBrokerReport()'s own function declaration, orphaning its body under
getBrokerDetailReport()'s closing brace — a silent syntax error that
would have failed the build. Caught by grepping for all function
declarations right after the edit (a cross-check habit worth keeping
after any large str_replace on a file with several functions, not just
trusting the diff looked plausible) and fixed before it went anywhere
near a build step, let alone a delivery.

Same class of real-data gap as §42, resolved the same way — decisive
substitution with real metrics, not invented ones, flagged rather than
silently done:
  - AgentDetail's "Uncontactable" KPI -> replaced with "No Answer", a
    real CallAttempt.outcome value and the closest real thing to what
    Uncontactable was gesturing at.
  - BrokerDetail's "Policy Value" KPI -> replaced with "Meetings Held"
    (real, COUNT across meeting1/2/3Status = 'Seen'). "Broker switches"
    KEPT as-is — isBrokerSwitch is a real boolean column on Appointment,
    no gap there despite living right next to Policy Value in the mock.

CONFIRMED FULLY REAL, no gap at all: BrokerDetail's "Products Sold" chart
— AppointmentProduct was already correctly wired by the outcome-save flow
from much earlier work, this session only needed a read query against it,
not a new write path.

BUILT:
  - reportService.js: getAgentDetailReport() (meta incl. region +
    portfolios via the same UserPortfolio join pattern as the list
    report; KPI row; call-outcome breakdown across all 7 real
    CallAttempt.outcome values, not the mock's 6 which omitted
    ClientContacted; activity trend reusing getTrendBuckets(); last 5
    leads with their most recent call). getBrokerDetailReport() (meta;
    KPI row incl. meetingsHeld/switches; products sold via
    AppointmentProduct; a real meeting-outcome summary — simplified from
    the mock's exact "signed after 2nd meeting" framing, which implied a
    stricter causal link the data doesn't actually establish, to a
    straightforward per-meeting-number Seen/Rescheduled/Cancelled
    breakdown plus an overall signed ratio, every number in it real; last
    5 appointments with meeting statuses and products).
  - Permission model for both: Admin/GlobalAdmin see any agent/broker;
    Supervisor sees their own direct reports for agents (all brokers, per
    the same "brokers aren't in a supervisor's line" reasoning as §42's
    list report); Agent sees only themselves and cannot reach broker
    detail at all; Broker sees only themselves. Not found and not
    permitted return the identical 404 — doesn't leak which case it was.
  - reportHandlers.js: handleAgentDetail/handleBrokerDetail, same
    resolveScopeRole() precedence helper §42 already established.
  - reports-router.js: two new routes, /api/reports/agent/:id and
    /api/reports/broker/:id, added to the same router §42 already wired
    into vercel.json — no further vercel.json change needed this time.
  - AgentDetail.jsx/BrokerDetail.jsx: full rewrite, mock data removed
    entirely, useFetch against the new endpoints, same loading/error
    pattern established across every rewired page this whole session
    (§37 onward) — real error surfaced, never silently swallowed.

RESULT: with this, the entire application is off mock data. No page left
with hardcoded fixtures — the last one standing (Reports and its two
drill-downs) is done.

BUILD VERIFICATION: full Vite build clean (1,300 modules), Vitest suite
unchanged and passing (45 tests).

MIGRATION — straightforward overwrite, no new database migration:
  api-lib/services/reportService.js
  api-lib/handlers/reportHandlers.js
  api/reports-router.js
  src/pages/AgentDetail.jsx
  src/pages/BrokerDetail.jsx
  src/services/api.js
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
44. PER-PRODUCT POLICY VALUE TRACKING — 23 July 2026 (session 10)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark, directly: "I actually want to be able to track values for policies
sold... against the items selected and store them, so that it could be a
metric that is reported on." This is the direct answer to the gap flagged
repeatedly in §42/§43 — no monetary field existed anywhere in the schema,
so Policy Value was dropped from every KPI it used to live in rather than
inventing a capture feature nobody had asked for. Now they have.

Scope decided from the wording, not asked about again given how clearly
it was stated: value is tracked PER PRODUCT on an appointment (Mark said
"against the items selected"), not one lump sum per appointment — a
broker selling both Life Insurance and Gap Cover in one meeting can have
different values against each. Value is optional at save time — a broker
recording the outcome without the exact figure yet shouldn't be blocked
from saving; the UI surfaces how many products are still missing a value
as a gentle nudge, not a hard requirement.

CAUGHT MID-BUILD, not after shipping: adding SUM(policyValue) via a
direct JOIN to AppointmentProduct in the broker-list report query would
have silently fanned out one row per product sold, inflating the
appts/signed COUNT()s on the very same query (an appointment with 3
products sold would have counted as 3 appointments). Used a correlated
scalar subquery for the policy-value sum instead, keeping the
appointment-level aggregates on a completely separate, fan-out-free path.
Same reasoning applied to the org-wide total in getReportSummary() — its
own standalone query, not folded into the pipeline/trend aggregates.

BUILT:
  - Schema: AppointmentProduct.policyValue NUMERIC(12,2), nullable.
    Migration 008_add_appointment_product_value.sql.
  - models/appointment.js: SaveOutcomeSchema.productsSold changed from
    z.array(z.string()) to z.array({product, value}) — value optional/
    nullable. A real breaking change to the wire contract, updated
    consistently on both ends in the same pass (not left half-migrated).
  - appointmentService.js: resolveProductIds() -> resolveProductIdMap()
    (returns a name->id Map instead of a bare array, so a value stays
    attached to its product through the resolve step rather than relying
    on two parallel arrays staying in matching order — fragile the moment
    that assumption breaks). getProductNames() -> getProductsSold(),
    returns {name, value} pairs instead of bare names. syncAppointmentProducts()
    now writes the value column alongside each row.
  - AppointmentDetail.jsx: Products Sold reworked from a flex-wrap
    checkbox-pill row to a vertical list — each checked product gets its
    own inline Rand input, plus a running total and a note on how many
    products still lack a value. Draft state changed from a bare product-
    name array to [{product, value}], consistent with the new wire shape.
  - reportService.js: getBrokerReport() adds a fan-out-safe policyValue
    per broker (scalar subquery, see above). getBrokerDetailReport()'s
    existing products-sold query gains SUM(policyValue) per product (safe
    here — that query already groups by product name, no new fan-out
    risk). getReportSummary() adds an org-wide totalPolicyValue, its own
    standalone query.
  - Reports.jsx: reintroduced the fmt() Rand formatter removed in §42.
    Real "Total Policy Value" org KPI (5th slot, grid now sized
    dynamically off kpis.length rather than a hardcoded column count so
    self-views with 4 cards and the org view's 5 both lay out correctly).
    Policy Value column back on the Broker Performance table, sort order
    restored to by-policy-value (matching the original mock's intent, now
    backed by real data instead of a fabricated number).
  - BrokerDetail.jsx: "Meetings Held" (the placeholder substituted in for
    Policy Value back in §43) swapped for real Policy Value. Products
    Sold chart now shows Rand value alongside count per product. Broker's
    own self-view KPI on Reports.jsx: "Portfolios" swapped for "My Policy
    Value" — a real performance number is more useful there than mostly-
    static metadata.
  - AgentDetail.jsx: untouched — agents don't sell products, no policy
    value concept applies to that page.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

AMENDED before Mark ever applied this delivery — while testing §43's
AgentDetail.jsx against live data (screenshot: agent "Steve Madden", 2
leads assigned, every call/appointment KPI showing 0, yet Recent Lead
Activity showed a "No Answer" call against one of his leads), found and
fixed a real bug in getAgentDetailReport()'s Recent Lead Activity query:
the LATERAL subquery finding each lead's most recent call was scoped only
by leadId, not by agentId — so it surfaced the most recent call ANY agent
ever made on that lead, including a prior agent's from before a
reassignment. A lead keeps its full call history across reassignment
(nothing transfers or deletes past CallAttempt rows — same principle as
Appointment.agentId staying with whoever originally booked it, §35), so
this wasn't wrong data exactly, but showing an activity the CURRENTLY
VIEWED agent never personally performed, on their own detail page, is
genuinely misleading and worth calling a bug. Fixed: the subquery now
filters WHERE agentId = @agentId too. Checked the rest of reportService.js
for the same pattern (every other LATERAL/LIMIT-1 subquery) — this was
the only instance; getReportSummary()'s pipeline-bucketing LATERAL is
correctly unscoped by agent on purpose (a lead's most recent appointment
for pipeline classification doesn't depend on which agent handled it),
and BrokerDetail's recentAppointments products subquery is scoped by
appointmentId off an already broker-scoped base row, no equivalent risk.

RESOLVED — Mark ran the verification query directly: Steve Madden has
zero CallAttempt/Appointment rows under his own id. Confirmed the KPI
zeros were correct all along, not a bug — the only real bug was the
Recent Lead Activity display misattributing a prior agent's call, which
is what got fixed above. The Agent report is behaving correctly; nothing
further needed here.

MIGRATION — straightforward overwrite (file list unchanged from the
original §44 delivery — reportService.js is the only file this amendment
touches, and it was already in that list):
  api-lib/models/appointment.js
  api-lib/services/appointmentService.js
  api-lib/services/reportService.js
  db/schema.postgres.sql
  db/migrations/008_add_appointment_product_value.sql (NEW)
  src/pages/AppointmentDetail.jsx
  src/pages/BrokerDetail.jsx
  src/pages/Reports.jsx
Plus this Status.md. If Mark already downloaded the original §44 zip
before this amendment, re-download reportService.js specifically — every
other file in that delivery is unchanged.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
45. MULTI-PORTFOLIO APPOINTMENTS, PLUS TWO BOOKING-FORM FIXES — 23 July 2026 (session 12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Three items from testing the Book Appointment flow, via a screenshot of
the modal mid-booking.

1. PORTFOLIO WAS SINGLE-SELECT ON THE BOOKING FORM. Mark: "I can only
   select one portfolio at a time." This turned out to matter beyond the
   form itself — a broker legitimately discussing and selling products
   from BOTH Discovery and Money & Medicine in one meeting is real, not
   an edge case (that's the whole premise §41 already established for
   brokers themselves not being limited to one portfolio). If the
   Appointment itself could only hold one, the Products Sold checklist
   during Outcome would never even offer the second portfolio's products
   to record against — a real functional gap, not just a form UX one.

   Made Appointment genuinely multi-portfolio, mirroring the same
   UserPortfolio/LeadPortfolio pattern already established:
   - New AppointmentPortfolio junction table (migration
     009_add_appointment_portfolio_multi.sql, backfills every existing
     appointment's single portfolioId into it). Unlike Lead.portfolioId/
     User.portfolioId, Appointment.portfolioId stays NOT NULL and becomes
     the PRIMARY portfolio (first one selected at booking) rather than
     going fully vestigial — booking always has at least one portfolio
     chosen, so there's no "unknown yet" case to accommodate the way
     there was for Lead.
   - CreateAppointmentSchema.portfolio (string) -> portfolios (array,
     min 1). createAppointment() resolves the full set via
     resolvePortfolioIds() (already shared from userService.js, not
     duplicated), sets the primary column to the first one, and syncs the
     complete set via new syncAppointmentPortfolios().
   - APPOINTMENT_SELECT (shared by list and detail queries) gains a
     portfolios array aggregation alongside the existing single
     "portfolio" (primary) — kept for anything not yet touched, not
     removed.
   - BookAppointmentModal: portfolio changed from radio buttons to
     checkboxes. Products offered now union across every selected
     portfolio, not just one. Pre-fill now seeds from every portfolio
     already tagged on the Lead, not just when there's exactly one
     unambiguous choice.
   - AppointmentDetail.jsx: Products Sold now offers the union across all
     of an appointment's portfolios (was scoped to the primary only —
     this was the actual functional gap, not just the booking form).
     Portfolio display shows multiple pills.
   - AppointmentList.jsx: portfolio FILTER fixed to check membership in
     the full set, not equality against the primary — an appointment
     tagged Discovery+M&M with Discovery as primary would have been
     wrongly excluded from an M&M filter before this fix. Portfolio
     badges (both desktop table instances) show multiple pills.
   - BrokerDetail.jsx's Recent Appointments table and its backing query
     in reportService.js: same primary-only gap, same fix — full
     portfolio set now returned and rendered as multiple pills.

2. CONFIRM BOOKING DID NOTHING VISIBLE WITHOUT A BROKER SELECTED. Traced
   this precisely rather than guessing: validation was already correct —
   "Select a broker" genuinely rendered, visible in Mark's own
   screenshot — but as a small inline error beneath the broker list, easy
   to miss if that section had scrolled past. Fixed by making it
   impossible to reach in the first place: Confirm Booking is now
   disabled until portfolio, broker, date, and time are all actually set,
   not just reactively erroring after a click. The inline fieldErrors
   stay too, as a fallback for anyone tabbing through fields.

3. "THIS LEAD HAS NO ASSIGNED AGENT" AFTER FILLING OUT THE WHOLE FORM.
   The error itself was correct server-side behaviour (an appointment's
   agent is sourced from the Lead's own assignedAgentId — nothing to
   source it from if that's empty), but reaching it only after completing
   portfolio, products, region, broker search, broker selection, date,
   time, address, and insurer is a bad way to discover a lead isn't ready
   to book. canBook now checks baseLead.assignedAgentId directly instead
   of inferring it from the pipeline status string (Assigned/InProgress
   is SUPPOSED to imply an agent is set, but checking the actual field is
   strictly safer than trusting that invariant always holds, and costs
   nothing extra) — the Book Appointment button itself won't show if
   there's genuinely no agent to book against.

BUILD VERIFICATION: full Vite build clean, Vitest suite unchanged and
passing (45 tests).

MIGRATION — straightforward overwrite:
  api-lib/models/appointment.js
  api-lib/services/appointmentService.js
  api-lib/services/reportService.js
  db/schema.postgres.sql
  db/migrations/009_add_appointment_portfolio_multi.sql (NEW)
  src/pages/AppointmentDetail.jsx
  src/pages/AppointmentList.jsx
  src/pages/BrokerDetail.jsx
  src/pages/LeadDetail.jsx
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
46. EVENTS DOMAIN GIVEN A REAL BACKEND — PREREQUISITE FOR LEAD PORTAL — 24 Jul 2026 (session 13)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Scoped as the Lead Portal (§27) — a prospect-facing QR registration + venue
check-in feature. Before building it, Mark asked the right sequencing
question: does Events need a real backend first? Checked directly rather
than assumed — confirmed EventList.jsx/EventDetail.jsx had been fully mock
since first built, no api-lib/api files for Events existed at all,
eventsApi in api.js called endpoints that were never implemented. This
session built that prerequisite. The Portal itself (registration + check-in
against a real Event.qrToken) is next, not started here.

LEAD PORTAL SCOPE DECIDED WITH MARK (for when that build starts):
  - v1 prospect capabilities: view own appointment status + assigned
    broker's display name + edit own contact details. Medical aid/existing
    cover/ID number stay out of v1 — deferred to the existing (unbuilt)
    POPIA SAR flow rather than building ad hoc partial access.
  - Auth: separate LeadPortalAccount identity (own table, own JWT signing
    secret/claims), not an extension of User/staff roles.
  - Lives in the same Vite app under new /portal/* routes, own
    ProspectAuthContext — not a second deployment.
  - QR's actual purpose, clarified directly by Mark after an initial
    misread: NOT in-app scanning to register (a phone camera opening the
    URL directly already handles that, and the URL is equally shareable
    via WhatsApp/email — no QR-specific code needed for registration
    itself). The QR is for VENUE CHECK-IN — a self-service flow where an
    already-registered, already-logged-in attendee scans the SAME event
    QR (Event.qrToken, already unique, already exists — no new
    barcode-generation needed) from inside the portal to confirm they've
    arrived. Maps directly onto EventAttendee.attended/attendedAt, both
    already in schema and never wired to anything until now.
  - Six-persona review already run on this scope (Kai/Priya/Jordan/David/
    Sam/Alex) — no blockers found, see the review table from this
    session's chat if picked up in a fresh conversation without it.

WHAT SHIPPED THIS SESSION (Events domain only):
  No schema migration — Event and EventAttendee already had everything
  needed (qrToken, status, rsvp/attended/attendedAt/popiConsent). This is
  the first backend built against them.

  - api-lib/models/event.js (NEW) — CreateEventSchema, UpdateEventStatusSchema,
    and ALLOWED_STATUS_TRANSITIONS (Draft -> Active|Cancelled,
    Active -> Closed|Cancelled, Closed/Cancelled terminal) — the single
    source of truth for valid transitions, enforced server-side.
  - api-lib/services/eventService.js (NEW) — listEvents/getEventById
    (rsvpCount/attendedCount/walkinCount aggregated via LEFT JOIN + GROUP BY
    on Event's own PK, no fan-out risk), createEvent (always Draft),
    updateEventStatus (validates against ALLOWED_STATUS_TRANSITIONS,
    returns a structured not_found/invalid_transition result rather than
    throwing), listEventAttendees, getEventReport (summary + attendee list,
    for client-side CSV export — no server-side file generation).
  - api-lib/handlers/eventHandlers.js (NEW) — GET routes open to all five
    roles (matches App.jsx's existing nav gating — Events has no role
    restriction beyond the events.enabled flag, unlike Reports); create/
    status-change restricted to Admin/Supervisor/GlobalAdmin, same gating
    as Lead creation. Writes EventCreated/EventStatusChanged to AuditLog.
  - api/events-router.js (NEW) + vercel.json — new /api/events/:slug*
    rewrite, same dispatcher pattern as every other domain (§29/§30).
    10th deployed function — 2 of headroom left under the Hobby 12 cap,
    flagged during scoping, not yet a blocker.
  - src/services/api.js — eventsApi.updateStatus added (list/get/create/
    report already existed as stubs calling endpoints that didn't exist).
  - EventList.jsx — real create (was a fake setTimeout), real list with
    real aggregates. Create Event gated to Admin/Supervisor/GlobalAdmin
    (view remains open to all roles). Events always create as Draft — an
    explicit Activate step from the detail page, not a status field on
    the create form.
  - EventDetail.jsx — real event + attendee list. Status transition
    buttons (Activate/Close/Cancel) driven by a small NEXT_STATUS_ACTIONS
    map mirroring ALLOWED_STATUS_TRANSITIONS — kept as a separate frontend
    copy rather than importing api-lib into the Vite bundle (api-lib is
    deliberately excluded from the frontend build, §24.2). QR code is now
    a REAL scannable image (new qrcode dependency, client-side
    QRCode.toDataURL()) encoding `${origin}/portal/register/:qrToken` —
    replaces the old decorative placeholder SVG. Download PNG now
    downloads the real generated image. New Share via WhatsApp (wa.me
    link) and Share via Email (mailto:) buttons on the QR modal, per
    Mark's ask that registration not be gated to a physical scan at the
    event — the link is the same either way, nothing QR-specific needed
    for sharing it. Download Report generates a real CSV client-side from
    GET /api/events/:id/report.
  - package.json — qrcode ^1.5.4 added.

REAL BUG FOUND BY TESTING AGAINST REAL POSTGRES, NOT REVIEW: the initial
rsvpCount aggregate counted every non-deleted EventAttendee row regardless
of the rsvp column's value — so a walk-in (attended=true, rsvp=false)
was incorrectly inflating rsvpCount. Caught by a seeded-data test
(2 RSVPs + 1 walk-in, expected rsvpCount=2, got 3) before this ever shipped.
Fixed: rsvpCount's FILTER clause now requires rsvp = TRUE explicitly.

VERIFIED against a real local Postgres 16 instance (schema.postgres.sql
run clean, confirmed cumulative through §45 — AppointmentPortfolio,
ReturnedToLeads, policyValue all present, so no separate migration replay
needed for a fresh install): 19 checks against the full event lifecycle
via the actual handler functions (create as Draft, list, get detail with
qrToken present, Draft->Closed rejected, Draft->Active succeeds,
Active->Active rejected as a non-listed transition, Active->Closed
succeeds, Closed->Cancelled rejected as terminal, report shape, Agent
create rejected 403, unknown id 404, malformed id 400, missing required
field 400), plus 6 further checks with seeded Lead/EventAttendee rows
confirming the rsvpCount/attendedCount/walkinCount math after the fix
(2/1/1 as expected) and the attendee list's name concatenation. Full Vite
production build clean both before and after (1375 modules, zero errors)
and the existing 45-test Vitest suite unaffected.

NEXT: the Lead Portal itself — LeadPortalAccount migration, registration
flow (GET /api/portal/events/:qrToken, POST /api/portal/register), login,
GET/PUT /api/portal/me, POST /api/portal/checkin, and the four new
frontend routes (/portal/register/:qrToken, /portal/login,
/portal/dashboard, /portal/check-in) — scope already agreed above, not
re-litigated when this is picked up.

FOLLOW-UP, SAME SESSION — two real gaps found by Mark testing the delivery:
there was no way to add attendees at all (nothing populates EventAttendee
until the Portal is built), and Closed/Cancelled were hard terminal states
with no way back from an accidental status change.

  1. STATUS RECOVERY. ALLOWED_STATUS_TRANSITIONS (api-lib/models/event.js)
     changed from Closed/Cancelled being terminal to: Closed -> Active
     (Reopen Event) and Cancelled -> Draft (Reactivate as Draft). An
     Event's status is a lifecycle position, not a data-integrity lock the
     way Appointment's ClosedWon/ClosedLost is — mistakes should be
     correctable. EventDetail.jsx's NEXT_STATUS_ACTIONS map (the frontend's
     own copy, kept in sync manually per the existing comment) updated to
     match and expose the new buttons.

  2. MANUAL ADD ATTENDEE. New AddAttendeeSchema (api-lib/models/event.js) —
     same required fields as CreateLeadSchema (title/firstName/lastName/
     dateOfBirth/email/mobileNumber/occupation), reusing Title/JobTitle/
     saMobile directly from models/lead.js rather than redeclaring them
     (saMobile is now exported from lead.js — the only change to that
     file). New eventService.addAttendee(): resolves an existing Lead via
     leadService.findDuplicate() (same email/idNumber dedup as everywhere
     else) or creates one via leadService.createLead() with
     linkedEventId + leadSource='EventAttendance'; then creates the
     EventAttendee row — idempotent if that Lead is already registered for
     this event (returns alreadyRegistered:true rather than erroring or
     duplicating). Gated to an Active event only, same reasoning as the
     future Portal registration flow. popiConsentConfirmed is a hard
     z.literal(true) gate — staff adding someone on their own behalf did
     not get consent through a self-service form the way Portal
     registration will, so this is an explicit staff attestation, not an
     assumed default. New POST /api/events/:id/attendees
     (handleEventAttendees, Admin/Supervisor/GlobalAdmin only) + a new
     Add Attendee modal on EventDetail.jsx (title/name/DOB/email/mobile/
     job-title fields identical to LeadImport.jsx's Manual Entry tab,
     plus an "attended now" checkbox and the consent confirmation).

  3. MANUAL CHECK-IN TOGGLE. New eventService.setAttendeeAttendance() +
     PUT /api/events/:id/attendees/:attendeeId/attendance
     (handleEventAttendeeAttendance) — flips attended/attendedAt directly,
     same column the future Portal self-check-in will write to. The
     Attended Yes/No badge in EventDetail.jsx's attendee table is now a
     click-to-toggle button for Admin/Supervisor/GlobalAdmin (read-only
     display for other roles) — gives Mark a way to exercise the full
     attendance lifecycle manually before the Portal exists, and doubles
     as a real feature for staff checking someone in without the Portal
     (weak venue connectivity, attendee without a smartphone, etc.).

VERIFIED against the same local Postgres instance: 18 further checks —
Closed->Active reopen, Active->Cancelled, Cancelled->Draft reactivate,
add-attendee rejected on a Draft event, add-attendee succeeds on Active
and creates a new Lead, re-adding the same email returns alreadyRegistered
without a duplicate Lead, missing popiConsentConfirmed rejected 400,
attendance toggle on/off with attendedAt set/cleared correctly each way,
Agent blocked from adding attendees (403). Full Vite build clean (1375
modules, same count — no new page-level chunk, EventDetail.jsx grew from
33.5kB to 38.4kB) and the existing 45-test Vitest suite unaffected.

MIGRATION — straightforward add, no deletions (supersedes this session's
earlier file list — these are the same files, now with the follow-up
included, not a separate delta to apply after):
  api-lib/models/event.js                (NEW)
  api-lib/models/lead.js                 (saMobile now exported — only change)
  api-lib/services/eventService.js       (NEW)
  api-lib/handlers/eventHandlers.js      (NEW)
  api/events-router.js                   (NEW)
  vercel.json
  src/services/api.js
  package.json
  package-lock.json
  src/pages/EventList.jsx
  src/pages/EventDetail.jsx
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW TO START A NEW CHAT
1. Start a new conversation in the MedBroker project
2. Claude will load project files automatically — no need to paste them
3. Say: "Please read the Project_Context.md and Status.md files and confirm
   you have full context before I give you a task."
4. Claude will confirm.
5. Give your task.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
47. LEAD PORTAL BUILT — SELF-SERVICE REGISTRATION + VENUE CHECK-IN — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The prospect-facing side of §27/§46's scope, built against the real
Events domain from earlier this session. Four new frontend routes, six
new backend endpoints, one new table.

DATA MODEL:
  - LeadPortalAccount (new, in schema.postgres.sql AND migration
    010_add_lead_portal_account.sql for Mark's live Neon instance —
    confirmed 010 is the correct next-free number, 009 being §45's last):
    id, leadId (UNIQUE FK -> Lead), email (UNIQUE), passwordHash,
    passwordSetAt, failedLoginAttempts, isLocked, timestamps. Same
    local-auth shape as "User" minus passwordMustChange/rotation — a
    staff policy concern, not applicable to a prospect's own account.

AUTH — STRUCTURALLY SEPARATE FROM STAFF, NOT JUST POLICY-SEPARATE:
  - New config.portalAuth.jwtSigningSecret (env PORTAL_JWT_SIGNING_SECRET)
    — a DIFFERENT secret from staff's JWT_SIGNING_SECRET, not a shared one
    with a different claim. Verified directly this session: a portal
    token thrown at staff middleware/auth.js's validateToken() is
    rejected, and a staff-shaped token (right claims, wrong secret) thrown
    at the new middleware/portalAuth.js is rejected too. Two keys makes
    cross-use structurally impossible, not just something requireRole()
    happens to catch.
  - middleware/portalAuth.js — verifies against the portal secret, checks
    a type:'portal' claim as defense in depth on top of that, re-checks
    the account isn't locked/deleted since the token was issued (same
    principle as staff's getActiveUserById re-check). No x-demo-user-id
    header-bypass fallback — a prospect always needs a real token.
  - Portal login lockout uses a fixed threshold (5 attempts), not routed
    through SystemConfig the way staff's passwordLockoutAttempts is — a
    prospect account's blast radius is one person's own record, much
    smaller than a staff account's, so a simple fixed default seemed
    reasonable rather than plumbing another admin-configurable setting
    through for it. Easy to revisit if this should be configurable too.

REGISTRATION WINDOW — A PREVIOUSLY DEAD FIELD NOW WIRED UP, INTERPRETATION
FLAGGED FOR MARK TO CONFIRM: SystemConfig.qrTokenExpiryHours has existed
since the password-policy work (default 720 = 30 days) but nothing ever
read it. This session wired it into GET /api/portal/events/:qrToken and
POST /api/portal/register — both now reject once the window's closed.
No prior code established what "expiry" means here, so this is an
inference, not a confirmed spec: implemented as hours since Event.createdAt
(a registration-campaign window), NOT relative to eventDate. A 30-day
default reads more sensibly as "how long the link stays open after being
created" than tied to eventDate, which can be scheduled arbitrarily far in
advance — but flag it if that's wrong, it's a one-line change
(isRegistrationWindowOpen() in leadPortalService.js).

ENDPOINTS (api/portal-router.js, new vercel.json rewrite — 11th deployed
function, 1 of headroom left under the Hobby 12-function cap):
  GET  /api/portal/events/:qrToken   event context for registration page (public)
  POST /api/portal/register           create account + auto-register for
                                       the scanned event, returns portal JWT (public)
  POST /api/portal/login               email + password, returns portal JWT (public)
  GET  /api/portal/me                  own profile: contact details +
                                       most recent appointment status +
                                       assigned broker's DISPLAY NAME ONLY
                                       (not their contact details — least
                                       privilege, broker reaches out, not
                                       the reverse) (portal JWT)
  PUT  /api/portal/me                  update own email/mobileNumber —
                                       writes through to Lead directly so
                                       staff always see current contact
                                       info; keeps LeadPortalAccount.email
                                       in step so login never silently
                                       diverges from displayed contact
                                       email (portal JWT)
  POST /api/portal/checkin             confirms attendance for the
                                       scanned event — rejects if never
                                       RSVP'd ("you haven't registered"),
                                       idempotent if already checked in
                                       (portal JWT)

Registration reuses the exact same resolve-or-create-Lead flow as §46's
Add Attendee (leadService.findDuplicate then createLead if no match) —
Lead.createdById passed as null (column is nullable with an FK to "User";
a self-registered Lead genuinely has no staff actor). AuditLog entries for
portal-driven actions (PortalRegistration/PortalProfileUpdated/
PortalCheckedIn) use the Lead's own id as performedById, since that column
has no FK constraint at all — documented as a self-service actor in
changeDetail rather than left looking like a User id.

FRONTEND — completely separate provider tree, not nested under the staff
app's RoleProvider/FlagProvider/AuthProvider:
  - services/portalAuthStore.js + services/portalApi.js — own sessionStorage
    key (medbroker.portal.session, vs staff's medbroker.session), own
    request client. Deliberately not reusing services/api.js — that
    attaches the STAFF token; reusing it here would mean a prospect's
    requests carry whatever staff token happens to be in the same browser.
  - context/ProspectAuthContext.jsx — same shape as AuthContext.jsx,
    parallel not nested.
  - components/PortalCard.jsx — shared centred-card shell, same visual
    language as Login.jsx (ThemeProvider wraps both branches of App.jsx,
    so the CSS-variable theme system applies equally to the portal).
  - pages/portal/PortalRegister.jsx (/portal/register/:qrToken) — same
    required fields as Add Attendee/CreateLeadSchema, plus password +
    confirm password + a REAL popiConsent checkbox (this one is the
    person themselves consenting, unlike Add Attendee's staff attestation).
  - pages/portal/PortalLogin.jsx (/portal/login).
  - pages/portal/PortalDashboard.jsx (/portal/dashboard) — appointment
    status (mapped through a friendlier label set than the raw enum),
    broker's name if assigned, edit-own-contact-details panel, link to
    check-in.
  - pages/portal/PortalCheckIn.jsx (/portal/check-in) — html5-qrcode
    camera scanner (not the native BarcodeDetector API — confirmed
    earlier this session that it doesn't work on iOS Safari/any iOS
    browser, which rules it out given the prospect base is largely
    iPhones). Scans the SAME Event.qrToken already rendered in
    EventDetail.jsx's staff QR modal — extracts the token from the scanned
    URL, calls checkin. Explicit permission-denied state, not a silent
    failure (Sam/Frontend's flag from the six-persona review two sessions
    back).
  - package.json — html5-qrcode ^2.3.8 added (qrcode, for generating the
    QR image, was already added in §46).

APP.JSX RESTRUCTURING — the one genuinely structural change: BrowserRouter
previously only mounted AFTER the staff login check passed (AuthGate
returned <Login/> directly, no router involved, before routing to
anything). That meant /portal/* could never be reached by an
unauthenticated prospect — the staff Login page would render regardless
of URL. Fixed by moving BrowserRouter to the top of App() with a
top-level <Routes> branching /portal/* (own ProspectAuthProvider tree,
no staff auth/role/flag context at all) from /* (unchanged staff
AuthProvider -> RoleProvider -> FlagProvider -> AuthGate chain, now
just missing its own BrowserRouter since one already wraps everything).
PortalProtectedRoute gates /dashboard and /check-in on
useProspectAuth().isAuthenticated, redirecting to /portal/login.

VERIFIED against the same local Postgres instance, 35 checks across three
scripts: full registration/login/profile/check-in lifecycle (event lookup,
duplicate-email rejection on register, missing-consent rejection, profile
read/update, wrong-password rejection, check-in idempotency); the security
boundary specifically — a portal token rejected by staff validateToken(),
a staff-shaped token rejected by validatePortalToken(); check-in against
an event never registered for correctly rejected; 5-failed-attempt
lockout (401 x4, then 423, and correct password still rejected once
locked); registration-window expiry (backdated Event.createdAt + a
1-hour SystemConfig threshold correctly blocks both the event lookup and
registration, reset afterward). Full Vite build clean (1408 modules, up
from 1375) and the existing 45-test Vitest suite unaffected throughout.

NEXT: nothing queued beyond the follow-up below — this closes out the Lead
Portal work scoped back in §27/§46.

FOLLOW-UP, SAME SESSION — a real gap Mark found testing this: registration
(POST /api/portal/register) is entirely event-anchored — it only exists
at /portal/register/:qrToken. A manually-added attendee (§46's Add
Attendee — creates a Lead + EventAttendee, no LeadPortalAccount) had no
way to get portal access once no event was currently active. Re-using an
active event's registration link technically already worked (it matches
by email, doesn't require the Lead to be new) but wasn't a real fix —
nothing to reuse once every event's closed.

Fix: new POST /api/portal/activate + /portal/activate page, no qrToken
needed at all. Verifies email + dateOfBirth against an EXISTING Lead —
deliberately never creates a new one on a miss, since that would let
anyone self-register a "ghost" lead with no staff record behind it. Both
"no Lead matches at all" and "matched a Lead but the DOB is wrong" return
the exact same generic message — verified directly this session that the
two failure paths are indistinguishable, so this can't be used to
enumerate which emails exist in the system. Belt-and-braces duplicate
check by leadId as well as by email (a Lead could in principle already
have an account under a different email if it changed outside the normal
updatePortalProfile flow that keeps the two in step). Linked from
PortalLogin.jsx ("Registered by a broker or agent but don't have an
account yet?").

FLAGGED, NOT FIXED THIS SESSION: neither /register nor /activate have any
rate limiting — there's no rate-limiting infrastructure anywhere in this
backend at all, confirmed by search this session. /activate matters more
here since it's an identity-probing surface (email + DOB guessing), even
though the blast radius if guessed correctly is narrow (contact info +
appointment status, not medical/financial data, per the narrow-v1 scope).
Grouping this with the already-deferred WAF/Cloudflare Pro deployment-
phase item rather than bolting on an ineffective in-process limiter now —
real IP/account rate limiting needs the Cloudflare layer to do properly
in a serverless deployment anyway.

VERIFIED against the same local Postgres instance: 6 further checks — a
Lead seeded with no portal account (simulating Add Attendee's output),
wrong DOB rejected generically, a wholly nonexistent email rejected with
the byte-for-byte SAME error (the enumeration-resistance check), correct
email+DOB succeeds and returns a token, re-activating the same email
correctly 409s, and the newly-set password logs in immediately after.
Full Vite build clean and the existing 45-test Vitest suite unaffected.

MIGRATION ADDITIONS — on top of §47's file list above:
  api-lib/models/leadPortal.js                 (PortalActivateSchema added)
  api-lib/services/leadPortalService.js        (activatePortalAccount, getPortalAccountByLeadId added)
  api-lib/handlers/portalHandlers.js           (handlePortalActivate added)
  api/portal-router.js                         (activate route added)
  src/services/portalApi.js                    (activate added)
  src/context/ProspectAuthContext.jsx          (activateAccount added)
  src/pages/portal/PortalActivate.jsx          (NEW)
  src/pages/portal/PortalLogin.jsx             (link to /portal/activate added)
  src/App.jsx                                   (PortalActivate route added)


MIGRATION — straightforward add, no deletions:
  db/schema.postgres.sql                       (LeadPortalAccount table added)
  db/migrations/010_add_lead_portal_account.sql (NEW)
  api-lib/config.js                            (portalAuth section added)
  api-lib/models/leadPortal.js                 (NEW)
  api-lib/services/leadPortalService.js        (NEW)
  api-lib/middleware/portalAuth.js             (NEW)
  api-lib/handlers/portalHandlers.js           (NEW)
  api/portal-router.js                         (NEW)
  vercel.json
  src/services/portalAuthStore.js              (NEW)
  src/services/portalApi.js                    (NEW)
  src/context/ProspectAuthContext.jsx          (NEW)
  src/components/PortalCard.jsx                (NEW)
  src/pages/portal/PortalRegister.jsx          (NEW)
  src/pages/portal/PortalLogin.jsx             (NEW)
  src/pages/portal/PortalDashboard.jsx         (NEW)
  src/pages/portal/PortalCheckIn.jsx           (NEW)
  src/App.jsx                                   (BrowserRouter moved to top level, /portal/* branch added)
  package.json                                  (html5-qrcode added)
Plus this Status.md.

ENVIRONMENT VARIABLE NEEDED IN VERCEL BEFORE THIS WORKS IN PRODUCTION:
  PORTAL_JWT_SIGNING_SECRET — a separate base64 secret from
  JWT_SIGNING_SECRET, not reused. Generate the same way the original
  JWT_SIGNING_SECRET was (see that variable's own setup notes) — this one
  just needs to be a DIFFERENT value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
48. TWO SEPARATE QR CODES + WALK-IN ATTENDANCE — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's clarification of the intended registration/RSVP vs attendance
flow surfaced two real problems with §47's original design: (1) qrToken
was doing double duty — shared before the event for registration, but
also the SAME token would have confirmed attendance, meaning anyone who
ever received the share link could "check in" from anywhere with no
proof they were at the venue; (2) checkinProspect() rejected outright
anyone with no prior RSVP — meaning walk-ins, despite WALK-INS already
being a ticker/filter on EventDetail.jsx, had never actually been
reachable through ANY path (Add Attendee always hardcoded rsvp=TRUE too).

MARK'S EXPLICIT DESIGN DECISIONS THIS SESSION:
  - Two separate tokens, not one dual-purpose one. No cross-event RSVP
    reuse — if the same person attends a genuinely different event, that
    goes through a different email/new Lead, full stop; the "logged in,
    scan a different event's REGISTRATION link" flow proposed earlier
    this session was explicitly declined, not built.
  - Attendance QR stays a single static code for the event's duration —
    no rotation/regeneration built.
  - A walk-in (scans the attendance code, was never registered) gets a
    real attendance record with rsvp=FALSE, not rejected — and the
    landing page shows a GREEN "RSVP Attendance" banner for a real
    registrant vs a PINK "Walk-In Attendance" banner otherwise.
  - Someone with NO portal account at all scanning the attendance code
    gets a quick on-the-spot signup right there (same required fields as
    every other Lead-creation path — "quick" means fewer steps, not
    fewer fields) rather than being turned away to find staff.

SCHEMA: Event.checkinToken (NEW column, UUID UNIQUE, same
gen_random_uuid() default pattern as qrToken) — schema.postgres.sql
updated + migration 011_add_event_checkin_token.sql for the live Neon
instance. Verified the ALTER backfills a genuine unique value per
existing row (gen_random_uuid() is volatile, not a shared stored
default) — confirmed directly against both existing test events.

BACKEND:
  - eventService.js — EVENT_SELECT now also returns checkinToken (staff
    UI needs both tokens).
  - models/leadPortal.js — PortalCheckinSchema's field renamed
    qrToken -> checkinToken (breaking change to that endpoint's request
    shape, applied directly rather than versioned — nothing in
    production depends on the old shape yet). New PortalWalkInSchema —
    identical required-field set to PortalRegisterSchema, keyed by
    checkinToken instead of qrToken.
  - leadPortalService.js — new getEventForCheckin(checkinToken) (parallel
    to getEventForRegistration, separate lookup by the new column).
    checkinProspect() rewritten: an EventAttendee match still just flips
    attended/attendedAt (idempotent), but NO match now INSERTS a walk-in
    row (rsvp=FALSE, attended=TRUE, popiConsent=TRUE — inherited from
    them already being an authenticated portal user) against their
    EXISTING leadId, rather than throwing not_registered. New
    walkInCheckin(checkinToken, data, passwordHash) for the no-account
    case — calls registerProspect() for the actual Lead/
    LeadPortalAccount creation (no duplicated logic), then inserts the
    same walk-in-shaped EventAttendee row directly.
  - portalHandlers.js — handlePortalCheckin now returns
    { ok, alreadyCheckedIn, attendanceType: 'rsvp'|'walkin' } instead of
    just { ok, alreadyCheckedIn } — this is what drives the banner
    colour on the frontend. New handlePortalCheckinEventLookup (GET
    /api/portal/checkin-events/:checkinToken, public — deliberately does
    NOT apply isRegistrationWindowOpen()/qrTokenExpiryHours, since that
    config bounds the pre-event REGISTRATION window, not attendance on
    the day — already gated on status==='Active' regardless). New
    handlePortalWalkIn (POST /api/portal/walkin, public).
  - api/portal-router.js — routes added for checkin-events lookup and
    walkin; no new deployed function (both live inside the same
    portal-router.js — still 11 total, 1 of Hobby-cap headroom left).

FRONTEND:
  - New pages/portal/PortalCheckinConfirm.jsx at the NEW route
    /portal/checkin/:checkinToken — the URL the attendance QR actually
    encodes, reachable directly by a phone camera app (same pattern as
    registration) or via the in-app scanner navigating here after
    decoding a scan. Public route (not gated behind
    PortalProtectedRoute) — has to work for a walk-in with no account at
    all. Two entirely different bodies: already-authenticated ->
    auto-confirms on mount, shows the green/pink banner per
    attendanceType; not authenticated -> the on-the-spot signup form,
    same fields as PortalRegister.jsx, submits to the new walkIn() call.
  - pages/portal/PortalCheckIn.jsx (the in-app scanner) simplified to a
    thin wrapper — decodes the scan, extracts checkinToken, navigates to
    the confirm page above rather than duplicating the confirm/walk-in
    logic in two places.
  - services/portalApi.js — checkin() now sends { checkinToken } not
    { qrToken }; new getCheckinEvent() and walkIn().
  - context/ProspectAuthContext.jsx — new walkInAndLogin().
  - EventDetail.jsx (staff side) — existing button relabelled "Show
    Registration QR" (was "Show QR Code"); new "Show Attendance QR"
    button + separate modal rendering event.checkinToken as its own real
    QRCode.toDataURL() image, encoding /portal/checkin/:checkinToken.
    Deliberately NO WhatsApp/Email share buttons on this one — Download
    PNG only, with copy explicitly telling staff not to share the link,
    since sharing it would recreate the exact gap having a separate
    token was meant to close. WALK-INS ticker and the attendance-bar
    walk-in segment recoloured from violet (#8b5cf6/#7c3aed) to pink
    (#db2777) to match the new banner language.

REAL BUG CAUGHT DURING VERIFICATION, NOT A NEW ONE INTRODUCED: the first
test run's "already checked in" and "duplicate walk-in" assertions
failed — turned out to be an already-locked test account (isLocked=TRUE)
left over from an EARLIER session's lockout-threshold test that was never
reset, plus re-run contamination from re-executing the same script twice
against the same test rows. Neither was a defect in this session's code —
confirmed by resetting the lockout flag and re-running with fresh unique
data, at which point everything passed cleanly. Documenting this so it
doesn't look like a shipped bug if this file is read out of context later.

VERIFIED against the same local Postgres instance: 18 checks — the
registration qrToken correctly rejected by the checkin-event lookup (the
two token spaces really are separate, not just cosmetically renamed); a
real registrant re-scanning the attendance code is idempotent and
reports attendanceType:'rsvp'; a logged-in prospect with NO RSVP for this
specific event checks in successfully as a walk-in under their EXISTING
identity rather than being rejected, idempotent on a second scan; a
completely fresh person with no account signs up on the spot via
walkIn(), receives a token, and the resulting EventAttendee row is
confirmed directly in the database to have rsvp=false/attended=true;
re-walking-in with the same email 409s (can't create a second account);
the WALK-INS ticker aggregate reflects the new rows. Full Vite build
clean and the existing 45-test Vitest suite unaffected throughout.

NEXT: nothing queued. This closes out the registration/RSVP vs
attendance distinction Mark asked to clarify, plus the walk-in gap it
surfaced.

MIGRATION — straightforward add, no deletions:
  db/schema.postgres.sql                        (Event.checkinToken column added)
  db/migrations/011_add_event_checkin_token.sql (NEW)
  api-lib/services/eventService.js              (checkinToken added to EVENT_SELECT)
  api-lib/models/leadPortal.js                  (PortalCheckinSchema field renamed, PortalWalkInSchema added)
  api-lib/services/leadPortalService.js         (getEventForCheckin added, checkinProspect rewritten, walkInCheckin added)
  api-lib/handlers/portalHandlers.js            (handlePortalCheckin updated, handlePortalCheckinEventLookup + handlePortalWalkIn added)
  api/portal-router.js                          (new routes added)
  src/services/portalApi.js                     (checkin renamed param, getCheckinEvent + walkIn added)
  src/context/ProspectAuthContext.jsx           (walkInAndLogin added)
  src/pages/portal/PortalCheckinConfirm.jsx     (NEW)
  src/pages/portal/PortalCheckIn.jsx             (simplified to thin scanner)
  src/pages/EventDetail.jsx                      (Show Attendance QR modal added, labels/colours updated)
  src/App.jsx                                     (PortalCheckinConfirm route added)
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
49. IN-APP SCANNER "STUCK BROWSER" BUG FIXED — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Real bug Mark hit testing §48 live: after scanning the attendance QR via
the in-app scanner, the browser appeared to freeze until manually
refreshed — at which point the correct result (already saved server-side)
showed up fine. Root cause: the post-scan hand-off used React Router's
client-side navigate(), which doesn't tear down the page's JS context —
so html5-qrcode's camera stream (known to not always fully release on
some browsers, iOS Safari especially) kept running underneath the
confirmation page, which never got the chance to repaint. The check-in
itself was never broken, only the UI reflecting it.

Fix, pages/portal/PortalCheckIn.jsx only: swapped the post-scan hand-off
from navigate() to a genuine full-page navigation
(window.location.href) — the browser's own document-teardown on a real
navigation reliably releases the camera stream, rather than depending on
the library's stop() to do it. Also fixed a related issue found while
in there: stop() was being called twice (once on scan success, once
again on unmount) — a known way to put this library into a bad state —
now guarded so it only ever fires once, and capped at 800ms so a hung
stop() can't block the hand-off either. Added a "Code found — confirming
your attendance…" transitional state so the scanner view doesn't sit
silently blank during the brief window between scan and navigation.

VERIFIED: full Vite build clean, existing 45-test Vitest suite
unaffected. This is a frontend-only navigation-timing fix — no backend
logic changed, so no new Postgres verification needed beyond what §48
already covered.

MIGRATION: single file, no schema/backend change:
  src/pages/portal/PortalCheckIn.jsx
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
50. "YOUR EVENTS" ADDED TO PORTAL DASHBOARD — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's ask: surface which events a prospect has checked in for directly
on the dashboard, with the same green (RSVP)/pink (walk-in) language
already used on the check-in confirmation page — without needing to
re-scan an event's code to see it. This is a real, already-possible case,
not a hypothetical: checkinProspect() (§48) already lets an
already-authenticated Lead pick up a SECOND event's walk-in attendance
under their existing identity, so more than one EventAttendee row per
Lead already happens in practice.

  - leadPortalService.js — new getPortalEvents(leadId): every
    EventAttendee row for this Lead, joined to Event for name/date/
    university/venue, ordered most recent event first.
  - portalHandlers.js — GET /api/portal/me's response gains an `events`
    array alongside `profile` (PUT /me's response unchanged — contact-
    detail edits don't affect event history, no need to refetch it there).
  - New src/constants/portalAttendance.js — ATTENDANCE_META, the single
    source for the rsvp/walkin/registered colour+label combination, used
    by BOTH PortalCheckinConfirm.jsx (refactored to import it rather than
    keep its own local copy) and the new dashboard section — avoids the
    two drifting apart. Added a third state, 'registered' (neutral grey,
    not green or pink), for an event they've RSVP'd to but not yet
    checked into — Mark's ask specifically covered the checked-in case,
    this fills the obvious adjacent gap so the list isn't misleading for
    upcoming events.
  - PortalDashboard.jsx — new "Your Events" card, between appointment
    status and the check-in button: each event as a row with a compact
    pill (same colours as the full banner, just badge-sized for a list)
    showing rsvp / walkin / registered.

VERIFIED against the same local Postgres instance: 8 checks — a walk-in
attendee's event list correctly shows rsvp:false/attended:true for their
walk-in event; a genuine registrant's list shows rsvp:true/attended:true
for the same event under their own account — confirming the query
correctly scopes to the CALLING lead's own attendance record, not the
event's aggregate state. Full Vite build clean and the existing 45-test
Vitest suite unaffected.

Also included in this delivery: the scanner navigation fix from earlier
this turn (PortalCheckIn.jsx) — not yet applied at the time this was
written, bundled together rather than as a second separate zip.

MIGRATION — no schema change, frontend + two backend files:
  api-lib/services/leadPortalService.js   (getPortalEvents added)
  api-lib/handlers/portalHandlers.js      (events array added to GET /me)
  src/constants/portalAttendance.js       (NEW)
  src/pages/portal/PortalCheckinConfirm.jsx (refactored to use shared ATTENDANCE_META)
  src/pages/portal/PortalDashboard.jsx    (Your Events section added)
  src/pages/portal/PortalCheckIn.jsx      (scanner navigation fix, from earlier this turn)
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
51. FIVE-ITEM TESTING FEEDBACK BATCH — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's list from live testing. Confirmed one, fixed four real bugs/gaps.

1. CONFIRMED (no code change) — every path that results in an
   EventAttendee row goes through the same match-or-create-Lead logic
   (leadService.findDuplicate/createLead), enforced by
   FK_EventAttendee_Lead. No way to attend without a backing Lead.

2. NO-SHOW TIMING FIXED. EventDetail.jsx's "No-shows" ticker/filter
   previously showed the moment someone was added (rsvp=true,
   attended=false) regardless of event status — a manually-added
   attendee read as a no-show instantly. Now gated on
   event.status === 'Closed': before that, the identical underlying
   count reads "Not Checked In" in a neutral colour instead of red
   "No-shows". No schema/backend change — this was always a client-side
   derived label, not a stored value, so retroactively correct for every
   event automatically.

3. "YOUR EVENTS" CLICK-THROUGH FIXED — REAL BUG, CONFIRMED. The list
   built in §50 had no onClick at all; confirmed by reading the code, not
   guessed. leadPortalService.getPortalEvents() now also selects
   checkinToken (it wasn't being returned at all). PortalDashboard.jsx
   rows are now clickable — but ONLY when attended=true. A 'registered'
   (RSVP'd, not yet checked in) row deliberately stays static: navigating
   THAT one to /portal/checkin/:checkinToken would silently trigger a
   real check-in as a side effect of browsing the dashboard, which is a
   different bug, not a fix. Reuses PortalCheckinConfirm.jsx entirely —
   checkinProspect() is idempotent for a repeat visit, so revisiting just
   re-shows the correct banner, no new page needed.

4. AUDIT LOG NAMES ADDED. New userService.getUserDisplayNameById() —
   deliberately NOT filtered by isActive (unlike getActiveUserById) since
   this is for historical display: a deactivated user's past actions
   should still show their real name. Wired into LeadAssigned/
   LeadReassigned (leadHandlers.js) AND, since it's the identical gap,
   AppointmentBrokerAssigned/AppointmentReassigned (appointmentHandlers.js)
   too — Mark only asked about the Lead case but the fix was the same one
   line of reasoning applied twice. AuditLogList.jsx's describeEntry() now
   renders "Lead assigned to Thabo Molefe" / "Broker reassigned from X to
   Y" when the name is present, falling back to the generic action label
   for entries written before this fix (they only have the raw id stored,
   not the name — never renders "undefined").

5. BROKER DOUBLE-BOOKING PREVENTION + DATE/TIME-GATED SEARCH. Confirmed
   the bug exactly as described: "Find available brokers"' disabled
   condition only checked region+products, and findMatchingBrokers()
   never accepted date/time as parameters at all — there was no way for
   it to have checked for conflicts, this wasn't a partial implementation
   that broke, it was never built.
     - New appointmentService.hasBrokerConflict(brokerId, date, time,
       excludeAppointmentId?) — true if that broker already has ANOTHER
       Appointment at the exact date+time, checked regardless of that
       other appointment's status (even a Closed one represents a real
       slot that broker was in a meeting for).
     - Wired into createAppointment() (409 on conflict) AND
       reassignAppointment() (409 if the NEW broker conflicts with the
       appointment's EXISTING date/time — reassignment doesn't change
       date/time, so checks the new broker against the current slot,
       excluding the appointment being modified itself).
     - brokerMatchingService.findMatchingBrokers() — date/time are now
       REQUIRED parameters (400 if missing), and the eligibility query
       gained a NOT EXISTS clause excluding any broker already booked at
       that exact date+time — showing an already-conflicting broker as a
       "match" would be actively wrong, not just an unhelpful ranking.
       BrokerMatchingQuerySchema (models/appointment.js) updated to match.
     - LeadDetail.jsx's Book Appointment modal: Date/Time fields moved
       ABOVE the "Find available brokers" button (were below it,
       alongside Address). Button's disabled condition now includes
       !date || !time. Changing date or time after an initial search
       invalidates it (setSearched(false), same pattern already used for
       region changes) rather than leaving stale results on screen.
       handleFindBrokers() now sends date/time to the search.

VERIFIED against a fresh local Postgres instance (new database, full
schema.postgres.sql applied clean, confirmed Portfolio/Product ARE
seeded by the schema itself — Region is not, seeded manually for this
test): 12 checks — findMatchingBrokers rejects a call with no date/time;
both test brokers returned before any booking; booking broker A at a
slot succeeds; booking broker A again at the SAME slot for a different
lead correctly 409s; booking broker B (different broker, same slot)
succeeds; a subsequent search for that exact slot returns zero brokers
(both now taken); a search for a DIFFERENT time still returns both;
reassigning broker B's appointment onto broker A is correctly rejected
(A already holds that slot); hasBrokerConflict correctly excludes the
appointment being checked against itself and correctly finds the
conflict when not excluded; audit log entry for a reassignment stores
and returns the resolved agent name; getPortalEvents returns a real
checkinToken. Full Vite build clean and the existing 45-test Vitest
suite unaffected throughout.

MIGRATION — no schema change, all logic:
  src/pages/EventDetail.jsx                (no-show status-gated)
  api-lib/services/leadPortalService.js     (checkinToken added to getPortalEvents)
  src/pages/portal/PortalDashboard.jsx      (rows clickable when attended)
  api-lib/services/userService.js           (getUserDisplayNameById added)
  api-lib/handlers/leadHandlers.js          (agent names in audit log)
  api-lib/handlers/appointmentHandlers.js   (broker/agent names in audit log)
  src/components/AuditLogList.jsx           (renders resolved names, safe fallback)
  api-lib/services/appointmentService.js    (hasBrokerConflict added + wired in)
  api-lib/services/brokerMatchingService.js (date/time required, conflict exclusion)
  api-lib/models/appointment.js             (BrokerMatchingQuerySchema requires date/time)
  src/pages/LeadDetail.jsx                  (modal reordered, button gated, search invalidation)
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
52. TWO MINOR FIXES — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PORTAL REGISTRATION — LOGIN PROMPT MOVED TO TOP. "Already registered?
   Log in" was at the bottom of PortalRegister.jsx, below the entire
   registration form — someone who'd already registered had to scroll
   past every field before finding out they didn't need to. Moved to
   directly under the event title/subtitle, before the form starts.

2. DELETE ATTENDEE, EVENT DOMAIN. New capability, same soft-delete
   convention as everything else in this app (deletedAt, not a hard
   DELETE) — removing an attendee from THIS event's list does NOT touch
   their underlying Lead record, which may have other associations
   (assigned to an agent, other events, a portal account). Confirmed
   directly in testing that the Lead's own deletedAt stays NULL after
   removing them from the event.
     - eventService.deleteAttendee(eventId, attendeeId) — soft-deletes
       the EventAttendee row. Already excluded everywhere via the
       existing `deletedAt IS NULL` filters (listEventAttendees,
       getEventById's aggregate counts, getPortalEvents) — no extra
       bookkeeping needed, a deleted row just stops appearing everywhere
       at once.
     - New DELETE /api/events/:id/attendees/:attendeeId
       (handleEventAttendeeDelete, Admin/Supervisor/GlobalAdmin only,
       same MANAGE_ROLES gate as Add Attendee/status changes). Writes
       AttendeeRemoved to AuditLog. events-router.js gained a 3-segment
       route case (distinct from the existing 2-segment POST /attendees
       for adding, and the 4-segment PUT .../attendance for toggling).
     - EventDetail.jsx's attendee table gained a "Remove" column
       (Admin/Supervisor/GlobalAdmin only), red-styled to signal it's
       destructive, gated behind a window.confirm() that explicitly says
       this doesn't delete their Lead record — no custom confirm-modal
       component exists anywhere in this codebase yet, so a native
       confirm is the right-sized choice here rather than building one
       for a single-row action.

VERIFIED against a fresh local Postgres instance: 7 checks — attendee
visible before delete; Agent role correctly rejected (403); Admin delete
succeeds; attendee gone from both the attendee list AND the event's
rsvpCount aggregate immediately after; re-deleting an already-removed
attendee correctly 404s (not a silent no-op); the underlying Lead
record's own deletedAt confirmed still NULL. Full Vite build clean and
the existing 45-test Vitest suite unaffected.

MIGRATION — no schema change:
  src/pages/portal/PortalRegister.jsx   (login prompt relocated)
  api-lib/services/eventService.js      (deleteAttendee added)
  api-lib/handlers/eventHandlers.js     (handleEventAttendeeDelete added)
  api/events-router.js                  (delete route added)
  src/services/api.js                   (eventsApi.deleteAttendee added)
  src/pages/EventDetail.jsx             (Remove column + confirm added)
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
53. LOGIN PROMPT MOVED TO TOP ON THE CHECK-IN LANDING PAGE TOO — 24 Jul 2026 (session 13, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Same fix as §52's PortalRegister.jsx change, applied to the walk-in signup
section of PortalCheckinConfirm.jsx (the unauthenticated path on the
attendance landing page, /portal/checkin/:checkinToken) — "Already have
an account? Log in, then scan again." was below the entire walk-in form,
now sits right under the subtitle, before the form starts. Pure UI
reordering, no logic touched — confirmed via diff against GitHub that
this is the only change. Build clean, existing 45-test suite unaffected;
no Postgres verification needed for a text-position change.

MIGRATION — single file:
  src/pages/portal/PortalCheckinConfirm.jsx
Plus this Status.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
54. APPOINTMENT HISTORY ON LEAD DETAIL — 28 Jul 2026 (session 14)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked directly: is there a way to show all Appointments linked to a
specific Lead — surfacing the one-to-many Lead:Appointment relationship
established back in §35? There wasn't. leadService.getLeadById() only
ever resolves the single MOST RECENT appointment (LATERAL join, built for
the conversion banner's lock/reopen logic), and listAppointments() had no
leadId filter at all — no route existed to ask for "every appointment for
this lead." Worse than just a missing feature: the only visible link to
appointment history on LeadDetail — the conversion banner's "View in
Appointments" button — disappears entirely once isConverted goes false,
which happens on Reopen. So a lead that had a Closed Lost appointment,
got reopened, and is now back InProgress shows NO trace of that earlier
appointment anywhere on the page, even though the row still exists in the
database exactly as §35 intended it to (preserved, not deleted).

Built:
  - listAppointments() (api-lib/services/appointmentService.js) gained a
    leadId filter, ANDed into the WHERE clause the same way every other
    filter here is — composes correctly with the existing Agent/Broker/
    Supervisor role-scoping (an Agent viewing a lead's history still only
    sees appointments that are also theirs under the existing scoping,
    a Supervisor still scoped to direct reports, etc. — no new scoping
    logic needed, the existing filters just stack).
  - AppointmentListQuerySchema (api-lib/models/appointment.js) —
    leadId: z.string().uuid().optional() added.
  - Fixed appointmentService.js's header comment, which still described
    Appointment as "1:1 child of Lead (UNIQUE leadId)" — stale since §35
    dropped that constraint over a month ago. Now documents the real
    one-to-many relationship and points to this card as where the full
    set is surfaced.
  - LeadDetail.jsx: new "Appointment History" card, fetched via
    appointmentsApi.list({ leadId: id, pageSize: 50 }) and sorted
    client-side by createdAt descending (most recent booking first).
    Deliberately NOT gated on isConverted, unlike the conversion banner —
    this card stays visible whether the lead is currently converted,
    reopened, or closed, which is the whole point. Each row shows a status
    chip (APPT_STATUS_META, imported from styles/tokens.js — first use of
    that export in this file; LeadDetail previously had its own separate
    STATUS_COLOURS for Lead statuses only), portfolio(s), broker name, and
    date; row-click navigates to /appointments/:id, matching the existing
    row-click pattern already used on AppointmentList.jsx (§38).
  - Card placed between Call History and Audit Log in the existing
    two-column grid — no layout restructuring elsewhere on the page.

NOT changed: leadService.getLeadById()'s single-most-recent resolution is
untouched and still correct for its own purpose — the conversion banner
needs exactly one appointment's status to reason about the lock/reopen
gate. This is a second, independent path to the full set, not a
replacement for the first.

Also corrected this file's own §0 NEXT ACTION block, which had gone stale
across sessions 12-13 (see §0 for detail) — flagged to Mark at the start
of this session before any build work started.

VERIFIED: full Vite production build clean (1,411 modules, zero errors);
existing 45-test Vitest suite unaffected (45 passed, 0 failed); both
edited api-lib files pass node --check and an ESM import smoke test
(appointmentService.js requires DATABASE_URL at import time as always —
confirmed clean with a dummy value; no live DB connection available in
this sandbox, same limitation as every prior session — this was a query/
schema change verified by inspection and by the existing test suite, not
by a live Postgres run).

MIGRATION — no schema change, query filter + one UI card only:
  frontend/api-lib/models/appointment.js        (leadId added to AppointmentListQuerySchema)
  frontend/api-lib/services/appointmentService.js  (leadId filter in listAppointments; header comment fixed)
  frontend/src/pages/LeadDetail.jsx             (Appointment History card; APPT_STATUS_META import; appointmentHistory fetch)
Plus this Status.md.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
55. SETTINGS WIRED TO A REAL SELF-SERVICE BACKEND — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked to pick up Settings next, expecting it to be relatively simple.
It wasn't quite — every preference on that page (theme, display name,
avatar colour, timezone) was sessionStorage-only, and BOTH ThemeContext.jsx
and Settings.jsx already carried their own "when a Users API exists, wire
this up" comments. The Users API existing (§23) wasn't enough on its own:
PUT /api/users/:id is Admin/GlobalAdmin-only, for editing SOMEONE ELSE —
there was no route an ordinary user could call to edit themselves, and the
User table had no columns for these preferences at all. Flagged this to
Mark before building rather than quietly narrowing scope to whatever the
existing route happened to support.

Built:

BACKEND
  - Migration 012_add_user_profile_prefs.sql — adds themePreference,
    avatarColour, timezone to "User" (VARCHAR ids — 'linen'/'grad'/etc. —
    not raw CSS, matching how Portfolio/Product names travel elsewhere).
    Mirrored into schema.postgres.sql for fresh databases.
  - UpdateOwnProfileSchema (models/user.js) — deliberately a SEPARATE
    schema from UpdateUserSchema, not a permissive subset of it. Only
    displayName/avatarColour/themePreference/timezone are acceptable —
    no role, isActive, or portfolios reachable through it at all, so a
    self-edit can never smuggle in a privilege change even by accident.
  - getOwnProfile() / updateOwnProfile() (userService.js) — a lighter,
    separate pair from getUserForAdmin()/updateUserFull() (no supervisor/
    portfolio/product joins Settings doesn't need).
  - handleUserMe (userHandlers.js) — GET + PUT /api/users/me. Deliberately
    NO requireRole() gate (every authenticated role reaches it), which is
    safe specifically because it's hard-keyed to claims.oid server-side,
    never to an id from the request — there's no way to reach any row but
    your own through this handler no matter what's sent.
  - users-router.js — routes 'me' ahead of the UUID branch (a real user id
    is never the literal string "me").
  - authHandlers.js's login response now carries avatarColour/
    themePreference/timezone on the user object — no extra round trip
    needed on login to have these available.
  - getUserByEmailForLogin() SELECT extended to match.

FRONTEND
  - authStore.updateUser(patch) — merges a partial update into the cached
    session user (and re-persists) without a full re-login.
  - AuthContext exposes updateUser; also now consumes useTheme() (safe —
    AuthProvider is a descendant of ThemeProvider in App.jsx's tree) so
    login() applies the user's saved themePreference immediately on a
    fresh login/new tab. A same-tab refresh was already covered without
    this, by ThemeContext's own sessionStorage persistence.
  - ThemeContext exports THEME_IDS so callers (AuthContext) can validate
    an incoming theme id before applying it, rather than trusting it blind.
  - RoleContext's demo-mode persona gains email and avatarColour (both
    already on the real user object) — persona is the existing one-stop
    place this file adapts "user" into for the rest of the app to consume.
  - NEW constants/avatarOptions.js — AVATAR_OPTIONS + avatarColourValue(id)
    moved out of Settings.jsx (which had them as a local-only const) so
    App.jsx's sidebar avatar bubble can use the same id -> CSS lookup.
  - App.jsx's sidebar avatar bubble now actually reflects the chosen
    colour — it previously hardcoded the gradient unconditionally, a
    pre-existing gap (not introduced this session) where the avatar
    picker had no visible effect anywhere outside Settings' own preview
    bubble even before this backend existed.
  - Settings.jsx rewired: initial values come straight off useAuth().user
    in demo mode (already loaded at login, no extra fetch); Save PUTs
    displayName/avatarColour/timezone via usersApi.updateMe() then calls
    updateUser() so the sidebar/persona reflect the change immediately;
    theme swatch clicks keep applying instantly (unchanged UX) and now
    also persist immediately in demo mode, fire-and-forget, matching that
    same "instant" semantic rather than waiting on the Save button; email
    field shows the real address in demo mode (still disabled — editing
    email isn't built, matches the admin side per §23); avatar photo
    upload is now an explicit disabled stub ("coming soon") rather than a
    clickable no-op.
  - The non-demo (Entra) branch is UNCHANGED, still sessionStorage-only —
    not because no backend exists for it (api.js's header notes preview/
    mock mode was removed entirely 22 Jul; the same frontend/api/ backend
    answers both auth modes), but because RoleContext's Entra branch
    doesn't yet derive a real identity from decoded MSAL claims (its own
    header still flags that as not wired) — there is no real user id to
    save a profile against there yet. Collapses to the same real-backend
    path automatically once that lands.

DELIBERATELY NOT BUILT: real avatar photo upload (file/blob storage is a
separate, larger piece of scope — flagged to Mark up front, not silently
descoped).

VERIFIED: full Vite production build clean (1,412 modules, zero errors);
existing 45-test Vitest suite unaffected; every edited/new backend file
(models/user.js, services/userService.js, handlers/userHandlers.js,
handlers/authHandlers.js, api/users-router.js) passes node --check and an
ESM import smoke test (userService.js/userHandlers.js/authHandlers.js
require DATABASE_URL + JWT_SIGNING_SECRET at import time as always —
confirmed clean with dummy values; no live DB connection available in this
sandbox, same limitation as every prior session — this was verified by
inspection and the existing test suite, not a live Postgres run).

MIGRATION:
  frontend/db/migrations/012_add_user_profile_prefs.sql (NEW)
  frontend/db/schema.postgres.sql               (User table columns added)
  frontend/api-lib/models/user.js               (UpdateOwnProfileSchema added)
  frontend/api-lib/services/userService.js      (getOwnProfile/updateOwnProfile added; login SELECT extended)
  frontend/api-lib/handlers/userHandlers.js     (handleUserMe added)
  frontend/api-lib/handlers/authHandlers.js     (login response extended)
  frontend/api/users-router.js                  (me route added)
  frontend/src/services/api.js                  (usersApi.updateMe added)
  frontend/src/services/authStore.js            (updateUser added)
  frontend/src/context/AuthContext.jsx          (updateUser exposed; theme sync on login)
  frontend/src/context/RoleContext.jsx          (persona.email/avatarColour added)
  frontend/src/context/ThemeContext.jsx         (THEME_IDS exported)
  frontend/src/constants/avatarOptions.js       (NEW)
  frontend/src/App.jsx                          (sidebar avatar bubble wired)
  frontend/src/pages/Settings.jsx               (real wiring)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
57. TASK BACKEND BUILT — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked which of Tasks or Notifications to tackle first. Recommended
Tasks: its generation model is fully spec'd in Tasks.jsx's own header
comment (five precise, entirely event-driven trigger rules hooking into
service methods already built and understood), whereas Notifications'
full scope — three of its six trigger types are time-based (appointment/
callback reminders, lead auto-return) — would need Vercel Cron, which
doesn't exist anywhere in this stack yet. Mark agreed; scoped Notifications
down to a smaller first pass (two synchronous types only) for a later
session.

SCHEMA GAPS FOUND (not guessed — read Tasks.jsx's own spec and MOCK_TASKS
shape before touching the database):
  - Task had no `priority` column at all, despite MOCK_TASKS and the whole
    UI depending on High/Medium/Low throughout.
  - Task.entityType/entityId were NOT NULL and Task.type's CHECK only
    allowed the five system-generated values — meaning a manually created
    task (NewTaskModal's default category, no linked Lead/Appointment)
    could never actually have been inserted under the original schema.
  Migration 013_add_task_priority_and_manual_type.sql fixes both: adds
  priority, makes entityType/entityId nullable, adds 'Manual' as a sixth
  type value. schema.postgres.sql updated to match for fresh databases.

BUILT — full REST API (api-lib/models/task.js, services/taskService.js,
handlers/taskHandlers.js, api/tasks-router.js, vercel.json rewrite):
  GET/POST /api/tasks, PATCH/DELETE /api/tasks/:id. Role-scoping mirrors
  the established Leads/Appointments pattern exactly rather than
  re-deriving it: Agent/Broker (non-admin) see only their own tasks;
  Supervisor-only sees self + direct reports; Admin/GlobalAdmin see
  everything. isComplete is the one field the assignee themselves can
  touch (ticking off your own task); every other field (reassign, edit)
  is Admin/Supervisor/GlobalAdmin only, matching what Tasks.jsx's UI
  already gated. DELETE is Admin/GlobalAdmin only per the file's own
  header spec. taskService's TASK_SELECT resolves Task's polymorphic
  entityType/entityId (Lead OR Appointment OR neither) via two
  mutually-exclusive LEFT JOINs plus a third hop from Appointment to its
  own Lead, so a task linked to an Appointment still surfaces the
  underlying Lead's name for display, not just Callback-category tasks.
  taskHandlers.js's shapeTask() translates DB rows into exactly the field
  names/shape Tasks.jsx's own MOCK_TASKS already established (category
  not type, done not isComplete, assembled linkedLead display name) so the
  frontend's existing contract needed no renaming to match.

TASK GENERATION — all five rules from Tasks.jsx's own header spec, wired
into their real trigger points, not stubbed:
  1. CallbackRequested outcome -> Callback task, assigned to the same
     agent (leadService.logCallAttempt).
  2 & 5. Appointment booked with a broker -> Confirm-appointment task
     (assigned to the agent) / booked without one -> Assign-broker task
     (assigned to the agent's Supervisor, falling back to the agent
     themselves if they have no supervisorId set — Task.assignedToId is
     NOT NULL, never left orphaned). Both hang off the SAME booking
     touchpoint in appointmentService.createAppointment() — mutually
     exclusive outcomes of the brokerId-present-or-absent branch that
     already decided the Appointment's status, not two separate call sites.
  3 & 4. Meeting marked Rescheduled -> Reschedule task / marked Seen ->
     Outcome task, both in appointmentService.saveOutcome(), assigned to
     the broker. Gated on a genuine TRANSITION into that status (compared
     against the meeting's previous status, fetched before the update) —
     re-saving an already-Rescheduled meeting does not spawn a fresh task
     every time.

FRONTEND (Tasks.jsx): rewired to the real backend in demo mode — real
fetch (role-scoping already happened server-side, so no redundant
client-side "is this mine" filtering the way the Entra branch's roleName
mechanism still needs), real create/toggle via tasksApi, real users
populate the Assignee filter and NewTaskModal's Assign-to field (id-based,
not name-based). The Entra branch's MOCK_TASKS interactivity is
deliberately UNCHANGED — its own local state, own checkbox/create
behaviour, exactly as before this session (RoleContext doesn't yet derive
a real identity there — see its header comment).

BUG CAUGHT IN PASSING: MOCK_TASKS' relative-date badges (Overdue/Due
today/etc.) were computed against a hardcoded fixed "today" of 20 May
2026. Left as a module-level constant, every REAL task fetched from the
live database (dated July 2026 onward) would have shown wildly wrong
Overdue badges the moment this went live. daysUntil()/dueMeta() now take
an explicit reference date instead — real current date in demo mode,
the fixed mock date (renamed MOCK_TODAY) only for the Entra branch's
curated MOCK_TASKS dataset.

DEPLOYMENT NOTE: tasks.enabled defaults to '0' (off) in feature-flags.
postgres.sql — Mark needs to toggle it on in FeatureFlags.jsx (AppAdmin)
to see the Tasks nav item / route at all. Not flipped automatically by
this delivery — flag state lives in the database, this is a code delivery.

VERIFIED: full Vite production build clean (1,412 modules, zero errors);
existing 45-test Vitest suite unaffected; every new/edited backend file
(models/task.js, services/taskService.js, handlers/taskHandlers.js,
api/tasks-router.js, services/leadService.js, services/appointmentService.js)
passes node --check and an ESM import smoke test (services requiring
DATABASE_URL/JWT_SIGNING_SECRET at import time as always — confirmed clean
with dummy values; no live DB connection available in this sandbox, same
limitation as every prior session — the five generation rules were
verified by inspection and against the existing test suite, not a live
Postgres run).

NOT YET BUILT (deliberately deferred, not silently dropped): a manual
task cannot currently be deleted from the UI (DELETE /api/tasks/:id exists
server-side per the header spec, but Tasks.jsx has no delete button/action
wired to it — no such control existed in the original mock UI either).

MIGRATION:
  frontend/db/migrations/013_add_task_priority_and_manual_type.sql (NEW)
  frontend/db/schema.postgres.sql                (Task table updated)
  frontend/api-lib/models/task.js                (NEW)
  frontend/api-lib/services/taskService.js       (NEW)
  frontend/api-lib/handlers/taskHandlers.js      (NEW)
  frontend/api/tasks-router.js                   (NEW)
  frontend/vercel.json                           (tasks-router rewrite registered)
  frontend/api-lib/services/leadService.js       (Callback task trigger)
  frontend/api-lib/services/appointmentService.js (Confirm/Assign-broker + Reschedule/Outcome triggers)
  frontend/src/services/api.js                   (tasksApi added)
  frontend/src/pages/Tasks.jsx                   (real wiring)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
58. MANUAL TASK DELETION + CASCADE CLEANUP — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked two things: (1) can manually created tasks be deleted, and
(2) is there anything that cleans up a task when its Lead or Appointment
gets reassigned or deleted. Honest answer to (2) was no — §56/§57 built
the five generation rules but nothing kept a task in sync with its entity
afterwards. Both built this pass.

PART 1 — MANUAL TASK DELETION:
  DELETE /api/tasks/:id already existed (§56, per Tasks.jsx's own header
  spec) but nothing in the UI called it. Added:
  - A "Delete task" control in TaskRow's expanded panel — visible only to
    Admin/GlobalAdmin (canDelete, narrower than isAdmin which also
    includes Supervisor — matches the API's own gate) AND only for
    task.source === 'manual'.
  - window.confirm() guard, matching the existing precedent already set
    in EventDetail.jsx for this class of lower-stakes destructive action,
    rather than introducing a new confirm-modal pattern for a to-do item.
  - Server-side restriction added on top of the existing role gate:
    taskHandlers.js now rejects (400) an attempt to DELETE a
    system-generated task (Callback/Appointment/Reschedule/Outcome),
    regardless of role. Deleting a task that represents a real pending
    business action would make it vanish with no record; those should be
    completed or reassigned (or cleaned up by Part 2 below), not deleted
    by hand. Enforced server-side, not just hidden in the UI — an Admin
    hitting the API directly gets the same rejection.

PART 2 — CASCADE CLEANUP (nothing existed before this):
  Two new generic helpers in taskService.js, used by both Lead and
  Appointment entity types rather than one bespoke function per call site:
    reassignTasksForEntity({entityType, entityId, oldAssigneeId, newAssigneeId})
      — moves every INCOMPLETE task currently assigned to the old owner
      onto the new one. The task's need is still real, it just needs a
      new owner.
    deleteTasksForEntity({entityType, entityId})
      — hard-deletes every INCOMPLETE task for that entity. Used when the
      need has genuinely evaporated, not just changed hands.
  Both leave COMPLETED tasks alone in every case — those are just history,
  untouched regardless of what happens to their entity afterwards.

  Wired into all four places an owner change or removal actually happens:
  - leadService.deleteLead() — Lead soft-deleted (POPIA erasure) ->
    deleteTasksForEntity('Lead', leadId). Nobody needs calling back a
    lead that's gone.
  - leadService.assignLead() — Lead reassigned to a new agent -> fetches
    the OLD assignedAgentId first (wasn't fetched at all before this),
    then reassignTasksForEntity('Lead', leadId, oldAgentId, newAgentId).
  - appointmentService.reassignAppointment() — broker and/or agent
    changed -> reassignTasksForEntity('Appointment', id, ...) for
    whichever field actually changed (a Reschedule/Outcome task follows
    a new broker; a Confirm-appointment task follows a new agent). The
    function's existing narrow date/time-only lookup was widened into one
    upfront query also carrying the OLD brokerId/agentId, reused for both
    the pre-existing broker-conflict check and this. Deliberately only
    fires when the field is being SET to a real person, not cleared —
    reassign() clearing a broker back to null is a rarer edge left alone
    rather than guessed at.
  - appointmentService.returnToLeads() — the appointment locks
    (ReturnedToLeads) and the Lead loses its agent (assignedAgentId
    cleared) -> deleteTasksForEntity for BOTH the Appointment (nothing
    left to confirm/reschedule/record) AND the Lead (nobody currently
    owns it to act on a callback either). Deleted, not reassigned — unlike
    a reassignment, there's no new owner to hand these off to.

  NOT touched: reopenLead() — doesn't change assignedAgentId at all (same
  agent throughout), so there's no stale ownership to clean up there.

VERIFIED: full Vite production build clean (1,412 modules → now includes
the delete control, zero errors); existing 45-test Vitest suite
unaffected; every edited backend file (services/taskService.js,
services/leadService.js, services/appointmentService.js,
handlers/taskHandlers.js) passes node --check and an ESM import smoke test
(same DATABASE_URL/JWT_SIGNING_SECRET dummy-value pattern as every prior
session — no live DB connection available in this sandbox; the cascade
logic was verified by inspection and against the existing test suite, not
a live Postgres run).

MIGRATION — logic only, no schema change:
  frontend/api-lib/services/taskService.js        (reassignTasksForEntity/deleteTasksForEntity added)
  frontend/api-lib/services/leadService.js        (deleteLead/assignLead cleanup)
  frontend/api-lib/services/appointmentService.js (reassignAppointment/returnToLeads cleanup)
  frontend/api-lib/handlers/taskHandlers.js       (DELETE restricted to Manual type)
  frontend/src/pages/Tasks.jsx                    (delete control wired up)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
59. TASK DUE-DATE BUG — "OVERDUE 9129D" — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark caught this in testing within minutes of the §58 delivery: created
two manual tasks due 31 Jul 2026 (3 days out), both showed "Overdue
9129d". Root-caused, not guessed — reproduced the exact number in the
sandbox before touching any code (see below).

CAUSE: taskHandlers.js's shapeTask() (§56) formatted dueDate/createdAt via
String(row.dueAt).slice(0, 10). pg returns TIMESTAMPTZ columns as native
JS Date objects, not strings — String(dateObj) calls .toString(), which
reads "Fri Jul 31 2026 00:00:00 GMT+0000 (...)". Slicing the first 10
characters gives "Fri Jul 31" — no year. Tasks.jsx then does
new Date("Fri Jul 31") to compute the overdue badge, and V8 silently
defaults a year-less date string to 2001. 31 Jul 2026 vs 31 Jul 2001 is
~9,129 days — exactly the number on screen. Confirmed by reproducing the
whole chain in the sandbox with node -e before writing the fix, not
assumed from the symptom alone.

FIX: shapeTask() now uses a small toDateOnly() helper —
value.toISOString().slice(0, 10) when it's a Date object, falling back to
new Date(value) for defensiveness. Matches the pattern leadHandlers.js's
dateOfBirth handling already used correctly — checked the rest of the
codebase for the same anti-pattern (grep for String(...).slice(0, *10))
before treating this as isolated: it was. dateFormat.js's formatDate() and
LeadDetail.jsx's dateOfBirth slicing look similar but are frontend code
operating on values already received via a JSON API response — safe,
since JSON.stringify() already calls .toISOString() on any Date object
crossing that boundary. Only backend code stringifying a raw pg result
directly, before JSON serialization, can hit this. Documented as a new
CRITICAL IMPLEMENTATION RULE in Project_Context.md §8 so it doesn't
recur in a future list/detail endpoint.

VERIFIED: reproduced the exact bug and confirmed the fix with a standalone
node script before and after (3 days, not 9129, on the same input); full
Vite build clean; existing 45-test Vitest suite unaffected; taskHandlers.js
passes node --check and an ESM import smoke test.

MIGRATION — one file, logic only:
  frontend/api-lib/handlers/taskHandlers.js (shapeTask() date fix)
Plus this Status.md and Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
60. TASKS SIDEBAR BADGE — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked whether Tasks shows a count indicator like Notifications does.
Checked before answering rather than assumed: no, it didn't — and worth
knowing, Notifications' "4" badge isn't real either, it's a hardcoded
useState(4) in App.jsx matching MOCK_NOTIFICATIONS. Tasks now has a real
one, since it has a real backend behind it and Notifications doesn't.

BUILT: AppLayout (App.jsx) fetches the current user's own incomplete task
count — tasksApi.list({ assignedToId: persona.id }), filtered to !done —
and shows it as a badge on the Tasks nav item, same NavItem badge prop
Notifications already uses. Deliberately scoped to assignedToId = self,
not the role-scoped list GET /api/tasks otherwise returns for a
Supervisor/Admin (self + reports, or everyone) — the badge means "tasks
assigned to YOU", not "tasks you can see".

Skipped entirely (no fetch at all) when tasks.enabled is off or there's
no real backend to ask (Entra branch) — badge stays absent rather than
showing a fake number the way Notifications does.

REFRESH STRATEGY: refetched on every route change (useLocation().pathname
as a useFetch dependency), not just once on mount. Deliberate trade-off,
noted plainly rather than silently chosen: this means one extra small GET
per navigation anywhere in the app, not just when leaving Tasks — but the
query is cheap (IX_Task_AssignedTo is indexed on assignedToId, and a
person's own task count is personal-scale, not the row counts Leads/
Appointments can reach), and there's no polling/websocket infrastructure
in this app to do it more precisely. Good enough for a sidebar badge; a
completed task's count updates the moment you navigate away from Tasks.

VERIFIED: full Vite production build clean (1,412 modules, zero errors,
confirmed no duplicate imports); existing 45-test Vitest suite unaffected.

MIGRATION — one file, logic only:
  frontend/src/App.jsx (Tasks badge added)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
61. NOTIFICATIONS BACKEND (NARROWED SCOPE) — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Confirmed direction from the Tasks-vs-Notifications conversation: build
the two synchronous, action-driven notification types now (LeadAssigned,
AppointmentAssigned); park the three time-based types (AppointmentReminder,
CallbackReminder, LeadAutoReturned) until the Vercel Cron question is
solved — no scheduled-job infrastructure exists anywhere in this stack.

NO MIGRATION NEEDED: unlike Task (§56, which needed a real schema fix),
the Notification table was already correctly designed — entityType/
entityId already nullable, no restrictive CHECK on type. Checked before
assuming; genuinely nothing to fix here.

BUILT — full REST API (api-lib/models/notification.js,
services/notificationService.js, handlers/notificationHandlers.js,
api/notifications-router.js, vercel.json rewrite):
  GET /api/notifications, PATCH /api/notifications/mark-all-read,
  PATCH /api/notifications/:id. Deliberately simpler than Task's API —
  every route is always self-scoped (recipientId = the caller, full
  stop), so there's no Agent/Broker/Supervisor/Admin role-scoping the way
  Task needed, and no audit log writes — marking a notification read/
  unread is UI bookkeeping, not a business-state change to a Lead/
  Appointment/User the way the A4 audit gate is concerned with.
  getNotificationById() is scoped to recipientId, not just id, so a user
  gets 404 (not 403) trying to touch someone else's notification — doesn't
  even reveal it exists for someone else.

TRIGGERS — deliberately live in two different layers, not arbitrarily:
  - AppointmentAssigned (appointmentService.assignBroker()): needs no
    performer identity — MOCK_NOTIFICATIONS' own wording for this type
    ("You have been assigned as broker...") never names who assigned it —
    so it's entirely self-contained inside the service function, same
    layer Task's generation rules already live in.
  - LeadAssigned (leadHandlers.js's assign handler, not
    leadService.assignLead()): MOCK_NOTIFICATIONS' wording for this type
    DOES name the performer ("Admin User assigned this lead to you"),
    and that identity (claims.oid) is only naturally available at the
    handler layer, which already fetches display names for its own audit
    log entry — reused rather than threading a new parameter into
    assignLead()'s signature.
  Small helper added to appointmentService.js: shortDateLabel() for the
  "21 May" style date in the AppointmentAssigned body — deliberately NOT
  String(dateValue), which was exactly the §59 bug (a raw pg Date
  object's .toString() has no year). No downstream re-parsing happens
  here — this is plain display text — but used .getUTCDate()/
  .getUTCMonth() anyway rather than risk the same landmine twice.

FRONTEND (Notifications.jsx): rewired to the real backend in demo mode —
real fetch, real mark-read/mark-all-read via notificationsApi, "time ago"
labels computed with formatDistanceToNow (date-fns, already used the same
way in LeadList.jsx/LeadDetail.jsx — not a new dependency or pattern).
The Entra branch's MOCK_NOTIFICATIONS interactivity is UNCHANGED, own
local state, covering all six types so the UI/UX can still be
demonstrated end-to-end even though only two are wired for real.

BUG CAUGHT IN PASSING: the unread-row background was a hardcoded
rgba(239,246,255,0.3) — a light-mode-only blue tint that never adapted to
Terra/Midnight/Ember, a real violation of the INLINE COLOUR ANTI-PATTERN
rule (Project_Context.md §8). Fixed to a themed color-mix(), matching
every other tinted surface in this app.

SIDEBAR BADGE PARITY (App.jsx): the Notifications sidebar badge was a
hardcoded useState(4) (§0/pre-existing) — leaving it fake while the
Notifications page itself now shows real data would read as MORE broken
than before, not less, so wired it to real data in demo mode too, exactly
mirroring the Tasks badge pattern from §60 (same route-change refetch
trade-off, same reasoning, applied consistently rather than leaving one
real and one fake). Entra branch unchanged — still the fixed mock value.

VERIFIED: full Vite production build clean (1,412 modules, zero errors);
existing 45-test Vitest suite unaffected; every new/edited backend file
(models/notification.js, services/notificationService.js,
handlers/notificationHandlers.js, api/notifications-router.js,
services/appointmentService.js, handlers/leadHandlers.js) passes
node --check and an ESM import smoke test (services requiring
DATABASE_URL/JWT_SIGNING_SECRET at import time as always — confirmed
clean with dummy values; no live DB connection available in this sandbox,
same limitation as every prior session).

MIGRATION — no schema change:
  frontend/api-lib/models/notification.js       (NEW)
  frontend/api-lib/services/notificationService.js (NEW)
  frontend/api-lib/handlers/notificationHandlers.js (NEW)
  frontend/api/notifications-router.js          (NEW)
  frontend/vercel.json                          (notifications-router rewrite registered)
  frontend/api-lib/services/appointmentService.js (AppointmentAssigned trigger)
  frontend/api-lib/handlers/leadHandlers.js     (LeadAssigned trigger)
  frontend/src/services/api.js                  (notificationsApi added)
  frontend/src/pages/Notifications.jsx          (real wiring + dark-theme fix)
  frontend/src/App.jsx                          (sidebar badge parity)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
62. VERCEL DEPLOY FAILED — 13 SERVERLESS FUNCTIONS, HOBBY LIMIT IS 12 — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's deployment failed: "No more than 12 Serverless Functions can be
added to a Deployment on the Hobby plan." Root-caused before fixing, not
guessed — counted every file under frontend/api (not just the router
files) and found 13, not the 12 I'd assumed:

  find frontend/api -type f -name "*.js" | wc -l

The 13th was api/broker-matching/index.js — a standalone GET endpoint
(LeadDetail.jsx's Book Appointment broker search) that I'd missed in an
earlier `-maxdepth 1` count, since it's nested one directory deeper than
every other route file. §29 (22 July) already consolidated this exact
problem once — 8 routers, down from ~20 files — but it didn't stay at 8:
Reports/Events/Portal routers, health.js, system-config.js, and this
nested broker-matching file grew it back to 11 over time, and this
session's Tasks (§56) + Notifications (§61) additions took it to 13.

FIX: folded broker-matching into appointments-router.js — a clean domain
fit (it's appointment-adjacent logic, not really its own domain), added
as a special first-segment case the same way users-router.js's /me and
notifications-router.js's /mark-all-read already work (checked BEFORE
the UUID-treating branch, since 'broker-matching' is never a valid
appointment id). Logic itself unchanged from the original file —
handleBrokerMatching() in appointmentHandlers.js is a straight move, not
a rewrite. Frontend's brokerMatchingApi.findBrokers() now calls
/api/appointments/broker-matching instead of /api/broker-matching — the
one call site (LeadDetail.jsx's Book Appointment modal) needed no other
change. Old api/broker-matching/ directory deleted.

Back to exactly 12 — the deploy should succeed now. FLAGGED, not silently
left: 12 is the ceiling itself, zero headroom. The next new domain
needing its own top-level API surface will hit this again immediately
unless something else gets folded first — system-config.js into
flags-router.js is the natural next candidate (both are AppAdmin-tier
system-settings concepts), not done this pass since it wasn't needed to
fix the actual failure and Mark didn't ask for it — his call whether to
do it now or wait.

VERIFIED: full Vite production build clean (1,412 modules, zero errors);
existing 45-test Vitest suite unaffected; appointmentHandlers.js and
appointments-router.js pass node --check and an ESM import smoke test.
Function count itself re-confirmed by direct find count after the fix
(12, not 13) — this is the one thing in this whole session that's
actually verifiable from the sandbox without a live deployment, since
it's just counting files, not behaviour.

MIGRATION — logic only, no schema change:
  frontend/api-lib/handlers/appointmentHandlers.js (handleBrokerMatching added)
  frontend/api/appointments-router.js            (broker-matching route added)
  frontend/src/services/api.js                   (brokerMatchingApi path updated)
  DELETE frontend/api/broker-matching/index.js    (folded in, no longer needed —
                                                     delete the file/folder on GitHub too,
                                                     not just add the new code, same
                                                     warning §29 gave the first time)
Plus this Status.md and Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
63. LEAD IMPORTER REWORK — REAL DEDUP, REAL CSV/EXCEL/JSON, FORMULA-INJECTION FIX — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Picked as the next feature over Token economy (needs business decisions
first) and Email notifications (blocked on Mark setting up Azure
Communication Services) — this one was self-contained and, on inspection,
worse than "unbuilt": partially built and actively misleading.

WHAT WAS ACTUALLY THERE (checked before touching anything): LeadImport.jsx's
"Historical CSV" channel already worked end-to-end — real file parsing,
real leadsApi.create() calls, real Lead rows created. But:
  - The duplicate count was fabricated — setCsvDupes(Math.floor(rows.length
    * 0.06)), a made-up "6% of rows" formula, not a real check.
  - Worse: NOTHING on this path had ever called leadService.findDuplicate()
    at all. Portal (leadPortalService.js) and Events (eventService.js)
    both check it themselves before their own createLead() calls; the
    public POST /api/leads endpoint — LeadImport.jsx's only route in, for
    both bulk import AND Manual Entry — never did. A genuine duplicate
    row really did create a true duplicate Lead; the UI just claimed
    otherwise.
  - CSV-only, naively so — lines[i].split(',') breaks on any quoted field
    containing a comma, routine in a real Excel-exported CSV. Couldn't
    read an actual .xlsx file at all despite "Excel" being in the
    feature's name. No JSON import path existed.
  - The "Medical Subscription" tab was a complete UI mockup — the drop
    zone toggled a hardcoded fake filename, the "Import" button faked a
    1-second spinner then navigated away doing nothing, and it falsely
    claimed "Deduplication is active" for a feature that never called the
    API at all.

BUILT:

BACKEND
  - leadHandlers.js's POST /api/leads now calls findDuplicate() before
    createLead() — 409 (not generic 400) if found, so the frontend can
    tell "skipped as duplicate" apart from "failed validation" instead of
    lumping every non-success into one fail count.
  - NEW: POST /api/leads/check-duplicates (models/lead.js's
    CheckDuplicatesSchema, leadHandlers.js's handleLeadCheckDuplicates) —
    one batched call checking every parsed row against findDuplicate(),
    so LeadImport.jsx's preview can show a real count before anything is
    created. Capped at 1000 rows. Routed as a literal sub-route on the
    EXISTING leads-router.js (same pattern as its own 'sources' route) —
    no new top-level function, Vercel count untouched at 12/12 (§62).
  - Formula-injection fix (leadService.js): Project_Context.md's own
    security checklist had flagged "CSV import hardening: formula
    injection (= + - @)" as an open gap before this session — addressed
    now, since createLead() is exactly the code path bulk-imported
    spreadsheet data flows through. neutralizeFormulaInjection() prefixes
    a leading quote onto any free-text field starting with =, +, -, or @
    (title, firstName, lastName, occupation, hospitalOrPractice,
    universityAttended, degreeAttained, policies, medicalAidProvider,
    manualSourceName) before insert — the standard mitigation, so a
    malicious formula payload can't execute if this data is ever exported
    back out to a spreadsheet and opened (no Lead export feature exists
    today, but fixing it at the point of storage means any future export
    inherits the protection automatically). Applied unconditionally, not
    just for bulk-import callers — manual entry gets the same protection.
    Row/size cap: the check-duplicates endpoint's own .max(1000) already
    provides a practical ceiling on import size, blocking with an error
    rather than a separate bespoke limit.

FRONTEND (LeadImport.jsx)
  - Real unified parser for CSV/Excel(.xlsx/.xls)/JSON via the new xlsx
    (SheetJS) dependency — replaces the naive comma-split, handles quoted
    fields correctly. JSON parsed directly, expecting an array of
    objects with the same field names CSV/Excel headers already needed
    (no column-mapping UI — matches the original design's assumption,
    just extended to more formats).
  - Real duplicate detection: a batched pre-check (check-duplicates) for
    an accurate preview count, PLUS the per-row create-time check (409)
    catching duplicates BETWEEN two rows in the same file, which the
    preview-time check alone can't (it only knows about leads already in
    the database when it runs, not earlier rows in this same batch that
    haven't been created yet).
  - Manual Entry also now rejects a duplicate submission with a clear
    message, instead of silently creating one.
  - "Medical Subscription" tab: every control now honestly disabled with
    a "coming soon" label, matching the same treatment already given to
    Settings' photo upload (§55) — not deleted, since it's still a useful
    visual preview of the intended feature, just no longer pretending to
    work. Its own now-unused subFile/subImporting state removed.

xlsx DEPENDENCY — FLAGGED, NOT HIDDEN: npm's registry only carries xlsx
up to 0.18.5; SheetJS stopped publishing newer releases there and moved
to their own CDN (cdn.sheetjs.com), outside this sandbox's allowed
network list. 0.18.5 carries two known high-severity advisories
(prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9),
both fixed in 0.20.2+ — a version this sandbox cannot install. Installed
0.18.5 as the only reachable option. Flagged to Mark directly in chat;
his call whether to bump the dependency to the CDN-hosted patched
version from his own machine, which does have unrestricted network
access this sandbox doesn't.

VERIFIED: full Vite production build clean (zero errors; LeadImport's own
chunk grew substantially — 346.90 kB / 118.24 kB gzipped — from bundling
SheetJS, but it's lazy-loaded only on that route, not the main bundle);
existing 45-test Vitest suite unaffected; every edited backend file
(models/lead.js, services/leadService.js, handlers/leadHandlers.js,
api/leads-router.js) passes node --check and an ESM import smoke test;
the formula-injection sanitizer itself unit-verified standalone against
real-shaped values (a formula string gets neutralized, an ordinary name/
phone/practice-name string passes through unchanged).

MIGRATION — no schema change:
  frontend/package.json                          (xlsx@0.18.5 added)
  frontend/package-lock.json                      (lockfile updated)
  frontend/api-lib/models/lead.js                 (CheckDuplicatesSchema added)
  frontend/api-lib/services/leadService.js        (dedup import fixed; formula-injection sanitizer added)
  frontend/api-lib/handlers/leadHandlers.js       (POST /leads dedup check; handleLeadCheckDuplicates added)
  frontend/api/leads-router.js                    (check-duplicates sub-route added)
  frontend/src/services/api.js                    (leadsApi.checkDuplicates added)
  frontend/src/pages/LeadImport.jsx               (real parsing/dedup; Subscription tab honesty fix)
Plus this Status.md and Project_Context.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
64. REACT ROUTER V7 MIGRATION — PHASE 1 (FUTURE FLAGS ON V6) — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Following up on the react-router/react-router-dom vulnerability (moderate,
open redirect + SSR hydration constructor injection — see the npm audit
conversation earlier this session): no patch exists within v6 at all
(6.30.4 is the newest v6 ever released and is still in the vulnerable
range) — the only real fix is a v6->v7 migration. Researched the current,
official migration path before touching anything: for a declarative-mode
app (plain BrowserRouter/Routes/Route, no data routers/loaders — which is
exactly what MedBroker is), the recommended approach is to enable every
v7 "future flag" on the CURRENT v6 install first, verify nothing changes,
THEN swap the package to v7 as a separate step. Never batch it all into
one change.

PHASE 1 (this entry): enabled all six flags on the existing v6.30.4
install. Each one verified SAFE BY READING THE ACTUAL CODE, not assumed
from general migration guidance:
  - v7_startTransition — every lazy() call in App.jsx is module-scope,
    not inside a component body (the standard gotcha this flag exposes).
    Confirmed by inspection.
  - v7_relativeSplatPath — the one flag that could genuinely have changed
    behavior here. PortalApp's own routes (register/:qrToken, login,
    dashboard, etc.) ARE relative, nested under the /portal/* splat —
    exactly the scenario this flag affects (old behavior: a relative
    path resolves ignoring everything after the splat; v7: resolves
    against the full current URL). But grepped every navigate()/<Link>
    call across all 17 files that import from react-router-dom, not just
    Portal's — every single one uses an absolute path (/portal/dashboard,
    /appointments/${id}, etc.), never relative. Zero relative navigation
    anywhere in the app means this flag is a confirmed no-op, not a
    "should be fine" guess.
  - v7_fetcherPersist, v7_normalizeFormMethod, v7_partialHydration,
    v7_skipActionErrorRevalidation — all four only affect useFetcher/
    <Form>/loaders/actions. Grepped for all of them (useFetcher,
    useLoaderData, useActionData, createBrowserRouter, <Form, 
    RouterProvider) — zero matches anywhere in src/. MedBroker is pure
    declarative mode; these four are complete no-ops for this app.
  - v7_prependBasename exists in the installed version too but is an
    internal implementation constant, not part of the public future{}
    API documented in React Router's own upgrade guide — not set, and
    doesn't apply anyway (this app has no basename prop on BrowserRouter).

Confirmed present in the actual installed package (not just documented
in guides) by grepping node_modules/react-router/dist/react-router.
development.js directly for the flag name strings.

NOT YET DONE (Phase 2, separate future step): swap the package from
react-router-dom to react-router v7, update imports across all 17 files
that currently import from react-router-dom, verify again. Given Phase 1
covers every behavioral flag and all of them are confirmed no-ops for
this specific app, Phase 2 should mostly be mechanical import-path
changes — but "should be" gets verified the same way Phase 1 was, not
assumed, when that step happens.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected. This phase has no server-side component (App.jsx only)
so no backend verification needed.

MIGRATION — logic only, no schema change, no new dependency (still
react-router-dom@6.30.4, just the future flags enabled):
  frontend/src/App.jsx (future flags added to BrowserRouter)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
65. REACT ROUTER V7 MIGRATION — PHASE 2 (PACKAGE SWAP, COMPLETE) + engines.node PIN — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 2 of §64's migration — swapping the package itself, the step that
actually closes the react-router/react-router-dom vulnerability (open
redirect + SSR hydration constructor injection). Verified the real
package structure before touching the project, not assumed from
documentation: installed react-router@7.18.2 in a scratch directory and
inspected its actual exports. Confirmed BrowserRouter, Routes, Route,
NavLink, Navigate, useNavigate, useParams, useLocation, and Link — every
single thing MedBroker uses — are all exported directly from the main
react-router package. The react-router/dom subpath only carries
RouterProvider/HydratedRouter (data-router/SSR features this app doesn't
use at all). This meant Phase 2 was purely mechanical: no code touching
routing LOGIC, just import paths and the package itself.

BUILT:
  - package.json: react-router-dom removed entirely, react-router@^7.18.2
    added as a direct dependency (was only ever transitive via
    react-router-dom@6 before).
  - All 17 files that imported from react-router-dom updated to import
    from react-router instead — a plain string swap
    (from 'react-router-dom' -> from 'react-router'), verified safe
    because every export name used is identical between the two.
  - App.jsx: the six v7 future flags added in §64 removed from
    BrowserRouter — they were how you opt into v7 behaviour early while
    still on v6; now that this genuinely is v7, that behaviour is just
    the only behaviour, no flag needed. Replaced with a comment
    documenting the full migration (§64 + §65) for whoever reads this
    file next.

NEW ADVISORY FOUND, CHECKED, CONFIRMED NOT APPLICABLE: even the patched
react-router@7.18.2 carries one high-severity npm audit entry —
GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass Allows Action Execution Before
400 Response". Read the actual advisory before accepting or dismissing
it: GitHub's own note says explicitly "This only affects your
application if you are using the unstable RSC APIs" — React Server
Components, an entirely different, unstable/experimental React Router
feature this app doesn't touch anywhere (confirmed — no RSC, no data
routers, no loaders/actions, declarative mode only, same as everything
else checked this session). The real fix is React Router v8 (already
released, 8.3.0), which is a separate, larger decision than the
originally-scoped v6->v7 migration — not bundled into this delivery.
Found the exact same reasoning already applied by another real project
hitting this identical advisory (a client-only Vite SPA with no RSC
server actions) while researching this — allowlisting the single
advisory ID until a deliberate v8 migration is a recognised, sound
pattern here, not a shortcut invented for this session.

BUNDLED IN (Mark's request, from the earlier Vercel build-log
conversation): package.json's engines.node changed from ">=20" (an
open-ended range Vercel had flagged — Vercel would silently move to a
newer Node major on a future deploy without any deliberate decision) to
"20.x", pinning the runtime to a specific major version. Unrelated to
React Router; bundled here purely because Mark asked for it to ship
together with this delivery.

VERIFIED: full Vite production build clean (zero errors; main bundle
grew somewhat — 265 kB vs 251 kB gzipped-precompression — expected, v7's
core is somewhat larger even in pure declarative-mode usage); existing
45-test Vitest suite unaffected; confirmed zero remaining references to
react-router-dom anywhere in the built output except one internal
react-router error-message STRING (an invariant check's own warning text
mentioning the old package name for people who mistakenly still import
RouterProvider from the wrong place) — not an actual dependency or
broken reference, checked the exact string context to be sure rather
than assume a grep hit meant a problem. package-lock.json confirmed
react-router-dom fully absent, react-router resolved to exactly 7.18.2.

NOT DONE, DELIBERATELY: React Router v8 upgrade (closes the one
remaining advisory, but a separate, larger decision — v7 -> v8 has its
own real breaking changes beyond what this session scoped). ESLint v10 +
missing eslint.config.js, and the Vite/Vitest major bump, both still
queued from the original npm audit conversation, lowest priority of the
three, not started.

MIGRATION — no schema change:
  frontend/package.json           (react-router-dom -> react-router@7.18.2; engines.node pinned to 20.x)
  frontend/package-lock.json      (lockfile updated)
  frontend/src/App.jsx            (imports updated; future flags removed; migration comment)
  frontend/src/pages/AgentDetail.jsx, AppointmentDetail.jsx, AppointmentList.jsx,
    BrokerDetail.jsx, EventDetail.jsx, EventList.jsx, LeadDetail.jsx, LeadImport.jsx,
    LeadList.jsx, Reports.jsx, portal/PortalActivate.jsx, portal/PortalCheckIn.jsx,
    portal/PortalCheckinConfirm.jsx, portal/PortalDashboard.jsx, portal/PortalLogin.jsx,
    portal/PortalRegister.jsx     (import path only: react-router-dom -> react-router)
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
66. FIXED OWN MISTAKE — engines.node PINNED TO A DEPRECATED VERSION — 28 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§65 pinned package.json's engines.node from an open-ended ">=20" to
"20.x", reasoning it as "a mature LTS, low risk." That reasoning was
wrong — didn't check Vercel's actual current platform support timeline
before picking a specific version. Mark's next deploy surfaced it
directly in the build log: "Error: Node.js version 20.x is deprecated.
Deployments created on or after 2026-10-01 will fail to build." 13
errors, 14 warnings, though the build itself still completed this time
(Vercel currently downgrades this to a hard failure only after the
2026-10-01 cutoff).

Worse detail from the log itself, worth being honest about: Vercel's own
Project Settings were ALREADY correctly set to Node 24.x — package.json's
"engines": { "node": "20.x" } was actively OVERRIDING that correct
platform setting down to the deprecated version. This wasn't just "picked
a slightly-too-old version" — it was a regression against a setting
that was already right.

FIX: engines.node changed to "24.x". Verified via search before
confirming, not just trusted Vercel's message blindly (though in this
case it was correct): Node 24.x has been the Active LTS line since
October 2025, supported through April 2028 — the right, current choice,
not just "whatever Vercel says this week."

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected. Caveat, stated plainly: this sandbox runs Node 22.22.2,
not 24.x — cannot fully replicate Vercel's exact target runtime locally.
Low risk given this is a metadata field (which Node version Vercel
provisions), not a code change, but the true test is Mark's next
deployment succeeding without the 13 errors/14 warnings recurring.

MIGRATION — one line, no schema change:
  frontend/package.json (engines.node: "20.x" -> "24.x")
Plus this Status.md.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
67. RECHARTS 2 -> 3 UPGRADE — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

First of four items from Mark's post-testing batch (password policy,
Task filtering, Notifications/Cron, recharts) — this one first per the
agreed order: quick and low-risk, closes a deploy-log warning
("recharts@2.15.4: 1.x and 2.x branches are no longer active").

Same rigor as the react-router migration: checked actual usage before
assuming safety, not just the general "breaking changes" list. recharts
is used in exactly one file (Reports.jsx), importing only BarChart, Bar,
XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
LabelList, Legend — fully public, documented API. v3's actual breaking
changes are almost entirely about undocumented internal state access
(the <Customized> component, activeIndex on Scatter/Area/Legend,
CategoricalChartState) — none of which this app touches anywhere.

BUILT: recharts bumped 2.12.7 -> 3.10.1 (latest). No code changes needed
in Reports.jsx at all — the upgrade alone was the fix.

VERIFIED: full Vite production build clean (Reports.jsx's own chunk grew
somewhat — 392.94 kB vs 382.61 kB gzipped-precompression — expected,
v3's internal rewrite); existing 45-test Vitest suite unaffected
(unrelated to charts, but confirms nothing else broke). Vulnerability
count unchanged (12) — recharts itself introduces nothing new either way.
Worth a quick visual check of the Reports page once deployed, same
caveat as the router/portal migrations — nothing in the check suggests
a problem, but Vitest doesn't render or interact with the actual charts.

NOT YET DONE (next three items in the agreed order):
  - Vercel Cron + the three remaining Notification types
    (AppointmentReminder, CallbackReminder, LeadAutoReturned) + Lead
    auto-return — confirmed genuinely feasible on Hobby (up to 100 cron
    jobs, once-per-day cadence — which suits all three of these anyway),
    wireable through an existing router file without threatening the
    12/12 function ceiling.
  - Task creator tracking (createdById) — Task currently has no way to
    know who created it, only who it's assigned to; Mark's ask was
    whether Tasks should show "things I created" alongside "things
    assigned to me," and the honest answer is the data to support that
    doesn't exist yet.
  - Password policy overhaul — the biggest of the four. Rotation
    (30/60/90/custom) and lockout are built server-side but have no
    AppAdmin UI; temp-password-on-creation + forced first-login change
    are entirely unbuilt despite generateTempPassword() and
    passwordMustChange existing as unused/half-used infrastructure;
    password-history/reuse-prevention ("unique in a calendar year")
    doesn't exist at all. Scoped last, deliberately — most
    security-sensitive of the four, deserves its own focused pass.

MIGRATION — one dependency, no code change:
  frontend/package.json (recharts: ^2.12.7 -> ^3.10.1)
  frontend/package-lock.json
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
68. VERCEL CRON + REMAINING NOTIFICATION TYPES + LEAD AUTO-RETURN — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Second of Mark's four post-testing items. §61 left three Notification
types parked specifically because "no Vercel Cron exists in this stack
yet" — checked that claim properly rather than accept it, and it turned
out Vercel Cron genuinely is usable on Hobby (up to 100 jobs per project,
raised from a much lower cap in Jan 2026) with one real constraint:
once-per-day cadence only, fired sometime within the scheduled hour, not
exact-minute. That's not a limitation for any of these three checks —
"today's appointments," "today's callbacks," and "stale leads" are all
naturally daily-cadence anyway.

FUNCTION COUNT: a cron entry just hits an existing route on a schedule —
it does not create a new serverless function. Routed the new endpoint
through the ALREADY-EXISTING notifications-router.js as a literal
sub-route (scheduled-tick, same pattern as mark-all-read), so this adds
zero to the 12/12 Vercel function count.

BUILT:
  - NEW api-lib/services/schedulerService.js — three independently
    idempotent-by-construction scan functions (re-running the same day
    doesn't duplicate anything, because each WHERE clause naturally
    excludes what's already been handled — no separate "already
    notified today" tracking needed):
      sendAppointmentReminders() — every Appointment dated today, still
        Assigned (a broker is actually attached), reminds that broker.
      sendCallbackReminders() — a Lead whose most recent CallAttempt
        asked for a callback today, with no LATER CallAttempt logged
        since (the NOT EXISTS clause is what stops this firing forever
        once the agent actually makes the call), reminds the agent.
      autoReturnStaleLeads() — a Lead still Assigned/InProgress whose
        last activity (most recent CallAttempt, or createdAt if none)
        is older than SystemConfig.leadAutoUnassignMonths gets
        unassigned back to Unassigned, its incomplete Tasks cleaned up
        (deleteTasksForEntity — the SAME cascade-cleanup function
        returnToLeads already uses, reused rather than duplicated), and
        the agent who lost it notified why. Gated on
        leads.autoUnassign.enabled (defaults on) — the one of the three
        that actually changes data, not just sends a notification, so
        it respects the flag explicitly rather than assuming it's safe.
  - handleScheduledTick (notificationHandlers.js) — the cron's actual
    entry point. Secured via CRON_SECRET, Vercel's own documented
    pattern (not a custom one): Vercel automatically sends
    Authorization: Bearer <CRON_SECRET> when it triggers a cron job;
    this route rejects anything that doesn't match, including — checked
    explicitly — the case where CRON_SECRET isn't configured at all
    (secure-by-default, not open-by-default if the env var is missing).
  - vercel.json: crons entry, "0 6 * * *" — 6am UTC = 8am SAST (South
    Africa has no DST, always UTC+2), a sensible before-business-hours
    time for the day's reminders to already exist.

MARK'S ACTION REQUIRED, NOT SOMETHING THIS DELIVERY CAN DO ON ITS OWN:
  set CRON_SECRET as an environment variable in Vercel's project
  settings (Settings -> Environment Variables), a random string of at
  least 16 characters. Without it, the endpoint will correctly reject
  every request (by design) and the cron will never actually do anything.

FRONTEND: no changes needed at all. Notifications.jsx's TYPE_ICON table
and the Reminders tab filter (n.type.includes('Reminder')) already
handle all three of these types — its own header comment said MOCK_
NOTIFICATIONS covered all six types for exactly this reason. Checked
before assuming, not just trusted the old comment.

CORRECTION TO §61's OWN RECORD: double-checked TYPE_ICON against
MOCK_NOTIFICATIONS before calling this done, since TYPE_ICON has a sixth
entry, RescheduleReminder, that §61's comment listed as one of "the
three time-based types" needing Cron. Grepped MOCK_NOTIFICATIONS itself
(not just the icon map) — RescheduleReminder is never actually used by
any mock entry, only 5 types are genuinely active (LeadAssigned,
AppointmentReminder, CallbackReminder, AppointmentAssigned,
LeadAutoReturned). §61's "six types" framing overstated it slightly;
RescheduleReminder in TYPE_ICON is vestigial, not a missed requirement —
this delivery's scope (the three genuinely time-based, actually-used
types) was complete as built, not short by one.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; all three new/edited backend files pass node --check
and an ESM import smoke test; vercel.json validated as well-formed JSON;
the CRON_SECRET auth logic itself unit-verified standalone against all
four cases (correct secret, wrong secret, missing header, secret not
configured at all) before trusting it.

NOT YET DONE (remaining two items from Mark's four):
  - Task creator tracking (createdById).
  - Password policy overhaul (temp password + forced first-login
    change, AppAdmin UI for rotation/lockout, password-history/reuse
    prevention) — biggest and most security-sensitive, scoped last.

MIGRATION — no schema change:
  frontend/api-lib/services/schedulerService.js   (NEW)
  frontend/api-lib/handlers/notificationHandlers.js (handleScheduledTick added)
  frontend/api/notifications-router.js            (scheduled-tick route added)
  frontend/vercel.json                            (crons entry added)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
69. TASK CREATOR TRACKING (createdById) — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Third of Mark's four post-testing items. Task tracked assignedToId (who
a task is FOR) but had no way to know who CREATED it — Mark asked
whether Tasks should show "things I created" alongside "things assigned
to me", and the honest answer was the data to support that didn't exist.

REAL GAP FOUND, NOT JUST A MISSING DISPLAY FIELD: this wasn't only a
"can't filter by creator" limitation — it was a genuine VISIBILITY bug.
A Supervisor's task list was scoped to assignedToId IN (self + direct
reports). If that Supervisor created a manual task and assigned it to
someone OUTSIDE their own reporting line (a real, if unusual, scenario —
nothing stops an Admin/Supervisor assigning a task to any user), the
task would immediately vanish from the CREATOR's own view the moment it
was created, with no way to find it again except by asking the assignee.

BUILT:
  - Migration 014_add_task_created_by.sql — createdById, nullable
    (always NULL for the five system-generated trigger rules — no human
    creator; always populated for a manual task). schema.postgres.sql
    updated to match for fresh databases.
  - taskService.js: createTask() accepts/stores createdById.
    listTasks()'s scoping fixed — a new viewerId parameter is ORed
    against the existing assignedToId-IN-scopeIds condition, so a
    creator's own tasks are always visible to them regardless of who
    they're assigned to. Verified the generated WHERE clause directly
    (not just trusted the code read) before considering this done.
  - taskHandlers.js: POST sets createdById to the caller; GET always
    passes viewerId = the caller's own id (harmless for Admin/
    GlobalAdmin, who have no scopeIds restriction to begin with, so
    nothing changes for them specifically — the fix matters for
    Supervisor and, in principle, Agent/Broker too, though those two
    can't create tasks at all so it's moot for them in practice today).
    shapeTask() now exposes createdBy/createdById.
  - Tasks.jsx: new "Created by me" checkbox (Admin/Supervisor/
    GlobalAdmin only, matching who can create tasks at all) — this is a
    convenience NARROW on top of the visibility fix above, not the fix
    itself; the fix means nothing is ever invisible to its own creator,
    the checkbox just lets someone filter down to only their own
    creations when they want to. Expanded task detail panel now also
    shows "Created by" next to the existing Source field, for manual
    tasks that have a creator to name.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; both edited backend files pass node --check and an
ESM import smoke test; the scoping fix's generated SQL WHERE clause
verified standalone for both the Supervisor and Agent cases before
trusting it, confirming createdById is genuinely ORed in, not silently
dropped.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
70. TRACKED ITEM — DB CONNECTION TLS: rejectUnauthorized: false — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Logged per Mark's instruction — bundled into this update rather than a
standalone delivery, since it's a documentation-only item with no code
change attached to it.

Mark spotted an "Error"-level log entry in Vercel's runtime logs (not
build logs — those were clean) on an unrelated /api/flags request:
  [DEP0169] DeprecationWarning: 'url.parse()' ...
  Warning: SECURITY WARNING: The SSL modes 'prefer', 'require', and
  'verify-ca' are treated as aliases for 'verify-full'. In the next
  major version (pg-connection-string v3.0.0 and pg v9.0.0)...

Checked before answering: neither warning comes from this codebase's own
code (grepped for url.parse() — zero matches anywhere in api-lib/api/).
Both originate inside pg's own dependency chain (pg-connection-string
parses the DATABASE_URL connection string using the legacy url.parse()
API, and inspects its sslmode parameter while doing so). Vercel's log
viewer buckets Node process warnings under "Error" severity because
they're written to stderr — the actual request succeeded (200, response
finished in 2s) — worth knowing so the red colour doesn't overstate it.

WHAT ACTUALLY MATTERS HERE, separate from the warning itself: db.js's
getPool() sets `ssl: { rejectUnauthorized: false }` explicitly when
creating the pg Pool, with a comment explaining why ("Neon requires TLS;
pooled connections terminate it upstream") — ported as-is from the
original build. This is what actually governs TLS behaviour for every
DB connection, not whatever sslmode value is embedded in DATABASE_URL —
so the FUTURE pg-connection-string v3/pg v9 change this warning
describes won't alter this app's behaviour at all when it lands (we
don't rely on the sslmode string's aliasing). But rejectUnauthorized:
false itself means the app encrypts the connection to Neon without
verifying Neon's TLS certificate against a certificate authority — a
real, standing, deliberate-if-inherited choice, low practical risk given
app and database both sit inside the same trusted cloud infrastructure,
but not the strictest possible configuration.

NOT URGENT — tracked, not acted on. If tightened later: set
rejectUnauthorized: true (requires Neon's CA chain to validate correctly
against Node's default trust store, which it should for a standard
managed Postgres provider) or move to explicit sslmode=verify-full in
the connection string per the warning's own suggested fix, and confirm
the app still connects successfully before calling it done — either
change touches every single database query this app makes, so it
deserves its own careful verification pass, not a same-turn fix bundled
into something else.

NOT YET DONE (last item from Mark's four): Password policy overhaul —
temp password + forced first-login change, AppAdmin UI for rotation/
lockout settings, password-history/reuse prevention. Biggest and most
security-sensitive of the four, scoped last deliberately.

MIGRATION — schema change (§69 only; §70 is documentation only):
  frontend/db/migrations/014_add_task_created_by.sql (NEW)
  frontend/db/schema.postgres.sql          (Task table updated)
  frontend/api-lib/services/taskService.js (createdById + scoping fix)
  frontend/api-lib/handlers/taskHandlers.js (createdById wired through)
  frontend/src/pages/Tasks.jsx             ("Created by me" filter + display)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
71. TASK VISIBILITY BUG FIX + TASK COMMENTS — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark tested §69's "Created by me" filter and found the specific task he
tested with disappeared when the filter was ON, for both himself and
Werner (Admin). Root-caused before touching anything: that task was
created BEFORE §69's migration/code landed, so its createdById is
genuinely NULL in the database — not a code bug. Re-checked every part
of the wiring (POST handler sets createdById; shapeTask returns it; the
frontend filter compares it correctly) and confirmed all of it was
already right. Gave Mark a one-off SQL backfill to run directly against
Neon (not a migration file — this is test-data cleanup specific to his
own account, not something every environment needs):
  UPDATE Task SET createdById = (SELECT id FROM "User" WHERE
  displayName = 'Mark du Toit') WHERE type = 'Manual' AND createdById
  IS NULL;

ADMIN/SUPERVISOR TASK VISIBILITY — CONFIRMED ALREADY CORRECT, NOT A BUG:
Mark asked whether Admin/Supervisor seeing all tasks was intentional,
and proposed exactly the design already built: Admin/GlobalAdmin see
everything; Supervisor sees self + direct reports only; Agent/Broker see
only their own. Re-verified the actual isSupervisorOnly()/isAdminRole()
logic before answering — confirmed this is precisely what's already
implemented (§56). Mark had only tested as GlobalAdmin and Admin so far
(both of which are SUPPOSED to see everything) — no code change needed.

REAL BUG FOUND AND FIXED WHILE BUILDING COMMENTS (below): §69 fixed
listTasks()'s LIST-view scoping to OR createdById against the usual
assignedToId scoping (a creator's own tasks are always visible to them).
But handleTaskById()'s SINGLE-task visibility check (used for PATCH/
DELETE) was never updated to match — it still only checked assignedToId.
That meant a Supervisor could see their own creation in the task LIST,
but clicking into it to edit/complete it, or now commenting on it, would
still 403. Extracted both checks into one shared canSeeTask() helper so
there's exactly one place this logic lives, not two that can silently
drift apart again — this bug existed because there were two, not one.

TASK COMMENTS (§71) — Mark's request: a threaded discussion per task,
showing who commented and when.
  - Migration 015_add_task_comment.sql — new TaskComment table
    (taskId, authorId, body, createdAt). ON DELETE CASCADE on taskId —
    if a Task is ever deleted (manual deletion or cascade-cleanup from a
    Lead/Appointment change), its comments go with it rather than
    becoming orphaned rows. No edit/delete on comments at all — a
    discussion thread is a record of what was said and when, matching
    the same philosophy AuditLog already follows for the same reason.
  - GET/POST /api/tasks/:id/comments — routed as a sub-route on the
    ALREADY-EXISTING tasks-router.js (matching every other sub-route
    precedent this build uses), so this adds zero to the 12/12 Vercel
    function count.
  - Visibility: whoever can see a task (canSeeTask() — see above) can
    both read and post to its comment thread. No separate permission
    tier for comments; if you can see the task, you're part of its
    discussion.
  - Tasks.jsx: comment thread UI in the expanded row, lazy-loaded only
    when a task is actually expanded (not fetched for every row in the
    list up front). Entra branch: a local, in-memory thread, matching
    the same "keep the mock UI interactive" philosophy already applied
    to Tasks/Notifications throughout this build.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file (models/task.js,
services/taskService.js, handlers/taskHandlers.js, api/tasks-router.js)
passes node --check and an ESM import smoke test.

MIGRATION:
  frontend/db/migrations/015_add_task_comment.sql (NEW)
  frontend/db/schema.postgres.sql          (TaskComment table added)
  frontend/api-lib/models/task.js          (CreateCommentSchema added)
  frontend/api-lib/services/taskService.js (listComments/createComment added)
  frontend/api-lib/handlers/taskHandlers.js (handleTaskComments added;
                                              canSeeTask() extracted, fixing
                                              the single-task visibility bug)
  frontend/api/tasks-router.js             (:id/comments sub-route added)
  frontend/src/services/api.js             (tasksApi.listComments/addComment added)
  frontend/src/pages/Tasks.jsx             (comment thread UI)
Plus this Status_Vercel.md.

NOT YET DONE: password policy overhaul — last item on Mark's list,
biggest and most security-sensitive, starting next.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
72. PASSWORD POLICY OVERHAUL — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Last of Mark's four post-testing items, and the biggest. Three questions
asked: (1) can manually created users be forced to change their password
on first login, (2) can passwords expire on a configurable schedule, (3)
can other rules apply, e.g. no reusing a password from the current
calendar year. Investigated before building anything, same as always —
found the real state was more scattered than expected: rotation and
lockout were ALREADY built and ALREADY enforced at login
(passwordRotationDays/passwordLockoutAttempts in SystemConfig), but had
NO admin-facing UI anywhere to configure them. generateTempPassword()
and passwordMustChange existed on User but were never actually wired to
the real user-creation flow — UserAdmin.jsx's "create user" form has the
Admin type a password directly, and nothing ever set
passwordMustChange=true regardless. Reuse prevention didn't exist at
all. Login.jsx even had its own comment: "passwordMustChange handling
(forcing a change screen) is a follow-up, not yet built."

FUNCTION COUNT: change-password is a new endpoint but not a new Vercel
function — routed as a sub-route on the ALREADY-EXISTING auth-router.js
(same pattern as every other sub-route this build uses), so this stays
at 12/12, not 13.

BUILT:

BACKEND
  - Migration 016_add_password_policy.sql — SystemConfig gains
    passwordPreventReuse (boolean, default TRUE); new PasswordHistory
    table (userId, passwordHash, createdAt), ON DELETE CASCADE so a
    hard-deleted user (never happens today, but the safe default
    regardless) doesn't leave orphaned rows.
  - userService.js: createUserFull() now ALWAYS sets
    passwordMustChange=true whenever a password is provided at creation
    — whether the Admin typed it themselves or it was system-generated,
    the point is the same either way: a password only the Admin knows
    shouldn't persist unchanged. Also seeds PasswordHistory with that
    initial password so a future reuse check has a baseline.
  - NEW: addPasswordHistory(), wasPasswordUsedThisYear() (loops
    verifyPassword() against every hash a user has held since 1 January
    this year — hashes are one-way, so this can't be a direct string
    comparison; fine at this scale, a handful of changes per user per
    year, not hundreds — verified the actual bcrypt behaviour standalone,
    not just read the code), getUserPasswordHash(), setUserPassword()
    (updates the User row AND records history in the same call, so no
    caller can do one without the other).
  - authHandlers.js: new handleChangePassword() — verifies current
    password, checks complexity (checkPasswordComplexity, already
    existed), checks calendar-year reuse if passwordPreventReuse is on,
    sets the new password. Same endpoint serves both a forced
    first-login change and a voluntary self-service one.
  - systemConfigService.js: passwordPreventReuse added to the existing
    GET/PUT — no new endpoint needed, this was already a working API
    that just needed one more field and a real UI in front of it.

FRONTEND
  - NEW ChangePassword.jsx — one component, two entry points: forced
    (rendered directly by App.jsx's AuthGate when
    user.passwordMustChange is true, blocks everything else, no cancel
    option) and voluntary (a normal /change-password route from
    Settings, with a Cancel link). Live complexity hints as you type.
  - AuthContext.jsx: fixed a real gap found while building this —
    passwordMustChange arrived as a top-level field on the login
    response but was never persisted into the stored session, only
    data.user was. A page refresh right after login would have silently
    lost it. Now merged into the persisted user object at login time.
  - App.jsx: AuthGate now checks user?.passwordMustChange before
    rendering the app at all — forces ChangePassword first. Safe outside
    demo mode (user is always null there, so this is a no-op).
  - Settings.jsx: new "Security" card, "Change password" button
    (voluntary path), demo mode only.
  - AppAdmin.jsx — turned out to need more than just adding password
    fields: the ENTIRE System Settings tab was mock-only, never actually
    connected to the real GET/PUT /api/system-config endpoint that
    already existed and worked (brokerFreeAppointmentsPerMonth,
    leadAutoUnassignMonths, maxCallAttempts were all fake useState with
    a "PUT /api/config" comment that never happened). Real-wired the
    WHOLE tab — not just the new fields — since building real fetch/save
    plumbing for two new fields costs the same as building it for six,
    and leaving half the form real and half mock in the same card would
    have been worse than fixing it properly. Added the new Password
    Policy card: rotation (preset dropdown 30/60/90/180/Never + custom),
    lockout attempts, and the reuse-prevention checkbox.

VERIFIED: full Vite production build clean (1208 modules); existing
45-test Vitest suite unaffected; every new/edited backend file passes
node --check and an ESM import smoke test. Beyond that, checked three
specific things standalone rather than trust the code read alone:
  - The reuse-check logic, with real bcrypt hashing (not mocked) —
    confirmed a reused password is correctly detected and a genuinely
    new one is correctly allowed through.
  - AppAdmin.jsx's rotation preset/custom sync logic — confirmed a
    non-preset value (e.g. 45 days) correctly falls into "Custom" with
    45 pre-filled, rather than silently defaulting to something wrong.
  - AuthGate's passwordMustChange check can't misfire outside demo
    mode — user is always null there by construction, so user
    ?.passwordMustChange is safely undefined, never true.

NOT DONE / DELIBERATELY OUT OF SCOPE: auto-generating a temp password
instead of the Admin typing one directly — kept the existing UserAdmin.jsx
flow as-is (Admin still types the initial password) and focused the fix
on always forcing the change afterward, rather than redesigning that
form's workflow, which wasn't what was asked.

This closes the last of Mark's four post-testing items.

MIGRATION:
  frontend/db/migrations/016_add_password_policy.sql (NEW)
  frontend/db/schema.postgres.sql          (PasswordHistory table + passwordPreventReuse column)
  frontend/api-lib/models/auth.js          (ChangePasswordSchema; UpdateSystemConfigSchema extended)
  frontend/api-lib/services/systemConfigService.js (passwordPreventReuse wired in)
  frontend/api-lib/services/userService.js (password history + setUserPassword + createUserFull fix)
  frontend/api-lib/handlers/authHandlers.js (handleChangePassword added)
  frontend/api/auth-router.js              (change-password sub-route added)
  frontend/src/services/api.js             (authApi.changePassword, systemConfigApi added)
  frontend/src/pages/ChangePassword.jsx    (NEW)
  frontend/src/context/AuthContext.jsx     (passwordMustChange persistence fix)
  frontend/src/App.jsx                     (forced gate + voluntary route)
  frontend/src/pages/Settings.jsx          (Security card)
  frontend/src/pages/AppAdmin.jsx          (System Settings tab real-wired; Password Policy card added)
Plus this Status_Vercel.md.

Mark's original four-item batch (recharts, Cron/Notifications, Task
creator tracking + comments, password policy) is now complete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
73. FIXED — STALE SUPERVISOR DROPDOWN AFTER A ROLE CHANGE — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found this while testing §72: changed a user's role from Admin to
Supervisor, then went to assign that same person as another user's
supervisor — they didn't appear in the "Select supervisor…" dropdown
until a full browser refresh.

ROOT CAUSE, confirmed by reading the actual code rather than guessed:
UserAdmin.jsx fetches two separate lists — the main user table
(refetched correctly after every save, via refetchUsers()) and a
SEPARATE supervisors-only list backing the dropdown
(usersApi.listSupervisors()), fetched with useFetch(..., []) — an empty
dependency array, meaning once on mount, never again. handleModalSave()
only ever called refetchUsers(), never anything for the supervisors
list, so a role change that should have added or removed someone from
that list silently didn't update it until the component remounted.

FIX: destructured refetch from the supervisors useFetch() call too, and
call both refetches together (Promise.all) after every save in
handleModalSave() — not just the one that happens to affect the edited
user directly, since any role change could plausibly change who
qualifies as a supervisor. Checked for the same pattern elsewhere first
— listSupervisors() is only ever called from this one place, so this was
the only spot with the bug, not one instance of several.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected.

MIGRATION — one file, no schema change:
  frontend/src/pages/UserAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
74. SORTABLE TABLES — USER ADMIN — 30 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's request: clickable column headers to sort a table, with a
sensible default (User Admin — alphabetical by name) and the ability to
change which column it's sorted on.

BUILT: new reusable hook, hooks/useSortableData.js — click a header to
sort by it, click the same one again to reverse direction, click a
different one to switch (ascending). Deliberately client-side —
everything this would apply to (Users, Tasks, a single agent's own
Leads) is personal/org-scale, dozens to a few hundred rows, not a
dataset that needs server-side sort + pagination. Stable sort (ties keep
their original relative order) and empty/null values always sort last
regardless of direction — verified both behaviours, plus case-
insensitive string comparison, with real data standalone before trusting
the logic, not just read the code.

Applied to UserAdmin.jsx: Name, Email, Role, Region, Supervisor, Status
are all sortable; Portfolio and Products stay unsortable (multi-value
badge columns, not a single value to compare). Default: Name, ascending
— exactly what Mark asked for.

Deliberately scoped to this one table for now, not retrofitted across
every table in the app in the same pass — the hook itself is written to
be reusable (see its own header comment), so applying the same pattern
elsewhere (Leads, Appointments, Tasks) is a small, contained addition
whenever wanted, not a rebuild.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; the sort logic itself (case-insensitive compare, null-
handling, stability on ties) verified standalone with representative
data, not just read.

MIGRATION — no schema/backend change:
  frontend/src/hooks/useSortableData.js (NEW)
  frontend/src/pages/UserAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
75. PRODUCTION-READINESS AUDIT + SSO PAGE REWRITE — 31 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark wants to wrap this project up and ship to a real customer — asked
for a proper audit of legacy/fake content plus a list of genuinely
missing features. Did this as an actual codebase search (grepped for
"coming soon"/"not yet built"/"mock"/"fake"/etc. across every page, not
from memory), since accuracy matters a lot here — Mark's about to make
real go/no-go decisions off this list.

FULL AUDIT FINDINGS (see chat for the complete tables presented to
Mark — summarised here for the record):

Legacy/fake content found:
  - SingleSignOn.jsx — far worse than expected on inspection. Not just
    outdated documentation: it presented FABRICATED configuration as
    live — a made-up Tenant ID, Client ID, "Token validation: Active —
    JWKS endpoint", "M365 calendar integration: Active — Graph API
    scopes granted", plus "Test connection"/"Edit configuration" buttons
    that did nothing. A real customer looking at this page would
    reasonably believe SSO was actively configured. Fixed this session
    (below).
  - AppAdmin.jsx's Audit Log tab — hardcoded fake entries shown
    UNCONDITIONALLY, not even gated behind demo mode like everything
    else in this app. Flagged as the next item to fix (compliance-
    adjacent feature showing fabricated data is a real problem).
  - AppAdmin.jsx's Subscriptions tab — same underlying gap as the
    already-tracked "Medical Subscription lead import never built"
    item, not a separate issue.
  - Login.jsx had a stale comment claiming the forced password-change
    flow "is a follow-up, not yet built" — it was built in §72, comment
    just never got updated. Fixed inline while doing this audit.
  - Dead "Entra branch" code scattered across ~8 files (RoleContext,
    AuthContext, Tasks, Notifications, Settings, Login, App.jsx,
    FeatureFlags) — inert, never executes since this deployment always
    runs in demo mode, but real bulk sitting in the codebase. Flagged,
    not removed yet — Mark's call on priority, it's a real refactor
    touching many files, not a quick fix.
  - LeadImport's "Medical Subscription" import tab and Settings' "Upload
    photo" are ALREADY honest, already-disabled stubs — checked, no
    action needed there.

Genuinely missing features (confirmed, not assumed): email
notifications (no provider connected), an org-wide Audit Log viewer
(only per-entity history exists — listAuditLog(entityType, entityId) in
auditService.js, no "browse everything" query), Medical Subscription
lead import (the channel itself, separate from Audit Log's use of the
same underlying gap), token economy (Stripe not wired), POPIA Subject
Access Request endpoint.

Security/compliance hardening items (go-live gates, already individually
tracked across earlier sections, not repeated here) and the still-queued
ESLint/Vite-Vitest/React-Router-v8 items from the npm audit conversation
are unchanged — see §0's CURRENT SECURITY / DEPENDENCY STATE for the
current list of those.

BUILT THIS ENTRY: SingleSignOn.jsx rewritten from scratch. Removed
entirely: the fabricated M365 config table, the fake "Test
connection"/"Edit configuration" buttons, and the full Microsoft Entra
ID / Google Workspace step-by-step setup documentation — all of it
described the ORIGINAL Azure Functions/Entra ID architecture (api/src/,
the separate, now out-of-scope target), and doesn't belong embedded in
this product's live UI regardless of whether it's accurate for a
DIFFERENT deployment. Replaced with a short, honest page: states plainly
that this deployment uses local email/password auth (with a pointer to
the real, working policy controls in App Admin), and that SSO is a
capability of a separate enterprise deployment profile, without implying
anything about it is active here. Nav entry/route left unchanged — the
label "Single Sign-On" is still a reasonable name for a page that now
honestly explains it isn't available, not misleading.

VERIFIED: full Vite production build clean (confirmed SingleSignOn's own
chunk built successfully, not just the overall build); existing 45-test
Vitest suite unaffected.

NEXT (Mark's confirmed order): AppAdmin's Audit Log tab (fake data
shown unconditionally), then email notifications, then the rest of the
list roughly in the order presented.

MIGRATION — no schema/backend change:
  frontend/src/pages/SingleSignOn.jsx (rewritten)
  frontend/src/pages/Login.jsx (stale comment fixed)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
76. REAL ORG-WIDE AUDIT LOG — 31 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Second item from §75's audit — AppAdmin's Audit Log tab showed ten
hardcoded fake entries unconditionally (not even gated behind demo mode
like the rest of this app). Compliance-adjacent feature showing
fabricated data was flagged as the most concerning finding in that
audit; this closes it.

FUNCTION COUNT: routed as a sub-route on the already-existing
flags-router.js (GET /api/flags/audit-log) — not a natural domain fit,
but every existing router is where AppAdmin's own routes have ended up
living, since this build is sitting at exactly 12/12 Vercel functions
with zero headroom for a new top-level file.

BUILT:
  - auditService.js: new listAllAuditLog({page, pageSize}) — org-wide,
    paginated, most recent first. entityType/entityId are polymorphic
    across everything that writes to AuditLog (confirmed by grepping
    every entityType value actually written anywhere in api-lib, not
    guessed: Appointment, Lead, Event, EventAttendee, FeatureFlag, Task,
    User). Resolving a human-readable "what was this about" reference
    for all seven would need a seven-way join — scoped down deliberately
    to the three that matter most for a real Admin reading this log
    (Lead, Appointment via its Lead, User), via the same
    COALESCE-across-LEFT-JOINs pattern already used for Task's own
    polymorphic resolution. Everything else falls back to entityType +
    entityId — FeatureFlag's entityId is already the human-readable flag
    key itself ("tasks.enabled"), so that fallback reads fine for that
    one specifically; Event/EventAttendee/Task show a raw id, a real gap
    but not the one costing the most value to close right now.
  - CAUGHT A REAL BUG BEFORE IT SHIPPED: the first version of this query
    cast entityId (VARCHAR) TO uuid for the Lead/Appointment/User joins.
    FeatureFlag rows genuinely have a non-UUID entityId (a flag key
    string), and Postgres doesn't guarantee an AND condition
    short-circuits away from evaluating a cast on non-matching rows —
    meaning the very first FeatureFlag audit entry in the table (there
    are already several, confirmed by the same grep above) would have
    made this query start throwing 500s. Fixed by comparing entityId
    against each table's id column CAST TO TEXT instead (l_direct.id::
    text) — casting a UUID to text always succeeds, so there's no
    failure mode regardless of what's actually in entityId. Checked this
    specific risk deliberately before considering the function done, not
    discovered by accident.
  - NEW auditHandlers.js — handleAuditLogList(), Admin/GlobalAdmin only.
  - flags-router.js: audit-log sub-route added, checked before the
    generic 1-segment PATCH-by-key branch (flag keys use dot-notation,
    so 'audit-log' can never collide with a real one anyway, but matches
    the same defensive-ordering convention every other sub-route in this
    build uses).
  - AppAdmin.jsx: real-wired with loading/error states and Previous/Next
    pagination (25 per page). The Role column from the mock table was
    DROPPED, not carried over — AuditLog never actually tracked a
    performer's role at the time of the action, only their identity;
    showing their CURRENT role would misrepresent history if it changed
    since (an Agent promoted to Supervisor would have their old actions
    relabelled as Supervisor actions, which they weren't at the time).
    Dropping a fabricated column is more honest than keeping the table
    shape identical to the mock.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; auditService.js and auditHandlers.js pass node --check
and an ESM import smoke test. The cast-failure risk was checked
deliberately (reasoned through Postgres's actual AND-evaluation
semantics, not just assumed the naive version was fine) before the fix
was written, not found by trial and error against a live database this
sandbox doesn't have access to.

NEXT (Mark's confirmed order): email notifications, then the rest of
the production-readiness list from §75 roughly in the order presented.

MIGRATION — no schema change (AuditLog table already existed):
  frontend/api-lib/services/auditService.js (listAllAuditLog added)
  frontend/api-lib/handlers/auditHandlers.js (NEW)
  frontend/api/flags-router.js             (audit-log sub-route added)
  frontend/src/services/api.js             (auditApi added)
  frontend/src/pages/AppAdmin.jsx          (Audit Log tab real-wired)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
77. AUDIT LOG FILTERS + CSV/JSON EXPORT — 31 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Follow-up to §76 — Mark asked for date range / Action / Entity /
Performed By filtering, plus CSV and JSON export.

BUILT:

BACKEND
  - auditService.js refactored: the SELECT/JOIN base and a new
    buildAuditFilters() are now shared between listAllAuditLog() and the
    new exportAuditLog() — deliberately, so filtering behaves IDENTICALLY
    in both. For a compliance feature specifically, an export that
    silently includes/excludes different rows than what's on screen
    would be a genuinely bad bug, not just an inconsistency.
  - exportAuditLog(filters, maxRows=5000) — same filters, no pagination,
    capped at 5000 rows as a safety limit against an unbounded export on
    a large, unfiltered log.
  - New toCsv() helper in http/helpers.js — proper CSV escaping (wraps
    a field in quotes and doubles internal quotes when it contains a
    comma, quote, or newline; JSON.stringifies nested objects like
    changeDetail into a single cell). Verified standalone against
    exactly those cases (comma, quotes, newline, object, null) before
    trusting it, not just read the code.
  - auditHandlers.js: entityType/action filters are validated against
    fixed, known lists (the actual entityType/action values grepped from
    across api-lib, not guessed) rather than trusted blindly from the
    query string — an invalid value would return zero rows either way,
    but validating explicitly turns a typo'd filter into something
    checkable rather than "the log looks empty" with no clue why.
    export=csv/json branches to a file-download response (Content-Type +
    Content-Disposition headers) instead of the normal paginated JSON.

  CAUGHT ANOTHER RISK BEFORE SHIPPING, related to this project's own
  history: originally used res.status(200).send(...) for the file
  response — but nothing anywhere else in this codebase has ever used
  res.send(), and this project already has a precedent for a Vercel-
  runtime assumption breaking in production without direct verification
  (the bracket catch-all routing failure, early this session). Rather
  than repeat that mistake, switched to res.statusCode = 200 +
  res.end(...) — a guaranteed core Node.js http.ServerResponse method,
  not a Vercel-specific convenience helper this sandbox can't verify
  against a live deployment. Worth a quick real-world check once
  deployed (click Export CSV/JSON and confirm a file actually
  downloads), same caveat as anything this sandbox can't fully verify.

FRONTEND
  - api.js: auditApi.list() now accepts filters (stripped of undefined/
    empty values before building the query string — URLSearchParams
    would otherwise serialize an unset filter as the literal string
    "undefined", which the backend's truthy check would treat as a real
    filter value; caught this before it shipped too). New auditApi.
    export() — can't reuse request() (that helper always parses JSON;
    an export response is a file, not JSON) — does its own authenticated
    fetch, reads the response as a Blob, and triggers a browser download
    via a temporary <a> element, the standard pattern for an
    authenticated file download (a plain <a href> can't carry the
    Authorization header this endpoint needs).
  - AppAdmin.jsx: date range, Entity dropdown (7 known values), Action
    dropdown (22 known values, mirrored from the backend's validation
    list), and Performed By dropdown (reuses the same usersApi.list()
    UserAdmin.jsx already calls — no new backend needed for this one).
    Any filter change resets to page 1. Export CSV/JSON buttons with a
    per-format loading state. Export errors get their OWN state
    (auditExportError) — initially reused settingsError from the System
    Settings tab for this, caught that it would show a stale Settings-
    tab error message on the Audit tab too, fixed before it shipped.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test; the CSV escaping helper verified standalone
against representative inputs (comma, quotes, newline, nested object,
null) before trusting it.

NEXT (Mark's confirmed order): email notifications, then the rest of
the production-readiness list from §75.

MIGRATION — no schema change:
  frontend/api-lib/services/auditService.js (refactored; exportAuditLog added)
  frontend/api-lib/handlers/auditHandlers.js (filters + export added)
  frontend/api-lib/http/helpers.js         (toCsv added)
  frontend/src/services/api.js             (auditApi.list filters; auditApi.export added)
  frontend/src/pages/AppAdmin.jsx          (filter UI + export buttons)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
78. EMAIL NOTIFICATIONS — 31 Jul 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's next item from §75's production-readiness list. Deliberately
built on STANDARD SMTP (via nodemailer), not any provider's proprietary
REST API — Mark's explicit requirement, discussed and agreed before
building: whatever this is built on needs to be swappable later for a
customer's own mail server or Microsoft 365, without a rewrite. Every
SMTP-capable provider speaks the identical protocol, so swapping is
purely an environment-variable change, never a code change.

Researched properly before building, not assumed: Vercel doesn't host
outbound email sending as a platform feature itself. Resend (built by
former Vercel engineers, in Vercel's own integration marketplace) is the
free option being targeted — confirmed current as of 31 Jul 2026: 3,000
emails/month, 100/day, one verified domain, 30-day log retention.
Resend supports both a proprietary REST API and standard SMTP relay;
building against the SMTP relay specifically is what makes this
swappable. Flagged one real caveat to Mark: M365 tenants increasingly
have SMTP AUTH disabled by default, so a customer's IT admin may need to
explicitly enable it — not something this code can control.

BUILT:
  - NEW emailService.js — pure SMTP transport, ZERO knowledge of Resend/
    M365/any specific provider on purpose. nodemailer chosen
    specifically: confirmed zero dependencies, no native bindings (no
    gypfile) before adding it — a real, checked reason to trust it in a
    serverless environment, not just "it's popular". Transporter cached
    at module scope, same pattern db.js already uses for its connection
    pool. Throws a clear error if SMTP_HOST/SMTP_USER/SMTP_PASSWORD
    aren't set — callers treat this as "not configured yet", not a hard
    failure of whatever triggered it.
  - notificationService.js: email-sending hooked into createNotification()
    itself — the ONE place every real notification type already funnels
    through (LeadAssigned/AppointmentAssigned action-driven, §61;
    AppointmentReminder/CallbackReminder/LeadAutoReturned via the daily
    Cron scan, §68) — rather than duplicating the email logic at five
    separate call sites. AWAITED, deliberately not fire-and-forget: a
    Vercel serverless function can freeze/terminate the instant its
    handler returns, so an un-awaited promise here risks the email
    silently never actually sending. Wrapped in try/catch so a failure —
    including "SMTP isn't configured yet", the DEFAULT state right now —
    can never make notification creation itself fail; verified this
    exact chain (flag on, SMTP not yet configured) standalone before
    trusting it, not just read the code.
  - Gated on notifications.email.enabled (already existed as a flag,
    default off — checked fresh on every call, not cached, since an
    Admin flipping this flag should take effect immediately). Its own
    seed description was stale ("not wired up") — fixed in
    feature-flags.postgres.sql; existing databases won't pick that text
    change up automatically (it's seed data, not a migration), a
    cosmetic detail Mark can leave as-is or update by hand, not urgent.
  - userService.js: new getUserEmailById(), matching
    getUserDisplayNameById's exact existing pattern.
  - Fixed a second stale comment in notificationService.js's own header
    while in there — it still said the Cron-dependent types "need a
    scheduled job that doesn't exist anywhere in this stack yet",
    written before §68 built exactly that.

MARK'S ACTION REQUIRED — nothing sends until these are set in Vercel's
project environment variables:
  SMTP_HOST      e.g. smtp.resend.com
  SMTP_PORT      587 (safe default; 465 also works if a provider needs it)
  SMTP_USER      provider-specific — for Resend this is literally the
                 string "resend", not an email address
  SMTP_PASSWORD  the actual API key / SMTP password
  SMTP_FROM      must be on a domain verified with whichever provider is
                 configured, or sends get rejected/spam-filtered
Get these from Resend's dashboard (Settings -> SMTP) once a domain is
verified there. Also needs notifications.email.enabled switched on in
AppAdmin -> Feature Flags — the env vars alone don't turn emails on.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test. The full failure-handling chain (flag on, SMTP
not configured — the realistic state immediately after this ships,
before Mark sets the env vars) verified standalone: confirmed the
in-app notification still succeeds and the error is caught non-fatally,
not just assumed the try/catch would behave as intended.

NOT YET DONE: actual email TEMPLATES beyond a plain paragraph wrapping
each notification's existing title/body text — functional, not
polished. Worth a follow-up pass once real sending is confirmed working,
not before.

MIGRATION — no schema change (notifications.email.enabled flag already existed):
  frontend/package.json                     (nodemailer added)
  frontend/package-lock.json
  frontend/db/feature-flags.postgres.sql    (stale flag description fixed)
  frontend/api-lib/services/emailService.js (NEW)
  frontend/api-lib/services/notificationService.js (email hook + stale comment fix)
  frontend/api-lib/services/userService.js  (getUserEmailById added)
Plus this Status_Vercel.md.

NEXT: rest of §75's production-readiness list.



If picking up a pending item, reference it by section number (e.g. "I
want to work on §61's remaining Notification types") — same convention
as before the split.

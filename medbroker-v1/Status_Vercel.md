MedBroker Lead Management System — Project Status (VERCEL VERSION)
==================================================
Last updated: 12 August 2026
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

NEW, per §142 (13 Aug 2026, session 21): five items Mark found through
his own live testing, all fully diagnosed against the live codebase.
ALL FIVE NOW BUILT AND VERIFIED (real Vite build run twice, real
55-test Vitest suite both times, ESM import smoke test, and direct
functional tests of every new validation rule), NOT YET DEPLOYED: (1)
claim-model booking modal never rendered Date/Time fields at all, so
Confirm Booking could never become enabled while claim model was
active — Date/Time moved out from the assign-mode-only branch to
render unconditionally; (2) Portfolio was genuinely optional on Lead
creation both sides, now mandatory both sides (CreateLeadSchema.
portfolios changed from .optional() to .min(1) — NOTE, this also now
requires CSV bulk-import rows to carry a resolvable portfolio, not
just the manual form, since both paths share the one schema; flag if
that breaks a real import); (3) Audit Log/Change Log card wasn't
refreshing after logging a call — the backend write from §138 was
already correct, LeadDetail.jsx's handleLogCall() just never called
refetchAudit() (the page's other two mutation handlers already did);
added a CallLogged label to AuditLogList.jsx while in there; (4)
Contact Number regex was far stricter than Mark wanted — replaced with
a character-set check (digits, spaces, + - ( )) plus Mark's chosen
7-digit minimum, shared across Lead/Event/Lead Portal via one change
in lead.js; (5) Reports Legend/key collision in Terra theme
(--accent and --live were the identical hex value there) — fixed per
Mark's chosen option (b): a new dedicated --chart2 CSS token, added to
all four themes and wired into CHART_PALETTE.won, decoupling chart
colours from the --live status/success semantic entirely rather than
just moving Terra's one value. §142 also carries an open, not-yet-
scoped functionality gap Mark raised alongside (1): nothing currently
surfaces unclaimed/unassigned appointments nearing their date —
separate from the bug fix, needs its own scoping pass.

MYSTERY RESOLVED, same session: frontend/db/migrations/ repeatedly
appearing to lose files (§136, §140, §141, and this session's own
initial misdiagnosis) was NEVER a bug or a github.dev artifact — Mark
clarified directly: he deletes migration files himself, deliberately,
once he's run them against Neon, because schema.postgres.sql is kept
current with the same change in the same delivery, so the migration
file serves no further purpose afterward. The actual cause of the
repeated "loss": every delivery ZIP this session (and apparently
before) packaged the FULL cumulative set of every file touched that
session, which silently resurrected migration files Mark had already
deliberately removed — he'd then remove them again before committing,
a cycle mistaken for recurring data loss across four separate
write-ups. CORRECTED — see the "Delivery packaging" section of
Project_Context_Vercel.md, revised same session: zips now contain only
the delta since the previous delivery, never a full re-inclusion.
STILL OPEN: whether migrations 025 and 026 specifically (the two most
recent, covering §140's default claim token cost and §140d's meeting
type) were actually executed against Neon before Mark deleted the
folder — his own explanation implies yes (he only deletes after
running), but worth Mark confirming directly rather than assumed,
since §141's own NEXT ACTION note (immediately below) had flagged
deployment of §140's changes as pending at the start of this session.

NEXT ACTION, per §141 (13 Aug 2026): §137 and §139 both confirmed
deployed and working, including Mark catching and helping fix a real
bug himself in §139's own addendum. §140 closed a real claim-model
enforcement gap. §141 (this session's latest) fixed four things Mark
found testing the claim model directly: the Active tab hiding Claimed
appointments, the token balance never actually moving (real root
cause: claimTokenCost was never set anywhere, not a refetch bug — see
§141), Address never being mandatory, and added the meeting-type
(InPerson/Virtual) field Mark asked for, which now drives that
validation. §141 is BUILT AND VERIFIED (including real Postgres
execution of both new migrations, twice each) but NOT YET DEPLOYED.
Migrations 025 and 026 have not been run against Neon.

STILL fully deferred, zero code written, now explicitly NEXT per
Mark's decision in §141: the meeting/appointment attempt-history
redesign itself (§138 has the full spec — read that before starting,
don't re-derive it). After that: the Reports date-scoping fix, which
depends on the redesign existing first.

RECURRING ISSUE, now three times (§136, §140, §141): frontend/db/
migrations/ keeps vanishing from GitHub main after github.dev uploads.
Restored again each time it's been caught. Drag the WHOLE folder every
time, not just the newest file, and check GitHub's own repo browser
after each upload — the guidance alone hasn't stopped it recurring.

A session-isolation footgun was discovered in session 20
(sessionStorage is per-tab, the mb_session cookie is not — multiple
tabs/InPrivate windows sharing one browser silently share one auth
session too). This throws real doubt on one specific conclusion from
that session — whether logCallAttempt() actually needs to route
Callback tasks to lead.assignedAgentId rather than the caller — see
§138's own "SESSION-ISOLATION FOOTGUN" entry before touching that
function's routing. Mark has not yet retested cleanly to confirm
either way; still deliberately left unchanged as of §141.

Whether migration 022 has actually been run against Neon is still
unconfirmed either way from this sandbox; migration 023 likewise. Ask
Mark directly if unsure before assuming either has run.

§135 (7 Aug 2026) added Paystack as a second, fully independent
appointments.tokens.paymentProvider option alongside Stripe — CONFIRMED
DEPLOYED (Mark's own hands-on testing this session, screenshot-verified,
is what surfaced §136's fix below; that only happens against a live
app). Full design/build/verification detail lives in §135 itself, not
duplicated here — this paragraph previously WAS a full duplicate of that
entry and stale-claimed "NOT YET DEPLOYED"; trimmed down and corrected
rather than left to accumulate as a second, disagreeing copy.

§136 (7 Aug 2026, this session) is a small, isolated Integrations-page
fix, prompted directly by that testing: Mark turned on only Paystack but
still saw full Stripe AND SMTP credential forms too — a "free-for-all"
rather than "here's what's actually live." Now each card is shown ONLY
when its corresponding flag actually matches, with a neutral notice
(naming whether credentials are already saved, so switching providers
never reads as "did I lose my setup?") in place of whichever isn't
active. Frontend-only, no backend/schema change, so no new sandbox DB
testing was needed — verified via a real build + the existing 55-test
Vitest suite staying green. NOT YET DEPLOYED. Full detail in §136 below.

FULLY BUILT AND WORKING (real backend, real Neon Postgres, not mock data):
  Auth            Local email/password, JWT, 8-hour expiry, full policy
                  controls (rotation/lockout/reuse, GlobalAdmin-forced
                  password reset §118). Entra ID SSO — all 4 stages
                  built and live end to end: "Sign in with Microsoft" on
                  the login page (§120), JIT provisioning + email-match
                  auto-link + GlobalAdmin manual link-identity (§114),
                  password-fallback toggle (§121), on-demand offboarding
                  sync via Graph API (§121, needs ENTRA_CLIENT_SECRET +
                  User.Read.All admin consent to actually run). Off by
                  default (auth.sso.enabled) — local login is always
                  the fallback unless a GlobalAdmin deliberately
                  disables it, and even then GlobalAdmin itself is
                  permanently exempt.
  Leads           Full CRUD, assignment, call logging, reopen, audit log,
                  real duplicate detection (check-duplicates batch
                  endpoint + create-time 409), CSV/Excel/JSON bulk import
                  via SheetJS, formula-injection hardening. The auto-
                  return banner shows the org's real configured period
                  now, not a hardcoded "6 months" (§108) — the auto-
                  return job itself always used the real value; only the
                  banner text was wrong.
  Appointments    Full CRUD, assign/reassign broker & agent, return-to-
                  leads, outcome recording, broker matching, Appointment
                  History card on Lead Detail (surfaces the full
                  one-to-many set, not just the most recent). Claim model
                  (appointments.claimModel = 'claim') is real as of §117 —
                  self-serve claiming, TokenLedger, monthly free
                  allocation with lazy reset (no cron in this stack).
                  Two independent payment-provider paths, both real:
                  Stripe (§134, 6 Aug 2026) — not usable for this
                  deployment, Stripe doesn't support South African
                  merchants at all — and Paystack (§135, 7 Aug 2026,
                  Stripe-owned, ZAR-native, South-Africa-supported) —
                  the one Mark will actually use. Both: Checkout/
                  transaction creation, raw-body-verified webhook credit,
                  idempotent against each provider's own documented
                  at-least-once webhook redelivery, sharing one
                  creditPurchasedTokens() function underneath. Manual
                  admin top-up ('none' provider, §117) still exists as a
                  separate, independent funding path — all three
                  coexist, switching the flag doesn't remove any of them.
  Users           Admin CRUD + real self-service profile (PUT /users/me
                  — theme/avatar/timezone, structurally separate schema
                  from the admin-editing-someone-else route)
  Flags           Full GET/PATCH, tiered (Core/Operational/Phase2)
  Reports         Pipeline + broker-activity, server-enforced Supervisor
                  team-scoping. Broker Performance table's Appointments/
                  Signed counts were silently doubled for any broker
                  with 2+ portfolios (a JOIN fan-out bug) — fixed §107.
                  Selected period now carries from Reports through to
                  BrokerDetail/AgentDetail's "View →" via a URL query
                  param (§107) — one-way only, deliberately; navigating
                  back to Reports still resets to the current month.
  Events          Full backend — registration, dual QR codes
                  (registration vs attendance), walk-in check-in
  Lead Portal     Public self-service registration + venue check-in,
                  own separate auth (ProspectAuthContext, own JWT secret,
                  own httpOnly cookie as of §115 — mb_portal_session,
                  same hardening staff auth got in §113).
                  All four password screens (Login, Register, Activate,
                  walk-in Check-in) have a Show/Hide toggle now (§101);
                  the "zooms in and won't use the full screen" mobile
                  bug is fixed too (§101 — was a 14px input font-size,
                  under iOS Safari's 16px auto-zoom threshold; this was
                  a global tokens.js fix, so it also applies to every
                  staff-side input, not just the portal).
  Tasks           Full REST API, all five generation rules event-driven
                  off real actions (no scheduled job needed), cascade
                  reassign/delete when the Lead/Appointment a task is
                  about changes owner or closes out, manual creation +
                  deletion (Admin/GlobalAdmin, manual-type only), real
                  sidebar badge (own incomplete-task count), creator
                  tracking (createdById, §69) — a creator's own tasks
                  are always visible to them regardless of who they're
                  assigned to, plus a "Created by me" filter. Reassign
                  is real now too (§104) — was in the backend
                  (taskHandlers.js) but had no UI control at all until
                  this session. A Supervisor's assignee targets are
                  team-scoped (self + direct reports) everywhere this
                  now comes up — Reassign (§105), NewTaskModal's "Assign
                  to", and the Assignee filter (§108) — with the actual
                  restriction enforced server-side on both POST and
                  PATCH, not just hidden in the dropdown.
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
                  Detail column shows what actually changed, not just
                  which entity (§96), and every entity type — including
                  Task/Event/EventAttendee, previously a raw id — now
                  resolves to a readable name, with ids never shown
                  redundantly alongside a resolved name (§103).
  Email notifications (§78) — real, built on standard SMTP
                  (nodemailer) rather than any provider's proprietary
                  API, deliberately, so it's swappable for a customer's
                  own mail server or M365 later without a rewrite.
                  UPDATED §134 (6 Aug 2026) — SMTP credentials now come
                  from the Integrations settings page (App Admin ->
                  Integrations, GlobalAdmin only, encrypted at rest)
                  FIRST, falling back to the original SMTP_HOST/
                  SMTP_USER/SMTP_PASSWORD/SMTP_FROM env vars if nothing's
                  saved on that page yet. Either way,
                  notifications.email.enabled (AppAdmin -> Feature
                  Flags) still has to be switched on before anything
                  actually sends — that flag isn't done yet, only the
                  credential source changed.
  POPIA Subject Access Request processing (§79) — real. AppAdmin ->
                  Data Requests: log a request against a Lead, track its
                  status, export everything MedBroker holds about that
                  Lead (JSON or CSV) once ready to fulfil it. Admin/
                  GlobalAdmin only. Properly flag-gated now too (§109) —
                  popia.subjectAccessRequest.enabled actually controls
                  whether the tab appears, closing the gap where it was
                  unconditionally visible regardless of the flag's value.
  Medical Subscription lead import (§80) — real now, same underlying
                  mechanism as CSV import (file upload, real duplicate
                  check), tagged with linkedSubscriptionId instead of a
                  free-text source name. AppAdmin's Subscriptions tab is
                  real too (was hardcoded mock data + a dead "+ Add
                  Subscription" button before this).
  Portfolio/Product management (§89/§90) — real. AppAdmin -> Portfolios
                  and Products tabs can genuinely add a new portfolio or
                  product now (products belong to a portfolio, matching
                  the real FK constraint) — every consumer across the
                  app (Lead Detail, Lead Import, Appointment Detail's
                  products-sold, User Admin's assignment checkboxes)
                  reads this same live data through RoleContext.jsx's
                  useRole() hook, not a hardcoded constant, so a new
                  portfolio/product shows up everywhere immediately.

SEED DEFAULTS (NOT necessarily current live state — Claude has no live DB
access, ever, so this section only reflects what a brand-new database
gets on first creation, per feature-flags.postgres.sql's ON CONFLICT DO
NOTHING inserts. Any of these may already be flipped in the real
deployment — check Feature Flags in the app itself, not this file, for
what's actually live right now):
  - tasks.enabled — seeded off. Mark has been actively testing Tasks all
    session, so this is almost certainly already on in the real
    deployment — this file previously kept describing it as "off by
    default" in a way that read as a current-state claim; that was the
    seed value, not a live check, and shouldn't have been repeated as
    if it were one.
  - notifications.email.enabled — seeded off. Still needs SMTP credentials
    set somewhere — the Integrations page (App Admin -> Integrations,
    §134) or the original SMTP_HOST/SMTP_USER/SMTP_PASSWORD/SMTP_FROM
    Vercel env vars as a fallback — regardless of the flag's live value
    (§78) — that part IS independently verifiable (neither the page's
    saved state nor the env vars are visible from Feature Flags), so
    still worth calling out as outstanding until Mark confirms otherwise.
  - auth.sso.enabled — seeded off, and no real SSO provider is wired up
    in the code regardless of the flag's live value (confirmed by
    grepping for entraObjectId/googleUid usage — see §109's SSO
    continuity design notes for the full picture). Toggling this flag
    on its own does not enable working SSO login.

DELIBERATELY NOT BUILT (real gaps, not yet scoped or blocked on
something outside this session's control):
  - (none currently outstanding for the token economy — see §134;
    claim model, TokenLedger, manual top-up, and Stripe payment are all
    real now)

FLAGGED, NOT BUILT — small, explicitly scoped-out while doing adjacent
work, worth revisiting if the same question comes up again:
  - Reports period retention (§107) is one-way — Reports -> BrokerDetail/
    AgentDetail carries the selected period; navigating back to Reports
    does not carry it back, always resets to the current month. Confirmed
    with Mark as expected/acceptable as-is.
  - Settings -> photo upload: honest disabled "coming soon" stub, not
    built. Deliberately parked (§110) — Mark doesn't want to take on a
    paid dependency (Vercel Blob) for a feature with no clear business
    value unless a customer actually asks for it.
  - GlobalAdmin guide's §2.2 Flag Reference table has TWO stale entries
    now: popia.subjectAccessRequest.enabled (described as dead/unwired,
    stale since §109 actually wired it up) and auth.sso.enabled/
    auth.sso.provider (still described by their pre-§114 meaning). Needs
    a single docx correction pass whenever documentation is next touched
    — same edit-and-verify process as the rest of that document.

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
  - Lead.idNumber field-level encryption: KMS-hardened as of §111 — AWS
    KMS now does the master-key wrapping step that used to be a raw key
    in a Vercel env var. Requires KMS_MASTER_KEY_ID/AWS_REGION/
    AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY all set before deploying, or
    Lead creation/update breaks for any lead with an ID number — see
    §111 for the full deployment sequencing warning.
  - Session token storage: httpOnly cookie now (§113), not sessionStorage
    — JavaScript, including injected/malicious JS via XSS, can never
    read it. Was sessionStorage before (JS-readable, exposed to token
    theft via any XSS vector); this closes that off. SameSite=Strict,
    Secure hardcoded on. CORS's permissive Origin-reflection policy
    stays safe with a cookie in play specifically because of that
    SameSite=Strict setting plus never setting Access-Control-Allow-
    Credentials — see §113 for the full reasoning; that pairing is
    load-bearing, not incidental. No CSP header configured either
    (checked frontend/vercel.json) — no defense-in-depth against XSS
    beyond React's own default JSX escaping, still an open item if ever
    wanted.
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
  - Text input font-size must stay >= 16px (1rem). Below that, iOS
    Safari auto-zooms the viewport on focus and doesn't zoom back out —
    the root cause of the Lead Portal zoom bug, §101. Any new form
    control that doesn't route through tokens.js's shared formInput
    style needs this checked explicitly.

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

[UPDATE 3 Aug 2026: resolved, see §100 — decision confirmed to defer to
Vercel's own Pro-plan WAF rather than Cloudflare specifically (no Azure
origin exists for Cloudflare to sit in front of), with these two
endpoints named among the priority targets once that Custom Rule is
actually configured against the customer's real Vercel account.]

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
79. POPIA SUBJECT ACCESS REQUEST PROCESSING — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's pick from §75's production-readiness list — the last genuinely
missing feature from that audit (Medical Subscription import and the
Entra branch cleanup are the only items left there now, plus the
process/paperwork items that were never code tasks in the first place).
Chosen ahead of Medical Subscription import and the token economy
specifically because this product's whole positioning is FAIS/POPIA
compliance — shipping without a working way to handle a data subject's
access request was a real gap in exactly the area meant to be a
strength, more than either of the other two candidates.

FUNCTION COUNT: routed through the already-existing leads-router.js
(GET/POST /api/leads/sar-requests, GET/PATCH /api/leads/sar-requests/:id,
GET .../:id/export) — a genuine domain fit this time (a SAR is always
tied to a Lead), not just "wherever there's room" the way some earlier
additions were. Still 12/12, no new function.

DESIGN: a SAR is always tied to a Lead — MedBroker's primary holder of
personal information about a data subject. If someone requesting access
isn't in the system as a Lead at all, there's nothing to compile in the
first place, so leadId is required, not optional, on the new
SubjectAccessRequest table. Admin/GlobalAdmin only, matching Audit Log's
access pattern — SAR processing can touch any Lead in the organisation,
not just a Supervisor's own team, so it doesn't fit the usual
scoped-visibility model Leads/Appointments/Tasks use.

Two distinct concerns, kept separate: tracking the REQUEST itself
(who asked, when, status: Received/InProgress/Fulfilled/Rejected, due
date, notes) versus actually COMPILING what MedBroker holds about that
Lead (a separate function, compileSubjectData, called specifically at
export time, not baked into the request-tracking flow).

BUILT:
  - Migration 017_add_subject_access_request.sql — new
    SubjectAccessRequest table.
  - NEW models/sar.js — CreateSarRequestSchema, UpdateSarStatusSchema.
  - NEW sarService.js — listSarRequests/createSarRequest/
    updateSarStatus (standard CRUD, matching every other service in this
    codebase) plus compileSubjectData(leadId), the part that actually
    fulfils a request: the Lead record itself (ID number DECRYPTED
    specifically for this export — the one place in the whole app where
    showing a staff member the plaintext is exactly the point, not a
    leak; every other view of a Lead never does this), every call
    attempt, every appointment with full meeting history, every task
    linked to the lead, and the lead's own audit trail (who's
    accessed/changed their data — POPIA's accountability angle, not
    just the raw data itself).
  - NEW sarHandlers.js — collection/detail/export handlers. Export
    supports JSON (the full nested compiled structure, the more
    legally-meaningful format for handing someone their own data) and
    CSV (flattened to one row, nested arrays JSON-stringified into
    cells — same pattern already established for Audit Log's
    changeDetail column, reused rather than reinvented). Every export
    is itself written to AuditLog (SarDataExported) — separately from
    SarRequestCreated/SarStatusChanged, so the log shows specifically
    WHEN the data was actually pulled, not just when the request was
    logged.
  - leads-router.js: sar-requests sub-routes added, checked before the
    generic 1/2-segment :id branches, same defensive-ordering
    convention as everywhere else.
  - auditHandlers.js: the three new SAR action types added to the
    Audit Log's filter dropdown (SarRequestCreated, SarStatusChanged,
    SarDataExported) — otherwise they'd be recorded but not filterable.
  - AppAdmin.jsx: new 6th tab, "Data Requests". List with status filter
    and pagination; a create form with a live Lead search-and-select
    (reuses leadsApi.list({search}), no new backend needed for that
    part); expandable rows (same interaction pattern Tasks.jsx already
    uses) showing notes, one-click status transitions, and per-request
    Export JSON/CSV buttons.
  - api.js: sarApi client, including its own export() — same
    can't-use-request()-because-it's-a-file-not-JSON reasoning as
    auditApi.export(), same authenticated-fetch-plus-Blob-download
    pattern, not reinvented.

CAUGHT DURING BUILD, not after: initially wrote the compileSubjectData
join to AuditLog and the Lead/Appointment id joins without re-checking
column types first — given the Audit Log cast-failure lesson from §76,
deliberately checked Task.entityId's actual type (UUID, not VARCHAR the
way AuditLog.entityId is) before trusting a plain equality comparison
there was safe, rather than assume the same fix from §76 was needed
again by default.

VERIFIED: full Vite production build clean (AppAdmin's own bundle grew
~20KB -> ~29KB, consistent with a new tab, not a red flag); existing
45-test Vitest suite unaffected; every new/edited backend file passes
node --check and an ESM import smoke test; every column name used in
compileSubjectData's queries (productsInterestedIn, customerSigned,
meeting1Status/2/3, etc.) individually re-checked against the actual
schema rather than typed from memory.

NOT YET DONE: no email notification to the requestor when their request
is marked Fulfilled — plausible small follow-up once real email sending
(§78) has been confirmed working end-to-end, not built as part of this
entry since it wasn't asked for and would have expanded scope.

MIGRATION:
  frontend/db/migrations/017_add_subject_access_request.sql (NEW)
  frontend/db/schema.postgres.sql          (SubjectAccessRequest table added)
  frontend/api-lib/models/sar.js           (NEW)
  frontend/api-lib/services/sarService.js  (NEW)
  frontend/api-lib/handlers/sarHandlers.js (NEW)
  frontend/api-lib/handlers/auditHandlers.js (new SAR action types added to filter list)
  frontend/api/leads-router.js             (sar-requests sub-routes added)
  frontend/src/services/api.js             (sarApi added)
  frontend/src/pages/AppAdmin.jsx          (Data Requests tab added)
Plus this Status_Vercel.md.

NEXT: Medical Subscription lead import (the channel itself) and the
dead Entra-branch cleanup are what's left on §75's original list, plus
the process/paperwork security items that were never code tasks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
80. MEDICAL SUBSCRIPTION LEAD IMPORT — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next item from §75's list — the "Medical Subscription" import channel
was a UI mockup with no backend at all (§63 had already made it
honestly disabled rather than fake-functional, but it still didn't do
anything). Investigated properly before building: MedicalSubscription
was already a real table (name/providerName/notes/isActive), and
Lead.linkedSubscriptionId was already a real foreign key to it —
leadService.createLead() already accepted and inserted
linkedSubscriptionId, and sourceLabel display already COALESCEd across
Event/MedicalSubscription/manualSourceName. The DISPLAY side was already
built; only the actual import mechanism was missing. This turned out to
simplify the build a lot — "Medical Subscription import" isn't a live
third-party API integration (no such fields exist on the table at all),
it's the SAME file-upload/parse/dedupe mechanism as the already-working
CSV import, just tagging leads with linkedSubscriptionId instead of
manualSourceName. Confirmed this by reading the CSV tab's actual working
code (handleFileChange, handleImport) before assuming anything about
scope.

FUNCTION COUNT: new GET/POST /api/leads/subscriptions sub-route on the
already-existing leads-router.js — no new function, 12/12 unchanged.

BUILT:
  - leadService.js: listMedicalSubscriptions() (all subscriptions, with
    REAL stats — leads imported count, last import date, computed via
    LEFT JOIN + COUNT/MAX against Lead, not stored/cached) and
    createMedicalSubscription().
  - models/lead.js: CreateMedicalSubscriptionSchema.
  - leadHandlers.js: handleLeadMedicalSubscriptions() — GET (Admin/
    Supervisor/GlobalAdmin, matches who can import) and POST (Admin/
    GlobalAdmin only, tighter — creating a subscription is a management
    action, not an import action).
  - leads-router.js: subscriptions sub-route added.
  - LeadImport.jsx: Subscription tab rebuilt from scratch — reuses the
    EXACT SAME state and handleFileChange as the CSV tab (same drop
    zone, same real duplicate-check, same preview, same result
    reporting), swapping only the free-text source-name input for a
    real subscription dropdown fetched from the new endpoint.
    handleImport now branches on which tab is active for tagging
    (linkedSubscriptionId vs manualSourceName) while sharing every other
    line of the import loop. Removed the dead hardcoded SUBSCRIPTIONS
    mock array — no longer referenced anywhere once the dropdown is
    real. Stale header comment fixed (no longer says "UI mockup only").

CAUGHT AND FIXED MID-BUILD, not left for later: while testing, found
that the import UI's own guidance ("add a subscription under App Admin")
pointed at a completely dead button — AppAdmin.jsx's "+ Add
Subscription" had no onClick handler at all, and the whole tab rendered
hardcoded MOCK_SUBSCRIPTIONS data. Shipping a working import feature
whose only path to creating a real subscription was a non-functional
button would have been a half-finished feature, not a complete one — so
this got fixed in the same delivery rather than flagged as a follow-up:
AppAdmin.jsx's Subscriptions tab is now real (fetches
listMedicalSubscriptions(), a working create form posts to the new
endpoint), MOCK_SUBSCRIPTIONS kept only as the Entra-branch fallback
(matching every other tab's demoMode-gated pattern), not removed
entirely.

VERIFIED: full Vite production build clean (AppAdmin's bundle grew
~29KB -> ~30KB, LeadImport ~347KB -> ~350KB, both consistent with real
new content, not a red flag); existing 45-test Vitest suite unaffected;
every new/edited backend file passes node --check and an ESM import
smoke test.

MIGRATION — no schema change (MedicalSubscription table already existed):
  frontend/api-lib/services/leadService.js  (listMedicalSubscriptions, createMedicalSubscription added)
  frontend/api-lib/models/lead.js           (CreateMedicalSubscriptionSchema added)
  frontend/api-lib/handlers/leadHandlers.js (handleLeadMedicalSubscriptions added)
  frontend/api/leads-router.js              (subscriptions sub-route added)
  frontend/src/services/api.js              (listSubscriptions, createSubscription added)
  frontend/src/pages/LeadImport.jsx         (Subscription tab rebuilt)
  frontend/src/pages/AppAdmin.jsx           (Subscriptions tab real-wired)
Plus this Status_Vercel.md.

NEXT: dead Entra-branch cleanup (~8 files, optional, Mark's call on
priority) is the last item on §75's original list; everything else
remaining there was process/paperwork, not a code task.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
81. FIXED — ADMIN COULD NOT UNLOCK A LOCKED ACCOUNT — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found this testing §72's password policy: an account locks
correctly after too many failed logins, but there was no way for an
Admin (or anyone) to unlock it again. He asked whether this was
deliberately reserved for GlobalAdmin.

It wasn't. Checked before answering: unlockUser() has existed in
userService.js since §72, but nothing anywhere in the codebase ever
called it — no handler, no route, no UI button. Not a role restriction,
a genuinely unfinished feature. Also found isLocked/failedLoginAttempts
were selected by neither the user LIST query nor the detail query the
Edit User modal uses — meaning even if the button had existed, there
was no way to tell which accounts were locked in the first place.

FUNCTION COUNT: PUT /api/users/:id/unlock added as a sub-route on the
already-existing users-router.js — no new function.

BUILT:
  - userService.js: isLocked + failedLoginAttempts added to
    USER_LIST_SELECT (shared by both listUsers and getUserForAdmin) —
    Postgres's primary-key functional-dependency rule means this didn't
    need a GROUP BY change (u.isActive was already relying on the same
    thing, confirmed before assuming it'd just work).
  - userHandlers.js: new handleUserUnlock() — Admin/GlobalAdmin, the
    SAME role gate as everything else in User Admin, correcting the
    assumption this was GlobalAdmin-only. This is a routine account-
    administration action, not a system-configuration one, so it
    doesn't belong behind a tighter gate than the rest of this router.
    Writes UserUnlocked to the audit trail.
  - users-router.js: unlock sub-route added.
  - auditHandlers.js: UserUnlocked added to the Audit Log's filterable
    action list.
  - UserAdmin.jsx: a red "Locked" badge now shows next to Active/
    Inactive in the main table, so locked accounts are visible without
    opening each one. The Edit User modal shows a clear locked notice
    up top (not just an implied state from a button's presence), and
    an "Unlock Account" button next to Deactivate, shown only when the
    account is actually locked. New onUnlock prop threaded through
    from the parent, mirroring the existing onSave pattern rather than
    inventing a different one.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test.

MIGRATION — no schema change (isLocked/failedLoginAttempts already existed):
  frontend/api-lib/services/userService.js  (isLocked/failedLoginAttempts added to shared SELECT)
  frontend/api-lib/handlers/userHandlers.js (handleUserUnlock added)
  frontend/api-lib/handlers/auditHandlers.js (UserUnlocked added to filter list)
  frontend/api/users-router.js              (unlock sub-route added)
  frontend/src/services/api.js              (usersApi.unlock added)
  frontend/src/pages/UserAdmin.jsx          (Locked badge, modal notice, Unlock button)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
82. FIXED — AGENT/BROKER "REPORTS" LINK BROKEN ("INVALID BROKER ID FORMAT") — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found this testing as Jane Smith (Broker) — clicking Reports threw
"Could not load this broker's report. Invalid broker ID format",
navigating to /reports/broker/sb.

ROOT CAUSE: App.jsx's own comment gave this away immediately — "these
values match the preview personas" (i.e. the OLD role-switcher preview
mode this app had before real login existed).
SELF_REPORT_ID = { Agent: 'tm', Broker: 'sb' } was a hardcoded lookup
that was always meant to be replaced with the real authenticated user's
id once real auth landed, and nothing ever came back and did that. Both
the sidebar's own "Reports" nav link AND the reportsLanding
redirect logic were building URLs from these literal strings instead of
the logged-in user's actual id — so every Agent/Broker's own report link
was broken for every single one of them, not just Jane. Confirmed the
destination pages (AgentDetail.jsx, BrokerDetail.jsx) were NOT part of
the bug — both were already correctly rewired to expect a real User.id
back on 23 Jul (their own header comments say so); only the link
generation in App.jsx was never updated to match, which is the entire
bug.

FIX: AppLayoutWrapper now destructures persona from useRole() (it only
had role before) and uses persona.id — the real logged-in user's id —
everywhere SELF_REPORT_ID used to be read, for both reportsLanding and
the value passed to ReportDrillGuard. Same fix applied to the sidebar's
"Reports" nav link in AppLayout, a separate component that had the exact
same hardcoded 'tm'/'sb' strings inline.

VERIFIED: grepped the entire frontend for any other reference to these
placeholder strings after fixing — the only remaining hits are in
historical comments in AgentDetail.jsx/BrokerDetail.jsx documenting what
USED to be wrong there before their own 23 Jul fix, not live code. Full
Vite production build clean; existing 45-test Vitest suite unaffected.

MIGRATION — no backend change, frontend only:
  frontend/src/App.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
83. FIXED — SINGLE SIGN-ON NAV ITEM NOW HIDDEN WHEN THE FLAG IS OFF — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's request: the Single Sign-On nav item/page was always visible to
Admin/GlobalAdmin regardless of auth.sso.enabled — inconsistent with
Tasks/Events, which hide their own nav items when their flag is off.

The existing behaviour had a deliberate-looking comment defending it:
"reachable regardless of current flag state — you need to get here to
turn it on". Checked whether that reasoning still held before changing
anything — it didn't: §75's rewrite of SingleSignOn.jsx made it a purely
informational page with no flag-toggle control on it at all (confirmed
by grepping the file for any toggle/onClick/flag-update code — none
exists). Flag toggling only ever happens via the separate Feature Flags
page, which isn't affected by this change and stays reachable for
GlobalAdmin either way. So the original justification no longer applied
— hiding the nav item doesn't trap anyone from turning the flag back on.

FIX: showSso now requires flag('auth.sso.enabled') in addition to the
existing isAdminOrAbove role check — same pattern Tasks/Events already
use. Also gated the /admin/sso ROUTE itself the same way, not just the
nav link — matches how Tasks/Events block direct URL navigation too,
not only hide the sidebar entry.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected.

MIGRATION — no backend change, frontend only:
  frontend/src/App.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
84. DEAD ENTRA-BRANCH CODE CLEANUP — BATCH 1 OF SEVERAL — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Last item from §75's original list. Mark confirmed the full scope
before starting: not just the original 8 auth-infrastructure files, but
the wider demoMode ? real : MOCK_X fallback pattern used across most
data-fetching pages too — a genuinely large refactor, so this is being
done in verified batches rather than one giant unreviewed sweep.

FOUND ON INVESTIGATION: the actual codebase split into two meaningfully
different categories, not one — worth recording since it changed how
this was sequenced:
  - Category A (trivial): LeadList, AppointmentList, Reports,
    AgentDetail, BrokerDetail, FeatureFlags — each had only a bare
    apiMode.DEMO_MODE && loading-style gate on a loading indicator (or,
    for FeatureFlags, a redundant if around one line), no actual mock
    dataset, no alternate rendering path. Six files, all mechanical.
  - Category B (substantial): AppAdmin.jsx alone has 31 demoMode
    references and 2 real MOCK_ datasets; Tasks.jsx has 17 references
    and 2 MOCK_ datasets; Notifications.jsx has 6 references and 1
    MOCK_ dataset; Settings.jsx has 8 references with no MOCK_ constant
    but real conditional identity-source logic. These need individual,
    careful handling — batched separately, not attempted in this entry.
  - Category C (foundational, highest risk, saved for last): RoleContext
    .jsx and AuthContext.jsx derive role/persona/auth state itself and
    are used by essentially every page in the app; Login.jsx and
    App.jsx's AuthGate gate the entire authenticated app on this same
    logic. A mistake here risks breaking the whole application, not
    just one page — deliberately sequenced last, after building
    confidence on the lower-risk categories first.

BUILT THIS ENTRY — Category A (6 files) plus UserAdmin.jsx (5
references, no MOCK_ dataset, turned out simple enough to fold into this
same batch): every apiMode.DEMO_MODE / demoMode check removed since it
always evaluated true in this deployment; the now-always-true branch
kept, the dead branch deleted, not left commented out. UserAdmin.jsx
also had a demoMode PROP threaded into UserModal — removed at both ends
(the prop declaration and the pass-through), not just simplified in
place, since prop-drilling an always-true value serves no purpose.
Removed the now-unused apiMode import from all 7 files rather than
leave a dangling import.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected. Checked after this batch specifically (not deferred
to a single check at the very end of the whole cleanup) so any issue
is caught close to its cause.

NOT YET DONE — remaining batches: AppAdmin.jsx, Tasks.jsx,
Notifications.jsx, Settings.jsx (Category B); RoleContext.jsx,
AuthContext.jsx, Login.jsx, App.jsx (Category C, highest risk, last).

MIGRATION — no schema change, frontend only:
  frontend/src/pages/LeadList.jsx
  frontend/src/pages/AppointmentList.jsx
  frontend/src/pages/Reports.jsx
  frontend/src/pages/AgentDetail.jsx
  frontend/src/pages/BrokerDetail.jsx
  frontend/src/pages/FeatureFlags.jsx
  frontend/src/pages/UserAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
85. DEAD ENTRA-BRANCH CODE CLEANUP — BATCH 2 (NOTIFICATIONS + APP.JSX BADGES) — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Continuing §84. This batch: Notifications.jsx in full, plus the
isolated notification/task-badge-count portion of App.jsx specifically
— NOT the rest of App.jsx, which shares foundational machinery with
RoleContext/AuthContext and is staying in the last, highest-risk batch
on purpose (see §84's own reasoning).

Notifications.jsx: removed MOCK_NOTIFICATIONS (6 fake entries) and the
mockItems/setMockItems local state entirely — every code path here was
already real as of §61/§68 (both action-driven and Cron-scheduled
notification types), so the mock branch had nothing left to cover that
the real one didn't already handle. markAllRead/markRead simplified to
their real-API branch only. Header comment updated — it had described
RescheduleReminder as one of the "not yet built" scheduled types, which
was already stale before this cleanup even started (§68 built the
Cron-scheduled types months ago); confirmed via App.jsx's own Task
badge comment that RescheduleReminder is actually dead/unused code, not
a missed requirement, and said so plainly rather than leaving another
vague "needs building" note.

App.jsx (partial): the unread-notification-count badge and the
pending-task-count badge each had a demoMode gate — removed both, now
unconditional fetches. Deliberately did NOT touch the "Preview mode"
role-switcher UI block still in this file (the ⚠ Preview mode
dropdown, tied directly to useRole()'s previewRole/setRole) — that's
entangled with RoleContext's preview-mode machinery and belongs in the
same pass as RoleContext/AuthContext, not fixed in isolation now where
it would leave the underlying machinery dangling until that batch.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected.

NOT YET DONE — remaining batches: Tasks.jsx, AppAdmin.jsx, Settings.jsx
(Category B); RoleContext.jsx, AuthContext.jsx, Login.jsx, and the rest
of App.jsx (Category C, last).

MIGRATION — no schema change, frontend only:
  frontend/src/pages/Notifications.jsx
  frontend/src/App.jsx (partial — badge counts only)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
86. DEAD ENTRA-BRANCH CODE CLEANUP — BATCH 3 (TASKS.JSX) — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Continuing §84/§85. This was the biggest, most tangled file in the whole
cleanup — 17 demoMode references, 2 mock datasets, and one mechanism
(roleName) that reached into filtering, metrics, AND category-tab counts
simultaneously. Read the entire file in full before touching anything,
given the scale, rather than editing section by section from a partial
view.

REMOVED:
  - MOCK_TASKS (11 fake tasks) and ASSIGNEES (a fixed name list) —
    entire ~120-line block deleted, not commented out.
  - MOCK_TODAY, the fixed reference date MOCK_TASKS' relative-date
    badges were curated against — no longer needed once the mock data
    is gone.
  - TaskRow's comment-thread demoMode branch — the "local, in-memory
    thread" fallback for a task's comments, simplified to always use
    the real backend (already fully real since §71).
  - mockTasks/setMockTasks local state, and the entire demoMode ? real
    : mock pattern across toggleDone/deleteTaskHandler/addTask — each
    simplified to its real-API branch only.
  - roleName — this was the largest single piece of dead logic in the
    whole cleanup exercise: a hardcoded name-matching mechanism
    ("Thabo Molefe" for Agent, "Sandra van der Berg" for Broker) that
    only ever existed because the Entra branch couldn't derive a real
    identity. It touched three separate places (the main filtered list,
    the metrics/myTasks calculation, and every category tab's count) —
    all three simplified together in the same pass, since leaving even
    one usage behind would have left roleName looking load-bearing when
    it wasn't. matchesAssigneeFilter's own demoMode branch (string name
    match vs id match) simplified to id-match only, the real shape.

VERIFIED: full Vite production build clean — Tasks.jsx's own bundle
shrank from 20.60 kB to 16.37 kB, a real, measurable confirmation that
actual dead code came out, not just cosmetic tidying. Existing 45-test
Vitest suite unaffected. Grepped the finished file for demoMode/
apiMode/roleName/MOCK_/Entra as a final check — zero remaining matches.

NOT YET DONE — remaining batches: AppAdmin.jsx (31 refs, the largest
remaining), Settings.jsx (8 refs); RoleContext.jsx, AuthContext.jsx,
Login.jsx, and the rest of App.jsx (Category C, last, on purpose).

MIGRATION — no schema change, frontend only:
  frontend/src/pages/Tasks.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
87. DEAD ENTRA-BRANCH CODE CLEANUP — BATCH 4 (APPADMIN + SETTINGS) — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Continuing §84/§85/§86. AppAdmin.jsx — the largest remaining file at 31
references — and Settings.jsx.

AppAdmin.jsx: removed MOCK_AUDIT_LOG and MOCK_SUBSCRIPTIONS entirely.
Every demoMode ? real : fallback across System Settings, Audit Log
(including the whole filter UI block, which was wrapped in a single
{demoMode && (...)} around ~55 lines — unwrapped rather than simplified
in place, since it's now unconditional), Data Requests/SAR, and
Subscriptions simplified to its real branch only. saveSettings() had a
fake "pretend to save" early-return for the non-demo path — removed.

Settings.jsx: removed the entire Entra-branch fallback in handleSave()
(sessionStorage-only saving, no real backend) and handleThemeSelect()'s
demoMode guard. Email field and the Security/change-password card
(previously hidden entirely outside demo mode) simplified to always
show the real thing. Removed the stale header paragraph explaining why
the Entra branch was "unchanged" — that reasoning no longer applies to
anything in this file.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
88. DEAD ENTRA-BRANCH CODE CLEANUP — BATCH 5, FINAL (ROLECONTEXT + AUTHCONTEXT + LOGIN + APP.JSX) — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completes §84 through §88 — the full dead Entra-branch cleanup Mark
asked for, confirmed full scope (auth infrastructure + the wider
demoMode ? real : mock pattern) before starting. This batch was
deliberately sequenced last: RoleContext.jsx and AuthContext.jsx derive
role/persona/auth state for the entire app, and every single page
depends on them — a mistake here doesn't break one page, it breaks
everything.

RISK MANAGEMENT — done before writing any code, not after: grepped every
actual import statement pulling from RoleContext.jsx across the whole
codebase (not just files that mention "demoMode") to get a complete,
verified picture of what's actually consumed where. This surfaced two
things worth recording:
  - PERSONAS was imported by exactly one file outside RoleContext.jsx
    itself: App.jsx's own dead "Preview mode" role-switcher UI (the
    same block flagged and deliberately deferred in §85, precisely so
    it could be fixed together with RoleContext rather than in
    isolation and leaving RoleContext's machinery looking used when it
    wasn't).
  - PORTFOLIOS/PRODUCTS_BY_PORTFOLIO are real, actively-used reference
    data — confirmed real consumers (AppAdmin.jsx, UserAdmin.jsx,
    LeadDetail.jsx, LeadImport.jsx) before concluding they were safe to
    leave completely untouched, not assumed safe because the surrounding
    file was being cleaned up.

A SPECIFIC CORRECTNESS RISK CAUGHT AND HANDLED, not overlooked: naively
removing RoleContext's "else" branch and assuming user is always
truthy would have been wrong. RoleProvider wraps the entire app,
including the brief render before AuthContext resolves and while the
Login page itself is showing — user is genuinely null at that moment,
and a React provider's render function still executes and must
successfully compute its context value even if nothing is currently
consuming it. Confirmed by grepping every single useRole() call site
across the whole app that none of them render before authentication
succeeds, then kept persona/role defaulting to null (a safe, minimal
fallback) rather than assuming user is always present. This is the kind
of check that's easy to skip when a file "obviously" only matters after
login — it doesn't render only then, it just isn't read until then.

BUILT:
  - RoleContext.jsx: removed PERSONAS, ROLES, ROLE_STORAGE_KEY,
    getInitialRole(), previewRole/setPreviewRole, and the sessionStorage-
    persistence useEffect entirely. PORTFOLIOS/PRODUCTS_BY_PORTFOLIO
    (real reference data, unrelated to auth) untouched.
  - AuthContext.jsx: removed the entire demoMode branch — isAuthenticated,
    the initial user state, and the onUnauthorized subscription are all
    unconditional now. demoMode removed from the exposed context value
    (confirmed exactly one consumer existed — App.jsx — fixed in the
    same batch, see below).
  - App.jsx: removed the dead "⚠ Preview mode" role-switcher dropdown
    (deferred from §85 for exactly this reason) — the "Signed in / Log
    out" state now always renders, unconditionally. Removed the now-
    unused setRole from its useRole() destructuring (nothing calls it
    anymore). Simplified AuthGate — was apiMode.DEMO_MODE && 
    !isAuthenticated, now just !isAuthenticated; comment above it fixed
    too ("only meaningful in demo-backend mode" no longer true, this is
    the app's only auth mode). Removed the now-unused apiMode import.
  - Login.jsx: no code branches existed here (confirmed before editing —
    it was always a single, real implementation), just a stale header
    comment claiming it was conditionally rendered only in "demo-backend
    mode" alongside "preview mode" and "Entra production mode (MSAL
    redirect flow)" alternatives that don't exist. Fixed the comment;
    no logic changed.

VERIFIED: full Vite production build clean — the main index bundle
(containing App.jsx/RoleContext/AuthContext) shrank from 271.87 kB to
270.09 kB, confirming real removal there too, not just in the page-level
files. Existing 45-test Vitest suite unaffected. Final comprehensive
grep across the ENTIRE frontend for Entra/MSAL/demoMode/DEMO_MODE/
PERSONAS after all edits — every remaining hit checked individually and
confirmed to be an explanatory comment (either this entry's own "FIXED"
notes, or SingleSignOn.jsx's already-accurate §75 comment), zero live
code remaining anywhere.

This closes out §75's original production-readiness list in full —
every item on it is now either built, fixed, or correctly identified as
process/paperwork outside the scope of what code changes can address.

MIGRATION — no schema change, frontend only:
  frontend/src/pages/AppAdmin.jsx
  frontend/src/pages/Settings.jsx
  frontend/src/context/RoleContext.jsx
  frontend/src/context/AuthContext.jsx
  frontend/src/App.jsx
  frontend/src/pages/Login.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
89. FIXED — PORTFOLIOS AND PRODUCTS TABS WERE ENTIRELY FAKE — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found this testing after §88 — App Admin's Portfolios and Products
tabs "don't work at all". Checked carefully whether this was a
regression from §88's large RoleContext/AuthContext/App.jsx refactor
before doing anything else, given the scale of that change — it
wasn't. Both tabs were always entirely hardcoded: fabricated numbers
("487 active leads", "3 brokers assigned", per-product monthly sales
figures pulled from a literal array of made-up integers) and "+ Add
Portfolio"/"+ Add Product"/"Edit" buttons with no onClick handlers at
all — never wired to anything, in any session.

Checked what MedBroker-User-Guide.docx already told the customer about
this page before deciding how to fix it, rather than guess at the
intended design: "These are fixed to match your organisation's
licensing and are not user-editable." That resolves the question
cleanly — the buttons and fake numbers were the bug, not evidence of a
missing CRUD feature. Building real portfolio/product management would
also have been a much larger undertaking than it looks: PORTFOLIOS and
PRODUCTS_BY_PORTFOLIO are hardcoded constants threaded through Lead
creation, User Admin's portfolio/product checkboxes, LeadImport, and
more — making them genuinely dynamic would mean touching all of those,
not just this one tab.

FIX: both tabs rebuilt as honest, static reference views — real
portfolio/product names and their real relationship to each other
(pulled from the same PORTFOLIOS/PRODUCTS_BY_PORTFOLIO constants
already used correctly everywhere else in the app), no fabricated
metrics, no dead buttons. ALL_PRODUCTS' fake sold/status fields removed
from the constant itself, not just hidden from the table — nothing
else in the file referenced them.

VERIFIED: full Vite production build clean — AppAdmin's own bundle
shrank further, 30.33 kB -> 28.22 kB; existing 45-test Vitest suite
unaffected.

STATUS CHECK (Mark also asked what's still outstanding overall):
everything from the original §75 production-readiness audit is now
either built, fixed, or correctly identified as process/paperwork
outside what code changes can address. What remains:
  - Token economy (Stripe) — needs Mark's pricing decisions before any
    build work can start, not a scoping gap.
  - Rate limiting on authenticated endpoints, session token refresh/
    revocation, TLS certificate verification tightening — buildable,
    not yet started.
  - Dependency bumps (ESLint v10, Vite v8/Vitest v4, React Router v8) —
    lowest priority, already established as such.
  - Process/paperwork items that were never code tasks: a real
    penetration test, operator agreements with Vercel and Neon, a
    cross-border data transfer assessment, a breach-notification
    process, actually testing DB backup/restore.

MIGRATION — no schema change, frontend only:
  frontend/src/pages/AppAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
90. REAL PORTFOLIO/PRODUCT MANAGEMENT — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Follow-up to §89 — after seeing the honest static reference view,
Mark clarified he wants these pages genuinely functional: a customer
Admin should be able to add portfolios and products, with products
correctly related to a portfolio. This turned out to be a much bigger
change than the tab itself — PORTFOLIOS/PRODUCTS_BY_PORTFOLIO were
hardcoded module-level constants in RoleContext.jsx, imported directly
by five different files (AppAdmin, User Admin's assignment checkboxes,
Lead Detail, Lead Import, Appointment Detail's products-sold), none of
which could ever see a newly-added portfolio without a full rewrite of
how this data flows through the app.

WHAT ALREADY EXISTED, confirmed before designing anything: real
Portfolio and Product tables, correctly related via Product.portfolioId,
already in the schema and already seeded with the same Discovery/Money
and Medicine data the hardcoded constants mirrored. A real
UserPortfolio junction table for user assignment also already existed.
The gap was purely that nothing ever exposed this over the API — the
data model was already right.

FUNCTION COUNT: GET/POST /api/leads/portfolios and POST /api/leads/
portfolios/:id/products added as sub-routes on leads-router.js — no new
function, 12/12 unchanged.

ARCHITECTURE: rather than have every consumer fetch this independently
(five separate fetches, five separate chances to go stale relative to
each other), RoleContext.jsx now fetches portfolios+products once and
exposes them through the same useRole() hook every consumer already
calls for role/persona — portfolios (array of {id, name, products}) and
productsByPortfolio (name-keyed, not id-keyed, matching how the rest of
the app already treats portfolio/product ASSIGNMENT as name-based, e.g.
User.portfolios/products are string-name arrays — see userService.js's
USER_LIST_SELECT). Name-keying also let every consumer drop its own
'disc'/'mm' key-translation hack, a genuine simplification alongside
making the data live.

A REAL BUG CAUGHT DURING THE MIGRATION, not after: LeadDetail.jsx has
two separate components in the same file — LeadDetail() itself, and
BookAppointmentModal(), which already had its own local portfolios/
setPortfolios state (the SELECTED portfolios for the appointment being
booked, entirely different from the new reference list of ALL available
portfolios). Naively destructuring the new context value as portfolios
in both places would have been a duplicate-declaration syntax error in
BookAppointmentModal specifically. Found by tracing every usage
individually before editing, not a blanket find-and-replace — renamed
to allPortfolios specifically where a real collision existed, left the
local selection state's name untouched elsewhere. The exact same
collision shape existed in UserAdmin.jsx's PortfolioProductSelector
(portfolios/products props are a user's ASSIGNED values) and was
handled the same deliberate way — useRole() called in the parent
(UserModal), the reference data passed down as new, distinctly-named
props rather than called a second time inside the child component.

BUILT:
  - NEW portfolioService.js — listPortfoliosWithProducts() (one query,
    JSON-aggregated, not fetched flat and joined client-side — every
    consumer needs "portfolio with its products nested" together, never
    one without the other), createPortfolio(), createProduct().
  - CAUGHT BEFORE TRUSTING IT: the json_agg result — no existing
    json_agg query anywhere in this codebase to confirm node-postgres's
    usual auto-parse-json-columns behaviour actually holds here, so the
    handling is defensive (checks whether the result is already an
    array or still a JSON string) rather than asserted confidently in a
    comment and left to find out in production.
  - NEW portfolioHandlers.js — LIST open to any authenticated role
    (pure reference data, nothing sensitive, and every role's own forms
    need it); CREATE Admin/GlobalAdmin only, matching Medical
    Subscription's own creation gate (§80).
  - leads-router.js: portfolios sub-routes added.
  - RoleContext.jsx: portfolios/productsByPortfolio/refetchPortfolios
    added to the exposed context value, fetched via the same useFetch
    pattern used throughout, gated on `user` existing (same "don't
    fetch before login" reasoning already applied to persona/role).
  - AppointmentDetail.jsx, LeadDetail.jsx, UserAdmin.jsx, LeadImport.jsx:
    migrated from the static import to useRole(), each checked
    individually for local-variable collisions before editing rather
    than assumed safe.
  - AppAdmin.jsx: Portfolios and Products tabs rebuilt again (replacing
    §89's static reference view) — real "+ Add Portfolio" and
    "+ Add Product" forms, the latter requiring a portfolio to be
    selected first (products can't exist without one, matching the
    real FK constraint), both wired to the new endpoints and refetching
    through the same refetchPortfolios() so every other open page
    picks up the change too, not just this tab.

VERIFIED: full Vite production build clean across all six touched
frontend files plus RoleContext; existing 45-test Vitest suite
unaffected; every new/edited backend file passes node --check and an
ESM import smoke test. Final comprehensive grep across the ENTIRE
frontend for PORTFOLIOS/PRODUCTS_BY_PORTFOLIO after all edits — the
only remaining hit is this entry's own explanatory comment in
RoleContext.jsx, zero live code left referencing the old static data.

MIGRATION — no schema change (Portfolio/Product/UserPortfolio tables
already existed and were already correctly related):
  frontend/api-lib/services/portfolioService.js (NEW)
  frontend/api-lib/handlers/portfolioHandlers.js (NEW)
  frontend/api-lib/models/lead.js          (CreatePortfolioSchema, CreateProductSchema added)
  frontend/api/leads-router.js             (portfolios sub-routes added)
  frontend/src/services/api.js             (leadsApi.listPortfolios/createPortfolio/createProduct added)
  frontend/src/context/RoleContext.jsx     (real portfolio/product fetching added)
  frontend/src/pages/AppointmentDetail.jsx (migrated to useRole())
  frontend/src/pages/LeadDetail.jsx        (migrated to useRole(), collision handled)
  frontend/src/pages/UserAdmin.jsx         (migrated to useRole(), collision handled)
  frontend/src/pages/LeadImport.jsx        (migrated to useRole())
  frontend/src/pages/AppAdmin.jsx          (real create UI built)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
91. REFERENTIAL-INTEGRITY FAILSAFES FOR PORTFOLIO/PRODUCT DELETE — 1 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked directly, while implementing §90, whether deleting a
portfolio/product still linked to leads/appointments/users was guarded
against. Honest answer at the time: no failsafe existed because delete
didn't exist at all yet — §90 only ever built create and list.

INVESTIGATED BEFORE BUILDING ANYTHING: checked every actual relationship
to Portfolio and Product in the schema, not assumed. Five are real,
FK-constrained relationships that Postgres itself already protects
(none of them cascade or null out) — Product→Portfolio, LeadPortfolio,
UserPortfolio, BrokerProduct, AppointmentProduct. One is not:
Appointment.productsInterestedIn is a JSON-stringified array of product
NAMES in a plain text column — no foreign key, nothing stopping a
delete from silently leaving it dangling. This asymmetry is exactly
what this entry closes.

CAUGHT DURING DESIGN, before writing the delete path: the existing
listPortfoliosWithProducts() query filtered to isActive = TRUE only —
meaning the moment something was deactivated, it would vanish from App
Admin's own management view too, making reactivation impossible through
the UI. Fixed by adding an includeInactive option: App Admin's own
fetch now asks for everything (so a deactivated item stays visible to
be turned back on), while every other consumer — Lead Detail, Lead
Import, Appointment Detail, User Admin's assignment checkboxes — keeps
getting the active-only default, which is what they actually want.

BUILT:
  - portfolioService.js: checkPortfolioDependents() and
    checkProductDependents() — the latter explicitly pattern-matches
    the JSON-serialised product name against Appointment.
    productsInterestedIn (the one relationship with no real FK to lean
    on), verified standalone against real edge cases before trusting it
    — including that a name like "Life Insurance" doesn't false-
    positive against a longer one like "Life Insurance Plus" sharing
    it as a prefix. setPortfolioActive()/setProductActive() (toggle
    either direction, not deactivate-only) and deletePortfolio()/
    deleteProduct() (only ever called by the handler after a dependents
    check has passed — the function itself doesn't re-check, matching
    how every other "guarded delete" in this codebase splits the check
    from the action).
  - portfolioHandlers.js: PUT for the activate/deactivate toggle, DELETE
    that checks dependents FIRST and returns a specific 409 naming
    exactly what's still attached ("still linked to 3 products, 12
    leads") rather than letting Postgres's own constraint violation
    reach the caller as a raw, unfriendly database error. The DB-level
    protection stays in place regardless as the last-resort backstop —
    this doesn't replace it, it makes the common case give a useful
    answer instead of an error page.
  - leads-router.js: PUT/DELETE routes added for both individual
    portfolios and individual products, still on the same existing
    router, no new function.
  - AppAdmin.jsx: Status column, Activate/Deactivate, and Delete
    controls added to both tables. Confirmation prompt before delete
    (matching the same window.confirm() precedent used for tasks and
    events elsewhere in this app). A delete blocked by dependents
    surfaces the backend's specific message as-is, not replaced with a
    generic one — the whole point is telling the Admin exactly what's
    still attached. The "Add Product to…" dropdown now filters to
    active portfolios only — adding a product under a deactivated
    portfolio wouldn't make sense.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test. The includeInactive boolean logic and the
product-name pattern-matching were both verified standalone against
representative cases before being trusted, not just read.

MIGRATION — no schema change (all five FK relationships already existed):
  frontend/api-lib/services/portfolioService.js  (dependents checks, activate toggle, guarded delete)
  frontend/api-lib/handlers/portfolioHandlers.js (PUT/DELETE handlers added)
  frontend/api-lib/models/lead.js                (UpdateActiveSchema added)
  frontend/api/leads-router.js                   (PUT/DELETE routes added)
  frontend/src/services/api.js                   (updatePortfolio/deletePortfolio/updateProduct/deleteProduct added)
  frontend/src/pages/AppAdmin.jsx                (Status/Activate/Deactivate/Delete UI, dual-fetch for includeInactive)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
92. CRITICAL — REMOVED A LIVE AUTHENTICATION BYPASS — 2 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found while investigating rate limiting/session revocation (the next
item on the security list) — not something Mark reported. This is the
single most serious finding of the whole build.

middleware/auth.js — the function EVERY authenticated API route in this
app calls to check who's making the request — had a second path:
whenever no Authorization header was present, it fell back to trusting
two plain HTTP headers, x-demo-user-id and x-demo-role, DIRECTLY, with
zero verification. No password. No token. No signature. Anyone who knew
or could guess a valid user id (UUIDs are guessable in practice more
often than assumed — sequential creation patterns, leaked ids in error
messages, etc.) could set two headers on any request and gain full
access as any user in any role, including GlobalAdmin — every lead's
personal and medical information, every appointment, full admin
control, all of it.

CONTEXT: this wasn't a mistake introduced carelessly. VERCEL_NOTES.md
had it documented as a deliberate, useful testing convenience from
before real login existed — "quickly testing a route as a role you
haven't created a real user for yet." The problem is that real
authentication WAS built (session 14 has covered this extensively —
local email/password login, JWT, password policy, lockout, all real)
and this fallback was simply never revisited or removed once it was.
It sat there, live, unguarded by any environment check, in an app now
built to handle a real medical insurance brokerage's real customer PII.

CHECKED BEFORE FIXING: confirmed the Lead Portal's own auth
(portalAuth.js) never had this — its own header comment explicitly says
so. The exposure was confined to the staff-facing app, not the
customer-facing portal — still critical, since staff accounts are
exactly the ones with access to everything. Also confirmed no frontend
code anywhere ever sent these headers (so nothing legitimate depended
on this path) and no test/script in the repo relies on it either.

FIX: removed entirely, not gated behind an environment check. Every
route requires a real Authorization: Bearer token now, no exceptions.
Also removed the now-dead x-demo-user-id/x-demo-role entries from the
CORS Access-Control-Allow-Headers list in helpers.js (they permitted
sending headers that no longer do anything) and updated
VERCEL_NOTES.md's own description of the auth flow to match.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected. Grepped the entire repository for any remaining
reference — the only three hits left are portalAuth.js's own comment
confirming it never had this, this entry's explanation of what was
removed, and VERCEL_NOTES.md's updated note. Zero live code path
remains.

RECOMMENDATION: given the severity, if this deployment has been
reachable at a public URL with real user data in it at any point,
worth treating this the way any credential-bypass discovery should be
treated — assume it could have been found and used, not just that it
probably wasn't. That's a judgement call for Mark and whoever owns risk
decisions for this engagement, not something Claude can assess from
here.

MIGRATION — no schema change:
  frontend/api-lib/middleware/auth.js  (bypass removed entirely)
  frontend/api-lib/http/helpers.js     (dead CORS header entries removed)
  frontend/VERCEL_NOTES.md             (auth flow description updated)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
93. THREE TESTING FIXES — PORTFOLIO/PRODUCT AUDIT LOG, FLAG TOGGLE, CANCEL BUTTON — 2 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found four issues while testing §90/§91. Three fixed here; the
fourth (Reports showing zero values) needs his input before committing
to a fix — see the note at the end of this entry.

1. PORTFOLIO/PRODUCT AUDIT LOG — a real gap, not a false alarm.
   portfolioHandlers.js had zero writeAuditLog() calls anywhere, unlike
   every other mutating endpoint in this codebase. Added audit logging
   to all six mutation points: create/status-change/delete for both
   Portfolio and Product (PortfolioCreated, PortfolioStatusChanged,
   PortfolioDeleted, ProductCreated, ProductStatusChanged,
   ProductDeleted). Also found and fixed while in here: the frontend's
   own copy of the Audit Log's filter dropdown lists (AppAdmin.jsx's
   AUDIT_ENTITY_TYPES/AUDIT_ACTIONS) had already drifted out of sync
   with the backend's — missing the SAR and UserUnlocked actions from
   earlier entries, not just the new Portfolio/Product ones. Both lists
   brought back in sync together. Entity-name resolution for Portfolio/
   Product audit entries still shows a raw id rather than a resolved
   name in the Audit Log table — same already-documented, deliberately
   deprioritised gap Event/EventAttendee/Task already have; not
   expanded into a bigger fix here without being asked.

2. FEATURE FLAG TOGGLE — found and fixed a real React anti-pattern.
   FlagRow's `useState(rawValue)` only ever initialises once on mount;
   because the row keeps the same key across re-renders (it's the same
   flag being edited, not a new one), React never re-runs that
   initialiser when the saved value changes underneath it after a
   successful save. Added a useEffect to explicitly resync localValue
   whenever rawValue changes. This is a genuine, real bug pattern and
   exactly the class of thing that produces "works once, silently
   doesn't the second time" symptoms — worth being direct that static
   code review across every layer (Toggle, FlagRow, the page component,
   api.js, the PATCH handler, the flag service, FlagContext) didn't
   turn up a second, more definite root cause, so Mark's re-test is
   what actually confirms this is the fix, not just a plausible one.

3. MISSING CANCEL ON ADD PRODUCT — real gap. The "Add Product to…"
   control was a dropdown that immediately opened the create form with
   no way to back out except manually resetting the dropdown or
   actually creating something — unlike the Portfolios tab, which
   already had a proper Cancel button. Added one, matching that same
   pattern.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; both edited backend handler files pass an ESM import
smoke test.

4. REPORTS SHOWING ZERO VALUES — investigated, not yet fixed, needs
   Mark's input. Checked the date-range calculation itself
   (getPeriodRange) for an off-by-one or timezone bug — it's correct:
   "Month to date" for August correctly computes [1 Aug 00:00 -> now].
   Today is 2 Aug — two days into the month. Every summary metric
   (leads, appointments, policy value) filters by created/updated
   THIS PERIOD, standard cohort-reporting convention (matches how
   Salesforce/HubSpot-style "this month" metrics work generally) — if
   the underlying test/demo data was created in an earlier month, "how
   much happened since 1 Aug" would correctly show near-zero this early
   in a brand-new month, which isn't a bug in itself. Could NOT verify
   this against live data (no DB access) — asked Mark to check whether
   Quarterly or Yearly view shows real numbers; if it does, that
   confirms this is expected cohort-period behaviour rather than a
   broken query, and the real fix (if any) is a UX/default-period
   question, not a data bug. If Quarterly/Yearly ALSO show zero despite
   known closed deals existing, that points at something genuinely
   wrong and changes the diagnosis — worth re-opening this rather than
   assuming either direction without his answer.

MIGRATION — no schema change:
  frontend/api-lib/handlers/portfolioHandlers.js (audit logging added to all 6 mutation points)
  frontend/api-lib/handlers/auditHandlers.js     (Portfolio/Product entity types + actions added)
  frontend/src/pages/AppAdmin.jsx                (filter lists resynced, Cancel button added)
  frontend/src/pages/FeatureFlags.jsx            (FlagRow resync bug fixed)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
94. REPORTS — SELECT A SPECIFIC PAST MONTH/QUARTER/YEAR — 2 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Follow-up to the Reports zero-values investigation — confirmed as
expected "brand new period, no activity yet" behaviour, not a bug, but
it surfaced a real, genuine gap: there was never a way to look at a
PAST month/quarter/year, only ever "the one we're in right now".

DESIGN DECISION MADE BEFORE WRITING CODE: distinguishing "viewing the
current, ongoing period" from "viewing a completed past period" turned
out to matter for correctness, not just UX. The old getPeriodRange
always used end = now — correct for an ongoing period (a genuine "to
date" progress view), but wrong for a past one: clamping a completed
month's range at "now" would silently exclude any activity in that
month's later days. Redesigned so a past period's end is that period's
own actual last moment, and verified this standalone against six cases
(current/past month, quarter, year) before trusting it, given how easy
this class of date-boundary math is to get subtly wrong.

BUILT — backend: getPeriodRange/getTrendBuckets in reportService.js now
accept a referenceDate (any date within the period instance to view;
defaults to today, preserving existing behaviour when omitted). All
five report functions (getReportSummary, getAgentReport,
getBrokerReport, getAgentDetailReport, getBrokerDetailReport) thread it
through. models/report.js validates it as a real, parseable date rather
than trusting whatever string arrives. All five reportHandlers.js
endpoints and all five reportsApi.js client methods updated to match.

BUILT — frontend: a genuinely new shared component,
components/PeriodSelector.jsx, rather than tripling the picker logic
across Reports.jsx/AgentDetail.jsx/BrokerDetail.jsx again — all three
previously had their own independent copy of the simple three-button
toggle, and building three more independent copies of something this
much more involved (instance dropdowns, date math, label formatting)
would have been exactly the kind of drift already found and fixed once
this session already (AppAdmin's audit-log filter lists silently
diverging from the backend's own list). Monthly uses a generated
month/year dropdown (last 24 months); Quarterly a generated quarter
dropdown (last 8); Yearly a generated year dropdown (last 5) — no
native HTML quarter/year-only input exists, so all three use the same
consistent dropdown pattern rather than mixing input types. Switching
period type resets the instance back to "now" in the new type, not a
stale carryover. The existing "Month to date (August 2026)" style label
now correctly drops "to date" for a genuinely completed past period —
a finished month isn't "to date" of anything.

CAUGHT MID-BUILD: AgentDetail.jsx/BrokerDetail.jsx's existing period
toggles used ad hoc inline styles, not the shared style tokens
Reports.jsx's version used (s.segment/s.segmentBtn) — a pre-existing,
minor visual inconsistency between the three pages. The new shared
component uses the token-based style consistently, so this incidentally
unifies the look across all three rather than preserving three
different variants.

VERIFIED: full Vite production build clean across all three pages plus
the new component; existing 45-test Vitest suite unaffected; every
edited backend file passes node --check and an ESM import smoke test.
Confirmed no local getPeriodLabel duplicates remain in any of the three
pages after the swap to the shared one.

MIGRATION — no schema change:
  frontend/api-lib/services/reportService.js  (referenceDate threaded through, period-boundary logic redesigned)
  frontend/api-lib/models/report.js           (referenceDate validated)
  frontend/api-lib/handlers/reportHandlers.js (referenceDate passed through on all 5 endpoints)
  frontend/src/services/api.js                (reportsApi's 5 methods accept referenceDate)
  frontend/src/components/PeriodSelector.jsx  (NEW — shared period-instance picker)
  frontend/src/pages/Reports.jsx              (migrated to the shared component)
  frontend/src/pages/AgentDetail.jsx          (migrated to the shared component)
  frontend/src/pages/BrokerDetail.jsx         (migrated to the shared component)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
95. FIXED — TIMEZONE BUG SILENTLY SHIFTED SELECTED REPORT MONTHS BACKWARD — 2 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found this immediately after §94 shipped: selecting July 2026 in
Monthly view showed all zeros, but Q3 2026 in Quarterly view — which
includes July — showed real data, including a visible "Jul" bar in the
trend chart. Confirmed as a genuine bug before touching anything, not
assumed: the two screenshots directly contradict each other unless
something is wrong.

ROOT CAUSE, confirmed with a standalone reproduction before fixing:
referenceDateToParam() serialised the selected date via
referenceDate.toISOString().slice(0, 10) — a well-known JS footgun.
toISOString() converts to UTC BEFORE slicing. For anyone east of UTC —
South Africa is UTC+2 — a locally-constructed "1 July, 00:00 SAST"
becomes "30 June, 22:00 UTC" once converted, sliced down to
"2026-06-30". Verified this exact chain with TZ=Africa/Johannesburg:
selecting July silently sent June 30 to the backend. The backend (Node
on Vercel, confirmed no TZ override anywhere in the deployment config,
so it runs in UTC by default) correctly parses that date-only string as
30 June — meaning the query that actually ran was for June, not July.
If June had no matching activity, July's real data was invisible
without an error anywhere to suggest why.

FIX: build the YYYY-MM-DD string directly from the Date object's own
local year/month/day accessors, never touching toISOString()/UTC at
all — nothing to shift when the string is built from the same
timezone the user selected it in.

FOUND WHILE FIXING, not left for later: grepped the whole frontend for
the same toISOString().slice(0, 10) pattern once the root cause was
clear, rather than only patching the one reported symptom. Found it in
two more places — AppAdmin.jsx's Subject Access Request form defaulted
its "date received" field the same broken way, which would have shown
yesterday's date for roughly the first two hours after local midnight
(the length of South Africa's UTC+2 offset) every single day. Fixed
both with the same local-accessor approach. Also swept for the
DIFFERENT, safe pattern (full toISOString() timestamps, not sliced to
date-only) to confirm those two remaining hits — call-logging
timestamps in LeadDetail.jsx — are unambiguous, precise instants with
no such bug, not something that needed touching.

VERIFIED: reproduced the exact broken date-string chain and the fixed
one standalone with TZ=Africa/Johannesburg before and after the change,
matching Mark's actual timezone rather than testing under the sandbox's
own default. Full Vite production build clean; existing 45-test Vitest
suite unaffected.

MIGRATION — no schema change:
  frontend/src/components/PeriodSelector.jsx (referenceDateToParam fixed)
  frontend/src/pages/AppAdmin.jsx             (SAR received-date default fixed, same root cause)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
96. FIXED — AUDIT LOG NEVER SHOWED WHAT A CHANGE ACTUALLY WAS — 2 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark noticed enabling and disabling auth.sso.enabled produced identical-
looking Audit Log rows and asked whether the wrong text gets written for
disable specifically. Checked before answering: it wasn't wrong text for
one direction, the Detail column never showed the actual change for
EITHER direction, for any entity type — not unique to feature flags.

ROOT CAUSE: the Detail column only ever rendered entityRef.
entityRef resolves to a real, specific name for Lead/Appointment/User
(see §76), but falls back to a generic "EntityType: id" string for
everything else — FeatureFlag, Portfolio, Product, Event, Task — the
SAME fallback text regardless of what the change actually was.
changeDetail (a small JSON object every mutating endpoint in this
codebase already writes — {value: '1'} for a flag toggle, {isActive:
true} for a portfolio/product status change, {name} for a create, etc.)
has always carried the real answer, and the backend has always
correctly parsed and returned it in the API response — it just was
never rendered anywhere in the table.

FIX: a generic formatChangeDetail() renders changeDetail as a compact
"key: value" summary beneath entityRef, applied uniformly rather than
building a bespoke formatter per action type — one formatter covers
every action already writing a small flat object, including the ones
built later than this fix without any extra work needed for them.
Boolean-like values ('1'/'0'/true/false) render as Yes/No for
readability rather than raw stored strings.

CHECKED, NOT ASSUMED: confirmed changeDetail already flows correctly
from writeAuditLog's JSON.stringify() through listAllAuditLog's
JSON.parse() to the handler's JSON response, so this needed no backend
change at all — purely a rendering gap. Also confirmed the CSV/JSON
export already had its own Detail column showing changeDetail properly
(built in §77) — this gap was specific to the on-screen table, not
exports.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected.

MIGRATION — no schema or backend change:
  frontend/src/pages/AppAdmin.jsx (formatChangeDetail added, Detail column now renders it)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
97. SESSION TOKEN REVOCATION — 3 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

First of the three remaining security items from the earlier list
(rate limiting, session revocation, TLS verification tightening) —
picked this one first since it's the most direct extension of §92's
auth-bypass fix and has the clearest security value.

THE GAP: JWTs here are deliberately stateless (no DB lookup needed to
verify one) — but that also meant there was no way to invalidate a
specific token before its natural 8-hour expiry. Not on a password
change (a stolen old token stayed fully valid for however long was left
on its 8 hours, even after the real password changed), and not via any
admin action short of fully deactivating the account.

DESIGN: a single sessionsRevokedAt timestamp on User, checked as part
of the SAME per-request lookup validateToken() already does for the
isActive/isLocked re-check — no new query, and deliberately not a
token-blacklist table (which would grow unboundedly and need ongoing
cleanup, working against the free-tier-friendly approach this project
already leans on elsewhere). Any token issued (iat) before that
timestamp gets rejected on its next use.

A REAL RACE CONDITION FOUND AND FIXED DURING BUILD, not left for later:
verified the revocation-comparison logic standalone before considering
this done, the same way every other tricky date/time comparison this
session has been checked rather than trusted on read-through alone.
That check surfaced a genuine bug: JWT iat is always floored to whole
seconds, but sessionsRevokedAt (Postgres TIMESTAMPTZ) carries sub-
second precision. A token signed a few hundred milliseconds after a
revocation — exactly what happens on a password change, where revoke-
then-reissue run microseconds apart in the same request — could get
floored to just before the revocation instant and be wrongly rejected
by its own replacement's very first request, locking a user out
immediately after their own password change: the opposite of the
intent. Fixed with a small (2s) grace window on the comparison;
verified standalone that this closes the race while a genuinely old,
stolen token (issued minutes or hours earlier, never within 2 seconds
of a revocation) is still correctly rejected.

TWO TRIGGER POINTS BUILT:
  1. Self-service password change (authHandlers.js) — now revokes every
     previously-issued token, then immediately signs and returns a
     fresh one for the session that just made the request, so changing
     your own password doesn't log you out of your own change. Needed
     getUserPasswordHash() extended to also return email/displayName/
     role (confirmed it had exactly one caller before extending it) —
     signJwt() needs all four to issue the replacement token.
  2. Admin "Force Logout" in User Admin — a new action distinct from
     Deactivate ("this person shouldn't have access at all") and Unlock
     ("this account got locked out by failed attempts") — for "I think
     this session may be compromised" or "they forgot to sign out on a
     shared computer" without touching the account's standing at all.
     Always visible in edit mode (unlike Unlock, which only shows when
     actually locked), with a confirmation prompt given it immediately
     affects an active session. Wired the exact same way as Unlock —
     new handler, new route, new audit action, new AuthContext plumbing
     only where password-change specifically needed it.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test; the revocation-timing logic and its grace-
window fix were both verified standalone against representative cases,
not just read through.

MIGRATION:
  frontend/db/migrations/018_add_session_revocation.sql (NEW — User.sessionsRevokedAt)
  frontend/db/schema.postgres.sql               (same column added, fresh databases)
  frontend/api-lib/services/userService.js       (revokeUserSessions, getActiveUserById extended, getUserPasswordHash extended)
  frontend/api-lib/middleware/auth.js            (revocation check + grace-window fix)
  frontend/api-lib/handlers/authHandlers.js      (password change revokes + reissues)
  frontend/api-lib/handlers/userHandlers.js      (handleUserForceLogout added)
  frontend/api-lib/handlers/auditHandlers.js     (UserSessionsRevoked added to filter list)
  frontend/api/users-router.js                   (force-logout route added)
  frontend/src/services/api.js                   (usersApi.forceLogout added)
  frontend/src/context/AuthContext.jsx           (refreshToken added)
  frontend/src/pages/ChangePassword.jsx          (uses refreshToken with the new token)
  frontend/src/pages/UserAdmin.jsx               (Force Logout button, filter list synced)
Plus this Status_Vercel.md.

NEXT: rate limiting on authenticated endpoints, and TLS certificate
verification tightening — both still outstanding from the same list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
98. FIXED — TASKS NEVER TRIGGERED ANY NOTIFICATION AT ALL — 3 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark noticed Werner had an overdue and a due-today task with zero
matching notifications, and asked whether this was just old data
predating the notification feature. Checked before answering: it
wasn't old data — creating or assigning a task has never triggered a
notification, for any task, manual or system-generated, since Tasks
was built. Confirmed by checking every recognised notification type
(Notifications.jsx's own TYPE_ICON table) and finding none of the six
related to tasks at all, then confirming zero calls to
createNotification anywhere in taskHandlers.js/taskService.js.

DESIGN: createTask() is called from six different places across the
codebase (manual creation via taskHandlers.js, plus five system-
generated call sites in appointmentService.js and leadService.js) —
confirmed this before deciding where to hook the notification in, so
it went into createTask() itself rather than being repeated at each
call site, covering every task creation path from one place rather
than needing five more additions done separately (and five more
chances to miss one).

TWO NEW NOTIFICATION TYPES, matching the two existing trigger
mechanisms already established in this codebase:
  - TaskAssigned — synchronous, fires from createTask() on every new
    task, and again from taskHandlers.js's PATCH path specifically when
    assignedToId actually changes to someone new (not on every edit —
    changing a title or priority isn't a reassignment). No performer
    name in the body, matching AppointmentAssigned's own precedent
    (createTask() only ever receives a raw createdById, not a resolved
    display name, and system-generated tasks often don't have a
    meaningful human "performer" to name anyway). No self-notification
    guard either, matching every other trigger in this codebase
    (LeadAssigned/AppointmentAssigned also fire when someone assigns to
    themselves) — consistency over cleverness.
  - TaskDueReminder — added to schedulerService.js's daily Cron scan
    alongside the three existing checks, exact same shape as
    AppointmentReminder/CallbackReminder: every incomplete task due
    today gets its assignee a same-day reminder, naturally idempotent
    (a task only matches "due today" on the one day that's true, and a
    completed task drops out of the WHERE clause on its own).

CAUGHT AND FIXED MID-EDIT, not shipped broken: a str_replace meant to
insert the new sendTaskDueReminders() function only matched the first
line of the following function's doc comment, orphaning the rest of
that comment as uncommented, unopened text sitting right after the new
function's closing brace. Caught by checking every function/comment
boundary in the file after the edit, not just running a syntax check
and moving on — node --check would likely have still passed against
the broken intermediate state depending on exactly where the orphaned
lines landed, so the boundary check specifically is what caught it.
Fully repaired and re-verified before continuing.

Neither new type needed a schema change (Notification.type is a plain
VARCHAR with no CHECK constraint) or any change to email delivery
(confirmed emailService.js/notificationService.js's send path is fully
generic, no type-specific branching anywhere) — both new types work
end-to-end, including email, the moment they're created.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test; confirmed the Notifications page's own tab
filters (Assignments/Reminders) correctly bucket both new types purely
from their names (.includes('Assigned')/.includes('Reminder')) with no
filter-logic changes needed.

MIGRATION — no schema change:
  frontend/api-lib/services/taskService.js        (createTask now fires TaskAssigned)
  frontend/api-lib/handlers/taskHandlers.js        (PATCH fires TaskAssigned on genuine reassignment)
  frontend/api-lib/services/schedulerService.js    (sendTaskDueReminders added to the daily scan)
  frontend/api-lib/handlers/notificationHandlers.js (sendTaskDueReminders wired into the scheduled tick)
  frontend/src/pages/Notifications.jsx             (TYPE_ICON entries added)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
99. THREE FIXES FROM TESTING §98 — DUE-DATE TIMEZONE BUG, MISSING DUE-DATE FIELD, NOTIFICATION RETENTION — 3 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark found three separate things testing §98's task-notification fix.
All three confirmed real before touching anything, none of them assumed.

1. "OVERDUE 1D" INSTEAD OF "DUE TODAY" — genuine bug, root cause
   confirmed by reproduction before fixing. new Date("2026-08-03")
   parses a date-only string as UTC midnight, not local midnight. For
   anyone east of UTC (South Africa is UTC+2), that instant has already
   passed by 2am local time — so from that point onward in the day, a
   task due "today" was computing as overdue by a fraction of a day,
   which Math.round() pushes down to a full day. Reproduced the exact
   failure with TZ=Africa/Johannesburg before writing the fix, not just
   read-through. Fixed by comparing calendar dates directly (year/month/
   day, both via the local Date constructor) rather than raw millisecond
   differences against the current moment's time-of-day.

   FOUND WHILE FIXING, not left for later: searched the frontend for the
   same pattern rather than stopping at the one reported symptom.
   EventList.jsx's isPast(new Date(event.eventDate)) had the identical
   root cause — an event happening later today would show as "past"
   (dimmed) as soon as local time passed 2am, hours before the event
   itself. Fixed the same way, verified separately. Also checked
   AppointmentList.jsx's superficially similar-looking date comparison
   and confirmed it's actually safe (both sides go through
   .toDateString(), which normalises to local calendar date before
   comparing) — didn't touch what wasn't broken.

2. DUE DATE NEVER SHOWN ON THE TASK CARD — confirmed real: the expanded
   task detail grid had Priority/Assigned to/Source/Created by/Created,
   but no Due Date field at all, even though the data clearly existed
   (visible only in the coloured badge and the notification text).
   Added it to the grid, next to Priority.

3. NO WAY TO CLEAR NOTIFICATIONS, NO AUTOMATIC EXPIRY — Mark asked
   directly whether these would age out on their own. Checked before
   answering: neither a dismiss action nor any cleanup mechanism existed
   anywhere — the list would have grown forever. Built both:
     - Per-notification dismiss (×) and a "Clear read" bulk action,
       deliberately scoped to already-read notifications only — an
       unread one still needs to be seen, clearing it would be
       indistinguishable from losing it.
     - Automatic cleanup added to the same daily Cron tick that already
       runs the reminder checks: anything read more than 30 days ago is
       removed on its own, no action needed. This needed one new column
       (readAt) — isRead alone can't tell a retention policy WHEN
       something was read, only that it currently is.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected; every new/edited backend file passes node --check and
an ESM import smoke test; the date-comparison fixes for both Tasks.jsx
and EventList.jsx were verified standalone against representative cases
using Mark's actual timezone before being considered done, not just
read through.

MIGRATION:
  frontend/db/migrations/019_add_notification_readat.sql (NEW — Notification.readAt)
  frontend/db/schema.postgres.sql                (same column, fresh databases)
  frontend/src/pages/Tasks.jsx                   (daysUntil timezone fix, Due date field added)
  frontend/src/pages/EventList.jsx               (isPast timezone fix, same root cause)
  frontend/api-lib/services/notificationService.js (readAt tracking, dismiss/clearRead/cleanup functions)
  frontend/api-lib/handlers/notificationHandlers.js (DELETE support, handleClearRead, cleanup wired into scheduled tick)
  frontend/api/notifications-router.js           (clear-read route added)
  frontend/src/services/api.js                   (notificationsApi.dismiss/clearRead added)
  frontend/src/pages/Notifications.jsx           (dismiss button, Clear read button)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
100. RATE LIMITING — DECISION: DEFER TO VERCEL PRO WAF, NOT CUSTOM-BUILT — 3 Aug 2026 (session 14, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's decision: since the customer's actual deployment will be on
Vercel Pro (not Hobby), rate limiting should come from Vercel's own WAF
rather than a custom Postgres-backed limiter. Asked specifically to be
explicit about this and confirm it doesn't leave the customer exposed —
this entry is that explicit account, written after verifying Vercel's
current documentation directly rather than relying on prior/possibly-
stale knowledge, given how much this specific claim matters.

VERIFIED (checked Vercel's own current docs, not assumed): WAF rate
limiting IS a real Pro-plan-and-above capability — this part of the
existing plan (see Project_Context_Vercel.md's EDGE/TRANSPORT section,
written 30 Jul 2026) holds up. But there are two important qualifications
that change what "leave it as is" actually needs to mean in practice:

  1. IT IS NOT AUTOMATIC. Being on the Pro plan makes rate limiting
     available to configure — it does not rate-limit anything on its
     own. Vercel's own setup guide is explicit: you must go into the
     Firewall tab in the Vercel dashboard (or use vercel.json / the
     @vercel/firewall Rate Limiting SDK), create a Custom Rule, and
     define which paths, thresholds, algorithm, and follow-up action
     (log/deny/challenge/429) apply. Nothing here happens by upgrading
     the plan alone. DDoS mitigation, IP blocking, and basic Custom
     Rules ARE free and on by default on every plan including Hobby —
     but rate limiting specifically sits behind this manual
     configuration step regardless of tier.

  2. IT IS A SEPARATELY METERED COST, not bundled into the flat Pro
     subscription. Pricing is regional, starting around $0.50 per
     million ALLOWED requests (requests a rule denies or challenges
     don't count against this) — small in absolute terms for this
     application's likely traffic, but worth the customer's admin
     knowing it's pay-as-you-go on top of the base Pro price, not a
     capped inclusion.

WHAT THIS MEANS FOR "NOT EXPOSING THE CUSTOMER TO ANY RISK": until
someone actually configures a Custom Rule in the Firewall tab, this
application has ZERO rate-limiting protection on any endpoint,
regardless of being on Pro. That configuration step is a genuine,
standing action item — not something this delivery can complete on its
own, since it's a Vercel dashboard action tied to whoever holds the
customer's actual Vercel account, not a code change. Recorded here so it
isn't silently assumed "handled" by the tier decision alone.

CONCRETE ACTION ITEM for whoever configures the customer's Vercel
account (Firewall tab -> Configure -> + New Rule, condition
@vercel/firewall, per Vercel's own rate-limiting SDK guide):
highest-priority targets, in order, are the PUBLIC, unauthenticated
endpoints an attacker could hit with no credentials at all:
  - POST /api/auth/login              (staff login — brute-force target)
  - POST /api/portal/login            (customer/lead portal login)
  - POST /api/portal/register         (portal account creation)
  - POST /api/portal/activate         (already flagged §-earlier this
    session as an identity-probing surface — email + DOB guessing,
    narrow blast radius since it only exposes contact info and
    appointment status, not medical/financial data, but still a real
    target)
  - POST /api/portal/walkin           (no auth at all — spam/junk-data
    risk, not just brute-force)
A reasonable starting point for each: a handful of requests per minute
per IP (e.g. 5-10), action "deny" or "429", reviewed and tightened once
real traffic patterns are visible. PUT /api/auth/change-password is
lower priority than the five above — it requires an already-valid
session token, so an attacker needs a compromised session to reach it
at all, unlike the public endpoints.

CODE-LEVEL DECISION THIS RESOLVES: no custom Postgres-backed rate
limiter will be built in api-lib. This was the alternative under
consideration (see the "what's next" discussion before this entry) —
correctly not pursued, since it would have added a query to every
rate-limited request while duplicating something the platform already
does properly at the edge, before the request even reaches a Function.

STATUS: WAF Custom Rule configuration itself is NOT done as part of this
delivery — it's a dashboard action against the customer's actual Vercel
account, which doesn't exist as "the customer's account" during this
build/demo phase. Flagged here as the explicit, concrete next step for
whenever the real Pro-tier deployment is stood up, not deferred
vaguely.

MIGRATION — no code change, documentation only:
  Status_Vercel.md (this entry)
  Project_Context_Vercel.md (EDGE/TRANSPORT and open-items checklist updated to match)



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
101. LEAD PORTAL — SHOW/HIDE PASSWORD + MOBILE AUTO-ZOOM FIX — 3 Aug 2026 (session 15)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two bugs Mark found testing on his phone.

1. NO SHOW/HIDE PASSWORD TOGGLE ON THE LEAD PORTAL — confirmed real, and
   wider than the one screen Mark flagged (Login). All four portal
   password screens lacked it: PortalLogin.jsx (1 field), PortalRegister.jsx
   (2), PortalActivate.jsx (2), PortalCheckinConfirm.jsx's walk-in signup
   (2) — 7 fields total. The staff Login.jsx already had this pattern
   built; extracted it into a new shared component,
   frontend/src/components/PasswordInput.jsx, rather than duplicating the
   toggle JSX seven times. Drop-in replacement for a plain
   type="password" input — callers keep their own formGroup/label
   wrapper. Applied across all four portal files. Login.jsx itself left
   untouched (already correct, not part of the reported bug).

2. PORTAL ZOOMS IN AND DOESN'T USE THE FULL SCREEN — root cause: tokens.js's
   formInput.fontSize was 0.875rem (14px). iOS Safari auto-zooms the
   viewport on focus for any text input under 16px and doesn't zoom back
   out on blur — that's the stuck-zoomed-in behaviour. Fixed by bumping
   to 1rem (16px). This token is shared by every input/select/textarea
   in the app, so the fix is global, not portal-scoped — deliberate,
   since the same bug would hit staff users on mobile too, and the
   visual difference (2px) is negligible. Flagged to Mark before
   building since the blast radius is every screen, not just the portal;
   no objection raised.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected. No backend files touched, so no node --check/ESM
smoke test needed this round. Re-hydrated from GitHub and diffed all
five changed files against live state before packaging — no parallel
changes found.

MIGRATION: none — frontend-only, no schema change.

FILES:
  frontend/src/components/PasswordInput.jsx  (NEW)
  frontend/src/styles/tokens.js              (formInput.fontSize 14px -> 16px)
  frontend/src/pages/portal/PortalLogin.jsx
  frontend/src/pages/portal/PortalRegister.jsx
  frontend/src/pages/portal/PortalActivate.jsx
  frontend/src/pages/portal/PortalCheckinConfirm.jsx
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
103. AUDIT LOG — RAW IDs REPLACED WITH RESOLVED NAMES — 3 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark caught this in testing (screenshot: a TaskCreated entry showing
"Task: da8e2fe0-..." and "assignedToId: aa56191c-...") and asked for the
full fix, not just the one entry. Confirmed real and traced to two
distinct causes rather than one bug:

1. entityRef fallback — the gap already named in §76/§0's "DELIBERATELY
   NOT BUILT" list (Event/EventAttendee/Task showing a raw
   "EntityType: id" string). Deprioritized before; Mark's testing found
   it costing real value.
2. changeDetail raw ids — separate, newer issue. §96's formatChangeDetail()
   generically dumps every changeDetail key as-is. Some write sites
   already resolve a name before writing (LeadAssigned/LeadReassigned/
   AppointmentBrokerAssigned/AppointmentReassigned, all pre-existing) —
   TaskCreated never got that treatment, and neither had several others
   once actually checked (grepped every writeAuditLog call site rather
   than assuming Task was the only one).

SCOPE, CONFIRMED BY GREP NOT ASSUMPTION — every write site that stored a
raw person/entity id with no matching name:
  - TaskCreated, TaskUpdated: assignedToId
  - AppointmentCreated: leadId, brokerId
  - Event AttendeeAdded: leadId
  - Event AttendeeRemoved: eventId
  - UserUpdated (admin editing someone): supervisorId

FIX (backend — resolve at write time, same pattern as the existing
LeadAssigned/AppointmentBrokerAssigned code, id kept alongside name, not
replaced):
  - NEW leadService.js:getLeadDisplayNameById() — mirrors
    userService.js's existing getUserDisplayNameById() exactly (same
    signature, same "not filtered by deleted/inactive, audit is a
    historical record" reasoning).
  - taskHandlers.js: TaskCreated now resolves assignedToName;
    TaskUpdated resolves assignedToName only when a PATCH actually
    touches assignedToId (no wasted query on ordinary edits).
  - appointmentHandlers.js: AppointmentCreated resolves leadName +
    brokerName (brokerName only when a broker was actually assigned at
    booking time).
  - eventHandlers.js: AttendeeAdded resolves leadName; AttendeeRemoved
    resolves eventName (needed one extra getEventById() call — deleteAttendee()
    doesn't return the event itself).
  - userHandlers.js: UserUpdated resolves supervisorName when
    supervisorId is part of the PATCH. Deliberately did NOT resolve
    portfolios/products (also raw-id arrays on this same schema) —
    multi-value name resolution is a different shape of fix, and both
    are already visible by name on their own Portfolio/Product audit
    entries, so this isn't a silently-reintroduced version of the same
    gap, just a consciously separate one.

FIX (backend — entityRef, auditService.js's AUDIT_SELECT_BASE): extended
the COALESCE to resolve Task -> its title, Event -> its name,
EventAttendee -> the attendee's own Lead name (an attendee IS a lead;
there's no separate name to show). FeatureFlag/Portfolio/Product/
MedicalSubscription deliberately left on the generic fallback — all four
already read fine that way (flag's entityId IS its readable key;
Portfolio/Product/Subscription changeDetail already carries the name
directly), so extending the join further had no visible payoff.

FIX (frontend — AppAdmin.jsx's formatChangeDetail()): resolving the name
at write time isn't sufficient by itself — without this, the Detail
column would show BOTH the id and the name side by side, not replace
one with the other. Generic suppression rule, not per-key special-casing:
any key ending in "Id" is hidden from the on-screen summary if a sibling
"<sameprefix>Name" key exists in the same object. Applies automatically
to every existing resolved-name pair (brokerName, agentName,
previousBrokerName, previousAgentName, newAgentName) as well as the five
new ones from this fix — one rule, not six.

VERIFIED: node --check + ESM import smoke test (DATABASE_URL stubbed,
since config.js throws without one — confirmed this is pre-existing
sandbox behaviour, not something new) on all 6 edited backend files;
full Vite production build clean; existing 45-test Vitest suite
unaffected. Re-hydrated fresh from GitHub and diffed all 7 changed files
against live state before packaging — clean, no parallel changes.

MIGRATION: none — logic-only fix, no schema change.

FILES:
  frontend/api-lib/services/leadService.js   (NEW getLeadDisplayNameById)
  frontend/api-lib/services/auditService.js  (entityRef COALESCE extended)
  frontend/api-lib/handlers/taskHandlers.js
  frontend/api-lib/handlers/appointmentHandlers.js
  frontend/api-lib/handlers/eventHandlers.js
  frontend/api-lib/handlers/userHandlers.js
  frontend/src/pages/AppAdmin.jsx            (formatChangeDetail suppression rule)
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
104. TASK REASSIGNMENT UI — CLOSING A DEAD BACKEND CAPABILITY — 3 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Follow-on from §103 — Mark tried to verify the changeDetail half of that
fix by reassigning a task, and found there was no way to. Real finding,
not a misunderstanding on his part: checked directly, tasksApi.update()
was called in exactly one place in the entire frontend (the isComplete
checkbox toggle) despite taskHandlers.js's PATCH handler already
supporting assignedToId (EDIT_FIELDS, gated Admin/Supervisor/GlobalAdmin,
§98's era) and Tasks.jsx's own header comment claiming "can
create/reassign/delete." The backend was built expecting this control to
exist; it never got built. My mistake too — told Mark to test by
reassigning without checking the UI actually supported it first.

BUILT: inline reassignment on TaskRow's existing "Assigned to" field in
the expanded detail panel — no new modal. A "Reassign" link (Admin/
Supervisor/GlobalAdmin only) swaps the static name for a <select> +
Save/Cancel, sourced from the same `assignees` list already fetched for
NewTaskModal and the Assignee filter (no extra request). Save calls
tasksApi.update(id, { assignedToId }) — the same endpoint §103 already
taught to resolve and store assignedToName in changeDetail, so every
reassignment done through this control produces a correctly-attributed
TaskUpdated audit entry with no id shown, automatically.

Deliberately NOT scoped to manual tasks only, unlike Delete just below
it in the same panel — checked taskHandlers.js's EDIT_FIELDS gate
specifically and confirmed it's role-only, no source-type restriction,
so a system-generated task (callback reminder, appointment task, etc.)
can be reassigned exactly the same way as a manually created one. Would
have been an easy, wrong assumption to copy Delete's manual-only
restriction onto this without checking.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected (frontend-only change, no backend logic touched — §103
already covers backend verification for the update path this now
actually exercises). Re-hydrated fresh from GitHub and diffed
Tasks.jsx against live state before packaging — clean, no parallel
changes.

MIGRATION: none — frontend-only, no schema or backend change.

FILES:
  frontend/src/pages/Tasks.jsx
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
105. TASK REASSIGNMENT — SCOPED TO A SUPERVISOR'S OWN TEAM — 3 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Follow-on from §104. Mark asked who could reassign a task; answer
surfaced that a Supervisor could reassign to anyone org-wide, not just
their own team — Mark asked for that tightened.

Fixed at both layers, deliberately, not just the dropdown:
  - Backend (taskHandlers.js PATCH): when the actor is Supervisor-only
    (not Admin/GlobalAdmin) and assignedToId is part of the PATCH, the
    target must be themselves or a direct report (getDirectReportIds())
    or the request is rejected with a 403. Admin/GlobalAdmin unrestricted,
    matching canSeeTask()'s own org-wide visibility for those roles.
  - Frontend (Tasks.jsx): a new reassignTargets list, scoped the same
    way, feeds only the Reassign control's <select>. Deliberately did
    NOT touch the existing assignees list that NewTaskModal and the
    Assignee filter still use — Mark's ask was specifically about
    reassignment, not task creation, and that's a related-but-separate
    scope decision left for him to raise if he wants it too (see open
    item below).

Reasoning for fixing server-side, not just the UI: a hidden dropdown
option is a suggestion, not a rule — the API is what actually has to
say no, matching how every other permission boundary in this codebase
works (client-side is always a reflection of a server-side rule, never
the rule itself).

OPEN ITEM, NOT BUILT — flagged, not fixed: NewTaskModal's "Assign to"
field and the Assignee filter dropdown have the exact same org-wide-not-
team-scoped behaviour this fix just closed for Reassign specifically.
Not touched since Mark didn't ask for it, but worth flagging if the same
question comes up for task creation.

VERIFIED: node --check + ESM import smoke test on taskHandlers.js; full
Vite production build clean; existing 45-test Vitest suite unaffected.
Re-hydrated fresh from GitHub and diffed both changed files before
packaging — clean.

MIGRATION: none.

FILES:
  frontend/api-lib/handlers/taskHandlers.js
  frontend/src/pages/Tasks.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
106. REPORTS — TWO ISSUES INVESTIGATED, NOT YET FIXED — 3 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked these be recorded before being forgotten, not built yet —
logging both here with root cause found, awaiting a go-ahead.

1. PERIOD SELECTION NOT CARRIED OVER — Reports.jsx to BrokerDetail.jsx
   (and, by the same code pattern, AgentDetail.jsx too, not yet
   confirmed but near-certain given they share the same View-button
   construction).
   CONFIRMED: Reports.jsx's View button navigates via
   navigate(`/reports/broker/${b.id}`) — no query param, no router
   state, nothing carrying the selected period across. BrokerDetail.jsx
   independently initialises period='Monthly' and referenceDate=undefined
   (defaults to "now") on mount, with zero awareness of what was
   selected on the page just left. Mark's two screenshots both showing
   "Jul 2026" was him manually reselecting it twice, not the app
   retaining anything.
   NOT FIXED — recommended approach if/when built: URL query params on
   the navigate() call (?period=...&ref=...), read by BrokerDetail/
   AgentDetail on mount via useSearchParams(), falling back to the
   current Monthly/now default when absent (i.e. a direct link to
   /reports/broker/:id with no query params keeps behaving exactly as
   it does today). Preferred over React Router location state because
   it survives a page refresh, back button, or a copied/shared link —
   state does not.

2. "SIGNED" COUNT DOUBLED FOR MULTI-PORTFOLIO BROKERS — real,
   confirmed, root-caused precisely, not a misread on Mark's part.
   William Barclay-Beuthin has 2 portfolios (Discovery + Money and
   Medicine). Reports.jsx's Broker Performance table showed
   Appointments 10 / Signed 4; BrokerDetail.jsx for the same broker,
   same period showed Appointments 5 / Signed 2 — exactly double,
   exactly matching his portfolio count.
   ROOT CAUSE: reportService.js's getBrokerReport() (the org-wide list
   powering Reports.jsx's table) joins Appointment AND
   UserPortfolio/Portfolio in the same query, then runs COUNT(a.id) /
   COUNT(a.id) FILTER(...) directly over that join — a broker with N
   portfolios gets every one of their appointments counted N times, the
   exact "SQL fan-out" pattern already named as a standing risk in this
   project's own conventions. The query's own comment (right above the
   policyValue field) correctly explains this exact danger and correctly
   avoids it FOR policyValue, via a scalar subquery — but that same
   treatment was never extended to the appts/signed COUNT()s sitting
   right next to it. getBrokerDetailReport() (the single-broker page —
   correct, not affected) avoids the bug entirely by never joining
   Appointment and UserPortfolio in the same query in the first place —
   confirmed by direct comparison of the two queries.
   NOT FIXED — recommended fix if/when built: replace getBrokerReport()'s
   `LEFT JOIN Appointment a` + direct COUNT(a.id) with scalar subqueries
   for appts and signed, exactly mirroring the pattern already used
   correctly for policyValue two lines below in the same query. Removes
   the Appointment join from the main FROM clause entirely, which
   removes the fan-out risk at its source rather than working around it.
   Low-risk, well-precedented within the same file, single-function
   change — recommended as a should-fix given it's a materially wrong
   number currently shown on a client-facing performance report, not
   just a cosmetic issue.

Both await Mark's go-ahead before being built — logged here per his
explicit request so neither gets lost in the meantime.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
107. REPORTS — BOTH §106 ITEMS FIXED — 3-4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Both items from §106 built, per Mark's go-ahead.

1. PERIOD RETAINED ACROSS NAVIGATION — Reports.jsx's "View →" now passes
   the selected period as a URL query param (?period=...&ref=...) to
   both BrokerDetail.jsx and AgentDetail.jsx, which read it on mount
   (lazy useState init, read once) instead of always defaulting to
   Monthly/now. A direct link or bookmark with neither param present
   behaves exactly as before — nothing about existing links changes.
   New helper: PeriodSelector.jsx's paramToReferenceDate() (reverse of
   the existing referenceDateToParam()), built local-component-first
   deliberately (new Date(y, m-1, d), not new Date(paramString)) to stay
   consistent with this codebase's established UTC-vs-local caution
   elsewhere (taskHandlers.js's toDateOnly()). period value validated
   against the three real enum values before use — a malformed or
   tampered URL falls back to Monthly, not an invalid state. Query
   params chosen over React Router location state specifically because
   they survive a refresh, back button, or a copied/shared link.

2. SIGNED/APPOINTMENTS COUNT FAN-OUT — FIXED, and via a cleaner fix than
   originally proposed in §106. Original plan was to restructure
   getBrokerReport() with scalar subqueries (mirroring policyValue in
   the same query). Actual fix: just added DISTINCT to the two COUNT()
   calls — COUNT(DISTINCT a.id) / COUNT(DISTINCT a.id) FILTER(...) —
   after noticing getAgentReport() a few dozen lines below in the same
   file already handles an even harder version of this exact problem
   (three separate one-to-many joins — Lead, CallAttempt, Appointment —
   all fanning out against each other simultaneously) correctly, purely
   through COUNT(DISTINCT ...). Matching that existing, already-proven
   pattern is a smaller, lower-risk diff than a query rewrite, and
   brings both broker-report functions in this file to the same
   defensive standard. Checked getAgentDetailReport() and
   getReportSummary() for the same class of bug while in this file —
   both already correct (former already uses DISTINCT throughout;
   latter's only per-row join is a LATERAL+LIMIT-1, which can't fan out).

VERIFIED: node --check + ESM import smoke test on reportService.js;
full Vite production build clean; existing 45-test Vitest suite
unaffected (no test coverage over this SQL specifically — noted as a
gap, not something addressed in this pass). Could not empirically
verify the exact before/after numbers against live data — no DB access
from the sandbox, ever; verification here is by direct code comparison
against the sibling function's already-correct, already-relied-on
pattern, which is the strongest verification available in this
environment. Mark should confirm the fix against real numbers once
deployed — William Barclay-Beuthin (2 portfolios) is the natural test
case, same as the bug report itself. Re-hydrated fresh from GitHub and
diffed all 5 changed files before packaging — clean, no parallel
changes.

MIGRATION: none — logic-only fix, no schema change.

FILES:
  frontend/src/components/PeriodSelector.jsx  (NEW paramToReferenceDate)
  frontend/src/pages/Reports.jsx
  frontend/src/pages/BrokerDetail.jsx
  frontend/src/pages/AgentDetail.jsx
  frontend/api-lib/services/reportService.js
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
108. LEADS AUTO-RETURN BANNER + TASK ASSIGNEE SCOPING COMPLETED — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two unrelated fixes, both from the same go-ahead.

1. LEADS AUTO-RETURN BANNER — Mark caught this reading the LeadList.jsx
   notice against App Admin's System Settings (his screenshot showed
   3 months configured). Investigated: the MECHANISM was already
   correct — schedulerService.js's daily job genuinely reads
   SystemConfig.leadAutoUnassignMonths (falls back to 6 only if unset),
   not a hardcoded value. The BANNER was the bug — a literal hardcoded
   "6 months" string in LeadList.jsx with zero connection to the actual
   config. Fixed by making it accurate rather than generic (an Agent —
   the audience for this exact banner — can't reach App Admin to check
   the real number themselves, so pointing them there instead of just
   showing it would have made the generic version actively worse).
   Required loosening GET /api/system-config from Admin/GlobalAdmin-only
   to any authenticated role — PUT is unchanged, still Admin/GlobalAdmin
   only. Nothing in that config is sensitive (call-attempt limits, this
   period, password rotation days), so this was a deliberate, considered
   read/write split, not a blanket opening. LeadList.jsx now fetches the
   real value and interpolates it, with correct month/months singular
   handling, falling back to 6 (the schema default) on load/error —
   same number the banner always showed before, so nothing gets worse
   in a failure case.

2. TASK ASSIGNEE SCOPING — CLOSING THE OTHER TWO GAPS FROM §105 —
   Mark asked for a plain explanation of the §105 recap line, then asked
   for both remaining gaps closed to match Reassign. Done:
   - NewTaskModal's "Assign to" field: now team-scoped for a Supervisor
     (self + direct reports), same as Reassign — AND, unlike Reassign at
     the time it first shipped, this one got server-side enforcement in
     the SAME delivery rather than as a follow-up fix. POST /api/tasks
     now runs the identical Supervisor-target check the PATCH handler
     already had.
   - The Assignee filter dropdown: also team-scoped now. This one was
     UI-only, deliberately no backend change — the underlying task list
     was already correctly scoped server-side regardless of what filter
     value a Supervisor picked (canSeeTask() never depended on the
     filter), so there was no security gap here to begin with, just an
     inconsistent, wider-than-necessary dropdown.
   Refactor: the Supervisor-scoped list built for Reassign in §105
   (reassignTargets) is now the single list feeding all three controls —
   renamed teamScopedAssignees since it's no longer reassignment-
   specific. Admin/GlobalAdmin unaffected throughout — still see the
   full org in all three places, exactly as before.

VERIFIED: node --check + ESM import smoke test on both edited backend
files; full Vite production build clean; existing 45-test Vitest suite
unaffected. Re-hydrated fresh from GitHub and diffed all 4 changed files
before packaging — clean, no parallel changes. No new Vercel function —
system-config.js already existed, only its internal role-gate logic
moved; function count stays 12/12.

MIGRATION: none — logic-only, no schema change.

FILES:
  frontend/api/system-config.js               (GET role gate loosened)
  frontend/api-lib/handlers/taskHandlers.js    (POST target validation added)
  frontend/src/pages/Tasks.jsx                 (teamScopedAssignees used by all 3 controls)
  frontend/src/pages/LeadList.jsx              (banner now reads the real config value)
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
109. TASKS DOCUMENTATION FIX, SSO CONTINUITY DESIGN, POPIA FLAG WIRED UP — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Three things from one message.

1. STOPPED CONFLATING SEED DEFAULTS WITH LIVE STATE — Mark pushed back,
   fairly, on Tasks repeatedly being described as "gated off by default"
   when he's been actively testing it all session. Root cause: §0's
   "GATED OFF BY DEFAULT" section was describing feature-flags.postgres
   .sql's seed values (ON CONFLICT DO NOTHING — only applies to a
   brand-new database) as if they were the current live state of Mark's
   actual deployment, which Claude has no way to check (no live DB
   access, ever). Reworded that whole section to be explicit about this
   distinction for all three flags it covers, not just Tasks — the same
   conflation applied equally to notifications.email.enabled and
   auth.sso.enabled, just hadn't been called out yet.

2. SSO USER-RECORD CONTINUITY — design discussion, no code (SSO itself
   isn't built for this deployment). Mark asked how manually-created
   User records would map/merge with SSO identities to preserve
   continuity and data integrity. Checked the actual schema before
   answering rather than reasoning in the abstract: it already has the
   right shape for this — entraObjectId and googleUid columns already
   exist on "User" (each with its own partial unique index, NULL-safe),
   passwordHash is nullable ("NULL = SSO-only user" per the schema's own
   comment), and email has a hard UNIQUE constraint. Confirmed via grep
   that neither entraObjectId nor googleUid is referenced ANYWHERE in
   actual application logic — the schema anticipated SSO, nothing was
   ever wired to it.
   Recommended design, given that foundation: match by email at first
   SSO login (case-insensitive, same organisation) and backfill
   entraObjectId/googleUid onto the EXISTING User row rather than
   creating a new one. Every foreign key in the system (Lead.assignedAgentId,
   Appointment.brokerId/agentId, Task.assignedToId, AuditLog.performedById,
   CallAttempt.agentId, Report queries) already points at User.id, never
   at "how they authenticate" — so continuity is automatic and complete
   the moment the row is the same row, no separate merge step needed for
   history to keep working. Flagged the real open decisions for when this
   actually gets built: (a) email-mismatch handling — a manual admin
   "link this identity" fallback, or a hard precondition that SSO and
   local emails match before flipping the flag; (b) just-in-time
   provisioning defaults for a genuinely new SSO identity with no
   matching local row — safe default role, Admin fills in the rest since
   SSO claims won't carry portfolio/region/supervisor; (c) whether local
   password stays as a break-glass fallback once SSO is on, or gets
   disabled entirely; (d) whether SSO directory removal should
   auto-deactivate the MedBroker account or require a manual step.
   Recommended role/authorization stay MedBroker-managed regardless
   (SSO proves identity, not authorization) — matches this app's
   existing FAIS/POPIA compliance posture.

3. POPIA SAR FLAG — ACTUALLY WIRED UP NOW (Mark's build queue, item 1).
   §103 found this flag didn't gate anything; §106's GlobalAdmin guide
   entry documented it as a discrepancy rather than silently fixing it,
   deferring the call to Mark. He chose "wire it up," not "retire it."
   Built: AppAdmin.jsx's Data Requests tab (both the tab button and its
   content panel) now only renders when popia.subjectAccessRequest.enabled
   is on — matches tasks.enabled's existing frontend-only gating pattern
   in App.jsx exactly (checked: tasks.enabled isn't re-verified server-
   side either; role, not the flag, is the actual security boundary,
   already enforced in sarHandlers.js's requireRole(['Admin',
   'GlobalAdmin'])). Also corrected the flag's own stale metadata, which
   was still Phase2/"not yet implemented" even after §79 shipped the real
   feature: feature-flags.postgres.sql's seed (for future fresh installs)
   and FeatureFlags.jsx's local display metadata (moved from the "Phase
   2 — not yet built" section to Operational) both updated, plus a new
   migration (020) to correct the tier on Mark's already-live database,
   since editing the seed file alone doesn't retroactively fix an
   existing row.
   NOT YET DONE: the GlobalAdmin guide's own §2.2 Flag Reference table
   (built in this session's earlier docs pass) describes this exact flag
   as dead/unwired metadata — now stale given this fix. Flagged here so
   it isn't lost; will need the same docx edit-and-verify process as
   the rest of that document whenever documentation is next touched.

VERIFIED: full Vite production build clean; existing 45-test Vitest
suite unaffected (no test coverage over feature-flag gating specifically
— pre-existing state, not something this pass changed). Re-hydrated
fresh from GitHub and diffed all 3 changed files plus confirmed the new
migration file before packaging — clean.

MIGRATION: yes — 020_correct_popia_sar_flag_tier.sql. Metadata-only
UPDATE (tier/isPhase2), not a structural change, but still needs running
against Neon like any other migration in this list; safe to re-run.

FILES:
  frontend/src/pages/AppAdmin.jsx
  frontend/src/pages/FeatureFlags.jsx
  frontend/db/feature-flags.postgres.sql
  frontend/db/migrations/020_correct_popia_sar_flag_tier.sql  (NEW)
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
110. ENCRYPTION Q&A, PHOTO UPLOAD PARKED, SSO SCOPED (NOT YET BUILT) — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. PHOTO UPLOAD — PARKED. Mark decided not to add a paid dependency
   (Vercel Blob) for a feature with no clear business value unless a
   customer actually asks for it. Removed from the active build queue;
   still listed as a known gap (honest disabled "coming soon" stub) but
   no longer "next up."

2. ENCRYPTION — investigated and answered in chat, no code changed.
   Summary for the record:
   - Passwords: bcrypt, 12 rounds (authService.js). Never stored or
     logged in plaintext beyond the initial HTTPS POST at login/creation.
   - Field-level encryption: ONLY Lead.idNumber (SA ID numbers) —
     AES-256-GCM envelope encryption (per-value data key wrapped by a
     master key from DEMO_ENCRYPTION_KEY) plus an HMAC-SHA256 blind
     index (ID_NUMBER_INDEX_KEY) for exact-match duplicate lookup
     without decrypting every row (encryption.js). Nothing else gets
     this treatment — email, mobile number, names all rely solely on
     Neon's storage-level encryption at rest, not application-level
     field encryption.
   - IMPORTANT CAVEAT, surfaced plainly to Mark: encryption.js's own
     header comment says "DO NOT use this file... for real POPIA-
     classified data. Seed/demo data only" — the master-key-in-an-env-
     var approach is explicitly flagged internally as weaker than the
     ported-from Azure version's Key-Vault-backed envelope encryption
     (HSM-backed custody/rotation/access-audit, none of which a bare
     env var provides). This is the single most POPIA-relevant finding
     from this investigation. Not fixed — a real architecture decision
     (what replaces a bare env var as master-key custody on Vercel) if
     Mark wants it hardened; not raised as an immediate action item
     since he didn't ask for a fix, only an explanation.
   - Transit: HTTPS browser<->API (Vercel-terminated, automatic).
     API<->Neon: TLS, but with rejectUnauthorized: false (§70, already
     tracked, low priority) — encrypted, certificate not verified.
   - Client-side (the "in the UI" part of the question): the session
     JWT is signed (HS256), not encrypted (standard JWS, not JWE) — its
     claims (user id, roles, name, email; never a password) are base64-
     readable by anyone holding the token, which is normal for JWTs
     generally, not a flaw specific to this app. Stored in
     sessionStorage (authStore.js) — tab-scoped, cleared on tab close,
     but still JS-readable (same XSS exposure profile as localStorage
     would have); an httpOnly cookie would be more XSS-resistant but
     isn't what's built.

3. SSO — FULL BUILD REQUESTED, SCOPED BUT NOT YET STARTED. Mark answered
   all five open design questions from §109 and asked for the whole
   thing built. Given the security-critical nature and genuine size of
   this, investigated what actually exists before proposing a plan
   rather than guessing at scope.
   FOUND: there's real, substantial, currently-DEAD frontend groundwork,
   ported over from the original Azure build, never wired up or
   removed:
     - @azure/msal-browser + @azure/msal-react are already in
       package.json.
     - authConfig.js has a complete MSAL config (client id/authority
       from VITE_ENTRA_CLIENT_ID/VITE_ENTRA_AUTHORITY env vars, scopes,
       sessionStorage cache, logger) — its own comment says "Import
       msalInstance into App.jsx and wrap with MsalProvider," which
       never happened.
     - api.js has a working-looking getAccessToken()/getMsalInstance()
       pair (silent token acquisition falling back to redirect) — but
       nothing in the entire frontend calls it. Dead code.
     - App.jsx has a comment referencing "MsalProvider + Authenticated
       Template" that was never implemented.
   FOUND, backend: middleware/auth.js's validateToken() ONLY verifies
   the local hand-rolled HS256 JWT (verifyJwt()) — zero code path for
   validating an actual Entra-issued token (no JWKS fetch, no issuer/
   audience/tenant checks). Confirmed by reading the file in full, not
   just grepping. This is the genuinely missing piece, not a refinement
   of something that exists.
   RECOMMENDATION, not yet confirmed with Mark in writing but implied
   strongly by the evidence: build Entra ID first, not Google — the
   dead MSAL code, entraObjectId/m365UserPrincipalName schema columns,
   and the GlobalAdmin guide's own M365 email setup precedent (§4.6) all
   already point that direction; googleUid has nothing beyond the bare
   schema column, no client library even installed.
   Mark's five answered design decisions, for when this actually gets
   built:
     (a) Email mismatch: GlobalAdmin gets a "link this identity" manual
         action, AND the ability to correct a user's email (typo fix)
         — email editing isn't currently exposed anywhere in User Admin;
         confirmed this needs building too, not just the SSO-linking
         piece.
     (b) New SSO identity, no local match: JIT-provision, feeding into
         the same admin visibility as (a) rather than silently
         succeeding with no review trail.
     (c) Password fallback: a toggle allowing local login to coexist
         with SSO temporarily, plus a separate, deliberate "hard commit"
         action to fully disable it once verified — not an immediate
         all-or-nothing cutover.
     (d) Offboarding: someone removed from the SSO directory should
         auto-deactivate their MedBroker account. This specifically
         requires a scheduled job calling Microsoft Graph API to check
         current directory membership (same daily-scan pattern already
         used for lead auto-return/notifications) — needs real Graph
         API application permissions registered against the customer's
         actual Entra tenant, which is IT coordination on Mark's side,
         not something buildable/testable from this sandbox alone.
     (e) Role source of truth stays MedBroker-managed (agreed) — but
         account creation itself should still auto-provision from SSO,
         which (b) already covers; role/permissions remain a separate,
         Admin-set concern from account existence.
   NOT YET BUILT — this is a multi-stage undertaking (dead-code review
   and wiring, a wholly new backend Entra-token-validation layer,
   email-matching/JIT-provisioning logic, a link-identity admin UI,
   email-correction UI, the password-fallback toggle+hard-commit, and
   the offboarding sync job) and deserves a focused, staged delivery
   rather than one giant unreviewable change, given how security-
   critical authentication code is. Proposed staging back to Mark in
   chat; awaiting confirmation on provider choice and stage order before
   writing the actual token-validation code. Also worth noting for
   whenever this is built: testing an actual OAuth handshake needs a
   real Entra tenant — nothing here can be verified end-to-end from the
   sandbox the way the rest of this session's fixes were.

FILES: none this entry — investigation and design discussion only, no
code changed. Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
111. KMS-HARDENED ID-NUMBER ENCRYPTION SHIPPED; JWT STORAGE RISK ASSESSED, NOT YET FIXED; GOOGLE SSO DEFERRED — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Three follow-ups from §110's encryption Q&A.

1. GOOGLE SSO — deferred to a future release, customer-demand-driven, not
   part of the current Entra-first build. No code, documentation only.

2. ID-NUMBER ENCRYPTION — HARDENED, AWS KMS-BACKED. Mark: "this must be
   fixed." Built, not just discussed.
   Root problem being fixed: DEMO_ENCRYPTION_KEY was a raw AES-256 master
   key sitting directly in a Vercel environment variable — readable by
   anyone with project access, no rotation, no access log, no revocation.
   encryption.js's own header comment already said as much ("DO NOT use
   this file... for real POPIA-classified data").
   Fix: AWS KMS now does the envelope-wrapping step that DEMO_ENCRYPTION_KEY
   used to do locally. Chosen over a self-hosted option (e.g. Vault)
   specifically to avoid introducing a new standing service to run —
   stays a managed API call, consistent with the Vercel+Neon-only
   philosophy already established for this project. The actual master
   key material now never exists inside Vercel at all — only a narrowly-
   scoped IAM credential (kms:Encrypt/Decrypt/GenerateDataKey on one key,
   nothing else) does, picked up automatically by the AWS SDK's own
   credential chain, never handled directly in application code.
   BACKWARD COMPATIBILITY, deliberate, not a stopgap: encrypt() now always
   produces a new 'kms1' format; decrypt() reads BOTH 'kms1' and the
   original 'demo1' format, branching on the version marker every payload
   already carries. This avoids a disruptive one-time re-encryption
   migration — any Lead.idNumber encrypted before this delivery stays
   permanently decryptable, since DEMO_ENCRYPTION_KEY and its decrypt
   path are kept, not removed. Verified with a synthetic test: manually
   constructed an old-format demo1 payload exactly as the pre-§111
   encrypt() would have, confirmed the new decrypt() still reads it
   correctly.
   New dependency: @aws-sdk/client-kms (^3.1102.0). Checked npm audit
   before and interpreted the result carefully — installing it surfaced
   8 pre-existing vulnerabilities (vite/vitest/react-router/xlsx/esbuild/
   brace-expansion), all already tracked in this file's own Security/
   Dependency State section from before this change; none are from the
   new package itself, confirmed by name-matching the audit output.
   New env vars, config.js (both optional() at that layer — encryption.js
   itself throws a clear, actionable error at call time if missing, same
   pattern as DEMO_ENCRYPTION_KEY's own existing error message):
     KMS_MASTER_KEY_ID, AWS_REGION
   Plus AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, read automatically by
   the AWS SDK's default credential chain — never referenced directly in
   this app's own code.
   *** DEPLOYMENT WARNING, repeated here and in the file's own header
   comment: encrypt() now throws rather than silently falling back to
   the weaker scheme if KMS_MASTER_KEY_ID/AWS_REGION are unset. DO NOT
   deploy this file until the AWS KMS key and a scoped IAM credential
   actually exist — otherwise Lead creation/update will start failing
   for any lead with an ID number the moment this ships. Needs Mark to:
   create/use an AWS account, create a KMS key, create an IAM policy
   scoped to only that key's Encrypt/Decrypt/GenerateDataKey actions,
   generate an access key pair, set all four env vars in Vercel. Same
   "needs real customer/account-side infrastructure before it takes
   effect" pattern as WAF configuration and SSO's offboarding sync. ***

3. SESSION TOKEN STORAGE — RISK ASSESSED HONESTLY, RECOMMENDATION GIVEN,
   NOT YET BUILT — Mark asked whether the signed-not-encrypted JWT is a
   "massive risk" and whether it can be fixed.
   Answer given: no, not a massive risk — signed-only (JWS, not JWE) is
   near-universal JWT practice, and the claims inside (user id, role,
   name, email — never a password) aren't confidential in a way that
   matters here; a stolen token grants full impersonation regardless of
   whether its payload was encrypted, since encryption doesn't prevent
   theft or replay, only reading the claims. Encrypting the JWT payload
   specifically would not have meaningfully reduced actual risk.
   The REAL, well-targeted fix identified instead: the token currently
   lives in sessionStorage (authStore.js) — JS-readable, so exposed to
   theft via any XSS vector exactly like localStorage would be. Checked
   frontend/vercel.json while answering this — confirmed there's no CSP
   header configured at all, meaning no defense-in-depth against XSS
   beyond React's own default JSX escaping. Moving the token to an
   httpOnly cookie would close the actual theft vector (JS, including
   injected/malicious JS, can never read an httpOnly cookie's value at
   all) — a materially bigger, more invasive change than encrypting the
   JWT would have been: touches the login response (Set-Cookie instead
   of/alongside a JSON token), every subsequent request's auth handling,
   and needs CSRF consideration (SameSite=Strict is likely sufficient
   for this app specifically — single-origin SPA, no legitimate cross-
   site request need — but that's a design call, not yet confirmed with
   Mark).
   NOT YET BUILT — flagged as a real, correctly-targeted recommendation,
   awaiting Mark's go-ahead given the size/invasiveness relative to what
   he'd literally asked about (encryption, not storage location).

VERIFIED (item 2 only — items 1 and 3 are documentation/discussion, no
code): node --check + ESM import smoke test on encryption.js and
config.js; confirmed encrypt() throws cleanly (not silently) without KMS
config; confirmed decrypt() still reads a manually-constructed old-format
demo1 payload correctly; full Vite production build clean; existing
45-test Vitest suite unaffected. Re-hydrated fresh from GitHub and
diffed all 3 changed files before packaging — clean, no parallel
changes. Could not test the actual AWS KMS call path itself — no real
AWS account/credentials available from the sandbox; verified by code
review against the documented KMS API shape, same "no live infrastructure
to test against" caveat already applied to WAF and the Reports fan-out fix.

MIGRATION: none — no schema change. Deployment sequencing warning above
takes the place of a migration note here; read it before deploying.

FILES:
  frontend/api-lib/services/encryption.js   (KMS-backed, demo1 kept for backward compat)
  frontend/api-lib/config.js                (kms.masterKeyId / kms.region added)
  frontend/package.json                     (@aws-sdk/client-kms added)
Plus this Status_Vercel.md.



━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
112. AWS KMS FLAG-GATED — APP WORKS WITH OR WITHOUT AWS CONFIGURED — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§111 shipped KMS as mandatory — encrypt() threw if unconfigured, which
would have broken Lead creation the moment it deployed, before Mark had
set up AWS. Mark asked for the wiring to stay, without forcing that
sequencing.

Built: security.kmsEncryption.enabled (Core tier, off by default — same
safe-by-default convention as every flag in this table). Checked via
getFlagMeta() (services/flagService.js), the same server-side flag-read
pattern already established by notifications.email.enabled — this is a
real precedent in this codebase for backend BEHAVIOUR gates, distinct
from the frontend-visibility-only pattern tasks.enabled/
popia.subjectAccessRequest.enabled use.
  - Flag off (default, every fresh deploy until Mark deliberately turns
    it on): encrypt() uses the original DEMO_ENCRYPTION_KEY-wrapped
    'demo1' scheme — app works with zero AWS setup.
  - Flag on: encrypt() uses KMS ('kms1'). If AWS isn't actually
    configured at this point, throws a clear, actionable error —
    deliberately NOT a silent fallback. Turning the flag on is a
    deliberate statement that KMS is ready; silently downgrading at that
    point would look like hardening is active when it isn't, which is
    worse than a loud failure.
  - decrypt() unaffected by the flag either way — always reads whichever
    format ('kms1' or 'demo1') a given value actually carries, so
    flipping the flag never breaks reading anything already encrypted
    under the other scheme.

New migration: 021_add_kms_encryption_flag.sql (an INSERT, not an
UPDATE like 020 — this is a brand-new flag key, not a metadata
correction on an existing one).

VERIFIED: node --check + ESM import smoke test on encryption.js/
config.js; full Vite production build clean; existing 45-test Vitest
suite unaffected. Re-hydrated fresh from GitHub and diffed all changed
files before packaging — clean.

FILES:
  frontend/api-lib/services/encryption.js
  frontend/src/context/FlagContext.jsx
  frontend/src/pages/FeatureFlags.jsx
  frontend/db/feature-flags.postgres.sql
  frontend/db/migrations/021_add_kms_encryption_flag.sql  (NEW)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
113. SESSION TOKEN MOVED TO AN HTTPONLY COOKIE — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full cutover, not a dual-support transition — staff auth (DEMO_MODE /
local email+password path only; the still-dead Entra/MSAL path in
api.js is untouched, it never used sessionStorage in the first place)
now transports its session token via an httpOnly cookie instead of a
JSON response body cached in sessionStorage. Closes the actual XSS
theft vector §111's original question was really about — encrypting the
JWT payload (what was literally asked back then) would not have helped;
this does, because JavaScript — including injected/malicious JavaScript
— can never read an httpOnly cookie's value at all.

NEW (http/helpers.js): setAuthCookie(), clearAuthCookie(), getAuthCookie().
No new dependency added for cookie parsing — Cookie headers are a
simple k=v; k2=v2 format and this app only ever needs to read the one
cookie it itself sets, not handle arbitrary third-party cookie
complexity a general-purpose parser exists for. Unit-tested the parser
directly (6 cases: single cookie, among others, URL-encoded value, no
cookie header, cookie header without mb_session, whitespace around a
pair) — all pass. This is real, run test coverage, not just a code-
review claim, unlike most of this session's backend changes which
can't be exercised without a live DB.

Cookie attributes, deliberate: SameSite=Strict (this app has no
legitimate cross-site request or top-level-navigation-into-the-app flow
that needs anything looser — Strict is correct here, not just cautious),
Secure hardcoded on regardless of NODE_ENV (Vercel serves everything
over HTTPS including previews, so there's no real case this breaks),
maxAge matching signJwt()'s own 8-hour default (cookie and token expire
together).

CORS RE-EXAMINED, NOT JUST LEFT ALONE: http/helpers.js's applyCors() had
a comment claiming safety specifically because "none of these routes use
cookies" — no longer true, and leaving that stale would have been
exactly the kind of claim this project's own PERMANENT PATTERNS section
warns against. Corrected: the permissive Origin-reflection approach
stays safe with a cookie in play, but now specifically BECAUSE (1) the
cookie is SameSite=Strict, so a browser never attaches it to a cross-
site request regardless of what this function does with Origin, and
(2) this function never sets Access-Control-Allow-Credentials: true. If
either of those two things ever changes, this needs re-examining — it
is not safe on its own merits, only safe because of those two
constraints holding together. Documented as a load-bearing pair, not a
one-off comment fix.

BACKEND — full list:
  - middleware/auth.js's validateToken(): reads getAuthCookie(req)
    instead of the Authorization header. No dual-path kept — same
    reasoning as why the old x-demo-user-id bypass was removed entirely
    rather than gated: no legitimate non-browser caller of staff routes
    exists, so a second path would be extra attack surface for nothing.
  - authHandlers.js: handleLogin and handleChangePassword both now call
    setAuthCookie() and no longer return token in their JSON body.
  - NEW handleLogout — didn't exist before. With sessionStorage, logout
    was a pure frontend action; an httpOnly cookie can only be cleared
    server-side, so a real endpoint is now required for logout to do
    anything at all. Deliberately skips validateToken() — logging out
    an already-invalid/expired session should still succeed in clearing
    whatever cookie the browser has, not error.
  - auth-router.js: routes POST /api/auth/logout to the new handler.
    No new Vercel function — same consolidated dispatcher file as
    login/change-password/bootstrap-admin, checked against the 12/12
    function cap before adding.

FRONTEND — full list:
  - authStore.js: rewritten. No token field in the stored session at
    all anymore — only { user }, a pure display-data cache (name, role,
    avatar colour). getToken() removed entirely, nothing calls it.
    setSession() is now one argument (user), not two.
  - api.js: request()'s DEMO_MODE branch no longer builds an
    Authorization header at all; every fetch call (including the two
    direct-fetch file-download functions — SAR export, Audit Log
    export — that couldn't go through request()) now sets
    credentials: 'same-origin' explicitly, which is what actually gets
    mb_session attached. New authApi.logout(). ENTRA_MODE branch
    (still dead code, not yet wired to anything) left untouched — MSAL-
    acquired tokens are correctly sent as Bearer headers per OAuth2
    convention, a cookie isn't the right transport for that path and
    this doesn't try to force it to be.
  - AuthContext.jsx: login() calls setSession(userWithFlag) (one arg).
    logout() is now async, calls authApi.logout() first (server clears
    the cookie), then always clears local display state regardless of
    whether that network call succeeded — a logout the user asked for
    should never appear to silently do nothing just because they're
    offline. refreshToken() removed entirely — there was nothing left
    for it to do once change-password stopped returning a token to pass
    around; the server-side re-set cookie already handles session
    continuity on its own.
  - ChangePassword.jsx: dropped the refreshToken(result.token) call and
    the now-unused result variable along with it.

SCOPE BOUNDARY, DELIBERATE: Lead Portal auth (ProspectAuthContext,
portalAuthStore.js, middleware/portalAuth.js) is a structurally separate
system with its own JWT secret and was NOT touched — Mark's question was
about the staff session token specifically. Flagging this explicitly
since it's a real, deliberate scope decision, not an oversight — Portal
auth still uses the same sessionStorage-based pattern staff auth used to,
if Mark wants that hardened too later.

VERIFIED: node --check + ESM import smoke test on all edited backend
files; full Vite production build clean; existing 45-test Vitest suite
unaffected; the cookie-parsing logic specifically unit-tested (6 cases,
all pass — see above). Could not test an actual browser round-trip
(login -> cookie set -> subsequent request -> logout -> cookie cleared)
— no live browser or deployed environment available from the sandbox;
this is the same "verified by code review and whatever can be unit-
tested standalone, not full integration" caveat already applied to every
other backend change this session that touches infrastructure this
environment can't reach. Re-hydrated fresh from GitHub and diffed all 8
changed files before packaging — clean, no parallel changes.

MIGRATION: none — no schema change.

FILES:
  frontend/api-lib/http/helpers.js
  frontend/api-lib/middleware/auth.js
  frontend/api-lib/handlers/authHandlers.js
  frontend/api/auth-router.js
  frontend/src/services/authStore.js
  frontend/src/services/api.js
  frontend/src/context/AuthContext.jsx
  frontend/src/pages/ChangePassword.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
114. ENTRA ID SSO — STAGE 1+2 BUILT — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark gave the explicit go-ahead §0 was waiting on. Built exactly the
already-scoped plan from §109/§110 — no scope re-derivation. Both stages
delivered together, per Mark's own request.

ARCHITECTURE DECISION (stated once here, not repeated per-file — see each
file's own header comment for the same reasoning): Entra validation is
deliberately NOT wired into middleware/auth.js as a second per-request
auth path. An Entra ID token is verified ONCE, at login
(POST /api/auth/entra-login). On success the app issues its OWN local
session JWT/httpOnly cookie — exactly what local-auth login already
issues. Every subsequent request goes through the one existing session
path (middleware/auth.js: isActive re-check, sessionsRevokedAt, role),
regardless of how the session started. This is a real scope reduction
from what §110's "wholly new backend Entra-token-validation layer"
phrasing implied — that layer exists (entraAuthService.js) but plugs in
only at the login boundary, not duplicated into every request's
validation path. Matches design decision (e): SSO only proves identity;
role/authorization/session-revocation/isActive stay entirely
MedBroker-managed, the same way for every user regardless of auth path.

STAGE 1 — FOUNDATION:
  NEW PUT /api/users/:id/link-identity — GlobalAdmin ONLY (tighter than
  every other User Admin route, which is Admin+GlobalAdmin), matching
  design decision (a). Corrects a user's email and/or manually links or
  unlinks an Entra Object ID (send entraObjectId: null to unlink).
  Neither existed anywhere in User Admin before this — confirmed absent
  by reading UserAdmin.jsx and models/user.js before writing anything,
  not assumed from the §110 investigation alone. Unique-constraint
  conflicts (email or entraObjectId already in use) return a 409 with a
  message naming which field conflicted, not a generic error — Postgres
  reports the actual constraint name (UQ_User_Email vs
  UQ_User_EntraObjectId, folded lowercase since both are unquoted in
  schema.postgres.sql) and the handler branches on it. Two audit actions
  (UserEmailCorrected, UserIdentityLinked/Unlinked), written per field
  actually touched when a single call changes both.
  FRONTEND: UserAdmin.jsx's edit modal gained a "Sign-in Identity
  (GlobalAdmin only)" section — visible only when role === 'GlobalAdmin'
  AND editing an existing user, with its own Update Identity button
  (separate save action, separate endpoint, separate audit semantics from
  the main Save Changes button above it). This is also the review surface
  a JIT-provisioned SSO user (stage 2, created inactive — see below) or an
  email-mismatch case gets resolved through: same admin-visible list
  every other user shows up in, not a new page.

STAGE 2 — CORE ENTRA VALIDATION:
  NEW api-lib/services/entraAuthService.js — the actual JWKS/RS256
  validation layer §110 found completely missing (middleware/auth.js's
  validateToken() had zero code path for an Entra-issued token). Uses
  `jose` (NEW dependency) rather than hand-rolling, unlike authService.js's
  local HMAC JWT — verifying a THIRD PARTY's rotating public key set is a
  different problem from signing/verifying with a secret this app
  controls, and jose is the standard library built specifically for it.
  verifyEntraIdToken() is a pure core (JWKS resolver + expected
  issuer/audience/tenant passed in explicitly) wrapped by
  validateEntraToken() (real config: ENTRA_TENANT_ID/ENTRA_CLIENT_ID, NEW
  backend env vars — deliberately separate from the VITE_-prefixed pair
  authConfig.js already has, since those are Vite build-time-only and a
  Vercel Function needs its own server-side copies). Validates issuer,
  audience, expiry, signature via Microsoft's real JWKS endpoint, PLUS a
  second belt-and-braces check that the token's own tid claim matches the
  configured tenant (redundant with the issuer check in the honest case,
  cheap insurance against a too-loose issuer configuration).
  NEW POST /api/auth/entra-login (auth-router.js, no new Vercel Function —
  still 12/12, checked before adding). Gated on auth.sso.enabled — a real
  backend-BEHAVIOUR flag check (getFlagMeta, same pattern
  security.kmsEncryption.enabled established, §112), not just a
  frontend-visibility gate; 403s immediately if SSO isn't turned on for
  the deployment. Matching order, per §109's design (backfill onto the
  EXISTING row rather than ever duplicating someone who already has a
  local account, so every FK already pointing at their user id — Lead.
  assignedAgentId, Appointment.brokerId, AuditLog.performedById, etc. —
  keeps working with no separate merge step):
    1. entraObjectId already linked -> that IS the user.
    2. No oid match, email matches an unlinked local row -> auto-backfill
       entraObjectId onto it, log them in.
    3. Email matches a row already linked to a DIFFERENT entraObjectId ->
       genuine mismatch, 409, don't silently relink — resolved via stage
       1's link-identity route.
    4. No match at all -> JIT-provision (userService.jitProvisionSsoUser)
       a new row, INACTIVE, role='Agent' (design decision (b)'s "safe
       default role, Admin fills in the rest") — isActive=FALSE IS the
       review gate; the row is real and immediately visible in User Admin,
       but middleware/auth.js's isActive check blocks all access until a
       GlobalAdmin reviews and activates it. Login itself 403s with a
       clear "pending administrator approval" message, an
       SsoUserJitProvisioned audit entry is written (performedById: null
       — the identity provider triggered this, not a MedBroker user).

NOT IN THIS DELIVERY, unchanged from §110's staging (stages 3+4, do not
start either without Mark's explicit go-ahead, same as this one needed —
stage 4 specifically needs a real Entra app registration only Mark can
create):
  - Password-fallback toggle + hard-commit, offboarding sync via Graph
    API directory-membership checks (stage 3).
  - Frontend MSAL wiring — the actual "Sign in with Microsoft" button;
    authConfig.js, App.jsx's MsalProvider comment, api.js's dead
    ENTRA_MODE branch are all untouched (stage 4). POST /api/auth/
    entra-login exists and works correctly when called, but nothing in
    the UI calls it yet — auth.sso.enabled stays off by default, and even
    turned on, there's no button.
  - GlobalAdmin guide docx's §2.2 Flag Reference table still describes
    auth.sso.enabled/auth.sso.provider by their pre-§114 meaning — same
    "flagged, not fixed inline" treatment §109 gave the POPIA SAR flag's
    stale doc entry; needs the same docx edit-and-verify pass whenever
    documentation is next touched.

TESTABILITY: cannot test an actual OAuth handshake or a real Neon insert
from this sandbox — no live Entra tenant, no live DB connection, same
caveat as every other piece of infrastructure this environment can't
reach. What COULD be given real, run coverage, was: NEW
entraAuthService.test.js (10 tests) signs real tokens against a
locally-generated RSA keypair and locally-hosted JWKS (jose's own
createLocalJWKSet) and drives verifyEntraIdToken() directly — valid
token accepted with correct claim extraction (including the
preferred_username -> email fallback and the lowercase/trim normalisation),
and separately rejects: wrong signing key, expired, wrong audience, wrong
issuer, mismatched tid despite a superficially-plausible issuer, missing
oid, missing any email claim. This is the same standard §113's
cookie-parsing tests set — real assertions against real logic, not a
code-review-only claim. Also fixed, incidentally: this was the first test
file to import anything that transitively touches api-lib/config.js,
which throws eagerly at import time without DATABASE_URL set — added a
placeholder-only DATABASE_URL to vite.config.js's new `test.env` block
(never actually connected to; db.js's getPool() is lazy) so `vitest run`
doesn't need a live database for tests that don't need one. A real,
generically useful fix, not specific to this one test file.

VERIFIED: node --check + ESM import smoke test on every new/edited
backend file; full 55-test Vitest suite passes (45 pre-existing + 10
new); full Vite production build clean. Re-hydrated fresh from GitHub and
diffed all 14 changed/new files before packaging — clean, no parallel
changes landed upstream.

MIGRATION: none. entraObjectId, passwordHash (nullable), and their unique
indexes (UQ_User_EntraObjectId, UQ_User_Email) already existed in
schema.postgres.sql, anticipating exactly this — confirmed via §109's own
investigation before writing a line of this delivery's code.

Project_Context_Vercel.md also updated this entry: the User entity
section's stale "some future SSO path — not currently exercised" note
and §5's auth.sso.enabled/auth.sso.provider flag descriptions ("not wired
to anything real") both corrected to reflect stage 1+2 now being real.
NOT touched: the RoleContext.jsx/PERSONAS paragraph in §3 is ALSO stale
(describes a preview role-switcher §87 already removed entirely, as if
it still exists as a fallback) — pre-existing inaccuracy, unrelated to
this delivery's scope, flagging rather than fixing so it isn't lost.

FILES:
  frontend/package.json                              (jose dependency)
  frontend/vite.config.js                             (test.env DATABASE_URL placeholder)
  frontend/api-lib/config.js                          (config.entra)
  frontend/api-lib/services/entraAuthService.js       (NEW)
  frontend/api-lib/services/entraAuthService.test.js  (NEW)
  frontend/api-lib/services/userService.js            (SSO support functions, entraObjectId in USER_LIST_SELECT)
  frontend/api-lib/handlers/userHandlers.js           (handleUserLinkIdentity)
  frontend/api-lib/handlers/authHandlers.js           (handleEntraLogin)
  frontend/api-lib/models/user.js                     (LinkIdentitySchema)
  frontend/api-lib/models/auth.js                     (EntraLoginSchema)
  frontend/api/auth-router.js                         (entra-login route)
  frontend/api/users-router.js                        (link-identity route)
  frontend/src/services/api.js                        (usersApi.linkIdentity)
  frontend/src/pages/UserAdmin.jsx                     (Sign-in Identity section)
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
115. LEAD PORTAL SESSION MOVED TO AN HTTPONLY COOKIE — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Closes the exact gap §113 deliberately left open at the time ("Lead
Portal auth... still on the pre-§113 pattern... flagged here explicitly
so it doesn't drop off"). Same fix shape as promised there: httpOnly
cookie, a real logout endpoint, the two cookies never conflated.

Full cutover, not dual-support — same reasoning as §113: no legitimate
non-browser caller of portal routes exists, so keeping the Authorization-
header path alive alongside the cookie would only be extra attack
surface for nothing.

BACKEND:
  - http/helpers.js: NEW setPortalAuthCookie()/clearPortalAuthCookie()/
    getPortalAuthCookie() — a SEPARATE cookie (mb_portal_session), not
    the staff mb_session cookie reused. Deliberately duplicated rather
    than parameterising setAuthCookie() with a cookie-name argument: two
    small, obviously-distinct functions are harder to misuse than one
    function a caller could accidentally invoke with the wrong name and
    silently cross the staff/portal boundary this file otherwise keeps
    structurally impossible to cross — same reasoning that already keeps
    the two JWT signing secrets (config.localAuth vs config.portalAuth)
    apart. Same SameSite=Strict/Secure/HttpOnly attributes as
    setAuthCookie(), same 8-hour maxAge (matches issuePortalToken()'s
    signJwt() default).
  - middleware/portalAuth.js: validatePortalToken() reads
    getPortalAuthCookie(req) instead of the Authorization header.
  - handlers/portalHandlers.js: handlePortalRegister, handlePortalActivate,
    handlePortalLogin, handlePortalWalkIn all call setPortalAuthCookie()
    now and no longer return token in their JSON body. handlePortalWalkIn
    keeps attendanceType in its response body — confirmed
    PortalCheckinConfirm.jsx actually reads that field before removing
    anything else from the response, not assumed safe to drop. NEW
    handlePortalLogout — didn't exist before (nothing to clear
    server-side while the token lived only in sessionStorage); skips
    validatePortalToken() deliberately, same "logging out an
    already-invalid session should still succeed" reasoning as staff's
    handleLogout.
  - api/portal-router.js: routes POST /api/portal/logout to the new
    handler. No new Vercel Function — still 12/12, same consolidated
    dispatcher file as every other portal route.

FRONTEND:
  - portalAuthStore.js: rewritten. No token field at all anymore — holds
    only a lightweight { authenticated: true } flag (not even display
    data, unlike authStore.js's { user } — the Lead Portal never shows
    cached profile data before its own fetch, PortalDashboard always
    calls portalApi.getMe() on mount regardless). getPortalToken()
    removed entirely, nothing calls it. setPortalAuthenticated() replaces
    setPortalSession(token).
  - portalApi.js: request() no longer attaches a manual Authorization
    header at all; every call now sets credentials: 'same-origin'
    explicitly, which is what actually gets mb_portal_session attached.
    New portalApi.logout().
  - ProspectAuthContext.jsx: registerAndLogin/walkInAndLogin/
    activateAccount/login all call setPortalAuthenticated() (no
    argument) instead of setPortalSession(data.token). logout() is now
    async, calls portalApi.logout() first (server clears the cookie),
    then always clears local display state regardless of whether that
    network call succeeded — same pattern AuthContext.jsx's own logout()
    already established for staff.
  - PortalDashboard.jsx: handleLogout is now async, awaits logout()
    before navigating.

SCOPE BOUNDARY, DELIBERATE: staff auth (mb_session) untouched by this
entry — already done, §113. The two cookies are structurally independent
(separate names, separate signing secrets) and this entry only ever
touched the portal side.

VERIFIED: node --check + ESM import smoke test on all edited backend
files; full Vite production build clean; existing 55-test Vitest suite
unaffected (no test coverage over cookie parsing specifically for the
portal path — mirrors staff's own §113 gap; getPortalAuthCookie() reuses
the same parsing logic getAuthCookie() already has real coverage-by-
inspection for, not a new untested code path). Could not test an actual
browser round-trip (register/login -> cookie set -> subsequent request
-> logout -> cookie cleared) — no live browser or deployed environment
reachable from the sandbox, same caveat as §113's own verification.
Re-hydrated fresh from GitHub and diffed all 9 changed files before
packaging — clean, no parallel changes.

MIGRATION: none — no schema change.

FILES:
  frontend/api-lib/http/helpers.js
  frontend/api-lib/middleware/portalAuth.js
  frontend/api-lib/handlers/portalHandlers.js
  frontend/api/portal-router.js
  frontend/src/services/portalAuthStore.js
  frontend/src/services/portalApi.js
  frontend/src/context/ProspectAuthContext.jsx
  frontend/src/pages/portal/PortalDashboard.jsx
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
116. AUDIT LOG "RAW ID ARRAYS" FLAG WAS A MISDIAGNOSIS, NOT A GAP — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark challenged §0's "AppAdmin Audit Log: a User's portfolio/product
array assignments still show as raw id arrays in changeDetail" bullet,
believing it was already fixed. Checked the actual code rather than
trusting either claim — he was right, and the real story is more
specific than "already fixed elsewhere": it was never broken. §103's own
entry (3 Aug 2026) is where the mischaracterization was introduced —
it described UserUpdated's changeDetail as carrying "raw-id arrays" for
portfolios/products and deliberately chose not to resolve them, and that
description then propagated into §0's outstanding-items list. Traced the
full chain instead of re-describing it from memory:
  - models/user.js's own header comment: UpdateUserSchema.portfolios/
    .products are z.array(z.string()) of NAMES — "matches UserAdmin.jsx's
    checkbox state exactly (form.portfolios / form.products are arrays
    of names, resolved against Portfolio/Product by userService.js)".
  - UserAdmin.jsx: togglePortfolio(name)/toggleProduct(name) and the
    checkbox `checked` state all operate on p.name throughout — confirmed
    by reading the component, not the comment describing it.
  - userService.js: updateUserFull() calls resolvePortfolioIds(data.portfolios)/
    resolveProductIds(data.products) to convert names to ids ONLY for the
    UserPortfolio/BrokerProduct join-table sync (syncUserPortfolios/
    syncUserProducts) — these return a NEW id array, they never mutate
    data.portfolios/data.products itself.
  - userHandlers.js's handleUserById: changeDetail is built from
    parsed.data directly (spread, plus supervisorName when relevant) —
    the same parsed.data whose portfolios/products fields were never
    touched by the id-resolution step above. Always names, every time.

FIX: corrected the stale comment at the actual write site (userHandlers.js)
so a future reader doesn't reach the same wrong conclusion §103 did, and
removed the corresponding bullet from §0's FLAGGED, NOT BUILT list.
Deliberately did NOT rewrite §103's historical entry itself — same
"leave history alone, correct forward" convention already established
(e.g. §109's seed-vs-live-state correction) — this entry is the
correction, not a silent edit of the record.

No code behaviour changed by this entry — the audit log has been showing
readable portfolio/product names for User updates the whole time; this
was a documentation-and-comment fix, not a functional one.

VERIFIED: read-only investigation (models/user.js, UserAdmin.jsx,
userService.js, userHandlers.js all traced directly against the live
GitHub source), plus the comment edit itself was included in this
session's node --check pass on userHandlers.js (§115, same file).

MIGRATION: none.

FILES:
  frontend/api-lib/handlers/userHandlers.js  (comment only, no logic change)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 (Entra SSO stage 1+2) — CONFIRMED LIVE. Not from Mark saying so
directly; the pre-packaging re-hydration for §115 pulled a fresh copy of
main and the entra-login route was already present, which only happens
if the §114 zip was deployed. Noted here as observed evidence, not
assumed — worth being precise about the difference given this file's own
"don't conflate seed defaults with live state" lesson (§109).

§115 (Lead Portal httpOnly cookie) and §116 (audit log comment
correction) are built and verified by this session but NOT YET DEPLOYED.
§115 needs no new env vars (PORTAL_JWT_SIGNING_SECRET already existed
and is unchanged) — a straight drag-and-drop-and-deploy, same as §116's
comment-only change. No migration for either.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
117. TOKEN ECONOMY STAGE 1 — CLAIM MODEL + TOKENLEDGER REAL, STRIPE STILL DEFERRED — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked to build the Stripe feature. Investigation before writing any
code found the actual scope was bigger than the "claim model works;
Stripe not connected" line this file's §0 previously carried — that was
wrong, corrected in conversation before this entry: the CLAIM model
(appointments.claimModel = 'claim') had ZERO backend implementation.
TokenLedger/TokenTransaction were schema-only ("Phase 2 stub", Section
14), and AppointmentList.jsx's entire claim UI — Available to Claim tab,
token balance, Buy Tokens modal — was mock data, by its own header
comment's own admission. Stripe had nothing real to connect a payment to.

Mark chose to stage it, same shape as the SSO staging: real claim/token
backend first (this entry), Stripe checkout/webhook after, only once
Mark gives the explicit go-ahead — same gate every staged piece this
session has used. This entry is the "before" half; Stripe is NOT built.

ARCHITECTURE DECISIONS MADE, WORTH KNOWING ABOUT:

  NO CRON FOR THE MONTHLY FREE-TOKEN RESET. TokenLedger.freeRemaining is
  meant to reset every calendar month to SystemConfig.
  brokerFreeAppointmentsPerMonth. This Vercel stack has no scheduled-job
  infrastructure (same gap that's kept Notifications' own scheduled
  pieces on hold). Solved the same way §111/§112's KMS/demo1 format
  detection solves an analogous problem: LAZY reset-on-read.
  getCurrentTokenLedger() (tokenService.js) checks whether periodStart
  is before the current month on every call and resets right then if so.
  A broker who never touches the token economy in a given month just
  never gets reset that month — harmless, nothing reads an unused ledger
  either. Recurring design language in this codebase for "no scheduler
  available," not a one-off improvisation.

  NO MULTI-STATEMENT TRANSACTIONS EXIST IN THIS STACK (confirmed by
  reading db.js, not assumed — executeQuery has no BEGIN/COMMIT wrapper,
  every call is one statement against the pool). claimAppointment()
  (appointmentService.js) and debitTokensForClaim()/manualTopUp()
  (tokenService.js) are each written as single, GUARDED, atomic UPDATEs
  (WHERE freeRemaining >= @x AND balance >= @y, or WHERE status =
  'Unassigned') rather than read-then-write, so a genuine race (two
  brokers claiming the same appointment, or a balance changing between
  check and debit) fails the guard and throws cleanly instead of
  silently corrupting a balance or double-assigning an appointment.
  claimAppointment() debits tokens BEFORE attempting the claim
  (deliberate ordering — a broker who can't afford an appointment never
  sees it flash to "claimed" and then revert), and refunds
  (refundTokens()) if the claim itself then loses the race.

  AVAILABLE-TO-CLAIM FILTERING mirrors brokerMatchingService.
  findMatchingBrokers()'s own region+product eligibility rule exactly —
  a broker only ever sees appointments they'd have been eligible for if
  an Admin had manually matched them instead (BrokerRegion + BrokerProduct,
  same tables, same join shape, just inverted — a broker looking up their
  own matches instead of a lead being matched against all brokers). An
  appointment with no productsInterestedIn recorded is shown to every
  region-matched broker rather than hidden from everyone — the safer
  default; the alternative would make an appointment permanently
  unclaimable over a data-entry gap. Product matching happens in JS
  (fetch the broker's own product names once, intersect against the
  parsed productsInterestedIn JSON), not fragile JSON-in-SQL matching.

  'NONE' PAYMENT PROVIDER IS FULLY BUILT, NOT A STOPGAP — matches the
  flag's own description ("manual top-up by admin only") exactly.
  UserAdmin.jsx's edit modal gained a "Token Balance (Admin)" section —
  visible for Admin+GlobalAdmin editing a Broker specifically (broader
  gate than §114's Sign-in Identity section, which is GlobalAdmin-only —
  this matches the top-up endpoint's own actual Admin+GlobalAdmin scope)
  — showing current free/paid balance with an add-tokens input. Stays
  open on save (unlike link-identity, which closes) since an Admin
  topping up a balance plausibly wants to check the new total or top up
  again, not leave immediately.

FRONTEND: AppointmentList.jsx's mock data (ALL_APPOINTMENTS,
MY_APPOINTMENTS, AVAILABLE_TO_CLAIM) is gone. Turned out MY_APPOINTMENTS
was redundant the whole time it existed — the real apptData fetch already
correctly scopes to a Broker's own appointments server-side (listAppointments
sets filters.brokerId = claims.oid for Broker role, confirmed by reading
handleAppointmentsCollection, not assumed), for BOTH claim and assign
model, since claiming sets brokerId same as assigning does. The claim-
model "My Appointments" tab was rendering mock data next to a perfectly
good real data source sitting unused in the same file. Available to
Claim and the token balance card are both real now (appointmentsApi.
listAvailableToClaim(), appointmentsApi.tokens.me()); claiming calls PUT
/api/appointments/:id/claim and refetches all three (appointments,
available pool, token balance) rather than the old local-state mock-row
append. BuyTokensModal's 'none'-provider message was already accurate
("contact your administrator") — left as-is.

ONE BUG CAUGHT MID-BUILD, WORTH FLAGGING: while adding a SQL comment to
APPOINTMENT_SELECT (appointmentService.js), a `//` (JS-style) slipped in
alongside the surrounding `--` (SQL-style) comment markers. Since this
whole SELECT is a JS template literal containing raw SQL text, that `//`
would have been sent to Postgres as-is — not a JS syntax error (node
--check passed fine), a malformed SQL string that would only have
surfaced as a runtime query failure. Caught by literally extracting and
reading the assembled SQL text before moving on, not by any automated
check — worth remembering that node --check/ESM smoke tests don't
validate SQL embedded in template literals; anything touching a raw SQL
comment block deserves that same manual read-the-actual-string step.

NOT IN THIS DELIVERY:
  - Stripe checkout + webhook + credential storage (stage 2) — needs
    Mark's explicit go-ahead, same gate this entry needed. Design already
    settled in conversation: jose-adjacent raw-body handling for webhook
    signature verification (Vercel auto-parses req.body; the fix is
    reading the raw stream before anything touches it — confirmed via
    Vercel's own docs/community answers, not assumed), folded into
    appointments-router.js (still 12/12), an encrypted DB-backed
    credentials store (reusing encryption.js's envelope encryption, NOT
    SystemConfig — that table's GET is open to any staff member by
    design, wrong place for secrets) with a shared "Integrations"
    settings UI Mark specifically wants to also cover SMTP credentials
    once built.
  - Any actual SMTP credential UI — same "Integrations" page as Stripe
    when that gets built; nodemailer still reads process.env.SMTP_* only.
  - broker.tokenIncentives.enabled (bonus tokens for closed deals) —
    Phase2-tagged flag, untouched, no indication Mark wants this yet.

TESTED how this session's other database-touching work has been tested:
node --check + ESM import smoke test on every backend file, full Vite
production build (JSX/import correctness), existing 55-test Vitest suite
unaffected (no new test file this entry — tokenService.js's core logic
is small enough guarded UPDATEs that unit-testing them meaningfully would
need a real or mocked Postgres connection, unlike entraAuthService.js's
pure-function verification core; flagged rather than faked). Cannot
verify an actual claim, a real race condition, or the lazy monthly reset
against a live database from this sandbox — same caveat as every other
piece of database-dependent work this session.

MIGRATION: none. TokenLedger, TokenTransaction, and Appointment.
claimedByBrokerId/claimedAt/claimTokenCost all already existed in
schema.postgres.sql, anticipating exactly this (Section 14's own "Phase 2
stub" label was accurate prophecy, not aspirational — confirmed via
direct inspection before writing a line of this entry's code).

Project_Context_Vercel.md also updated this entry: the CLAIM MODEL flag
section corrected (was describing claim mode as unbuilt with Stripe as
the missing piece; now describes what's actually real vs still deferred),
and the Appointment entity's status enum corrected to include 'Claimed'
— missing from that list entirely, unrelated to this entry's own work but
caught while in the area.

FILES:
  frontend/api-lib/models/appointment.js         (claimTokenCost, TokenTopUpSchema)
  frontend/api-lib/services/tokenService.js      (NEW)
  frontend/api-lib/services/appointmentService.js (claimAppointment, listAvailableToClaim, claimTokenCost wired into createAppointment, agentRegion added to APPOINTMENT_SELECT)
  frontend/api-lib/handlers/appointmentHandlers.js (5 new handlers)
  frontend/api/appointments-router.js            (claim/available-to-claim/tokens routes — still 12/12)
  frontend/src/services/api.js                   (appointmentsApi.claim/listAvailableToClaim/tokens.*)
  frontend/src/pages/AppointmentList.jsx          (mock data removed, real wiring throughout)
  frontend/src/pages/UserAdmin.jsx                (Token Balance admin section)
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 (Entra SSO stage 1+2) — CONFIRMED LIVE. Not from Mark saying so
directly; the pre-packaging re-hydration for §115 pulled a fresh copy of
main and the entra-login route was already present, which only happens
if the §114 zip was deployed. Noted here as observed evidence, not
assumed — worth being precise about the difference given this file's own
"don't conflate seed defaults with live state" lesson (§109).

§115 (Lead Portal httpOnly cookie), §116 (audit log comment correction),
and §117 (token economy stage 1) — ALSO CONFIRMED LIVE, same kind of
observed evidence: the pre-investigation re-hydration for §118 (below)
pulled a fresh copy of main and mb_portal_session, the §116 comment
correction, and handleAvailableToClaim were all already present. Mark
was actively testing §117 when he found the bug §118 turned out to be —
he'd deployed everything through the token economy delivery by then.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
118. NOT A LOCKOUT BUG — WRONG TEST EMAIL; FORCE PASSWORD RESET BUILT; SHOW/HIDE GAP CLOSED — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark reported the 5-failed-attempts lockout no longer worked, while
testing right after deploying §117. Investigated end to end before
concluding anything — diffed handleLogin, recordLoginFailure,
systemConfigService.js, AppAdmin.jsx's settings form, authService.js,
db.js, config.js, http/helpers.js, and auth-router.js against a snapshot
from before ANY of this session's work (§114 onward). Every one of them
is either byte-for-byte identical or only ADDITIVELY changed — nothing
in this session's four deliveries touches User.isLocked,
User.failedLoginAttempts, or SystemConfig at all. Also had Mark confirm
the live SystemConfig.passwordLockoutAttempts value directly (5, not 0)
before ruling that out too.

ACTUAL CAUSE, found by Mark himself: wrong test email — the user didn't
exist. handleLogin's very first check (`if (!user) return
res.status(401)...`) fires before the failure-counting logic is ever
reached, so repeated wrong-password attempts against a nonexistent
account were never going to count toward anything. Not a regression,
not a bug — correct behaviour the whole time, confirmed by exhaustive
diffing rather than assumed innocent.

Two genuine, unrelated things came out of the same conversation:

1. SHOW/HIDE PASSWORD GAP — ChangePassword.jsx had zero Show/Hide
   toggles on any of its three fields (Current/New/Confirm), unlike
   Login.jsx and all four Lead Portal password screens (§101), which
   already have one. Added — one shared toggle across all three fields
   (not three independent ones), matching Login.jsx's exact pattern
   (position:relative wrapper, `type={showPassword ? 'text' : 'password'}`,
   absolutely-positioned Show/Hide button) rather than inventing a new one.
   A single shared toggle also means New and Confirm can be visually
   compared side by side, the more common reason to want them visible.

2. NEW: GLOBALADMIN-ONLY FORCE PASSWORD RESET. Mark's request — "if they
   have genuinely forgotten their password and we want to set something
   for them that needs to change at first login." Investigated
   createUserFull() first to find the existing precedent for "admin sets
   an initial password, user is forced to replace it" (§72's
   passwordMustChange = !!passwordHash at creation time) rather than
   inventing a new pattern — this is that same mechanism, applied to an
   EXISTING user instead of a new one.
     - NEW userService.forcePasswordReset(userId, newPlaintext): sets
       passwordHash/passwordSetAt (like setUserPassword()), but
       passwordMustChange = TRUE, not FALSE — the whole point, an
       admin-typed value is never left as a real password for someone
       else's account. ALSO clears isLocked/failedLoginAttempts and the
       caller (handleUserForcePasswordReset) calls revokeUserSessions()
       — all three folded into one action deliberately: "forgotten
       password" plausibly already involves a lockout from the attempts
       that led here, and there's no good reason to make an Admin
       perform Unlock as an easy-to-forget separate second step.
     - NEW PUT /api/users/:id/force-password-reset — GlobalAdmin ONLY,
       tighter than Unlock/Force-Logout's Admin+GlobalAdmin gate,
       matching Mark's own explicit wording ("a Global Admin user").
       Runs the SAME checkPasswordComplexity() bar a voluntary change is
       held to — an admin-typed temporary value doesn't get a policy
       exemption. Deliberately does NOT run the reuse-prevention check
       (wasPasswordUsedThisYear) — that policy exists to stop someone
       cycling back to a password THEY chose; doesn't meaningfully apply
       to a one-time admin-assigned value the real owner replaces at
       next login anyway.
     - FRONTEND: UserAdmin.jsx's edit modal gained a "Forgotten Password
       (GlobalAdmin only)" section, positioned between Sign-in Identity
       and Token Balance (all three are GlobalAdmin-adjacent recovery/
       security actions in the same modal). Click-to-reveal an inline
       form rather than a footer button like Unlock/Force Logout —
       unlike those, this needs actual input (the temporary password),
       not just a confirm-and-go action. Uses the SAME
       err.body?.error.passwordProblems special-case ChangePassword.jsx
       already needs, not usersApi's shared formatErrorBody() — that
       helper only understands Zod's fieldErrors/formErrors shape, and
       would have silently swallowed the complexity-check error message
       into a generic "API request failed" otherwise. Caught by reading
       ChangePassword.jsx's own error handling first, not discovered by
       testing.

VERIFIED: node --check + ESM import smoke test on every edited backend
file, full Vite production build clean, existing 55-test Vitest suite
unaffected. Re-hydrated fresh from GitHub and diffed all 7 changed files
before packaging — clean, no parallel changes.

MIGRATION: none — no schema change (isLocked, failedLoginAttempts,
passwordMustChange, passwordHash all already existed).

FILES:
  frontend/api-lib/models/user.js               (ForcePasswordResetSchema)
  frontend/api-lib/services/userService.js       (forcePasswordReset)
  frontend/api-lib/handlers/userHandlers.js      (handleUserForcePasswordReset)
  frontend/api/users-router.js                   (force-password-reset route)
  frontend/src/services/api.js                   (usersApi.forcePasswordReset)
  frontend/src/pages/UserAdmin.jsx                (Forgotten Password section)
  frontend/src/pages/ChangePassword.jsx           (Show/Hide on all 3 fields)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §117 all CONFIRMED LIVE — see the notes above §118 for how
that was established. §118 (Force Password Reset + Show/Hide fix) —
ALSO CONFIRMED LIVE, same kind of evidence: the pre-investigation
re-hydration for §119 (below) pulled a fresh copy of main and
force-password-reset was already present in users-router.js.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
119. APPOINTMENTS "MY APPOINTMENTS" TAB HAD NO FILTERING — LEADS ALREADY DID — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked whether Appointments filtering (Active by default, toggle to
Closed) could be added for a Broker, and the same for Leads/Agent if it
wasn't already there. Checked both before building anything.

LEADS: already fully built, no gap. LeadList.jsx's activeStatus chips
(Active/Closed/All/etc, default 'Active') apply uniformly to every
role — Agent scoping (agentId: persona.id) is a query param alongside
the status filter, not a separate code path that bypasses it. Nothing
to build here; told Mark so rather than duplicating something already
correct.

APPOINTMENTS: real gap, isolated to one specific view. showClaimTabs
(isBroker && claimModel === 'claim') renders a My Appointments/Available
to Claim tabbed interface instead of the general filtered table+FiltersBar
every other role (and even a Broker under the ASSIGN model) gets. The
"mine" tab's table read from myAppts — broker-scoped only, via
sourceData.filter(a => a.brokerCode === persona.id) — never from
filtered, which is the SAME broker-scoping plus statusFilter/search/
source/portfolio/broker on top. FiltersBar itself wasn't rendered on
that tab at all. A claim-model Broker had no way to hide Closed
appointments from their own list; every other view in this exact file
already could, including via a comment on FiltersBar itself noting it
"mirrors LeadList.jsx" — the irony being the mirroring was real for the
general appointments view, just never extended to this one broker-
specific tab when it was added.

FIX: render <FiltersBar /> in the 'mine' tab (same component, no new
one), and point the table at `filtered` instead of `myAppts`. Metric
cards (Total assigned/Today/Closed Won) deliberately keep reading
myAppts, not filtered — same convention the non-claim-tab metric cards
elsewhere in this file already use: summary counts show true totals
regardless of the current filter selection, only the table itself
responds to it.

VERIFIED: full Vite production build clean, existing 55-test Vitest
suite unaffected (no backend touched — single frontend file). Re-hydrated
fresh from GitHub and diffed the one changed file before packaging.

MIGRATION: none — no backend change at all, this entry is pure frontend.

FILES:
  frontend/src/pages/AppointmentList.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §118 all CONFIRMED LIVE. §119 (Appointments "My
Appointments" tab filtering) — ALSO CONFIRMED LIVE, same kind of
evidence: the pre-investigation re-hydration for §120/§121 (below)
pulled a fresh copy of main and the FiltersBar/filtered wiring on the
'mine' tab was already present.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
120. ENTRA SSO STAGE 4 — FRONTEND MSAL WIRING, "SIGN IN WITH MICROSOFT" IS REAL — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed he doesn't mind that neither SSO nor Stripe can be
exercised end to end without real third-party credentials — same
"buildable now, dormant until configured" pattern AWS KMS, SSO stage
1+2, and the token economy already established, not a reason to defer
building. Asked for SSO first, then Stripe. This entry is stage 4 —
built first (frontend), stage 3 (§121, below) built second.

Investigation before writing anything found stage 4 wasn't "wire up
existing pieces" — some of what existed needed REPLACING, not reusing:

  - api.js had a complete, dead, pre-§114 parallel auth system
    (ENTRA_MODE, getAccessToken()) that attached a fresh Entra Bearer
    token to EVERY request — a fundamentally different, incompatible
    architecture from §114's "validate once at login, then the same
    httpOnly-cookie session governs everything after" design. Removed
    entirely rather than reused — keeping both would mean two
    incompatible ways of authenticating a request existing side by side.
  - authConfig.js's loginRequest requested ACCESS TOKEN scopes for a
    custom exposed API (api://{clientId}/leads.read, leads.write) — a
    mismatch with what entraAuthService.validateEntraToken() (§114)
    actually validates: a plain ID token, audience = the client ID
    itself. Requesting those scopes would have gotten a token with the
    wrong audience for that check to ever pass, and would have required
    Mark to additionally configure "Expose an API" in the Entra app
    registration for a capability this app doesn't use — it does its own
    RBAC via the role field, not OAuth scopes. Corrected to standard OIDC
    scopes (openid, profile, email); the code now reads response.idToken.
  - SingleSignOn.jsx needed a real rewrite, not a tweak. It was
    rewritten 31 Jul (§75) specifically to STOP claiming SSO was live
    when it wasn't — accurate then, actively wrong after §114 shipped
    ("turning this flag on has no functional effect here," sitting right
    next to a working "Sign in with Microsoft" button, would have been
    the misleading version this time).

WHAT WAS BUILT:
  - NEW services/msalAuth.js — the ONLY place MSAL is touched beyond
    static config, deliberately narrow: acquireEntraIdToken() opens a
    Microsoft popup, once, at login. Nothing else in the app ever
    touches MSAL again — every request after that runs through the
    exact same cookie session local login already uses.
  - AuthContext.ssoLogin() — same shape as login() deliberately
    (handleEntraLogin's response is the identical { user,
    passwordMustChange } shape handleLogin's is), so session caching,
    theme application, and passwordMustChange handling are all identical
    too; the only real difference is how the credential is obtained.
  - Login.jsx — "Sign in with Microsoft" button, shown only when
    auth.sso.enabled is on (checked via GET /api/flags, genuinely public,
    no auth required — works before any session exists, confirmed by
    reading flagHandlers.js, not assumed).
  - App.jsx's stale "AUTH BYPASSED FOR PREVIEW" / "replace RoleProvider
    with MsalProvider + AuthenticatedTemplate" header comment corrected
    — that's NOT the approach taken; MSAL stays narrowly scoped to
    msalAuth.js, RoleProvider is untouched.

BUG CAUGHT MID-BUILD, WORTH FLAGGING: a static top-level import of
msalAuth.js in AuthContext.jsx put MSAL in the main app bundle's module
graph — confirmed via the actual production build, not theorised: the
main chunk nearly doubled, 272kB -> 539kB, with a chunk-size warning,
for every single user regardless of whether their deployment even has
SSO enabled. Fixed with a dynamic import() inside ssoLogin() instead —
rebuilt and confirmed fixed the same way, by reading the real numbers:
MSAL now lives in its own separate 265kB chunk, only fetched the moment
someone actually clicks the button, main bundle back to 273kB.

VERIFIED: full Vite production build clean (twice — once catching the
bundle regression, once confirming the fix), existing 55-test Vitest
suite unaffected. Re-hydrated fresh from GitHub and diffed every changed
file before packaging alongside §121, below.

MIGRATION: none. No new env vars beyond what §114 already required
(ENTRA_TENANT_ID/CLIENT_ID backend, VITE_ENTRA_CLIENT_ID/AUTHORITY
frontend) — stage 4 uses the same ones, doesn't add new ones.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
121. ENTRA SSO STAGE 3 — PASSWORD-FALLBACK TOGGLE + OFFBOARDING SYNC — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Built second, after §120 (frontend). Closes out the SSO staging plan
that's been carried in this file's NEXT ACTION section since §114.

PASSWORD-FALLBACK TOGGLE — new flag auth.sso.disableLocalFallback (Core,
boolean, off by default — non-breaking, local login keeps working for
everyone until a GlobalAdmin deliberately turns this on). Same
dependsOn pattern auth.sso.provider already established in
FeatureFlags.jsx (both frontend metadata AND the DB seed row added —
confirmed via reading FeatureFlags.jsx that FLAG_META genuinely is a
hand-maintained mirror of the seed data, not generated from it, so both
needed updating). When on: handleLogin (authHandlers.js) blocks local
email/password login for any user with a linked Entra identity
(entraObjectId set) — checked BEFORE the passwordHash check, so even a
user who still technically has a local password set is told to use SSO
once policy requires it, not silently let through. GlobalAdmin is
DELIBERATELY EXEMPT from this check always, regardless of the flag — a
permanent break-glass path so an Entra outage or a misconfigured app
registration can never fully lock every admin out of MedBroker. Needed
entraObjectId added to getUserByEmailForLogin's SELECT (userService.js)
— wasn't there before, nothing had needed it at that call site until now.

OFFBOARDING SYNC — NEW api-lib/services/entraGraphService.js, app-only
(client-credentials) Graph API access. Deliberately separate from
entraAuthService.js (§114): that validates a USER's own ID token (public
client, no secret); this authenticates as the APPLICATION itself
(confidential client, needs a NEW credential — ENTRA_CLIENT_SECRET,
config.entra.clientSecret, optional() — plus User.Read.All admin consent
in the Entra app registration, something only Mark can grant). Hand-
rolled with plain fetch, no new dependency — a client-credentials token
request and a Graph GET don't need a library, same "simple enough to get
right by hand" bar authService.js's local HMAC JWT and http/helpers.js's
cookie parsing already set.

NO SCHEDULER, SAME CONSTRAINT AS EVERYWHERE ELSE IN THIS STACK, DIFFERENT
SOLUTION THIS TIME: the token economy's monthly reset (§117) self-heals
lazily on next read because a broker who hasn't touched it yet doesn't
need it reset yet either. Offboarding sync can't use that trick — if
someone's been removed from Entra, they're not logging in to trigger
anything. So this is a genuinely on-demand action instead: NEW POST
/api/auth/offboarding-sync (auth-router.js, still 12/12 — folded into
the existing function), GlobalAdmin only, triggered by a "Run Sync Now"
button on the SingleSignOn page. Checks every active, Entra-linked user
against Graph, deactivates anyone Graph says is gone or disabled,
continues past individual failures (one broken Graph lookup shouldn't
abort checking everyone else) and reports them back rather than
swallowing them. New userService functions: listSsoLinkedActiveUsers(),
deactivateUser() (a small dedicated function, not routed through
updateUserFull() — this call site has exactly one field to set and no
request body to validate against a schema).

SingleSignOn.jsx gained both the fallback-toggle status line and the
Offboarding Sync card (GlobalAdmin-gated in the UI too, matching the
endpoint's own gate) — same page §120 already rewrote, extended rather
than touched twice separately.

CAUGHT WHILE IN THE NEIGHBOURHOOD, UNRELATED TO THIS ENTRY'S OWN WORK:
Project_Context_Vercel.md had THREE separate stale references to
apiMode.DEMO_MODE and a "PERSONAS-based preview role switcher" — both
removed 1 Aug (§87) and 4 Aug (§120) respectively, well before this
entry. All three corrected (role-derivation paragraph, the services/
file-tree listing, the "MOCK DATA — PREVIEW PERSONAS" section retitled
to "TEST ACCOUNTS" and rewritten). Checked RoleContext.jsx's OWN header
comment while in the area, expecting it to need the same fix — it
didn't; it was already accurate, correctly documenting §87's own
removal. The earlier assumption in §114's own delivery notes that this
comment was stale was wrong — never actually re-verified at the time,
just inferred from Project_Context_Vercel.md's OWN stale description of
it. Worth remembering: a flagged-but-unverified staleness claim can
itself be wrong, not just the thing it's flagging.

VERIFIED: node --check + ESM import smoke test on every new/edited
backend file, full Vite production build clean, existing 55-test Vitest
suite unaffected. Re-hydrated fresh from GitHub and diffed all 18 files
changed across §120+§121 together before packaging as one delivery —
clean, no parallel changes.

MIGRATION: schema — none (no new columns). Feature flag seed — the new
auth.sso.disableLocalFallback row needs feature-flags.postgres.sql
re-run against Neon; confirmed safe (ON CONFLICT (flagKey) DO NOTHING on
the whole INSERT block, already re-run for prior sessions' new flags the
same way) — Mark can just re-run the whole file, not a targeted snippet.

NOT IN THIS DELIVERY: Stripe (checkout, webhook, Integrations
credentials page) — next, per Mark's own sequencing ("SSO first, then
Stripe").

FILES (§120+§121 combined, one delivery):
  frontend/src/services/authConfig.js
  frontend/src/services/msalAuth.js               (NEW)
  frontend/src/services/api.js
  frontend/src/context/AuthContext.jsx
  frontend/src/pages/Login.jsx
  frontend/src/App.jsx
  frontend/src/pages/SingleSignOn.jsx
  frontend/api-lib/config.js
  frontend/api-lib/services/entraGraphService.js   (NEW)
  frontend/api-lib/services/userService.js
  frontend/api-lib/handlers/authHandlers.js
  frontend/api/auth-router.js
  frontend/db/feature-flags.postgres.sql
  frontend/src/pages/FeatureFlags.jsx
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §119 all CONFIRMED LIVE. §120+§121 (Entra SSO stages 3+4 —
the full staging plan is now complete, all four stages built) are built
and verified by this session but NOT YET DEPLOYED. Deploying requires
re-running feature-flags.postgres.sql (new flag row, safe, idempotent —
see §121). No other migration. ENTRA_CLIENT_SECRET only needed once Mark
actually wants to run offboarding sync live — everything else works
without it, same optional()-until-configured pattern as every other
credential in this app.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
123. APP ADMIN SYSTEM SETTINGS — SAVE CONFIRMATION SCROLLED OUT OF VIEW — 4 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark: the "Changes saved" banner on App Admin -> System Settings isn't
visible when you scroll down to actually click Save, so a save looks
like it silently did nothing. Confirmed by reading the layout, not
assumed: both settingsSaved and settingsError render inline at the TOP
of a long, scrollable settings form (password policy, token allocation,
lockout, etc.), while Save Settings sits at the very bottom, well below
the fold — by the time anyone reaches the button, feedback rendered
above it is already scrolled out of view. Same root cause for both
success and failure, though Mark only reported the success case;
fixed both rather than leaving the error case with the identical bug
for someone to hit later.

FIX: position: fixed on both banners (bottom-right of the viewport,
z-index above page content) instead of inline in the document flow —
visible regardless of scroll position, seen immediately after clicking
whichever button just triggered it. Didn't touch the 2.5s auto-hide
timeout on the success banner — that duration was never the problem,
only ever being unable to see it in the first place.

Scoped to System Settings only, matching what Mark actually reported —
didn't audit AppAdmin.jsx's other tabs (Portfolios, Products, Medical
Subscriptions, Audit Log) for the same pattern; worth a look if the same
complaint comes up elsewhere on this page.

VERIFIED: full Vite production build clean, existing 55-test Vitest
suite unaffected (single frontend file, no backend touched). Re-hydrated
fresh from GitHub and diffed the one changed file before packaging.

MIGRATION: none.

FILES:
  frontend/src/pages/AppAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §121 all CONFIRMED LIVE. §122 (Feature Flags tab count fix)
and §123 (App Admin save-confirmation visibility) are built and verified
by this session but NOT YET DEPLOYED — two small, independent frontend-
only fixes, no particular order needed between them. No new env vars, no
migration for either.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
125. SAR FEATURE MATURITY — TWO REAL BUGS FIXED, LOCKING, ASSIGNMENT, NOTES, PER-ITEM AUDIT — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's own SAR testing feedback, several items in one conversation.
Investigated each before building anything — two turned out to be real,
confirmed bugs, not feature gaps; the rest were genuine additions.
Mark also added mid-build: once Fulfilled or Rejected, a SAR should be
locked — folded in as the organising rule most of this entry's other
pieces check against.

CONFIRMED BUGS, NOT GAPS:
  1. CSV/JSON export parity — CSV was missing 10 real fields the JSON
     export has (whatsappNumber, universityAttended, yearOfAttendance,
     degreeAttained, existingCover, currentInsurer, policies, medicalAid,
     medicalAidProvider, the lead's own createdAt). Confirmed by diffing
     the two field lists directly. Fixed — SAR_CSV_COLUMNS
     (sarHandlers.js) now carries every field compileSubjectData()
     returns, kept in the same order as that function's own Lead SELECT
     specifically so the two are easy to eyeball together next time
     either changes.
  2. Audit Log missing detail for SAR entries — every writeAuditLog()
     call in sarService.js/sarHandlers.js was passing changeDetail
     ALREADY JSON.stringify()'d, but writeAuditLog (auditService.js)
     does that internally — the result was a double-encoded string in
     the database. Read back for display, it comes out as a plain
     string, not an object, and AppAdmin.jsx's formatChangeDetail()
     (§103, working correctly for every other action type in the app)
     bails out immediately on anything that isn't an object. Not a
     rendering gap — one wrong line, repeated across three call sites.
     Fixed by passing plain objects, matching every other writeAuditLog()
     caller in this codebase.

NEW — LOCKING (Mark's mid-build addition): once a SAR's status is
Fulfilled or Rejected, sarService.assertNotLocked() rejects any further
status change, reassignment, or new comment with a 409. This is the ONE
place the rule lives — every mutating function calls it first, so there
was nowhere for a UI-only lock to quietly diverge from what the server
actually allows. Exports remain available on a locked request
deliberately — re-downloading data already fulfilled seems reasonable,
and export is read-only with respect to the SAR record itself.

NEW — ASSIGNMENT + NOTIFICATION: assignSarRequest() — Admin/GlobalAdmin
only, re-validates the target user's role server-side even though the
caller (sarHandlers.js) already checked, same defense-in-depth reasoning
as handleLogin's auth.sso.disableLocalFallback check (§121: never trust
a single check alone for something this consequential). Fires a
notification to the new assignee via createNotification(), same
mechanism every other assignment-style action in this app already uses.

NEW — NOTES THREAD: "the same way as Tasks" — investigated what that
actually meant before building anything and found Tasks don't have one
text field, they have a real TaskComment table (growing, timestamped,
authored). NEW SarComment table mirrors it exactly. SubjectAccessRequest.
notes (the original single field) is UNCHANGED, kept alongside — same
relationship Task.detail has alongside TaskComment, not a replacement.

NEW — PER-SAR AUDIT VIEW: every SAR action now writes TWO audit entries,
not one — the existing Lead-scoped entry (kept: a SAR being processed is
part of the Lead's own history, and compileSubjectData's own auditTrail
reads from Lead-scoped entries) PLUS a new SAR-scoped one
(entityType: 'SubjectAccessRequest'). The new GET /api/leads/sar-requests/
:id/audit endpoint reuses auditService.listAuditLog(entityType, entityId)
directly — the exact same generic function LeadDetail/AppointmentDetail's
own Change Log panels already use. Caught while wiring this: almost wrote
a bespoke getSarAuditLog() in sarService.js that would have needed its
own JSON.parse on changeDetail, duplicating logic that already exists
and is already correct — checked for an existing generic function before
writing a new one, found it, used it instead.

NEW — AUTO STATUS TRANSITION: first export on a still-Received request
auto-advances it to InProgress (markInProgressOnFirstExport) — the same
"system reflects that work has actually started" reasoning a broker
claiming an appointment already gets (§117). Deliberately a no-op for
anything not currently Received — re-exporting an already-InProgress or
locked request never touches status.

DELIBERATELY NOT INCLUDED: compileSubjectData() (the subject-facing
export) does NOT include SarComment or assignedToId — MedBroker's own
internal processing metadata about handling the request isn't data held
ABOUT the subject, and a person asking "what do you know about me"
doesn't need to see staff's internal notes about who's working their
ticket.

ALSO NOT BUILT, FLAGGED RATHER THAN FORCED: a "SAR due soon" reminder
notification, which Claude itself suggested last entry as a natural
complement to assignment+notifications. This app has no scheduled-job
infrastructure (same constraint offboarding sync, §121, and the token
economy's monthly reset, §117, both work around differently) — a due-
date reminder genuinely needs something to run on a schedule and check,
which nothing here can do without either a manual trigger (workable, but
Mark didn't ask for it) or real scheduler infrastructure this stack
doesn't have. Deferred rather than shipped as a compromised version of
what was suggested.

VERIFIED: node --check + ESM import smoke test on every new/edited
backend file, full Vite production build clean, existing 55-test Vitest
suite unaffected. Re-hydrated fresh from GitHub and diffed all 7 changed
files before packaging.

MIGRATION — a real one this time, not just a safe-to-rerun seed file.
Two schema changes, neither covered by schema.postgres.sql's own
CREATE TABLE IF NOT EXISTS for an ALREADY-existing SubjectAccessRequest
table:

  ALTER TABLE SubjectAccessRequest ADD COLUMN IF NOT EXISTS assignedToId UUID NULL;
  ALTER TABLE SubjectAccessRequest ADD CONSTRAINT FK_SubjectAccessRequest_Assignee FOREIGN KEY (assignedToId) REFERENCES "User"(id);

  CREATE TABLE IF NOT EXISTS SarComment (
      id             UUID          NOT NULL DEFAULT gen_random_uuid(),
      organisationId UUID          NOT NULL DEFAULT 'D0000000-0000-0000-0000-000000000001',
      sarId          UUID          NOT NULL,
      authorId       UUID          NOT NULL,
      body           VARCHAR(2000) NOT NULL,
      createdAt      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      CONSTRAINT PK_SarComment        PRIMARY KEY (id),
      CONSTRAINT FK_SarComment_Org    FOREIGN KEY (organisationId) REFERENCES Organisation(id),
      CONSTRAINT FK_SarComment_Sar    FOREIGN KEY (sarId) REFERENCES SubjectAccessRequest(id) ON DELETE CASCADE,
      CONSTRAINT FK_SarComment_Author FOREIGN KEY (authorId) REFERENCES "User"(id)
  );
  CREATE INDEX IF NOT EXISTS IX_SarComment_Sar ON SarComment (sarId, createdAt);

Both also added to schema.postgres.sql for future fresh deployments —
run the snippet above against the EXISTING Neon database first, schema.
postgres.sql alone won't retroactively alter an already-existing table.

FILES:
  frontend/db/schema.postgres.sql
  frontend/api-lib/models/sar.js
  frontend/api-lib/services/sarService.js
  frontend/api-lib/handlers/sarHandlers.js
  frontend/api/leads-router.js
  frontend/src/services/api.js
  frontend/src/pages/AppAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §124 all CONFIRMED LIVE. §125 (SAR feature maturity) is
built and verified by this session but NOT YET DEPLOYED — needs the
ALTER TABLE/CREATE TABLE snippet above run against Neon before or right
after dragging the zip in (the app will work with the code deployed and
the migration not yet run, right up until someone tries to assign a SAR
or add a note — those specific actions would fail against the missing
column/table until the migration runs).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
126. SAR DATE DISPLAY + A REAL CSV CORRUPTION BUG FOUND WHILE VERIFYING — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark: SAR list table shows full ISO timestamps ("2026-08-05T00:00:00.000Z")
instead of just a date, and asked to re-confirm whether the CSV parity
fix (§125) actually took effect — sent an actual exported CSV to check
against, not just a description.

CSV PARITY: verified against the file itself — all 24 columns present,
matches SAR_CSV_COLUMNS exactly. §125's fix is live and working as
intended.

FOUND WHILE VERIFYING, NOT WHAT WAS ASKED ABOUT: the same CSV's Date of
Birth cell was corrupted — "\"\"\"2026-07-30T00:00:00.000Z\"\"\"" instead
of a clean value. Root cause, in the SHARED toCsv() utility
(http/helpers.js), used by every CSV export in this app, not just SAR:
escapeCell() treated any `typeof value === 'object'` as a real
object/array needing JSON.stringify() — correct for the "(JSON)"
columns (policies, callAttempts, etc.), wrong for a Date instance, which
is ALSO typeof 'object'. JSON.stringify(aDate) wraps it in an extra pair
of literal quote characters; escapeCell then CSV-escaped THAT (since it
now contained a "), doubling those quotes again. Confirmed the exact
mechanism by actually running toCsv() with a real Date object before
and after the fix, not just reading the code. Fixed generically —
Date instances now use .toISOString() directly — so every OTHER CSV
export in this app carrying a raw Date-typed column is fixed too, not
just SAR's.

ALSO FIXED: dateOfBirth specifically trimmed to YYYY-MM-DD in the CSV's
flat object (sarHandlers.js) — the toCsv() fix alone stops the
corruption but would still show a full midnight-UTC timestamp for a
field that's genuinely date-only. Matches this codebase's own stated
convention (models/sar.js's receivedAt comment: "YYYY-MM-DD, matches
every other date-only field").

UI DATE DISPLAY: AppAdmin.jsx's SAR table was rendering
sar.receivedAt/dueDate raw. A shared utility for exactly this already
existed — utils/dateFormat.js's formatDate(), built 23 Jul specifically
for "Postgres DATE column serialised as a full ISO timestamp" (its own
header comment's exact words), with a scope note flagging that sweeping
every date display over to it was a reasonable follow-up not yet done.
Should have used it when building §125's table and didn't — fixed now,
no new utility needed, just applying the one already there.

VERIFIED: full Vite build clean, existing 55-test Vitest suite
unaffected. toCsv()'s fix specifically verified by executing it directly
against a real Date object (not just reading the code) — confirmed
clean output before packaging, not assumed correct from the diff alone.
Re-hydrated fresh from GitHub and diffed all 3 changed files.

MIGRATION: none.

FILES:
  frontend/api-lib/http/helpers.js       (toCsv Date-handling fix — app-wide)
  frontend/api-lib/handlers/sarHandlers.js (dateOfBirth trimmed to YYYY-MM-DD)
  frontend/src/pages/AppAdmin.jsx         (formatDate() applied to SAR table)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §125 all CONFIRMED LIVE (§125's CSV parity fix specifically
verified against Mark's own exported file, not just assumed from the
code). §126 (date display + the toCsv corruption bug) is built and
verified by this session but NOT YET DEPLOYED. No new env vars, no
migration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
127. AUDIT LOG COULDN'T NAME THE LEAD ON A SAR ENTRY; SAR LEAD PICKER NOW A REAL DROPDOWN — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark: the Audit Log's SubjectAccessRequest-scoped entries show the raw
SAR id, not the Lead's name — "anyone reading the log won't know who it
was about."

ROOT CAUSE: auditService.js's AUDIT_SELECT_BASE resolves a human-readable
"entityRef" per entityType via a COALESCE of CASE branches, each backed
by a LEFT JOIN — Lead resolves directly, Appointment/EventAttendee
resolve INDIRECTLY through their own leadId (exactly the shape needed
here), everything else falls through to a generic "entityType: id"
string. §125 added SubjectAccessRequest as a real entityType being
written to the audit log but never added a branch for it here — it fell
straight through to that generic fallback, which is exactly what Mark
saw. Fixed by adding the same indirect-join shape Appointment/
EventAttendee already use, through SubjectAccessRequest.leadId.

FOUND WHILE FIXING, SAME BUG CATEGORY: VALID_ENTITY_TYPES/VALID_ACTIONS
(auditHandlers.js, backend) and AUDIT_ENTITY_TYPES/AUDIT_ACTIONS
(AppAdmin.jsx, frontend filter dropdowns) are both meant to be kept in
sync whenever a new entityType/action is introduced — an explicit
existing convention (this file's own header comment: "if it's ever
written on the backend, add it here too or it just won't appear as a
filter option"). §125 introduced SubjectAccessRequest (entity) and
SarAssigned (action) without adding either to any of the four lists —
filtering the Audit Log by either would have silently returned zero
rows, no error, just nothing. All four lists corrected. Also found,
unrelated to SAR: UserSessionsRevoked was already in the backend's list
but missing from the frontend's — pre-existing drift, fixed alongside
since it's the identical category of bug in the identical two files.

SAR LEAD PICKER: Mark wants search by name/email (already worked) AND
selection via a real dropdown. The "Find the Lead" search results used
to render as a custom clickable div list — replaced with an actual
<select>, search still narrows the candidates first (keeps the dropdown
a manageable size rather than listing every Lead in the org). Also added
a small "Change" link next to a selected lead, since the select-from-
dropdown flow made it less obvious how to pick a different one after
selecting — a gap the old always-visible list didn't have.

VERIFIED: node --check + ESM import smoke test on both edited backend
files, full Vite build clean, existing 55-test Vitest suite unaffected.
Re-hydrated fresh from GitHub and diffed all 3 changed files before
packaging — confirmed §126 (previous entry) was already live by the
time this investigation started, so no separate-checkout consolidation
needed this time.

MIGRATION: none.

FILES:
  frontend/api-lib/services/auditService.js  (SubjectAccessRequest -> Lead resolution)
  frontend/api-lib/handlers/auditHandlers.js (VALID_ENTITY_TYPES/VALID_ACTIONS)
  frontend/src/pages/AppAdmin.jsx             (filter lists + SAR lead-picker dropdown)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §126 all CONFIRMED LIVE. §127 (audit entity resolution +
SAR lead-picker dropdown) is built and verified by this session but NOT
YET DEPLOYED. No new env vars, no migration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
128. SAR ASSIGNEE DROPDOWN WAS ACTUALLY BROKEN; ASSIGN AT CREATION; STATUS CAN ONLY MOVE FORWARD — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark: the "Assigned to" dropdown only ever shows "Unassigned" — nobody
else in it at all. Also wants to assign at creation time, not only
afterward, and confirmed the assignable pool should be Admin (not
GlobalAdmin-only) — checked whether Supervisor should be included too
and whether Supervisor even has access to these pages at all, since
there's no point being assignable to a page you can't open.

ROOT CAUSE, confirmed by reading both sides of the call, not assumed:
the dropdown's data came from usersApi.list({ role: 'Admin' }) and
usersApi.list({ role: 'GlobalAdmin' }) run together via Promise.all.
Two separate problems compounded: (1) CreatableRole (models/user.js)
doesn't accept 'GlobalAdmin' as a valid filter value at all — that call
returns a 400, not an empty list; (2) even if it did, listUsers() itself
hardcodes `u.role != 'GlobalAdmin'` in its base WHERE clause, a
deliberate exclusion for ITS purpose (the general User Admin list,
where GlobalAdmin — bootstrap-only — was never meant to appear). The
400 from problem (1) rejected the whole Promise.all, which the
surrounding catch silently swallowed to an empty array — discarding the
WORKING Admin results too, not just the broken GlobalAdmin ones. Fixed
with a genuinely separate, dedicated query
(userService.listSarAssignableUsers()) rather than reusing or
parameterising the general-purpose one, which has its own, different,
deliberate reason to exclude GlobalAdmin that shouldn't be touched.

ROLE SCOPE, confirmed rather than assumed: checked App.jsx's route
gating and every single SAR/Audit backend handler directly — App Admin
(which hosts both Data Requests and Audit Log) is Admin/GlobalAdmin only
at BOTH the route level and independently on every endpoint. Supervisor
currently has zero access to either page. Told Mark this plainly rather
than silently deciding either way — assignable pool stays Admin +
GlobalAdmin (not GlobalAdmin-only, matching his explicit instruction);
extending Supervisor access is a separate, deliberate decision for him
to make later if he wants it, not a side effect of this fix.

NEW — ASSIGN AT CREATION: CreateSarRequestSchema gained an optional
assignedToId; createSarRequest() validates and notifies exactly the way
assignSarRequest() already did — factored the "is this a real, active
Admin or GlobalAdmin" check into one shared helper
(getValidSarAssignee()) used by both, rather than two copies of the
same query.

NEW — STATUS CAN ONLY MOVE FORWARD (Mark's explicit rule): Received(0)
< InProgress(1) < Fulfilled/Rejected(2, equal rank, not ordered against
each other — reaching either is what triggers the existing lock, not a
meaningful order between them). updateSarStatus() now rejects any
transition where the new status's rank isn't strictly greater than the
current one — closes the specific gap assertNotLocked() doesn't cover
(InProgress -> Received, since neither end of that move is itself a
locked state). Mirrored client-side (SAR_STATUS_RANK, AppAdmin.jsx) to
disable backward buttons before a click ever reaches the server, same
"UI reflects it, server enforces it" split every other business rule in
this app already uses.

NEW — GET /api/leads/sar-requests/assignable-users: backs both the
create-time and after-the-fact pickers now, one query, one source of
truth for "who can this be assigned to."

VERIFIED: node --check + ESM import smoke test on every new/edited
backend file, full Vite production build clean, existing 55-test Vitest
suite unaffected. Re-hydrated fresh from GitHub and diffed all 7 changed
files before packaging.

MIGRATION: none — assignedToId column already exists (§125).

FILES:
  frontend/api-lib/models/sar.js             (assignedToId on create)
  frontend/api-lib/services/userService.js   (listSarAssignableUsers)
  frontend/api-lib/services/sarService.js    (shared assignee validation, status-rank rule, assign-at-creation)
  frontend/api-lib/handlers/sarHandlers.js   (handleSarAssignableUsers)
  frontend/api/leads-router.js               (assignable-users route)
  frontend/src/services/api.js               (sarApi.assignableUsers)
  frontend/src/pages/AppAdmin.jsx            (fixed dropdown data source, create-time field, forward-only buttons)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §127 all CONFIRMED LIVE. §128 (SAR assignee dropdown fix +
assign-at-creation + forward-only status) is built and verified by this
session but NOT YET DEPLOYED. No new env vars, no migration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
129. SAR HISTORY WENT STALE FOR AN ALREADY-EXPANDED ROW — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked directly: is this a limitation or an oversight? Traced it
before answering either way — a real, precise oversight, not anything
architectural.

sarAuditEntries[id] (the "History" section) is fetched exactly once,
the first time a row expands, and cached — re-expanding the same row
never re-fetches (deliberate, §125, to avoid a network call on every
click). What was missing: nothing ever INVALIDATED that cache when the
underlying data actually changed. handleSarAssignChange,
handleSarStatusChange, and handleSarExport all correctly write new
audit entries server-side and already called refetchSar() to refresh
the table row (status badge, assignee name) — none of them touched the
cached audit trail for a row that happened to already be open. Comments
didn't have this problem — handleSarAddComment already appends locally
on success — but History genuinely went stale until a full page reload
wiped all local state and forced a fresh fetch next time.

FIX: one small shared helper, refreshSarAuditIfExpanded(id) — re-fetches
and replaces just that row's cached entries, but only if it's actually
the currently-expanded row (no point fetching something not on screen).
Called from all three action handlers, right after their existing
refetchSar().

VERIFIED: full Vite build clean (confirms the function-hoisting order
this relies on — refreshSarAuditIfExpanded is defined after two of its
three callers in the file — works correctly, not just reasoned about),
existing 55-test Vitest suite unaffected. Re-hydrated fresh from GitHub
and diffed the one changed file before packaging.

MIGRATION: none — pure frontend, no backend touched.

FILES:
  frontend/src/pages/AppAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §128 all CONFIRMED LIVE. §129 (SAR History staleness fix)
is built and verified by this session but NOT YET DEPLOYED. No new env
vars, no migration, no backend change at all.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
130. STALENESS-PATTERN SWEEP (CLEAN ELSEWHERE) + SAR ASSIGN NOW STAGED, NOT INSTANT — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Two asks in one: after §129's fix, Mark asked (1) for a full review that
the same "cached detail view goes stale after a related mutation
elsewhere on the page" bug doesn't exist anywhere else, and (2)
questioned whether the assignee <select> firing sarApi.assign()
straight from onChange was wise, given a misclick would be hard to
fully undo.

SWEEP RESULT — clean everywhere else, checked directly not assumed:
  - AppointmentDetail.jsx's Change Log: every mutation (outcome,
    meetings, reassign, return-to-leads) calls the exposed refetchAudit().
  - LeadDetail.jsx's Change Log: same — handleSaveEdit/handleReopenLead
    both call it; the one theoretically relevant action (agent
    reassignment) isn't even performable from this page at all.
  - Tasks.jsx's comment thread: different situation entirely — nothing
    EXTERNAL can write a task comment, so there's no sibling mutation
    that could make the cache stale in the first place.
  - UserAdmin.jsx's Token Balance: handleTopUp calls refetchTokenLedger().
  SAR was the only place this existed. Root architectural reason, worth
  remembering: the other three all use useFetch() with an exposed
  refetch() — every mutation handler on those pages was written against
  that contract. SAR's history/comments used a manual useState object
  keyed by request id instead, a less robust pattern with no equivalent
  forcing function — nothing reminded a new mutation handler to
  invalidate it. §129 fixed the three known call sites individually;
  worth considering a future refactor to the same useFetch-based shape
  for consistency, not done here since it wasn't broken, just less safe
  by construction.

ASSIGN NOW STAGED: agreed with Mark's instinct rather than just
deferring to it — assignment fires a notification to whoever gets
picked, so an accidental selection isn't just a wrong value sitting
there, it pings a real person, which status buttons and flag toggles
elsewhere in this app don't do (why those stay instant-fire and this
one shouldn't). The <select>'s onChange now only stages
sarPendingAssignedToId; nothing calls sarApi.assign() until a new Save
button is clicked (a Cancel button alongside it clears the staged
pick). Renamed handleSarAssignChange -> handleSarAssignConfirm to match
what it's actually triggered by now. Resets on row expand/collapse so a
staged-but-unsaved pick on one request can never leak into a different
one that's just been opened.

VERIFIED: full Vite build clean (also confirms no dangling reference to
the renamed handler — checked directly by grep, not just trusted the
build), existing 55-test Vitest suite unaffected. Re-hydrated fresh from
GitHub and diffed the one changed file before packaging.

MIGRATION: none — pure frontend, no backend touched.

FILES:
  frontend/src/pages/AppAdmin.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §129 all CONFIRMED LIVE. §130 (staleness sweep + staged
SAR assignment) is built and verified by this session but NOT YET
DEPLOYED. No new env vars, no migration, no backend change at all.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
131. SAR AUDIT DUAL-WRITE REMOVED — WRITE ONCE, READ SMARTER (OPTION 1) — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark spotted every SAR action logging twice in the global Audit Log —
once against SubjectAccessRequest, once against Lead — and asked
whether it was a bug. Confirmed it was deliberate (§125), not
accidental: AuditLog only supports one (entityType, entityId) per row,
and three different things needed to see a SAR action — the per-SAR
History panel, the data subject's own compiled export, and the Lead's
own Change Log — so §125 just wrote the event twice rather than teach
three read paths to look in two places. Agreed the duplication was
still the wrong call for THIS specific table, given its own stated
purpose ("for FAIS Act and POPIA compliance") — real duplicate rows in
a compliance-facing audit record is worse than the read-path complexity
it was avoiding, especially since the duplication would still be there
if anyone ever queried the raw table directly rather than through the
app. Presented two options rather than just picking one; Mark chose
write-once-read-smarter over keep-dual-write-hide-in-the-UI, for the
same reason — the latter would have "fixed" only the screen, not the
data.

FIX: sarService.js's three write points (createSarRequest,
updateSarStatus, assignSarRequest) and sarHandlers.js's export handler
now write ONLY the SubjectAccessRequest-scoped row — the Lead-scoped
twin is gone. NEW auditService.listAuditLogForLead(leadId) — a UNION of
direct Lead-scoped entries and SubjectAccessRequest-scoped entries
belonging to that lead's own SAR requests (JOIN SubjectAccessRequest ON
al.entityType = 'SubjectAccessRequest' AND al.entityId = sar.id::text,
same ::text cast pattern §127's entity-resolution fix already
established for exactly this kind of comparison) — replaces the removed
write at READ time instead. Two consumers switched to it:
compileSubjectData's auditTrail (reversed to ASC for its export
narrative — listAuditLogForLead returns DESC, matching the existing
listAuditLog() convention for a UI history list; trimmed back to the
same three fields the export always had, so the JSON/CSV shape itself
doesn't change even though the underlying query does) and
leadHandlers.handleLeadAudit (Lead's own Change Log — access control for
the lead was already checked before this call, so the swap doesn't
change WHO can see anything, only what's included once they're allowed
to look). The per-SAR History panel needed zero changes — it only ever
wanted SubjectAccessRequest-scoped rows, which are still written exactly
as before.

VERIFIED: node --check + ESM import smoke test on all four edited
backend files, full Vite build clean (frontend bundle sizes byte-
identical to the previous delivery — confirms this is genuinely
backend-only, not assumed from the file list alone), existing 55-test
Vitest suite unaffected. Could not execute the new UNION query against
a real Postgres instance from this sandbox — extracted and manually
read the exact assembled SQL text instead (same discipline this
session's own §117 "//comment" bug was caught with): column count/order
matches across both SELECT halves (a UNION ALL requirement), the
entityId::text cast matches §127's own proven pattern, and the quoted
"performedAt" alias is correctly referenced in the trailing ORDER BY.
Re-hydrated fresh from GitHub and diffed all four changed files before
packaging.

MIGRATION: none — no schema change, this is a query/write-pattern fix only.

FILES:
  frontend/api-lib/services/auditService.js  (NEW listAuditLogForLead)
  frontend/api-lib/services/sarService.js    (single-write x3, compileSubjectData switched)
  frontend/api-lib/handlers/sarHandlers.js   (single-write on export)
  frontend/api-lib/handlers/leadHandlers.js  (handleLeadAudit switched)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §130 all CONFIRMED LIVE. §131 (SAR audit dual-write
removed) is built and verified by this session but NOT YET DEPLOYED. No
new env vars, no migration, backend-only — confirmed by identical
frontend bundle sizes across the build, not just an unchanged file list.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
132. §131 SHIPPED WITH A GENUINE SQL BUG — TYPE MISMATCH IN THE NEW UNION QUERY — 5 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark hit a 500 exporting a SAR and, to his credit, sent the actual
Vercel stack trace rather than just "it's broken" — that's what made
this fixable in one pass instead of guessing. His own hypothesis
("because it was created before the change") turned out not to be the
mechanism, though understandable to suspect given the timing — checked
first rather than agreed with it.

REAL CAUSE: §131's new listAuditLogForLead() reuses the SAME @leadId
parameter in both halves of its UNION — once against AuditLog.entityId
(VARCHAR(100)) in the Lead-scoped half, once against
SubjectAccessRequest.leadId (a genuine UUID column) in the SAR-scoped
half. db.js's toPositional() correctly collapses repeated @name
occurrences to the same $N (confirmed by reading it directly — a
different bug was suspected and ruled out first, see below) — but that
means ONE parameter needed to satisfy TWO conflicting inferred types in
the same query, which Postgres can't resolve without an explicit cast:
"operator does not exist: uuid = text". This wasn't about old data,
migration state, or anything about the SAR's age — it would have failed
identically for a SAR created five minutes after §131 deployed. Every
single call to this function was broken, both read paths that use it
(compileSubjectData's export, and handleLeadAudit's own Change Log) —
confirmed by tracing the exact stack trace Mark sent, which showed
handleLeadAudit, not the export handler he thought he'd triggered; same
underlying broken function, reachable from either caller.

WRONGLY SUSPECTED FIRST, RULED OUT BY READING THE ACTUAL SHIM CODE: that
db.js's positional-parameter substitution might mishandle @leadId being
used twice at all. It doesn't — confirmed directly, not assumed, before
looking further.

FIX: explicit casts at each usage site — @leadId::text where compared
to entityId, @leadId::uuid where compared to SubjectAccessRequest.leadId.
Same single parameter, two different casts at its two different uses;
valid and unambiguous in Postgres.

VERIFIED PROPERLY THIS TIME — §131's own manual SQL read had already
missed this once, so a second manual read wasn't good enough. Installed
PostgreSQL 16 directly in this sandbox (apt, no live Neon access needed
or used) and reproduced the exact reported error character-for-character
against a real database with the real table casing/quoting conventions
this codebase actually uses ("operator does not exist: character
varying = uuid") before touching any code. Applied the fix, re-ran
against the same real database, confirmed correct output (both
Lead-scoped and SubjectAccessRequest-scoped entries returned, correctly
merged) — including the edge case of a Lead with zero SAR requests at
all (returns cleanly, no error). Then ran the ACTUAL production
function (listAuditLogForLead, imported from the real file, unmodified
test harness) end to end against that same database as a final check,
not just the hand-written reproduction query. Checked for the same bug
pattern (one parameter, two differently-typed comparisons in one query)
anywhere else in this session's other work — this UNION is the only one
in the codebase; nothing else at risk.

VERIFIED (standard pass, on top of the above): full Vite build clean
(bundle sizes byte-identical to §131 — confirms backend-only), existing
55-test Vitest suite unaffected. Re-hydrated fresh from GitHub and
diffed the one changed file before packaging.

MIGRATION: none.

FILES:
  frontend/api-lib/services/auditService.js
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §131 all CONFIRMED LIVE EXCEPT §131 SHIPPED BROKEN — see
§132 above. §132 (the actual fix) is built and verified — this time by
executing the real function against a real Postgres instance in this
sandbox, not just reading the SQL — but NOT YET DEPLOYED. No new env
vars, no migration.

LESSON WORTH CARRYING FORWARD: manually reading assembled SQL (this
session's own established practice since the §117 "//comment" catch)
is good for syntax and structure, but it does NOT reliably catch
cross-column TYPE mismatches in a query that reuses one parameter
against two differently-typed columns — that class of bug only really
surfaces by executing the query. Now know this sandbox CAN run a real
local Postgres instance (apt install postgresql, no network access to
the real Neon database needed) — worth reaching for this earlier for
any future query with meaningfully different-typed columns being
compared against the same reused parameter, rather than defaulting to
manual reading alone.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
133. AUDIT/CHANGE LOG FETCH FAILURES WERE INDISTINGUISHABLE FROM GENUINE EMPTY HISTORY — 6 Aug 2026 (session 15, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark, while installing §132: rejected a SAR, checked the Lead's own
"Audit Log" panel afterward, saw "Audit Log (0)" / "No changes recorded
yet." — asked whether that was correct. It wasn't, and it led to a
second, real, separate bug — not the same one as §132, but directly
surfaced by testing around it.

ROOT CAUSE: useFetch() (hooks/useFetch.js) has always exposed loading,
error, AND data — but LeadDetail.jsx's Audit Log and
AppointmentDetail.jsx's Change Log both only ever destructured data and
refetch, silently discarding error. When §131's now-fixed type-mismatch
bug (§132) was making listAuditLogForLead() throw on every call, data
stayed null on both these panels — auditData?.entries ?? [] quietly
produced an empty array, and the UI rendered exactly as if the lead/
appointment genuinely had zero history. No error banner, nothing to
suggest a fetch had failed at all. Confirmed this precisely (not
assumed) by reading useFetch.js directly — error was there the whole
time, on both pages, just never checked.

Note the SAR History panel (AppAdmin.jsx, §125/§130) does NOT have this
gap — it uses its own try/catch with an existing sarError surfaced to
the user, not useFetch's data/error split. Checked directly rather than
assumed clean.

FIX: both pages now also destructure error from their audit useFetch()
call and show a visible message ("Could not load audit history" / "the
change log", matching each page's own existing terminology) instead of
silently falling through to the empty-history state when the fetch
genuinely failed. LeadDetail.jsx didn't import the shared s (tokens)
object at all before this — added it rather than hand-roll a one-off
local error style, since s.errorBox is already the established
convention everywhere else in the app.

Worth being explicit about scope: this fix makes a REAL future failure
visible instead of silently lying about empty history — it doesn't
retroactively surface anything about the specific §131/§132 incident,
which is already resolved by §132 itself. This is a hardening measure
for whatever the next fetch failure turns out to be, not a patch
specific to this one bug.

VERIFIED: full Vite build clean, existing 55-test Vitest suite
unaffected. Re-hydrated fresh from GitHub and diffed both changed files
before packaging.

MIGRATION: none — pure frontend, no backend touched.

FILES:
  frontend/src/pages/LeadDetail.jsx
  frontend/src/pages/AppointmentDetail.jsx
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 15 PAUSED HERE — 4 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark confirmed everything through §113 deployed cleanly, no errors seen.
The AWS KMS code path (§111/§112) is deployed and visible in Feature
Flags but deliberately untested end-to-end — the flag stays off until a
paying customer exists, so this remains verified-by-code-review only,
not exercised live; worth remembering next session that "deployed
successfully" here means the flag-off/demo1 path was exercised by
normal use, not the KMS path itself. Migration 020 confirmed already
run by Mark before this session's end; safe to leave alone (re-running
it is a no-op by design, confirmed and explained when he asked).

§114 through §132 all CONFIRMED LIVE. §133 (audit/change log silent-
failure fix) is built and verified by this session but NOT YET
DEPLOYED. No new env vars, no migration.

Pausing on session usage, not on anything blocking. See §0's NEXT ACTION
at the top of this file for what's next — Stripe (checkout, webhook,
Integrations credentials page covering Stripe + SMTP), per Mark's own
sequencing.



If picking up a pending item, reference it by section number (e.g. "I
want to work on §61's remaining Notification types") — same convention
as before the split.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
134. STRIPE CHECKOUT + WEBHOOK + INTEGRATIONS SETTINGS PAGE (STRIPE + SMTP) — 6 Aug 2026 (session 16)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark's own next-action instruction from the end of session 15: Stripe
(checkout, webhook, Integrations settings page for Stripe + SMTP
credentials). Full build in one session, per the design already settled
at the end of session 15 (see the version of §0's NEXT ACTION this
replaces, still readable via git/session history if ever needed) — not
re-derived here, actually built.

1. RAW-BODY WEBHOOK SIGNATURE VERIFICATION. appointments-router.js is
   one Vercel Function serving five pre-existing JSON routes (collection,
   assign, reassign, outcome, claim, topup) plus the two new ones. Stripe
   signature verification needs the EXACT raw bytes of the request body —
   Vercel's default automatic body parsing (which every existing route in
   this file depended on) destroys that before a handler ever sees it,
   and re-serializing an already-parsed body doesn't reliably round-trip
   byte-for-byte. Fix: `export const config = { api: { bodyParser: false
   } }` disables Vercel's automatic parsing for the WHOLE file (one file
   = one function on this stack, so this is necessarily file-wide, not
   per-route), and the router itself now reads the raw stream once
   (readRawBody(), http/helpers.js — a real, documented Vercel pattern
   for this exact problem, hand-rolled, no new dependency) before
   dispatching. The webhook route gets the raw Buffer untouched, for
   signature verification. Every other route gets it JSON.parsed into
   req.body immediately, reproducing exactly what Vercel's own parser
   used to do — none of the five existing routes needed to change at
   all. Verified this holds (not just reasoned through) — see VERIFIED
   below.

2. STRIPE CHECKOUT (redirect-based, not Stripe.js/Elements).
   POST /api/appointments/tokens/checkout — Broker only, gated on
   appointments.tokens.paymentProvider = 'stripe' (checked via
   getFlagMeta(), server-side — not just frontend visibility, since this
   actually changes what the server will do). Creates a Stripe Checkout
   Session for one of three fixed token packs (stripeService.TOKEN_PACKS
   — 5/R250, 10/R450 "save R50", 20/R800 "save R200", unchanged from
   AppointmentList.jsx's existing Phase-2 mockup, now server-priced
   rather than display-only) and returns { url } for the browser to
   redirect to. Because Checkout is redirect-based, this app never
   handles card details or needs a Stripe publishable key anywhere —
   IntegrationCredential's 'stripe' config only has secretKey and
   webhookSigningSecret. metadata on the session (brokerId, tokens,
   packIndex, organisationId) carries everything the webhook needs to
   credit the right broker — no separate session-id-to-intent lookup
   table required.

3. STRIPE WEBHOOK, IDEMPOTENT AGAINST REDELIVERY.
   POST /api/appointments/tokens/webhook — DELIBERATELY NO staff JWT
   check, unlike every other route in this file; Stripe has no MedBroker
   session to send. The Stripe-Signature header (verified against the
   DB-stored webhook signing secret, stripeService.verifyWebhookSignature)
   is the entire auth boundary. On checkout.session.completed,
   tokenService.creditStripeTokens() credits the broker's paid balance —
   made idempotent against Stripe's own documented at-least-once webhook
   redelivery via a NEW TokenTransaction.externalRef column (nullable,
   partial UNIQUE index WHERE externalRef IS NOT NULL, migration 022):
   the INSERT carrying the Stripe session id as externalRef is the atomic
   guard itself, not a read-then-write check — a redelivered event's
   INSERT hits the unique index, the resulting 23505 is caught, and the
   function returns cleanly without touching the ledger a second time.
   Same reasoning debitTokensForClaim() (§117) already established for
   why a guarded write beats check-then-act under real concurrency.
   Every event type is acknowledged 200 regardless of whether this app
   acts on it — Stripe retries on anything except a 2xx, and retrying an
   event type this app doesn't react to would just retry forever for no
   reason. A genuine failure (bad signature, a real DB error) still
   returns non-2xx on purpose — that's what tells Stripe to retry, and
   the idempotency above is exactly what makes a retry safe.

4. INTEGRATIONS SETTINGS PAGE — Stripe + SMTP credentials, App Admin ->
   Integrations, GlobalAdmin only in both directions (unlike System
   Settings' deliberately-open GET — see system-config.js's own header
   for why that split exists and why this page doesn't inherit it).
   Backend: NEW table IntegrationCredential — one row per
   (organisationId, provider), the ENTIRE per-provider config JSON-
   encoded and encrypted as a single opaque blob via encryption.js's
   existing envelope encryption (services/integrationCredentialService.js)
   — same 'kms1'/'demo1' format-aware encrypt()/decrypt() Lead.idNumber
   already uses, so this inherits the AWS-KMS-when-the-flag-is-on / demo1
   -when-it's-not behaviour for free, zero new code for that distinction.
   Deliberately NOT SystemConfig, per the original design note — wrong
   access model for a secret. Routed as a slug sub-tree on system-
   config.js (GET /api/system-config/integrations, PUT /api/system-
   config/integrations/:provider) rather than a new top-level file — this
   app is at exactly 12/12 Vercel functions with zero headroom, same
   reasoning auditHandlers.js's own header gives for its own placement
   under flags-router.js. Needed a new vercel.json rewrite
   (/api/system-config/:slug* -> /api/system-config?slug=:slug*) — this
   file previously had no sub-route support at all.
   MASKING CONTRACT: GET never returns a raw secret once it's been
   saved — only `<field>Set: boolean` + a `••••<last 4 chars>` preview.
   Non-secret fields (SMTP host/port/user/from — none of which are
   actually sensitive, see emailService.js's own header) pass through in
   the clear so a GlobalAdmin can see/edit them without re-entering
   everything. PUT is a partial update; a blank/omitted SECRET field
   leaves the stored value untouched rather than clearing it — a
   GlobalAdmin changing just the SMTP port doesn't have to re-type a
   password they don't want to change. Verified all of this for real
   (masking, partial-update semantics, encrypted round-trip) — see
   VERIFIED below, not just asserted.
   Audit: IntegrationCredentialUpdated records the provider and WHICH
   FIELD NAMES changed, never values — same "never write secrets to
   logs" principle this app already applies to special PI, now applied
   to credentials too.

5. SMTP REWIRED TO DB-FIRST, ENV-FALLBACK. emailService.js's
   getTransporterConfig() now checks IntegrationCredential('smtp')
   first, falling back to the original SMTP_HOST/SMTP_USER/
   SMTP_PASSWORD/SMTP_FROM env vars if nothing's saved there yet — a
   deployment that never touches the new page keeps working exactly as
   it did before this session, reading env vars, unchanged. The module-
   level transporter cache §78 originally had was DROPPED as part of
   this — it was only safe because SMTP credentials were env vars, fixed
   for a warm container's lifetime; now that they can change at any time
   via the page, a cached transporter risked using a stale/rotated
   credential until a cold start happened to clear it.
   nodemailer.createTransport() is cheap enough (no connection made
   until sendMail() actually runs) that rebuilding it per send costs
   nothing meaningful.

6. AUDIT LIST GAPS — THIS SESSION'S OWN, PLUS TWO BACKFILLED FROM §117.
   Added this session's new action/entity types (IntegrationCredential,
   IntegrationCredentialUpdated, TokenStripeCredited) to auditHandlers.js's
   VALID_ACTIONS/VALID_ENTITY_TYPES and AppAdmin.jsx's mirrored frontend
   lists. WHILE THERE, also found and fixed three PRE-EXISTING gaps from
   §117 that were never added when that session shipped — TokenLedger
   and SystemConfig (entity types), AppointmentClaimed/TokenManualTopUp/
   SystemConfigUpdated (actions) — same silent-empty-filter bug §127
   already found and fixed once for SAR (SubjectAccessRequest/SarAssigned
   were missing the same way). Flagged explicitly here per the standing
   pattern (Project_Context_Vercel.md's PERMANENT PATTERNS) rather than
   treated as silent scope creep — cheap, obviously correct, done in a
   file already being edited for the identical reason.

VERIFIED — unusually thorough for this build, and worth recording why:
   the raw-body mechanism (item 1) was genuinely novel for this codebase
   — nothing else disables Vercel's bodyParser — so static review alone
   wasn't enough confidence to ship it. Installed PostgreSQL 16 directly
   in this sandbox (apt, no live Neon access needed or used, same
   approach §132 established), loaded schema.postgres.sql AND separately
   applied migrations/022_add_integration_credentials.sql to an original
   PRE-SESSION schema snapshot pulled fresh from GitHub, confirmed both
   produce an equivalent table (one cosmetic column-order difference from
   ALTER TABLE ADD COLUMN vs. inline CREATE TABLE placement — confirmed
   nothing in this codebase does a positional SELECT * against
   TokenTransaction, so this doesn't matter functionally). Then ran three
   real HTTP-level smoke-test scripts (deleted before packaging —
   verification tooling, not a permanent addition to this repo's vitest-
   only test footprint) against that real database:
     - Confirmed all five pre-existing JSON routes in appointments-
       router.js still work correctly despite the file-wide bodyParser
       change, plus a malformed-JSON-body case returns a clean 400.
     - Used Stripe's OWN SDK test helper
       (Stripe.webhooks.generateTestHeaderString) to construct a REAL
       valid webhook signature — not a mock — and confirmed: a valid
       delivery credits tokens and writes an audit entry; a REPLAYED
       delivery of the identical event does NOT double-credit
       (idempotency genuinely holds under an actual duplicate INSERT
       attempt, not just reasoned about); a TAMPERED payload sent with
       the original signature is genuinely rejected (proves the raw-byte
       capture is what's actually being verified, not something silently
       re-serialized that would happen to still pass).
     - Confirmed the encrypted-credential round-trip through real
       encrypt()/decrypt() calls, the masking contract (a raw secret
       string was never present anywhere in a masked JSON response —
       checked by substring search against the actual plaintext, not
       assumed), partial-update semantics (an omitted secret field
       genuinely survives an update to a different field), and that the
       audit log for a credential save contains field names only, never
       the value, by reading the actual stored AuditLog row.
   TWO REAL BUGS were caught by this process and fixed before packaging —
   BOTH in the throwaway test harnesses themselves, not the application
   code: a URL-construction mismatch in the system-config test that
   nearly produced a false "the base System Settings route is broken"
   alarm (the harness put "system-config" into the slug itself, which
   Vercel's real rewrite would already have consumed), and a missing
   body-parsing shim in a harness testing a file that correctly relies on
   Vercel's own default parser (system-config.js never opted out of it,
   unlike appointments-router.js). Recorded here deliberately, not
   glossed over — a red result needs its own verification before either
   "fixing" working application code or reporting a false positive back
   to Mark, and this is a concrete example of exactly that discipline
   paying off mid-session.
   Full frontend build (npm run build) clean — Integrations.jsx got its
   own lazy-loaded chunk as expected (matches every other GlobalAdmin-
   only settings page). Full existing 55-test Vitest suite unaffected —
   no test file in this repo covers Stripe/encryption specifically, so
   the sandbox Postgres run above is what actually exercised this
   session's new code, not vitest. Re-hydrated fresh from GitHub and
   diffed every file in the delivery against that live snapshot before
   packaging — matches the intended change set exactly (every changed/
   new file traces to something deliberately touched this session),
   zero parallel-session drift to reconcile.

NOT VERIFIED AGAINST REAL STRIPE INFRASTRUCTURE — no real Stripe
   account or test-mode keys were available in this sandbox, so the
   ACTUAL Checkout Session creation call (stripe.checkout.sessions.create)
   and the ACTUAL end-to-end "click Buy Tokens -> pay with a Stripe test
   card -> land back on /appointments -> see the balance update" flow
   were never exercised against Stripe's real API — only against Stripe's
   own signature-construction test helper (which is a different, narrower
   thing: it proves the signature verification logic is correct, not that
   the whole flow works against Stripe's real service). This is the one
   part of §134 Mark needs to verify himself once real test-mode
   credentials are in the Integrations page — see §0's NEXT ACTION for
   the exact sequence.

MIGRATION: NEW — migrations/022_add_integration_credentials.sql. Adds
   IntegrationCredential (new table) and TokenTransaction.externalRef
   (new nullable column + partial unique index). Both additive, no data
   loss risk, confirmed safe to run against a live database with existing
   TokenLedger/TokenTransaction rows (ADD COLUMN ... NULL is metadata-
   only on Postgres). NOT YET RUN against Neon — see §0's NEXT ACTION.

NEW DEPENDENCY: stripe (^22.4.0) — added to package.json, installed
   clean, no peer-dependency conflicts with anything else in this
   project.

FILES:
  frontend/db/schema.postgres.sql (updated — IntegrationCredential
    table, TokenTransaction.externalRef + partial unique index, cumulative)
  frontend/db/migrations/022_add_integration_credentials.sql (NEW)
  frontend/api-lib/services/integrationCredentialService.js (NEW)
  frontend/api-lib/services/stripeService.js (NEW)
  frontend/api-lib/services/tokenService.js (updated — creditStripeTokens())
  frontend/api-lib/services/emailService.js (rewritten — DB-first, env-fallback)
  frontend/api-lib/models/integration.js (NEW)
  frontend/api-lib/http/helpers.js (updated — readRawBody())
  frontend/api-lib/handlers/appointmentHandlers.js (updated — handleTokenCheckout, handleTokenWebhook)
  frontend/api-lib/handlers/integrationHandlers.js (NEW)
  frontend/api-lib/handlers/auditHandlers.js (updated — new + backfilled VALID_ACTIONS/VALID_ENTITY_TYPES)
  frontend/api/appointments-router.js (rewritten — file-wide bodyParser:false, raw-body handling, two new routes)
  frontend/api/system-config.js (updated — /integrations slug sub-tree)
  frontend/vercel.json (updated — new rewrite for /api/system-config/:slug*)
  frontend/package.json (updated — added stripe dependency)
  frontend/src/pages/Integrations.jsx (NEW)
  frontend/src/pages/AppointmentList.jsx (updated — BuyTokensModal rewired to real Stripe redirect, Stripe-return banner)
  frontend/src/pages/AppAdmin.jsx (updated — mirrored audit filter lists)
  frontend/src/App.jsx (updated — Integrations route + nav link, GlobalAdmin only)
  frontend/src/services/api.js (updated — integrationsApi, appointmentsApi.tokens.checkout)
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 16 PAUSED HERE — 6 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§134 is built and thoroughly verified in-sandbox (see VERIFIED above)
but NOT YET DEPLOYED, and NOT YET run against real Stripe test-mode
infrastructure — see §0's NEXT ACTION for Mark's exact next steps
(run migration 022, deploy, set real credentials, flip the flag, try a
real test-card purchase). Everything through §133 remains confirmed live
as of session 15's end; nothing in this session touched or retested that.

If picking up a pending item, reference it by section number — same
convention as before.

CORRECTION, added at the start of session 17 (7 Aug 2026): the "NOT YET
DEPLOYED" line directly above was accurate when session 16 wrote it, but
is stale now — re-hydrating fresh from GitHub at the start of this
session found stripeService.js and every other §134 file already live on
main, byte-for-byte identical to what was delivered (only the expected
package-lock.json regeneration differed). §134's CODE is confirmed
deployed. Whether migration 022 was run is still not independently
verifiable from this sandbox — that part of the "NOT YET" claim may
still be accurate, may not be; ask Mark rather than assume either way.
See §135 below for what session 17 actually did.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
135. PAYSTACK AS A SECOND PAYMENT PROVIDER — 7 Aug 2026 (session 17)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark discovered Stripe does not support South Africa as a merchant
country at all — checked directly against paystack.com/za, which
confirmed Paystack (Stripe-owned) does support ZA, natively in ZAR.
Asked how difficult adding Paystack as a dropdown option alongside
Stripe would be; assessed as moderate (most of §134's architecture is
already provider-agnostic by construction — raw-body webhook plumbing,
the IntegrationCredential encrypted-storage pattern, the
TokenTransaction.externalRef idempotency mechanism, and the enum-flag
dropdown UI all needed zero new mechanism, just a second value/branch
each); asked to build it; built it in this session.

1. PAYSTACK SERVICE — api-lib/services/paystackService.js, NEW. Mirrors
   stripeService.js's shape (createTransaction()/verifyWebhookSignature()
   pair) but is genuinely simpler in two ways:
     - ONE secret, not two. No separate "webhook signing secret" concept
       — the same secret key both authorises /transaction/initialize
       calls and HMAC-SHA512-signs the webhook. IntegrationCredential's
       'paystack' config is just { secretKey }.
     - NO SDK DEPENDENCY. Paystack's API is plain REST (Bearer token,
       JSON) — this file calls https://api.paystack.co directly via
       fetch(), same as Paystack's own docs show. No new npm package
       added for this (unlike Stripe, which needed the `stripe` package).
   Amounts use the exact same priceZarCents values Stripe uses (Paystack
   also wants integer minor-unit amounts) — see item 4 below for where
   that shared definition now lives.

2. DEFENCE IN DEPTH, GENUINELY ENFORCED. Paystack's own webhook docs are
   more conservative than Stripe's about trusting a signed payload alone
   — they explicitly recommend also confirming via GET
   /transaction/verify/:reference before granting value.
   verifyTransaction() does exactly that, and
   handleTokenWebhookPaystack (appointmentHandlers.js) cross-checks the
   amount that call reports against the pack's real price before
   crediting anything — a mismatch (or a non-'success' status) refuses
   the credit. Verified this ACTUALLY blocks a credit under a simulated
   mismatch, not just present in the code and untested (see VERIFIED
   below) — the distinction mattered enough to build a specific test for
   it rather than trust that writing the check was the same as it working.

3. TWO WEBHOOK URLS, ONE CHECKOUT ENDPOINT.
   POST /api/appointments/tokens/webhook/paystack is a NEW, separate
   route from Stripe's existing /api/appointments/tokens/webhook —
   each provider gets its own dashboard-configured URL, since the two
   send structurally different payloads with different signature
   schemes; a shared endpoint would have to sniff which provider sent a
   request before it could even verify anything, which defeats the point
   of verifying first. Stripe's existing route is UNCHANGED — not
   renamed to /tokens/webhook/stripe, specifically to avoid breaking a
   webhook Mark may already have configured in Stripe's dashboard.
   appointments-router.js's raw-body mechanism (§134) needed no change
   in kind to cover this — just a second shape recognised by isWebhook,
   proving that mechanism really was general-purpose, not something that
   happened to work once.
   Checkout stayed as ONE endpoint, though — /api/appointments/tokens/
   checkout now reads appointments.tokens.paymentProvider itself and
   dispatches to whichever service (stripeService.createCheckoutSession
   or paystackService.createTransaction) is actually active.
   BuyTokensModal (AppointmentList.jsx) never needed to know or care
   which provider is live; it always just gets back a URL to redirect
   the browser tab to.

4. TWO REFACTORS, DONE BECAUSE A SECOND PROVIDER MADE THE DUPLICATION
   REAL RATHER THAN HYPOTHETICAL:
     - TOKEN_PACKS moved from stripeService.js into a new shared
       api-lib/services/tokenPacks.js — same 5/R250, 10/R450 ("save
       R50"), 20/R800 ("save R200") packs, now imported by both
       provider services rather than each defining its own copy, so
       they can't silently drift apart on what "10 tokens" actually
       costs.
     - tokenService.creditStripeTokens() GENERALIZED to
       creditPurchasedTokens(brokerId, tokens, externalRef, description)
       — its idempotent-credit logic (the TokenTransaction.externalRef
       unique-index guard) never actually inspected anything
       Stripe-specific; externalRef was always just an opaque uniqueness
       key. Both webhook handlers now call the same function rather than
       Paystack getting a near-duplicate copy of code whose entire job
       is preventing a double-payment — that specific kind of
       duplication felt like exactly the wrong place to accept drift
       risk for the sake of a smaller diff.

5. INTEGRATIONS PAGE — third card added (PaystackCard, Integrations.jsx),
   single secret-key field, shows the exact webhook URL to paste into
   Paystack's dashboard. integrationHandlers.js's GET/PUT already
   iterated over a provider->schema map generically, so supporting a
   third provider there was adding one map entry each, not new logic.

6. DROPDOWN — appointments.tokens.paymentProvider was ALREADY a real
   enum-type flag rendered as a genuine <select> by FeatureFlags.jsx's
   existing generic enum-flag renderer (confirmed before starting any
   of this — see the conversation this session opened with). Adding
   Paystack as a third option was a one-line allowedValues array change
   on the frontend and one UPDATE statement on the backend row
   (migration 023) — no new UI component, because the mechanism this
   was asking for already existed.

7. AUDIT — TokenPaystackCredited added alongside the existing
   TokenStripeCredited in both auditHandlers.js's VALID_ACTIONS and
   AppAdmin.jsx's mirrored filter list, in the same commit that
   introduced it (not a backfilled gap this time — §127/§134's own
   lesson about adding both lists simultaneously, applied proactively
   rather than caught after the fact).

VERIFIED — same standard as §134, with one real sandbox limitation worth
   being explicit about: api.paystack.co is NOT in this sandbox's
   allowed network egress list (same restriction api.stripe.com had for
   §134's real-checkout-call testing), so paystackService.js's actual
   network calls could not be exercised against Paystack's real API.
   Two different techniques covered what COULD be verified without that
   access:
     - Signature verification: Paystack's HMAC-SHA512 scheme (unlike
       Stripe's SDK-internal one) is simple enough to self-construct a
       genuinely valid signature in the test harness using the exact
       algorithm Paystack's own docs specify, then confirm the app's own
       verifyWebhookSignature() accepts it — and separately confirmed a
       TAMPERED payload sent with the ORIGINAL signature is genuinely
       rejected before the network-dependent verify-transaction step is
       ever reached (checked by asserting that step's mock was never
       invoked in that specific test case, not just that the response
       code looked right).
     - The defence-in-depth verify-transaction call: since this
       genuinely needs network access this sandbox doesn't have,
       globalThis.fetch was temporarily mocked for exactly the
       api.paystack.co/transaction/verify URL shape (a standard
       dependency-injection testing technique, not a change to any
       application code) so the FULL handler path — signature check,
       then the real server-to-server confirmation step, then the
       credit — could be exercised end to end, including a case where
       the mocked response reports a MISMATCHED amount and confirming
       that genuinely blocks the credit rather than the check being
       present but inert.
   Beyond the Paystack-specific pieces: confirmed idempotency holds
   under a replayed identical webhook event using the same
   TokenTransaction.externalRef mechanism §134 built — proof
   creditPurchasedTokens() genuinely works correctly for a second,
   differently-shaped provider, not just the one it was originally
   written for. Confirmed the checkout endpoint dispatches to the
   correct provider's service based on the live flag value in both
   directions. Ran a DEDICATED STRIPE REGRESSION TEST (real webhook
   delivery via Stripe's own signature-test helper, real credit,
   checkout dispatch) confirming §134's original path is fully intact
   after this session's creditPurchasedTokens()/tokenPacks.js refactor
   — not assumed safe just because the diff looked mechanical; a rename
   plus an extraction touching a money-crediting function was exactly
   the kind of change worth re-proving, not just re-reading. Full
   frontend build clean, Integrations.jsx picked up the new card without
   issue. Full existing 55-test Vitest suite unaffected. Re-hydrated
   fresh from GitHub and diffed every file before packaging — matches
   the intended change set exactly, no parallel-session drift.

NOT VERIFIED AGAINST REAL PAYSTACK INFRASTRUCTURE — no real Paystack
   account or test-mode keys were available in this sandbox, so the
   ACTUAL transaction/initialize and transaction/verify calls, and the
   real end-to-end "click Buy Tokens -> pay with a Paystack test card ->
   land back on /appointments -> see the balance update" flow, were
   never exercised against Paystack's real API — only against a
   self-constructed signature (proves the verification logic is
   correct) and a mocked verify response (proves the defence-in-depth
   logic and full handler wiring are correct). This is the one part of
   §135 Mark needs to verify himself once real test-mode credentials are
   in the Integrations page — see §0's NEXT ACTION for the exact sequence.

MIGRATION: NEW — migrations/023_add_paystack_provider.sql. Widens
   IntegrationCredential's provider CHECK constraint to allow 'paystack',
   and UPDATEs the appointments.tokens.paymentProvider FeatureFlag row's
   allowedValues to 'none,stripe,paystack' (a plain UPDATE, not something
   feature-flags.postgres.sql's own re-run would pick up on an
   already-seeded database — that file's seed INSERT is
   ON CONFLICT (flagKey) DO NOTHING). Both changes additive/non-
   destructive, confirmed safe against a database with existing
   IntegrationCredential rows and an existing paymentProvider flag row.
   Depends on migration 022 already having been run (IntegrationCredential
   must exist first). NOT YET RUN against Neon.

NO NEW DEPENDENCY — deliberately. Paystack's plain-REST API meant no
   npm package was needed for this session's work, unlike §134's `stripe`
   addition.

FILES:
  frontend/db/schema.postgres.sql (updated — provider CHECK widened, §14b comment updated)
  frontend/db/feature-flags.postgres.sql (updated — paymentProvider flag's seed allowedValues/description, for a fresh install)
  frontend/db/migrations/023_add_paystack_provider.sql (NEW)
  frontend/api-lib/services/tokenPacks.js (NEW — extracted from stripeService.js)
  frontend/api-lib/services/stripeService.js (updated — imports TOKEN_PACKS from tokenPacks.js instead of defining its own)
  frontend/api-lib/services/paystackService.js (NEW)
  frontend/api-lib/services/tokenService.js (updated — creditStripeTokens() generalized to creditPurchasedTokens())
  frontend/api-lib/services/integrationCredentialService.js (updated — 'paystack' added as a third provider)
  frontend/api-lib/models/integration.js (updated — UpdatePaystackCredentialsSchema)
  frontend/api-lib/handlers/appointmentHandlers.js (updated — checkout dispatch, new handleTokenWebhookPaystack)
  frontend/api-lib/handlers/integrationHandlers.js (updated — paystack added to the provider->schema map)
  frontend/api-lib/handlers/auditHandlers.js (updated — TokenPaystackCredited)
  frontend/api/appointments-router.js (updated — new webhook route recognised, raw-body mechanism otherwise unchanged)
  frontend/src/pages/Integrations.jsx (updated — new PaystackCard)
  frontend/src/pages/FeatureFlags.jsx (updated — allowedValues now includes 'paystack')
  frontend/src/pages/AppointmentList.jsx (updated — provider-agnostic return-banner handling, comment accuracy)
  frontend/src/pages/AppAdmin.jsx (updated — TokenPaystackCredited in the mirrored audit filter list)
  frontend/src/services/api.js (updated — integrationsApi.updatePaystack, checkout comment accuracy)
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 17 PAUSED HERE — 7 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§135 is built and thoroughly verified in-sandbox (see VERIFIED above)
but NOT YET DEPLOYED, and NOT YET run against real Paystack test-mode
infrastructure — see §0's NEXT ACTION for Mark's exact next steps (run
migration 022 if not already done, then 023, deploy, set real Paystack
credentials, flip the flag, try a real test-card purchase). §134's code
was independently confirmed deployed at the start of this session
(see the correction above §135); whether either migration has actually
been run against Neon remains unconfirmed from this sandbox either way.

If picking up a pending item, reference it by section number — same
convention as before.

CORRECTION, added at the start of session 18 (7 Aug 2026): §135 WAS
deployed — Mark tested the live Integrations page himself this session
and reported real product feedback (screenshot included), which is only
possible against a genuinely deployed app. The "NOT YET DEPLOYED" line
above was accurate when session 17 wrote it, stale by the time session
18 started. See §136 below for what session 18 actually did — a small
fix prompted directly by that testing, not a re-verification of §135
itself (which held up fine; the underlying build wasn't in question,
only how the settings page presented it).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
136. INTEGRATIONS PAGE — SHOW ONLY WHAT'S ACTUALLY ACTIVE — 7 Aug 2026 (session 18)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark tested the deployed Integrations page (App Admin -> Integrations)
himself — screenshot included in the conversation. He'd turned ON only
Paystack (appointments.tokens.paymentProvider = 'paystack'), but the
page still showed the FULL Stripe card (secret key, webhook signing
secret, save button) right alongside the Paystack one, and SMTP's full
form too regardless of notifications.email.enabled. His own words: "I
want those integrations shown based on which Feature Flags are turned
on, not just a free-for-all." Real, specific product feedback against
a genuinely live deployment — exactly the kind of thing that only
surfaces once something's actually been used, not just built.

THE FIX — src/pages/Integrations.jsx REWORKED, frontend-only, no
backend/schema/API change at all:
  - The payment-provider section now renders EXACTLY ONE of: the Stripe
    card (only when the flag is literally 'stripe'), the Paystack card
    (only when 'paystack'), or a neutral "nothing selected yet" notice
    (when 'none') that points at Feature Flags rather than just going
    blank.
  - The SMTP card now only renders when notifications.email.enabled is
    genuinely on; otherwise the same neutral-notice pattern.
  - Flag-reading was lifted from each card into the parent Integrations()
    component, which now decides what to render at all rather than each
    card rendering unconditionally and merely reporting its own
    active/inactive status via a banner. The StatusRow banners inside
    each card were simplified to drop their now-unreachable "not active"
    branch — a card is only ever on screen when it IS active, so there
    was no longer a real "is this actually live?" question left for it
    to answer both ways.

DATA SAFETY, EXPLICITLY DESIGNED FOR AND STATED IN THE UI ITSELF — hiding
  a card is a DISPLAY decision only; it never touches, clears, or even
  reads differently the underlying IntegrationCredential row, which is
  keyed by provider and completely independent of which FeatureFlag
  value happens to be selected right now. Switching the flag back
  brings the same card straight back with whatever was last saved still
  in place. This wasn't left as an inference for Mark to make himself —
  both neutral notices explicitly report whether that provider's (or
  SMTP's) credentials are already configured (reading the real GET
  status, not guessed), specifically so switching providers never reads
  as "did I just lose my Paystack setup?"

TRADE-OFF ACCEPTED, WORTH KNOWING RATHER THAN DISCOVERING LATER: this
  makes it impossible to pre-stage a provider's credentials before
  switching the flag over to it — the card simply isn't there to fill in
  until the flag already points at it. Judged low-risk and not raised as
  a blocking question before building (see PROACTIVITY in Claude's own
  operating principles: pick the most reasonable interpretation, state
  the assumption, proceed) — nothing public depends on a provider until
  its flag is actually live, and the checkout endpoint's own "not
  configured yet" error is clean, not a crash, for whatever brief window
  might exist between flipping a flag and finishing that provider's
  form. Cheap to revisit if Mark disagrees once he's used it for real.

SEPARATE FINDING FROM THIS SESSION'S PRE-WORK RE-HYDRATE, UNRELATED TO
  THE ABOVE: migrations/022_add_integration_credentials.sql had gone
  MISSING from GitHub — re-hydrating fresh at the start of this session
  found only 023_add_paystack_provider.sql in db/migrations/, not 022,
  even though 022 was confirmed present in an earlier re-hydrate this
  same day (before the Paystack delivery). Almost certainly github.dev's
  drag-and-drop REPLACING the whole migrations/ folder rather than
  merging into it, when only the §135 delivery's files (which only
  included 023) were dropped in. Mark's live Neon database is unaffected
  either way — a migration file doesn't need to remain in the repo once
  it's actually been run against the database — this is a source-control
  completeness gap, not a data gap. RESTORED in this delivery. WORTH
  FLAGGING FOR EVERY FUTURE DELIVERY GOING FORWARD: drag the ENTIRE
  db/migrations/ folder each time a delivery touches it, not just the
  newest file, or check GitHub's own repo browser after deploying to
  confirm nothing vanished.

VERIFIED: real `npm run build` (Integrations.jsx's own chunk grew from
  ~10.3kB to ~12.0kB, consistent with the two new notice components and
  no unexpected bloat), full existing 55-test Vitest suite unaffected
  (nothing in this session touched backend code, so this is confirming
  absence of collateral damage, not testing new logic). Re-hydrated
  fresh from GitHub and diffed before packaging — confirmed the exact
  expected change set (Integrations.jsx, plus the restored migrations/
  folder) and, separately, confirmed §134/§135's code is genuinely live
  on main (Mark's own testing already proved this, but confirming it
  independently from source control is cheap and worth doing rather than
  taking a screenshot alone as the only evidence).
  NOT INDEPENDENTLY RE-TESTED: the underlying Stripe/Paystack backend
  logic itself (checkout dispatch, webhook credit, idempotency) — this
  session made zero backend changes, so §135's own verification stands
  unchanged; re-running those tests would have proven nothing new.

FILES:
  frontend/db/migrations/022_add_integration_credentials.sql (RESTORED — see finding above)
  frontend/src/pages/Integrations.jsx (reworked — conditional card visibility per active Feature Flags)
Plus this Status_Vercel.md and Project_Context_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 18 PAUSED HERE — 7 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§136 is built and verified (real build, existing test suite green — see
VERIFIED above; no new backend testing was needed or attempted, since
nothing backend changed) but NOT YET DEPLOYED. §134 and §135's own code
are both confirmed live and working — Mark's own hands-on testing this
session is what surfaced §136 in the first place. Once §136 deploys,
worth Mark spending two minutes confirming the Paystack/Stripe/SMTP
cards now show and hide correctly as Feature Flags change, and that the
neutral notices' "already configured" wording matches what he actually
has saved.

If picking up a pending item, reference it by section number — same
convention as before.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
137. DB LAYER MOVED OFF pg.Pool ONTO NEON'S HTTP DRIVER — ROOT-CAUSE FIX, NOT A PATCH — 12 Aug 2026 (session 19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark reported several genuinely unrelated areas failing on the live
deployment at once: AppAdmin's Audit Log tab, the Lead/Appointment
entity Audit Log panels, the broker Reports drill-down, and the
Integrations page ("Could not load integration settings" every time).
Two Node process warnings appeared in the Vercel logs when he tested
Integrations — a DEP0169 url.parse() deprecation notice and a
pg-connection-string SSL-mode aliasing warning.

DIAGNOSIS, DONE BY ACTUALLY RUNNING THE CODE, NOT BY READING IT — same
discipline §132 established for exactly this class of bug. Hydrated
fresh from GitHub, stood up a real local Postgres, applied the current
schema.postgres.sql plus migrations 022 and 023, seeded realistic data,
and called listAllAuditLog(), listAuditLog(), listAuditLogForLead(),
getBrokerDetailReport(), getBrokerReport(), and getMaskedStatus() (all
three providers) directly against it — every one of them ran cleanly.
That ruled out a SQL/logic bug in the current codebase as the cause of
what Mark was seeing.

The two warnings pointed at the real one. The SSL-mode line is
pg-connection-string identifying itself — confirming Postgres was being
reached at all — and checking what's actually shared across every one
of the failing features led to db.js: getPool() cached a single
pg.Pool at module scope, with no pool.on('error', ...) handler and no
idleTimeoutMillis/connectionTimeoutMillis configured. Two compounding
problems: (1) node-postgres treats an unlistened background 'error' on
an idle pooled client as unhandled — it crashes the whole process, not
just the one query; (2) Vercel freezes a function's entire process
between invocations, and a frozen container's open TCP sockets can be
reset by the network or Neon's proxy while suspended — the next warm
invocation hands out that same dead connection, the first query against
it fails, and that feeds straight into (1). One shared file, so one
root cause plausibly explaining several unrelated-looking failures at
once — more consistent with what Mark described than three independent
bugs would be.

Mark asked for the proper fix, not a patch that would need patching
again — so this is a driver swap, not a pool.on('error') band-aid.

REWRITE — services/db.js now uses @neondatabase/serverless's neon()
   HTTP driver instead of pg.Pool. This doesn't mitigate the freeze/
   thaw failure mode, it removes it: neon() holds no persistent
   connection at all — every call is its own stateless HTTPS request to
   Neon's data API, so there is nothing to go stale across a freeze/thaw
   cycle and no pool 'error' event to go unhandled, because there's no
   pool. Confirmed first that nothing in this codebase relies on an
   explicit multi-statement transaction (grepped for BEGIN/COMMIT/
   pool.connect() across all of api-lib — the only hit was a comment in
   tokenService.js noting the ABSENCE of one) — every write here is
   already a single guarded statement, so the HTTP driver's
   single-statement-per-call model costs this app nothing.
   toPositional() (the @name -> $1,$2... rewriter) is completely
   unchanged — only the execution call underneath it moved, from
   pool.query(text, values) (returns {rows}) to
   sql.query(text, values) (returns rows directly, confirmed from the
   installed package's own type definitions, not assumed) — so
   executeQuery/executeQueryOne keep the exact same signature and return
   shape every service file already depends on. The sql export
   (the inert mssql-style type-marker proxy every service imports
   alongside executeQuery) is untouched and deliberately NOT the same
   name as Neon's own query function, which is never assigned to a
   module-level name here at all.

DATABASE_URL DOES NOT NEED TO CHANGE — worth stating plainly since it's
   the one thing that'd otherwise need a Vercel env var edit alongside
   this deploy. Neon's HTTP driver works against either the pooled
   (-pooler) or direct connection string; whatever's set today keeps
   working as-is.

OTHER FILES TOUCHED, MINIMAL:
   api/health.js was the only other consumer of the old getPool()
   export (GET /api/health, no-auth, confirms the deployment can reach
   Neon) — updated to call executeQuery() like every other route does,
   rather than keep a second, differently-shaped way of reaching the
   database alive for one file. vite.config.js had a comment
   referencing db.js's old getPool() by name — corrected, not left
   stale (this codebase's own established standard — see the Login.jsx/
   App.jsx precedents).

PACKAGE.JSON: pg removed, @neondatabase/serverless (^1.1.0) added.
   Clean npm install, no peer-dependency conflicts; npm audit findings
   are pre-existing (esbuild/vite dev-tooling, xlsx) and unrelated to
   this change — checked, not assumed.

VERIFIED: node --check + a real ESM import smoke test on every one of
   the 17 service files that import db.js (all import cleanly), full
   Vite production build clean, existing 55-test Vitest suite
   unaffected. Re-hydrated fresh from GitHub and diffed before
   packaging — confirmed exactly these four files changed, nothing else
   drifted from a parallel session.
   NOT VERIFIED: an actual live HTTPS round-trip against Mark's real
   Neon endpoint — this sandbox's network egress doesn't reach
   neon.tech or a Docker registry (needed for Neon's own local-dev
   proxy), so neon()'s data-API call itself couldn't be exercised
   end-to-end from here, only confirmed correct by construction (exact
   method signature and return shape read from the installed package's
   own type definitions, not from memory) and by the fact that
   everything importing and calling into this file does so cleanly.
   This is the one thing worth Mark confirming himself once deployed —
   hit GET /api/health first (cheapest, no-auth check), then the three
   pages that were failing.

MIGRATION: none — no schema change, driver/execution-layer change only.

FILES:
  frontend/api-lib/services/db.js   (rewritten — neon() HTTP driver replaces pg.Pool)
  frontend/api/health.js            (updated — executeQuery() instead of the removed getPool())
  frontend/vite.config.js           (comment corrected — stale getPool() reference)
  frontend/package.json             (pg removed, @neondatabase/serverless added)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 19 PAUSED HERE — 12 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§137 is built and verified as far as this sandbox can verify it (see
VERIFIED above) but NOT YET DEPLOYED. §136 (7 Aug 2026, previous
session) — the Integrations conditional-card-visibility fix — was ALSO
still showing as not yet deployed as of last session's end; unconfirmed
whether Mark deployed it between sessions 18 and 19. Ask before
assuming either way. Once §137 deploys: check GET /api/health first,
then Audit Log (both the AppAdmin tab and an entity's own panel),
Broker Reports, and Integrations — all four were the ones Mark reported
failing, and all four go through this one file.

If picking up a pending item, reference it by section number — same
convention as before.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
138. LARGE DESIGN SESSION — TASKS/NOTIFICATIONS REDESIGNED, MEETING MODEL SPECED (NOT YET BUILT), SESSION-ISOLATION FOOTGUN DISCOVERED — 12 Aug 2026 (session 20)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§137 confirmed working — Mark deployed it and tested. Reports for a
broker was STILL empty though, and turned out to be a separate,
pre-existing bug: getBrokerReport()/getBrokerDetailReport() scope
activity by Appointment.createdAt (when first booked), not by when a
meeting was actually held or the deal closed — an appointment closed
today doesn't show in this month's view if the row itself was created
earlier. reportService.js's own header comment says broker/agent tables
should scope by "activity within the period" — the code doesn't match
its own stated intent. FIX DEFERRED DELIBERATELY: there's no field
today that means "when did this actually happen" (meeting1Date is
scheduled date, not evidence of occurrence; updatedAt changes on any
edit) — the meeting redesign below would produce the right field, so
fixing Reports before that exists means touching this query twice.

TASK VS NOTIFICATION — FULL REDESIGN AGREED, NOT YET BUILT THIS SESSION
(session 21 will build it — see NEXT ACTION). Long interview with Mark,
landed on:

  Core test (Mark's own words): Task = a concrete action + a real due
  date. Notification = FYI, nothing owed, or the action already
  happened at the point of the event (e.g. rescheduling IS the action —
  broker's on the phone, sets the new date right there, nothing left to
  chase).

  Every current auto-generated event, inventoried by actually reading
  every createTask()/createNotification() call site rather than
  guessing (5 Task triggers, 8 Notification types across 11 call
  sites):

  TASKS — dropping from 5 to 2:
    KEEP: CallbackRequested on a call attempt -> Callback task
    KEEP: Appointment booked, no broker -> Assign-broker task
    DROP: Meeting marked Rescheduled -> no event at all (see meeting
      redesign — the reschedule action itself now captures the new
      date atomically, nothing left to track separately)
    DROP: Meeting marked Seen/Held, outcome pending -> no event at all
      (the appointment's own "Held, outcome pending" state is already
      visible via Appointments list filtering — same reasoning as
      Reschedule, don't duplicate a status the entity itself already
      carries)
    DROP: "Confirm appointment with [broker]" (fires on the Agent when
      a broker's chosen at booking time) -> was never actually a real
      action (no confirm button, no state change anywhere represents
      "confirming"), moves to a NEW Notification instead (see below —
      this trigger literally doesn't exist as a Notification today,
      broker-chosen-at-booking currently fires nothing at all).

  NOTIFICATIONS — existing 8 types unchanged, PLUS one new trigger:
    NEW: broker chosen at Appointment creation time -> AppointmentAssigned
      notification to that broker. Today AppointmentAssigned only
      fires on LATER assignment (assignBroker()/self-claim) — booking
      WITH a broker chosen upfront currently notifies nobody at all.

  CALLBACK TASK CLOSURE (Mark's explicit design): any new call attempt
  logged against a lead with an open Callback task auto-completes that
  task, REGARDLESS OF OUTCOME — "the agent could call and leave a
  voicemail, or not get hold of the client... any call logged should
  close the callback task." Detail of the closing call should be
  visible against the completed task. Building this as a link
  (Task.resolvedByCallAttemptId, nullable FK to CallAttempt), not a
  copied/duplicated text blob — completed task shows the original
  request detail (already on Task.detail) plus the closing call's
  outcome/notes/timestamp live from CallAttempt, so a later correction
  to the call log's notes doesn't leave the Task showing stale text.

  SUPERVISOR ROUTING FOR "ASSIGN BROKER" — Mark corrected an
  assumption mid-conversation: this should route to a BROKER's
  supervisor, not the AGENT's own supervisor (the existing
  lead.agentSupervisorId fallback the code currently uses is simply the
  wrong axis — an agent's line manager has nothing to do with broker
  capacity). Since this flow exists precisely because no broker was
  ever matched, there's no specific broker to trace a supervisor from —
  routes instead by REGION: find Supervisor-role users whose own
  User.region matches the appointment's region (region already exists
  as a plain column on every User row, not agent-specific — confirmed
  by reading schema.postgres.sql directly), and of any that match, pick
  whichever currently has the fewest open tasks (Mark's choice,
  load-spreading over simple first-match).

  MANDATORY SUPERVISOR/REGION AT USER CREATION — confirmed CURRENTLY a
  real gap by reading CreateUserSchema directly: both supervisorId and
  region are .optional() today. Fixing: supervisorId becomes required
  when role is Agent or Broker; region becomes required when role is
  Supervisor (this second one wasn't Mark's original ask but follows
  directly from it — the region-based Supervisor lookup above is only
  reliable if every Supervisor actually has a region set).

  AUDIT LOG GAP — Mark asked directly why logged calls don't appear in
  a Lead's Change Log. Confirmed by reading the full function:
  logCallAttempt() never calls writeAuditLog() anywhere, at all — not
  an oversight in a query, a genuinely missing write. Fix is a single
  writeAuditLog({ entityType: 'Lead', entityId: leadId, ... }) call;
  confirmed it needs no other changes to show up — listAuditLogForLead()'s
  own base UNION branch already matches entityType = 'Lead', so a
  normal-shaped write slots straight into the existing Change Log with
  no query changes.

  TASKS.JSX CHANGES AGREED: drop the Rescheduling and Outcomes filter
  tabs entirely (nothing will ever populate them once the two Task
  triggers above are dropped). Callback and Assign-broker task rows
  lose their in-list checkbox — Mark's model is that a system-generated
  task with a real underlying entity should only be completable FROM
  that entity (Callback closes via Log Call on the Lead, Assign-broker
  closes via actually assigning a broker on the Appointment), not
  ticked off directly in the list. Manual tasks keep the checkbox
  exactly as today. Worth noting this makes Tasks.jsx naturally
  role-scoped without any new filter code: Callback only ever goes to
  Agents, Assign-broker only ever goes to Supervisors — a Broker's task
  list is Manual-only by construction now, not by a rule anyone has to
  maintain.

MEETING / APPOINTMENT ATTEMPT-HISTORY REDESIGN — FULLY SPECED, ZERO
CODE WRITTEN. Deliberately scoped OUT of this session's build (see
NEXT ACTION) — "task and lead changes" per Mark's own framing when he
said go ahead, not appointment/meeting changes. Full spec, so a future
session can pick this up without re-deriving it:

  Problem: meeting1Date/meeting1Status/meeting1RescheduledDateTime etc.
  are flat columns — a reschedule overwrites in place, no history, no
  way to see how many attempts it took to actually hold a meeting.

  New model: one row per scheduled ATTEMPT of a meeting number
  (append-only, matching the Lead call-log pattern, not the flat-column
  pattern) — a reschedule creates a new row rather than editing the old
  one. Meeting 1's first row is created atomically with the Appointment
  itself, date pre-filled from firstAppointmentDate (not separately
  editable on that row — it's just what was booked). Status per row:
    Scheduled (default) / Held – Interested / Held – Not Interested /
    Rescheduled
  Separate field, asked ONLY when a row is saved Held – Interested:
  "Is a follow-up meeting required?" — deliberately not folded into the
  status label, because it answers a different question than Rescheduled
  does (Rescheduled = same meeting number didn't happen as planned, new
  row under it; follow-up-required = meeting DID happen, needs a second
  meeting NUMBER entirely, new row under Meeting 2).

  Full outcome-form routing table (all four branches, no dead ends):
    Held – Not Interested (any meeting number)            -> Outcome
      form appears, Customer Signed pre-set No
    Held – Interested, on the LAST configured meeting      -> Outcome
      number (2 or 3, per appointments.thirdMeeting.enabled) form
      appears, Customer Signed pre-set Yes
    Held – Interested, follow-up required = No (not last)  -> same,
      Outcome form appears, Customer Signed pre-set Yes
    Held – Interested, follow-up required = Yes             -> advances
      to next meeting number's first row, Outcome form does NOT appear
    Rescheduled                                              -> new row,
      same meeting number, Outcome form does NOT appear
  "Mark Meeting Held" button drops entirely — the Status dropdown
  itself is the save action now.

  NOT YET DECIDED, future session needs to ask: does an
  in-flight/existing appointment get backfilled into the new attempt
  table, or does this only apply going forward? Mark flagged this as
  open when the spec was agreed and it was never actually answered.

SESSION-ISOLATION FOOTGUN — DISCOVERED, EXPLAINS SEVERAL "BUGS" THAT
MAY NOT HAVE BEEN BUGS. Mark had been testing across multiple users in
private/InPrivate browser tabs simultaneously. AuthContext caches which
user you are in sessionStorage — genuinely per-tab. The actual auth
boundary, the mb_session httpOnly cookie, is NOT per-tab — it's shared
across every tab in the same browser, InPrivate windows included if
more than one tab shares that window. A tab's own UI can keep showing
stale "who am I" state while every real request silently authenticates
as whoever most recently logged in anywhere else in that browser.

THIS DIRECTLY UNDERMINES ONE CONCLUSION FROM THIS SESSION: Mark
produced screenshots appearing to show a Callback task correctly
routing to a lead's actual assigned agent (Steve Madden) rather than to
whoever was logged in and logged the call — which flatly contradicts
logCallAttempt()'s actual code (assignedToId: agentId, where agentId is
literally claims.oid, the caller, re-read fresh from GitHub three
separate times with identical results, no other code path creates a
Callback task anywhere in the codebase). The session-isolation footgun
is the far more likely explanation than a code path neither of us can
find: Steve Madden's session may have been the one actually live in
that browser at the moment, with the tab's own display simply not
reflecting it. UNRESOLVED — Mark has not yet retested cleanly (single
window, single fresh login, nothing else open) to confirm either way.
DELIBERATELY NOT CHANGED THIS SESSION: logCallAttempt() still routes to
whoever calls it (claims.oid), not lead.assignedAgentId — changing this
without a clean retest risks fixing a problem that doesn't exist and
re-breaking something that was already correct. Ask Mark for the
retest result before touching this function's routing at all.

WORTH RE-EXAMINING LATER, NOT NOW (Mark's own flag, explicitly
deferred): given this footgun existed all along, is it possible §137's
whole db.js/pg.Pool -> neon() HTTP driver rewrite was solving session
confusion mislabeled as a connection-pool crash, rather than a genuine
Vercel-freeze/Neon-connection problem? Worth revisiting once things have
settled, NOT by reverting anything preemptively — §137 is independently
justified on its own merits regardless (removed a real known-bad
pattern: no pool.on('error') handler, no idle timeout, both genuine
node-postgres/Vercel gotchas on their own terms) and is working in
production now. The question is only whether the ORIGINAL symptom
(Audit Log/Reports/Integrations all failing) was actually caused by
what §137 fixed, or whether session confusion was doing some or all of
that damage too and §137 gets credit it only partly deserves. Not
urgent, doesn't change anything about whether §137 was worth doing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
139. TASK AND LEAD CHANGES — BUILT AND VERIFIED — 12 Aug 2026 (continuation of session 20)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All 8 items from §138's NEXT ACTION list, built in the same sitting per
Mark's "go ahead." Meeting/attempt-history redesign still NOT built —
stays speced-only in §138, genuinely deferred.

WHAT CHANGED:
  1. appointmentService.js — Reschedule/Outcome createTask() calls
     removed from the outcome-save flow entirely (the flow itself is
     otherwise untouched — this is NOT the meeting redesign).
  2. appointmentService.createAppointment() — broker-chosen-at-booking
     now fires an AppointmentAssigned Notification (new trigger — this
     literally fired nothing before). No-broker-chosen now calls
     userService.findLeastLoadedSupervisorForRegion(lead.agentRegion)
     instead of using lead.agentSupervisorId.
  3. userService.js — new findLeastLoadedSupervisorForRegion(region):
     matches Supervisor role + region, LEFT JOINs open Task count,
     ORDER BY count ASC then displayName ASC, LIMIT 1. Returns null if
     no active Supervisor has that region — caller falls back to the
     agent themselves, same "never orphan a task" pattern as before.
  4. LeadDetail.jsx booking form — new "I couldn't find an available
     broker" radio option, mutually exclusive with picking a broker,
     submits with brokerId omitted on purpose (not just left blank).
  5. models/user.js CreateUserSchema — .superRefine() added:
     supervisorId required when role is Agent or Broker; region required
     when role is Supervisor. Tested all 6 role/field combinations
     directly against the schema — every case behaves correctly.
  6. leadService.logCallAttempt() — now calls writeAuditLog()
     (action 'CallLogged', entityType 'Lead') — this write never existed
     before, confirmed by reading the function fresh three times before
     touching it. New action added to auditHandlers.js's VALID_ACTIONS
     and AppAdmin.jsx's filter list together, per this codebase's own
     established convention for keeping those two in sync.
  7. Migration 024 (Task.resolvedByCallAttemptId, nullable FK to
     CallAttempt, ON DELETE SET NULL) + schema.postgres.sql updated to
     match. taskService.js: new completeOpenCallbackTasksForLead(leadId,
     callAttemptId) — closes every open Callback task for a lead
     (isComplete=TRUE, completedAt=NOW(), resolvedByCallAttemptId set),
     writes a TaskAutoCompleted audit entry per task closed (own new
     action, added to both action lists same as CallLogged). Wired into
     logCallAttempt() to run right after the new CallAttempt row is
     inserted, before the CallbackRequested-creates-a-new-task rule
     further down — so if the new attempt is itself another
     CallbackRequested, the old task is already closed before the new
     one opens; no window with both open. TASK_SELECT/TASK_JOINS and
     shapeTask() updated so a completed Callback task's closing call
     detail (outcome/notes/callTime) is visible without a separate
     query — pulled live via the FK, not copied at completion time.
  8. Tasks.jsx — header comment corrected (2 rules, not 5). Rescheduling
     and Outcomes dropped from both the tab list (CATEGORIES) and the
     manual-creation category picker (CATEGORY_META) — also narrowed
     models/task.js's TaskCategory enum server-side so nothing can create
     one via direct API call either, not just hidden from the UI.
     TYPE_TO_CATEGORY (read-direction, for shapeTask()) stays complete —
     a handful of historical rows may still carry type Reschedule/Outcome
     from before this change; they now display with manual-style
     fallback styling (CATEGORY_META[cat] ?? CATEGORY_META.manual) rather
     than their old dedicated colour — a minor, accepted cosmetic
     tradeoff for old data, not a functional issue.
     Checkbox replaced with a redirect-link (to the Lead or Appointment)
     for Callback/Assign-broker rows — keyed off actually HAVING a linked
     entity (task.linkedLeadId / task.linkedAppointment), not off
     category alone: a manually created task can still be given category
     'callback' or 'appointment' in the New Task modal, but always has
     entityType/entityId = NULL (no entity-linking UI there), so it
     correctly falls through to the checkbox regardless of which
     category was picked. useNavigate wired in from 'react-router'
     (matching AppointmentDetail.jsx's own import pattern, verified, not
     assumed — this app uses the react-router package directly, not
     react-router-dom).

ONE UNCONFIRMED ASSUMPTION, FLAGGED TO MARK, NOT YET ANSWERED: neither
Lead nor Appointment has a region column (confirmed by reading both
table definitions) — the region used for the Supervisor lookup in
createAppointment() is the AGENT's own region (lead.assignedAgentId's
User.region), inferred as the only sensible per-booking region signal
available, not something Mark explicitly confirmed. Worth a quick
sanity check before this ships.

DELIBERATELY UNCHANGED, per §138: logCallAttempt()'s Callback task still
routes to `agentId` (the caller), not lead.assignedAgentId — holding
until Mark retests cleanly per the session-isolation footgun. The
existing misleading comment on this rule was corrected to state
precisely what the code does and why it wasn't changed, without
changing the behavior itself.

VERIFIED — properly, not just "it imports":
  - node --check clean on every touched .js file.
  - Full ESM import smoke test on all 17 services AND all 12 API router
    entrypoints (not just services this time — confirmed the actual
    Vercel function files resolve too).
  - Full Vite production build clean (validates the two touched .jsx
    files, which node --check can't parse).
  - Existing 55-test Vitest suite unaffected.
  - REAL POSTGRES, not just read: fresh local instance, schema.postgres.sql
    + migration 024 both loaded (024 also re-run against an
    already-current schema to confirm its idempotency — clean, no
    errors, matches this codebase's established DROP-IF-EXISTS/ADD
    constraint pattern rather than a heavier DO-block).  Seeded two
    Supervisors sharing a region with different open-task counts and
    ran findLeastLoadedSupervisorForRegion's exact SQL directly — correctly
    picked the less-loaded one. Ran completeOpenCallbackTasksForLead's
    exact SELECT/UPDATE against a seeded open Callback task and a second
    CallAttempt with a DIFFERENT outcome than CallbackRequested — closed
    correctly regardless of outcome, matching Mark's design exactly.
    Confirmed CallLogged surfaces via listAuditLogForLead's existing base
    UNION branch with no query changes, exactly as predicted before
    building it. Confirmed the FK's ON DELETE SET NULL behaves as
    designed — deleted the linked CallAttempt, the Task survived intact
    with the link nulled out, not cascade-deleted.
  - CreateUserSchema tested directly against all 6 role/field
    combinations — every case (Agent/Broker with and without supervisor,
    Supervisor with and without region, Admin needing neither) produced
    the correct pass/fail result.
  - Re-hydrated fresh from GitHub and diffed the whole tree before
    packaging — confirmed the exact 14 changed/new files listed below,
    nothing else drifted. Caught and fixed a real mistake in this same
    pass: Status_Vercel.md's own §138 edit from earlier in this session
    had been made in a scratch copy that was never actually copied into
    the working tree — would have shipped a delivery with an
    un-updated status file had the diff not caught it.

NOT VERIFIED (same limitation as §137, unchanged): actual live behavior
against Mark's real Neon endpoint — this sandbox's network can't reach
neon.tech. Everything above was verified as thoroughly as this
environment allows; the live round-trip is still Mark's to confirm
post-deploy.

MIGRATION: 024_add_task_call_resolution_link.sql — additive only
(nullable column + FK + partial index), no data loss risk, safe against
an existing database with live Task/CallAttempt rows.

FILES:
  frontend/api-lib/services/appointmentService.js  (Reschedule/Outcome tasks removed; createAppointment rewired)
  frontend/api-lib/services/userService.js         (findLeastLoadedSupervisorForRegion added)
  frontend/api-lib/services/leadService.js         (writeAuditLog + completeOpenCallbackTasksForLead wired into logCallAttempt)
  frontend/api-lib/services/taskService.js         (completeOpenCallbackTasksForLead added; TASK_SELECT/TASK_JOINS extended)
  frontend/api-lib/handlers/taskHandlers.js        (shapeTask() surfaces resolvedByCall)
  frontend/api-lib/handlers/auditHandlers.js       (VALID_ACTIONS: CallLogged, TaskAutoCompleted)
  frontend/api-lib/models/user.js                  (CreateUserSchema conditional validation)
  frontend/api-lib/models/task.js                  (TaskCategory narrowed, TYPE_TO_CATEGORY unchanged)
  frontend/db/migrations/024_add_task_call_resolution_link.sql (NEW)
  frontend/db/schema.postgres.sql                  (Task table updated to match)
  frontend/src/pages/LeadDetail.jsx                ("couldn't find a broker" booking option)
  frontend/src/pages/Tasks.jsx                     (tabs dropped, checkbox -> redirect-link)
  frontend/src/pages/AppAdmin.jsx                  (AUDIT_ACTIONS: CallLogged, TaskAutoCompleted)
Plus Status_Vercel.md and Project_Context_Vercel.md.

ADDENDUM, same day, before Mark had finished testing: Mark asked
directly "will old data cause any issues" before testing this delivery.
Answering that properly (tracing every one of the 8 items above against
pre-existing rows, not just asserting it's fine) surfaced a real bug in
item 8's Tasks.jsx change: isRedirectOnly was keyed off "any non-manual
task with a linked entity", which incorrectly also matched a
Reschedule- or Outcome-type task created BEFORE this deploy (those
types always had entityType/entityId set). Since both of those types'
creation rules are now gone, and neither ever had auto-completion
logic, an old still-open one would have had NO way left to ever
complete — checkbox gone, no automated path, permanently stuck.
FIXED before Mark deployed: narrowed to category === 'callback' ||
'appointment' specifically — an old Reschedule/Outcome task keeps its
checkbox exactly as before, the only way it can still be resolved.
Re-verified: full build + 55-test suite clean after the fix.

Also surfaced, NOT a code bug, Mark's own action needed: the new
region-based Supervisor routing only works for Supervisors who actually
have a region set, and the mandatory-region rule only applies at
creation — existing Supervisor rows aren't retroactively touched. Gave
Mark a query to find which of his existing Supervisors need a region
set via User Admin before "couldn't find a broker" will route to them
correctly rather than silently falling back to the agent.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 20 PAUSED HERE — 12 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT ACTION: §139 is built and verified as far as this sandbox can
verify (see §139's own VERIFIED section) but NOT YET DEPLOYED, and
migration 024 has not been run against the real Neon database. Ask Mark
to confirm the AGENT-region assumption (see §139) before or immediately
after deploying — if wrong, it's a small, contained fix (swap which
region field feeds the lookup), not a redesign.

STILL OPEN, deferred deliberately: the meeting/attempt-history redesign
(fully speced in §138, zero code written) and the Reports date-scoping
fix (depends on that redesign existing first). The session-isolation
footgun's effect on logCallAttempt()'s routing is also still open —
waiting on Mark's clean retest before touching that function again.

If picking up a pending item, reference it by section number — same
convention as before.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
140. CLAIM MODEL NOW GENUINELY EXCLUSIVE OF DIRECT-ASSIGN — 12 Aug 2026 (session 20, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark asked a sharp architectural question after testing §139: if an
Agent can assign a broker directly at booking, how does the Claim model
(brokers self-serving from a filtered queue, paying tokens) actually
work? Investigated before answering rather than guessing:

CONFIRMED ALREADY WORKING, no changes needed: listAvailableToClaim()
already filters the claim pool by region (BrokerRegion vs the booking
agent's own User.region) and product (BrokerProduct vs
productsInterestedIn, intersected in JS) — built back in §117, 4 Aug
2026, well before this session. Worth noting: it matches on the
AGENT's region, the exact same signal §139 used for the new Supervisor
routing — confirming that assumption (flagged as unconfirmed in §139)
actually matches established precedent already in this codebase, not
an arbitrary guess.

CONFIRMED A REAL GAP: appointments.claimModel is a single org-wide
toggle, but isClaimModelEnabled() was only ever checked on the two
claim-side endpoints (claim, available-to-claim) — never on the two
direct-assign paths: createAppointment() accepting a brokerId at
booking, and handleAppointmentAssign (the Supervisor/Admin Assign
action). AppointmentList.jsx already hid the Assign/Reassign buttons in
claim mode (frontend-only, pre-existing), but the backend never
enforced it — exactly the "flag genuinely gates behaviour, not just
frontend visibility" principle this same file's own isClaimModelEnabled()
comment already states, just not applied consistently to these two.

Mark's explicit decision: block both, no exceptions, when claim model
is active.

FIXED:
  - appointmentHandlers.handleAppointmentAssign — now checks
    isClaimModelEnabled() and returns 403 if claim model is active.
    Same helper this file already used elsewhere, just not here before.
  - appointmentService.createAppointment() — rejects (400) a supplied
    brokerId outright when claim model is active. Also: when NO broker
    is chosen and claim model is active, the Assign-broker Task is no
    longer created at all — creating a task telling a Supervisor to do
    something they're now blocked from doing would be actively broken,
    not just redundant. The appointment sitting Unassigned, visible in
    the claim pool, already IS the mechanism in that mode — same
    "already visible elsewhere, no Task needed" reasoning §138 already
    established for Reschedule/Held-outcome-pending. Region-routing
    logic (§139) is completely unchanged for 'assign' mode — only
    reachable behind the new isClaimModelActive check now, not
    rewritten.
  - LeadDetail.jsx booking form — the entire broker-search/select
    section (region+products+date/time search, broker list, "couldn't
    find a broker" option — now redundant in this mode since there's no
    search to fail) is hidden when claim model is active, replaced with
    a plain message that the appointment will book Unassigned into the
    claim pool. Frontend hiding here is matched by real backend
    rejection above — not hiding-as-the-only-defense the way
    Assign/Reassign's buttons were before this fix.

VERIFIED: node --check clean, ESM import smoke test on both changed
backend files, full Vite build clean (validates the LeadDetail.jsx
fragment restructuring), existing 55-test suite unaffected. Manually
traced the full branch logic (reject-with-brokerId / skip-notification /
skip-task-in-claim-mode / unchanged-region-routing-in-assign-mode) since
this delivery's real Postgres verification hit the same known limit as
§137/§139 — db.js's Neon HTTP driver can't reach a local Postgres
instance, only the flag row's stored value could be confirmed directly
via psql (confirmed 'claim' stores and reads correctly). No new SQL was
introduced this round — createAppointment reuses flagService.getFlagMeta()
unchanged; the risk here was JS control flow, not query correctness,
and that's what got the careful manual trace plus the full build/test
pass.

SEPARATE FINDING, caught while diffing before packaging, UNRELATED to
the work above: the ENTIRE frontend/db/migrations/ folder is missing
from GitHub main again — same exact recurring issue flagged at §136
(7 Aug 2026) and presumably again since. schema.postgres.sql itself is
fine (cumulative, already has migration 024's column) so a fresh
deployment isn't affected, but the individual migration files
(022/023/024) have no source-control record right now. Restored in
this delivery — dragging the WHOLE migrations/ folder in every time,
not just the newest file, remains the fix; worth checking GitHub's own
repo browser after each github.dev upload to confirm nothing silently
vanished, since this has now happened at least twice.

MIGRATION: none new this session — 024 already covers everything
needed; this is backend/frontend logic only.

FILES:
  frontend/api-lib/handlers/appointmentHandlers.js  (handleAppointmentAssign blocked in claim mode)
  frontend/api-lib/services/appointmentService.js   (createAppointment: reject brokerId, skip task, in claim mode)
  frontend/src/pages/LeadDetail.jsx                 (booking form hides broker-search in claim mode)
  frontend/db/migrations/ (all three files RESTORED — see finding above)
Plus this Status_Vercel.md.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
141. FOUR TESTING FINDINGS FROM THE CLAIM MODEL — 13 Aug 2026 (session 20, continued)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mark tested §140's claim-model work directly (screenshots: claiming an
appointment, checking Tasks/Notifications) and reported four things.
Investigated each before building anything — two turned out to be
deeper than their symptom suggested.

1. CLAIMED APPOINTMENTS VANISHING FROM THE ACTIVE TAB — real, small
   bug. AppointmentList.jsx's ACTIVE_APPT_STATUSES was
   ['Unassigned', 'Assigned', 'InProgress'] — predates 'Claimed' as a
   concept entirely, so a freshly claimed appointment (arguably the
   MOST active state — a broker owns it, hasn't started the meeting
   process) disappeared from Active until its first meeting moved it to
   InProgress. Fixed: 'Claimed' added to the list. ReturnedToLeads
   deliberately still excluded — it already has its own filter chip.

2. TOKEN BALANCE NOT MOVING AFTER A CLAIM — not a refetch bug.
   handleClaim() in AppointmentList.jsx already correctly calls
   refetchTokens() after every successful claim — traced that code
   before looking anywhere else, it was never the problem. Real cause:
   claimAppointment() only debits `if (cost > 0)`, and cost comes from
   Appointment.claimTokenCost — which has existed since §117 but was
   NEVER SET to anything nonzero anywhere in the codebase. Checked every
   reference: CreateAppointmentSchema had it as an optional
   caller-supplied field, but no frontend ever sent one. Every
   appointment ever booked has cost 0 to claim — the entire token-debit
   mechanism has been dead since it was built, not failing silently,
   just never actually invoked. The surrounding infrastructure (monthly
   allocations, Stripe/Paystack purchase, refund-on-lost-race) is all
   real and correctly wired; only the "what does THIS appointment cost"
   input was never connected to anything.
   FIXED, per Mark's explicit choice (flat org-wide cost via
   SystemConfig, not per-portfolio or agent-set-per-booking):
     - New SystemConfig.defaultClaimTokenCost column (migration 025,
       default 1), with a matching AppAdmin field right below the
       existing monthly-allocation setting in the same card.
     - createAppointment() now derives claimTokenCost itself from that
       setting whenever claim model is active (fetched only when
       needed, not on every booking regardless of mode) — stamped onto
       the Appointment row at booking time, not re-read at claim time,
       so a later admin change doesn't retroactively move the price of
       appointments already sitting in the pool.
     - The old caller-supplied claimTokenCost field REMOVED from
       CreateAppointmentSchema entirely — no longer part of the request
       shape at all, closing off the exact gap that let this go unset
       for as long as it did.

3. FIRST MEETING DATE NOT PRE-FILLING FROM THE APPOINTMENT DATE — NOT a
   new bug, and not something this session (or any recent one) broke.
   Traced meeting1Date's every write site: it has never been set from
   firstAppointmentDate anywhere, ever — a broker has always had to
   type it in manually. This is exactly the gap the meeting/
   attempt-history redesign (fully specced in §138, zero code written)
   already exists to close. No code change here; Mark's own testing
   surfaced real, current friction from a gap that was already on the
   backlog — see the redesign-prioritization decision below.

4. ADDRESS NOT MANDATORY — confirmed, genuinely optional both
   server-side (Zod .optional()) and client-side (no validation at
   all). Connected to Mark's own follow-on idea (meeting type,
   in-person vs Teams/virtual) rather than fixed in isolation, since
   fixing address alone would have needed redoing once meeting type
   landed. Mark's explicit decision: meeting type DRIVES validation —
   Address required only for InPerson, a new meeting-link field
   required only for Virtual — not just an informational label.
   BUILT:
     - Appointment.meetingType (VARCHAR, 'InPerson'/'Virtual', default
       'InPerson' for historical rows) and .virtualMeetingLink columns
       — migration 026.
     - CreateAppointmentSchema: meetingType now required (no default —
       the agent must choose explicitly), with a .superRefine()
       enforcing the conditional address/link requirement. Verified all
       four cases directly against the schema (InPerson+address pass,
       InPerson-no-address fail, Virtual+link pass, Virtual-no-link
       fail) before touching anything else.
     - LeadDetail.jsx booking form: a meeting-type radio (defaults to
       InPerson — the only kind this app supported until now, avoids
       forcing an extra click on the common case), swapping between an
       Address field and a Meeting link field depending on the choice,
       both validated client-side to match the schema exactly.
     - AppointmentDetail.jsx: shows Meeting type, and either Address or
       Meeting link (rendered as a clickable link only when it actually
       looks like a URL — this field is free text, since sometimes
       people paste dial-in instructions rather than a pure link;
       forcing every value through an <a href> would produce broken
       links for those).

REDESIGN PRIORITIZATION, per Mark's decision: the meeting/attempt-
history redesign (§138) moves from "deferred" to "next" — this
session's finding #3 above is real, current evidence of the cost of
continuing to defer it. NOT STARTED YET this session — still fully
specced only, zero code written. Next session's primary work.

VERIFIED: node --check clean on every touched .js file, ESM import
smoke test, full Vite build clean (validates all three touched .jsx
files), existing 55-test suite unaffected. REAL POSTGRES this time,
not just SQL-text review — fresh instance, schema.postgres.sql loaded
clean with all new columns, migrations 025 and 026 both applied twice
each (fresh and idempotently against an already-current schema, no
errors either time). Inserted a real Virtual-meeting appointment
through the exact INSERT shape createAppointment() uses and confirmed
it lands correctly; separately confirmed the CK_Appointment_MeetingType
constraint genuinely rejects an invalid value ('Hologram'), not just
that the happy path works. Confirmed SystemConfig.defaultClaimTokenCost
updates correctly and its own bounds check rejects a negative value.

SEPARATE, caught again while diffing before packaging: frontend/db/
migrations/ is STILL missing from GitHub main (all of 022-024, not just
this session's new 025/026) — third time this exact issue has surfaced
this project (see §136, §140). Restored again in this delivery. Also
confirmed while diffing: the Tasks.jsx fix from earlier this session
(the isRedirectOnly bug — see the §139 addendum) has not been merged
yet either — carried forward in this delivery's file list, unchanged
from before, not a new edit.

MIGRATION: 025_add_default_claim_token_cost.sql,
026_add_appointment_meeting_type.sql — both additive only (new nullable/
defaulted columns), no data loss risk against an existing database with
live Appointment/SystemConfig rows.

FILES:
  frontend/api-lib/models/appointment.js            (meetingType/virtualMeetingLink added, claimTokenCost removed)
  frontend/api-lib/models/auth.js                   (defaultClaimTokenCost added to UpdateSystemConfigSchema)
  frontend/api-lib/services/appointmentService.js   (INSERT columns, claimTokenCost derivation)
  frontend/api-lib/services/systemConfigService.js  (defaultClaimTokenCost read/write)
  frontend/db/migrations/ (025, 026 NEW; 022-024 restored again — see finding above)
  frontend/db/schema.postgres.sql                   (all new columns/constraints)
  frontend/src/pages/AppAdmin.jsx                   (Tokens per claim field)
  frontend/src/pages/AppointmentDetail.jsx          (Meeting type / Address-or-Link display)
  frontend/src/pages/AppointmentList.jsx            (Active tab fix)
  frontend/src/pages/LeadDetail.jsx                 (meeting type selector, conditional address/link)
  frontend/src/pages/Tasks.jsx                      (carried forward, unmerged fix from earlier this session)
Plus this Status_Vercel.md.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 20 PAUSED HERE — 13 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT ACTION: §141 built and verified, NOT YET DEPLOYED. Migrations 025
and 026 have not been run against Neon. Once deployed and migrated: the
meeting/attempt-history redesign (§138) is next — genuinely large (new
attempt-history table, migration, full outcome-flow rewrite of
AppointmentDetail.jsx, interaction with the task/notification changes
already built in §139), warrants its own dedicated session rather than
being started at the tail end of this one. After that: the Reports
date-scoping fix, which depends on the redesign existing first.

If picking up a pending item, reference it by section number — same
convention as before.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION 21 STARTED — 13 Aug 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

142. FIVE ITEMS FROM MARK'S LIVE TESTING — ALL FIVE BUILT AND
     VERIFIED — 13 Aug 2026 (session 21)

Hydrated fresh from GitHub (codeload tarball) at session start per
standing protocol before touching anything. Mark listed five items he
found using the live app. Rather than transcribing his descriptions
verbatim, each was traced against the actual hydrated code first — per
the "verified delivery over claimed delivery" principle, a backlog
entry with the wrong root cause just wastes the next session's time
re-diagnosing it. Mark's explicit instruction: log first so nothing
gets lost, then fix ASAP in this same session. Items 1, 2, 3 had no
open design questions and were built immediately after logging; items
4 and 5 each carried a real decision — Mark answered both (7-digit
minimum for item 4; option (b), a dedicated chart token, for item 5)
and both were then built in the same session.

1. CLAIM-MODEL BOOKING MODAL NEVER RENDERS DATE/TIME FIELDS
   Screenshot evidence: claim model active, Book Appointment modal open,
   no Date or Time field visible anywhere, Confirm Booking correctly
   disabled (per isFormValid) but with no way to satisfy it.
   ROOT CAUSE, confirmed by reading BookAppointmentModal in
   LeadDetail.jsx: the Date and Time <input> fields are nested INSIDE
   the `{isClaimModel ? (...) : (<>...)}` block's ELSE branch only —
   alongside the region/broker-search section that's deliberately
   hidden in claim mode per §140. When claim model is active, that
   whole branch (including Date/Time, not just broker search) is
   skipped. Meanwhile isFormValid and handleConfirmBooking's own error
   checks both still require `date` and `time` unconditionally,
   regardless of claimModel. Genuine regression from §140's change, not
   a pre-existing gap — §140's isClaimModel branching was scoped to
   "hide the broker-search escape hatch" but the JSX nesting caught
   Date/Time in the same net.
   FIX, BUILT AND VERIFIED: moved the Date/Time input block out of the
   isClaimModel-conditional entirely so it always renders; only the
   region + "Find available brokers" + broker-selection subsection
   stays gated on `!isClaimModel`. No schema or backend change needed —
   firstAppointmentDate/firstAppointmentTime were never the problem,
   only their form inputs were unreachable. Minor field-order change in
   assign mode as a side effect: Date/Time now precedes Region rather
   than following it — functionally equivalent, not flagged as a
   concern.

   RELATED, NOT THE SAME ISSUE — genuinely new functionality, not a bug:
   Mark also raised, while testing this, that nothing currently surfaces
   an unclaimed (claim model) or unassigned (assign model) appointment
   as it nears its own appointment date. NOT SCOPED. No design decided
   yet — needs its own pass (options include a Task/Notification
   trigger off firstAppointmentDate proximity, a dedicated dashboard
   card, or folding into the meeting/attempt-history redesign already
   queued in §138 given the overlap). Flagged here so it isn't lost,
   deliberately not conflated with the Date/Time field fix above.

2. PORTFOLIO NOT MANDATORY ON LEAD CREATION — FIXED, THEN REVISED SAME
   DAY after Mark caught a real consequence of the first pass
   Was optional on both sides:
     - Backend: CreateLeadSchema.portfolios in api-lib/models/lead.js was
       `z.array(z.string()).optional()`.
     - Frontend: LeadImport.jsx's handleManualSubmit() validation block
       checked title/source/firstName/lastName/dateOfBirth/occupation/
       mobileNumber/email but had no portfolios entry at all. The
       field's own on-screen hint text used to read "Optional, and not
       limited to one".
   FIRST PASS (superseded): made CreateLeadSchema.portfolios itself
   `.min(1)`. Correctly matched Mark's literal instruction but also
   blocked CSV bulk-import rows, since they share this one schema.
   Flagged at the time as a deliberate, visible trade-off rather than a
   silent side effect — Mark came back and asked for it resolved
   properly instead of accepted.
   REVISED FIX, BUILT AND VERIFIED: portfolios field itself reverted to
   `.optional()`; the actual requirement now lives in a `.superRefine()`
   on CreateLeadSchema, conditioned on `leadSource === 'ManualEntry'`.
   Backend enforcement still exists for the manual-entry path specifically
   (not UI-only — hitting the API directly with leadSource: 'ManualEntry'
   and no portfolios is still correctly rejected), while CSVImport/
   EventAttendance/Referral/WebForm-sourced leads stay exempt, matching
   their pre-existing behaviour. Required a structural change alongside
   it: CreateLeadSchema.superRefine() returns a ZodEffects wrapper, which
   doesn't support `.partial()` — and UpdateLeadSchema further down
   derives via `CreateLeadSchema.partial()`. Split the plain object into
   an internal `CreateLeadShape`, with UpdateLeadSchema now deriving from
   that bare shape instead (a partial edit shouldn't re-trigger a
   creation-time gate anyway) and the exported CreateLeadSchema being
   `CreateLeadShape.superRefine(...)`.
   FOUND WHILE SCOPING THIS: LeadImport.jsx's "subscription" import tab
   (tab === 'subscription') never set leadSource at all in its tag
   object — only linkedSubscriptionId — silently defaulting to
   'ManualEntry' via the schema's own .default(). Pre-existing quirk,
   not introduced by this change, but would have reproduced the exact
   CSV-breaking problem for subscription-linked bulk imports specifically
   if left alone, since it's bulk-imported the same way the csv tab is.
   Fixed alongside this: that branch's tag now explicitly includes
   `leadSource: 'CSVImport'` too.
   VERIFIED: 8-case direct functional test against the live schema —
   ManualEntry with no portfolios (rejected), ManualEntry with empty
   array (rejected), ManualEntry with one portfolio (accepted),
   CSVImport with no portfolios (accepted), CSVImport with empty array
   (accepted), leadSource omitted entirely / defaults to ManualEntry
   (rejected, matches manual-form behaviour correctly), WebForm with no
   portfolios (accepted, confirms other sources aren't accidentally
   gated), and UpdateLeadSchema still accepting a plain partial edit
   (confirms the .partial()/.omit() restructure didn't break lead
   editing). All eight behaved exactly as intended.

3. AUDIT LOG DOESN'T REFLECT A LOGGED CALL WITHOUT A MANUAL RELOAD — FIXED
   Confirmed the backend write was already correct — this was NOT a
   repeat of §138's original gap. §138 (12 Aug 2026) added
   `writeAuditLog({ entityType: 'Lead', action: 'CallLogged', ... })`
   inside logCallAttempt() in leadService.js, and 'CallLogged' was
   already present in both auditHandlers.js's VALID_ACTIONS and
   AppAdmin.jsx's mirrored frontend list — confirmed both, no drift.
   ROOT CAUSE: LeadDetail.jsx's handleLogCall() calls leadsApi.logCall(),
   then on success only did an optimistic local update to the Call
   History card (`setCalls`) and `setStatusOverride` — it never called
   `refetchAudit()`. The page's other two mutation handlers (reopen,
   reassign) both call refetchAudit() after their own actions; this one
   was missed.
   FIX, BUILT AND VERIFIED: added `refetchAudit()` to handleLogCall's
   success path. Also added a 'CallLogged': 'Call logged' entry to
   AuditLogList.jsx's ACTION_LABELS map while in there — previously,
   even once refreshed, it would have fallen back to rendering the raw
   string "CallLogged" rather than a proper label, since describeEntry()
   only has a hardcoded label map, not a fallback formatter.

4. CONTACT NUMBER REGEX TOO RIGID — FIXED
   Was: `saMobile` in api-lib/models/lead.js was
   `/^(\+27|0)[6-8]\d{8}$/` — accepted only an unformatted SA mobile
   number in exactly that shape. No spaces, dashes, brackets, or
   international format tolerated at all. Shared across three intake
   surfaces via import: lead.js, event.js, leadPortal.js — one fix
   covers Lead creation, Events, and the public Lead Portal
   self-registration form together.
   Mark's spec: accept digits, +, -, (, ), and spaces only, minimum 7
   digits — drop the SA-mobile-format enforcement entirely.
   TRADE-OFF FLAGGED (not objected to, just noted, Mark's own call):
   genuine loosening, not a bug-for-bug fix — a landline number or any
   non-SA number now passes where the old regex correctly rejected it.
   Accepted as intentional given WhatsApp/SMS deliverability isn't a
   hard requirement for every lead.
   FIX, BUILT AND VERIFIED:
     saMobile = z.string()
       .regex(/^[0-9+\-() ]+$/, '...')
       .refine((val) => (val.match(/\d/g) ?? []).length >= 7, '...')
   Digit count is measured on actual digit characters only, not raw
   string length — a value padded with spaces/brackets can't fake its
   way past the minimum. Verified with 10 direct test cases against the
   live schema: plain SA mobile, SA international format, spaced,
   bracketed+dashed, a landline (now correctly allowed), exactly 6
   digits (correctly rejected), exactly 7 digits (correctly accepted),
   letters (correctly rejected), empty string (correctly rejected),
   international with spaces — all ten behaved exactly as intended.

5. REPORTS CHART LEGEND/KEY MEANINGLESS IN TERRA THEME — FIXED
   Traced to themes.css, not a rendering bug. Recharts' own
   DefaultLegendContent source confirms the legend swatch and the bar
   itself both derive fill from the same source (Bar's own `fill` prop,
   passed through to the legend's payload.color) — both are genuinely
   live CSS-variable-driven and track theme changes together, no
   caching involved. The actual defect: Terra's theme block defined
   `--accent:#5E7A4F` and `--live:#5E7A4F` — the IDENTICAL hex value.
   TrendChart.jsx mapped its two Bar series directly onto those two
   tokens (CHART_PALETTE.leads = var(--accent), CHART_PALETTE.won =
   var(--live)), so in Terra specifically, "Leads" and "Closed Won"
   rendered as the exact same green — bars and legend swatches both
   genuinely indistinguishable.
   MARK'S DECISION: option (b) — a dedicated chart-series token,
   decoupled from --live entirely, rather than just moving Terra's
   --live value.
   FIX, BUILT AND VERIFIED: added a new `--chart2` CSS variable to
   every theme in themes.css (documented in the file's own header
   contract comment), and changed CHART_PALETTE.won in tokens.js from
   var(--live) to var(--chart2). --live itself is UNCHANGED everywhere
   — it's still the general "success" semantic token driving confirm
   buttons and status badges (App.jsx, LeadDetail.jsx, LeadImport.jsx,
   tokens.js's own `success` alias); only chart series now depend on
   --chart2 instead. Per-theme --chart2 values:
     Midnight: #2DD4BF (same as current --live — no collision existed,
               visual appearance unchanged)
     Ember:    #E0A23C (same as current --live — this pairing is close
               to --accent's hue but not an exact collision like
               Terra's; deliberately NOT moved further apart, since
               that wasn't part of what Mark asked for or decided —
               flag if it should be revisited)
     Terra:    #3E7C8C — the actual fix. A muted teal-blue, clearly
               outside Terra's green/amber/rust hue range, distinct
               from --accent (#5E7A4F), --limited (#C08A3E), and
               --danger (#B8503F), while staying harmonious with the
               theme's earthy palette
     Linen:    #2E7D6B (same as current --live — no collision existed,
               visual appearance unchanged)
   Net effect: Midnight, Ember, and Linen look exactly as before (their
   --chart2 matches their existing --live value); only Terra's "Closed
   Won" bar and legend swatch actually change colour, from the
   collision green to the new teal-blue. Verified via full Vite build
   (compiles the CSS variable references cleanly) — visual confirmation
   across all four themes still needs Mark's own eyes on the deployed
   app, not something verifiable from this sandbox.

ALL FIVE ITEMS NOW BUILT — no open questions remain. Mark answered
both: item 4's minimum is 7 digits; item 5 is option (b), a dedicated
--chart2 token.

VERIFIED (all five items): full Vite build clean twice (once after
items 1-3, once after items 4-5), existing 55-test Vitest suite
unaffected both times, ESM import smoke test + node --check on
lead.js, a direct functional test against the live CreateLeadSchema
confirming the portfolios rule (empty array rejected with the custom
message, omitted field rejected as "Required", one portfolio
accepted), and a 10-case direct functional test against the live
saMobile validator (SA mobile, SA international, spaced, bracketed and
dashed, a landline now correctly allowed, 6 digits correctly rejected,
exactly 7 correctly accepted, letters correctly rejected, empty string
correctly rejected, international with spaces — all ten as intended).
themes.css/tokens.js changes verified by clean build only; the actual
visual result across all four themes needs Mark's own eyes on the
deployed app, not verifiable from this sandbox. Diffed all six touched
files against a fresh GitHub hydration before writing this entry —
confirmed each diff contains only the intended change, nothing else
disturbed.
NOT YET DEPLOYED — all five are built and verified in-sandbox only;
Mark still needs to push these six files to GitHub for Vercel to pick
them up. No migration required for any of the five.

FILES (all five items):
  frontend/api-lib/models/lead.js          (portfolios: .optional() -> .min(1); saMobile regex loosened + 7-digit minimum)
  frontend/src/pages/LeadDetail.jsx        (Date/Time hoisted out of isClaimModel branch; refetchAudit() added to handleLogCall)
  frontend/src/pages/LeadImport.jsx        (Portfolio required client-side, label/hint/error updated)
  frontend/src/components/AuditLogList.jsx (CallLogged label added)
  frontend/src/themes.css                  (--chart2 added to all four themes; header contract comment updated)
  frontend/src/styles/tokens.js            (CHART_PALETTE.won: var(--live) -> var(--chart2))
Plus this Status_Vercel.md.

MIGRATIONS DIRECTORY MYSTERY — RESOLVED, see §0's "MYSTERY RESOLVED"
paragraph above for the full account. Not a bug, never was: Mark
deliberately deletes migration files after running them against Neon,
and this session's own full-cumulative delivery packaging (corrected
in §145, and in Project_Context_Vercel.md directly) was resurrecting
them each time. Not re-duplicated here — that paragraph is the
authoritative account, per this file's own stated convention of
correcting/updating the one real entry rather than accumulating a
second, possibly-disagreeing copy elsewhere in the file.

143. BROKER-MATCHING FILTER CRITERIA — CORRECTED MARK'S OWN
     ASSUMPTION, AND A GENUINE OPEN SCOPING QUESTION — 13 Aug 2026
     (session 21, continued)

Mark asked three related questions while reviewing item 2's revision
above: whether Portfolio filters broker availability in the Assign
flow (he believed it does), whether the Claim model's pool is filtered
by Portfolio and/or Products, and whether Lead should capture Products
the same way it now captures Portfolio.

CORRECTION, verified by reading both matching code paths directly:
Portfolio does NOT drive broker eligibility anywhere in this codebase.
  - Assign flow: brokerMatchingService.js's findMatchingBrokers()
    filters strictly by region (BrokerRegion) and product specialisation
    (BrokerProduct) — no portfolio reference anywhere in the file.
    Products is already a hard backend requirement here: `if (!products
    || products.length === 0) throw { status: 400, message: 'at least
    one product is required for broker matching' }`.
  - Claim model: appointmentService.js's listAvailableToClaim() filters
    the same way — region match via BrokerRegion, then product overlap
    via BrokerProduct, computed in JS against the appointment's
    productsInterestedIn. Its own docblock confirms this mirrors
    findMatchingBrokers()'s eligibility rule exactly, just inverted. An
    appointment with no productsInterestedIn recorded is shown to every
    region-matched broker rather than excluded — a deliberate existing
    design choice ("the alternative would make an appointment
    permanently unclaimable over a data-entry gap"), not something
    changed today.
  - Portfolio's only role, confirmed by grep across both services: pure
    storage/reporting/filtering on the Appointment record itself
    (AppointmentPortfolio, listAppointments's own `portfolio` filter
    param, Reports.jsx). No BrokerPortfolio table exists. Mark's mental
    model was off on which field does the filtering — Products, not
    Portfolio — corrected here rather than silently building around the
    wrong premise.
  - One consistency point worth noting: CreateAppointmentSchema has
    required data.portfolios (min 1) since §41/§45 already — today's
    Lead-level portfolio fix (item 2 above) brings Lead creation in line
    with what Appointment creation already enforced, not a new
    standard.

OPEN SCOPING QUESTION, NOT BUILT — Mark's "should Lead not include
Products as well?": well-founded. Products is the field that actually
drives matching in both flows (and is already backend-mandatory at
Appointment-creation time), yet — confirmed by grep — Lead has no
products-equivalent field at all; it's only ever captured for the
first time at Book Appointment. Portfolio, by contrast, now has the
early-capture-and-carry-through treatment Products arguably needs more.
Making this real would mean: adding a products array to
CreateLeadSchema, a Products selector on the manual Create Lead form
(CSV import less obviously — a products column in a spreadsheet is a
reasonable ask, not yet discussed), and wiring Book Appointment's own
Products selection to pre-fill from the Lead the same way Portfolio
does now. Whether it should be mandatory (matching Portfolio's new
treatment) or stay optional is Mark's call, not decided. NOT SCOPED
FURTHER OR BUILT THIS SESSION — flagged as a real next-session
candidate, deliberately not built speculatively without Mark deciding
mandatory-or-optional and manual-form-only-or-also-CSV first.

144. TWO DECISIONS RESOLVED, ONE NEW ITEM BUILT AND VERIFIED — 13 Aug
     2026 (session 21, continued)

Mark reviewed §143's correction and made two decisions:

DECISION 1 — Lead-level Portfolio requirement (§142 item 2, revised):
KEEP AS BUILT. Manual-entry leads still require Portfolio at creation;
CSV/subscription imports stay exempt. No change needed — already live
in §142's revised fix.

DECISION 2 — Products on Book Appointment: MAKE MANDATORY, in both
Claim and Assign mode. Reasoning confirmed by Mark's own live testing
first (see §143's correction) — Confirm Booking stayed enabled with
zero products selected in claim mode, which traced back to
isFormValid never checking products in either mode, ever, matching
CreateAppointmentSchema's productsInterestedIn being genuinely
`.optional()` — not a bug, but a real gap now closed given Products is
the field that actually drives broker/claim-pool eligibility.

FIX, BUILT AND VERIFIED (item 6):
  - Backend: CreateAppointmentSchema.productsInterestedIn changed from
    `.optional()` to `.min(1, 'Select at least one product')`, in
    api-lib/models/appointment.js. No .partial()/.omit() consumer found
    downstream (confirmed via grep before building — only .safeParse()
    calls this schema elsewhere), so no ZodEffects restructure needed
    this time, unlike §142 item 2's revision.
  - Frontend: LeadDetail.jsx's isFormValid now includes
    `products.length > 0` in BOTH the claim-mode and assign-mode
    branches. Label changed to "Products the client is interested in *"
    to match every other required field's asterisk convention on this
    form. Disabled-button tooltip text updated to mention "at least one
    product" alongside the existing requirements, both mode variants.
  - Checked for other appointment-creation callers before building —
    grepped the whole frontend for appointmentsApi.create; LeadDetail.jsx
    is the only caller, so no other flow needed updating.
VERIFIED: full Vite build clean, existing 55-test Vitest suite
unaffected, node --check on appointment.js, and a 3-case direct
functional test against the live CreateAppointmentSchema (no
productsInterestedIn field at all -> rejected "Required"; empty array
-> rejected with the custom message; one product -> accepted). Diffed
both touched files (appointment.js, LeadDetail.jsx) against a fresh
GitHub hydration — confirmed each diff contains only the intended
changes, correctly cumulative with everything else built this session.
NOT YET DEPLOYED.

CORRECTION LOGGED for the record: an earlier message this session
(after §142/§143's first pass) stated "Products is already mandatory
at Book Appointment time" — inaccurate. That claim conflated the
Assign flow's own search-time requirement (findMatchingBrokers throws
if called with zero products) with a general booking-time requirement,
which never existed for claim-model bookings at all. Corrected in
§143 once Mark's own testing surfaced the discrepancy; noting the
error explicitly here rather than letting it stand only implicitly
corrected.

FILES, this addendum only (item 6): appointment.js, LeadDetail.jsx
(both already listed in the cumulative FILES list for this session —
no new files introduced).

145. DELIVERY PACKAGING CORRECTED — FULL CUMULATIVE ZIPS WERE THE ROOT
     CAUSE OF THE "VANISHING MIGRATIONS" MYSTERY — 13 Aug 2026 (session
     21, continued)

Mark questioned why the last few delivery ZIPs kept including
themes.css and tokens.js unchanged since item 5, when only item 6
(appointment.js, LeadDetail.jsx) had actually changed. Verified with
direct MD5 comparison between this session's two most recent zips
before responding — themes.css and tokens.js were confirmed byte-for-
byte identical, no drift, no accidental re-edit. The zips had been
packaging the FULL cumulative set of every file touched THIS session,
every time, on the assumption that was the safer default (drag the
whole folder over each time, nothing to track). Mark corrected this
directly: he only ever wants the actual delta — files changed since
the previous delivery — and explained why the previous full-cumulative
behaviour had a real cost beyond noise: it's what was resurrecting
migration files he'd deliberately deleted after running them against
Neon (see §0's "MYSTERY RESOLVED" paragraph, and the corrected entry
replacing what used to sit under §142's "SEPARATE FINDING, MIGRATIONS
DIRECTORY") — previously misdiagnosed as data loss across four
separate session write-ups (§136, §140, §141, and this session's own
first pass), when it was actually his own normal cleanup running
head-on into Claude re-adding what he'd just removed.

CORRECTED:
  - Project_Context_Vercel.md's "Delivery packaging" line (§14),
    updated directly — zips now contain only the delta since the
    previous delivery in the session, never a full re-inclusion of
    every file touched earlier that session. Status_Vercel.md /
    Project_Context_Vercel.md themselves are the one deliberate
    exception — they're presented standalone AND included in the zip
    whenever either actually changes, which is nearly every delivery,
    so that part of the convention is unchanged.
  - Claude's own cross-session memory (separate from this file, not
    stored in the repo) updated with the same correction, so this
    doesn't need to be re-explained at the start of a future session.

GOING FORWARD: before packaging any delivery, check what's actually
changed since the LAST zip sent this session (diff or just track it
directly through the session's own edit history) and include only
that — plus Status_Vercel.md/Project_Context_Vercel.md when they're
part of what changed.

CONFIRMED, same session: migrations 025 (default claim token cost) and
026 (appointment meetingType column) were both run against Neon
successfully — Mark confirmed with a screenshot of the Neon Console
SQL Editor's own query history, both showing "Statement executed
successfully" at 9:34am and 9:38am today respectively, before the
migrations folder was deleted. This closes out the one thing his
delete-after-running explanation hadn't fully settled on its own.
Practical effect: §140's default claim token cost and §140d's
meetingType column (which items 1 and 2 above, and item 6, all build
on or interact with) are confirmed live in the actual database, not
just in schema.postgres.sql on paper — nothing from this session is
blocked on an unrun migration.

146. "VIEW IN APPOINTMENTS" BUTTON UNGATED BY ROLE — FIXED — 13 Aug
     2026 (session 21, continued)

Mark found the "View in Appointments →" button, shown on a converted
Lead's conversion banner in LeadDetail.jsx, was visible to every role
including Agent. Should only ever show for Supervisor and up.
ROOT CAUSE: the button had no role check at all — only its neighbour,
Reopen Lead, was gated (via `canReopen`, itself built on `canManage`).
FIX, BUILT AND VERIFIED: wrapped the button in `{canManage && (...)}`.
canManage already exists on this page and already encodes exactly
"Supervisor and up" — `isAdminRole || role === 'Supervisor'`, where
isAdminRole is Admin or GlobalAdmin — and is the same check already
driving Reopen Lead right next to it, so this reuses an existing,
already-correct pattern rather than introducing a new one. Correctly
excludes both Agent and Broker. Verified via full Vite build (clean)
and the existing 55-test Vitest suite (unaffected). Diffed
LeadDetail.jsx against a fresh GitHub hydration — confirmed this
change is isolated and correctly cumulative alongside item 6's
products.length check, nothing else disturbed.
NOT YET DEPLOYED. No migration required.

FILES, this addendum only: frontend/src/pages/LeadDetail.jsx (already
in the cumulative set — no new files). Per the corrected delivery
convention (§145), the next zip contains ONLY this file, since it's
the only thing that changed since the last delivery.

147. TASKS PAGE CATEGORY TABS NOT ROLE-AWARE — TRACED TO SESSION 20,
     NEVER ACTUALLY BUILT, NOW FIXED — 13 Aug 2026 (session 21,
     continued)

Mark asked "did we lose this somewhere along the line" — checked
properly via conversation_search rather than guessing. Traced to the
same long design conversation as §138/139 (session 20, previous day):
Mark's original wording, mid-conversation — "the Task feature will
need to be role or context aware i.e. don't show Callbacks to Brokers,
or Appointments to Agents... Tasks that are visible to Supervisors are
for their direct reports, and Admins can see all." That same
conversation then pivoted into a much bigger "worklist" redesign
exploration (a unified due/overdue view spanning Tasks, Leads, and
Appointments, with a Leads tab) before circling back to a narrower,
different implementation — §139's own "WHAT CHANGED" list covers
Reschedule/Outcome task removal, notification routing changes, and
redirect-only task rows, but never mentions category-tab visibility at
all, and §138 explicitly flagged only the meeting/attempt-history
redesign as "genuinely deferred" — the tab-visibility piece was never
built AND never logged as deferred, unlike the meeting redesign. Not a
regression — confirmed by reading the live CATEGORIES array and its
render site directly: no role logic existed there at all, for any
role, ever, in the current code.
VERIFIED SEPARATELY, before building: the OTHER half of Mark's
original request — Supervisor sees direct reports only, Admin sees
everything — was already correctly built. taskHandlers.js's own
listTasks() scoping (its docblock explicitly states this) already
matches the Leads/Appointments pattern. Only the tab-visibility half
was missing.
FIX, BUILT AND VERIFIED: Tasks.jsx's static CATEGORIES array is now
filtered through a new `visibleCategories` at render time — Broker
never sees the Callbacks tab, Agent never sees the Appointments tab.
'All tasks' and 'Manual' stay visible for every role, per Mark's own
original wording ("keep Manual for everyone"). GlobalAdmin/Admin/
Supervisor see every tab, matching this page's existing `isAdmin`
definition. Checked `activeTab`'s state handling before building — it
initialises to 'all' and can only change via clicking a rendered tab
button (no URL param drives it), so there's no edge case where a role
could land on a now-hidden category. Verified via full Vite build
(clean) and the existing 55-test Vitest suite (unaffected). Diffed
Tasks.jsx against a fresh GitHub hydration — confirmed the change is
fully isolated: two additions (isAgent, visibleCategories) and one
render-site swap (CATEGORIES -> visibleCategories), nothing else
touched.
NOT YET DEPLOYED. No migration required.

FILES, this addendum only: frontend/src/pages/Tasks.jsx. Per the
corrected delivery convention (§145), the next zip contains ONLY this
file — nothing else has changed since the last delivery.

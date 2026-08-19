MedBroker Lead Management System — Project Status (VERCEL VERSION)
==================================================
Last updated: 18 August 2026
Scope: this file tracks ONLY the Vercel + Neon Postgres deployment —
frontend/api/ + frontend/api-lib/ + frontend/src/. It does NOT cover the
separate Azure Functions/Azure SQL codebase (api/src/, infra/), which is
frozen and out of scope for this project going forward (Mark will start
a separate Claude project for any future Azure customer build). Read
alongside Project_Context_Vercel.md — that one is architecture and
standing conventions; this one is current build state.

SPLIT AGAIN, 18 August 2026: this file had grown to 14,150 lines / ~862 KB
(~215,000 tokens) by combining live current-state tracking with a
permanent, verbatim session-by-session build log dating back to 21 July
2026 — reading it in full every session, as the standing protocol
required, was consuming most of a session's usable context before any
actual work began. The full historical log (§21 onward, unedited) now
lives in Status_Vercel_Archive.md. This file holds ONLY current state,
the outstanding-items list, and standing patterns — read this file in
full every session; consult the archive (or use project knowledge search
— the intended way to reach it) only when a specific past decision's
full rationale is needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0. CURRENT STATE — READ THIS FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REWRITTEN FROM SCRATCH 18 Aug 2026 — the previous version of this block
was written 13 Aug 2026 (end of session 21) and had gone stale in the
five days since: it still described the Reports page rebuild as an
unstarted "second priority for the next session." It is not. That work
happened, extensively, across sessions 22 and 23, and this rewrite is
verified against a fresh GitHub hydration (codeload tarball, 18 Aug
2026) plus a clean `npm install` / `npm run build` / `npx vitest run`
(48/48 passing) on that hydration — not carried forward from this log's
own prior claims.

REPORTS PAGE — FULL GROUND-UP REDESIGN: COMPLETE AND LIVE. What was
flagged in the 13 Aug version of this block as "not started, deserves
its own dedicated session" was in fact built, iterated on extensively
against Mark's direct feedback, and shipped across sessions 22-23 (§156
through §191). Donut breakdowns for Won/Lost (by Region, by Portfolio),
Cancellation Reasons, Loss Reasons, and Meeting Type; a real pipeline
funnel; upgraded KPI cards; consistent shared card tokens throughout.
The authoritative technical account of the final design lives in
Project_Context_Vercel.md's "Donut pattern" and "STANDING LAYOUT
PRINCIPLE" sections, which a session working directly on this stayed
current throughout — a session-log-shaped reconstruction of how it got
there (§179-191, clearly marked as reconstructed rather than first-hand)
lives in the archive, closing a gap this file's own §190 entry had
already flagged honestly rather than silently.

MEETING/APPOINTMENT ATTEMPT HISTORY: built (§164), then partially
reworked (§172, 15 Aug) — Cancelled and Missed/No-show split back out
into separate, independently reportable outcomes with a structured
cancellation-reason field, reversing part of §164's own original design,
with a genuine data recovery via migration 034. Confirmed present in the
live schema (MeetingAttempt table, cancelReason column, CHECK
constraints on status/cancelReason) via direct hydration.

MIGRATIONS: confirmed by Mark on 18 Aug 2026 — migration 034 (and
everything through §191) has been run against Neon. The earlier flag in
this section (based on a confirmation that predated migration 034) is
resolved; no longer an open item.

SESSION 18 AUG 2026 — REPORTS PAGE KPI-CARD CONSISTENCY, USER GUIDE AND
GLOBALADMIN GUIDE BOTH TAKEN TO v0.2, ARCHITECTURE DIAGRAM BLOCKED.
Reports.jsx / ReportsWidgets.jsx: Won vs Lost's four-metric row (Won,
Lost, Win Rate, Avg Days) switched from plain text to the same KpiCard
treatment Appointment Analysis already used — added a `customValue`
prop to KpiCard for the one genuinely compound value on the page (Avg
Days is two fmtDays() results, not one). DonutBreakdown card minHeight
raised from a flat 184px to clamp(210px, 20vw, 250px) on desktop (a
flat 210px on mobile deliberately — vw scales off the full viewport,
which breaks on a narrow portrait screen). Build clean, 48/48 tests,
diffed clean against a fresh hydration. Delivered as
medbroker-reports-cards-20260818-1600.zip.
MedBroker-User-Guide.docx and MedBroker-GlobalAdmin-Guide.docx both
rewritten to v0.2 (from v0.1, dated 31 Jul 2026 — five weeks stale).
User Guide: the meeting-outcome overhaul (Held-Interested/Held-Not-
Interested/Cancelled-with-structured-reason/Missed), the collapsed task
types (Callback and Assign Broker only, both non-tick-off-able by
design — Reschedule/Outcome tasks no longer exist), Manual Entry's move
to its own page with mandatory Products, the Claimed appointment
status, the unassigned-appointment warning, and the rebuilt Reports
page's real breakdowns. GlobalAdmin Guide: SMTP/Stripe/Paystack now
DB-backed via the Integrations page (env vars demoted to fallback-only),
two new flags (auth.sso.disableLocalFallback, security.kmsEncryption.
enabled), the Stripe/Paystack payment-provider correction (Stripe does
not support South Africa as a merchant country — flagged as a CAUTION
box, not a footnote), POPIA SAR reclassified from Phase2/not-built to
Operational/built, and a new environment-variables block for the KMS
four. Both rendered to PDF and visually checked before delivery.
Architecture diagrams (HTML microsite) — BLOCKED, not done this
session. Past-conversation search found it: MedBroker-Architecture-
Overview.html, built 10-11 Aug with six embedded diagrams (system
architecture, four ERDs, one payment sequence) in the Midnight theme —
but the file itself isn't in this project's knowledge, only referenced
in an old conversation. Cannot update a file not held anywhere
accessible; risk of silently rebuilding it from scratch and losing the
real Midnight-theme work already done was judged worse than leaving it
open. Needs Mark to upload the actual file (or its Mermaid/Draw.io
sources) before this can be picked up.

FOUR ITEMS PREVIOUSLY LOGGED AS "FIXED, NOT YET APPLIED TO THE LIVE
REPO" ARE NOW CONFIRMED LIVE — verified directly against the fresh
hydration, not assumed from this log's own prior notes:
  - Mixed-basis conversion ratios (§158) — reportService.js's conversion
    fields are the plain ratio, not a percentage, across Broker
    conversion and all four §151 breakdown reports.
  - Products on Lead (§159) — mandatory, manual-entry-form-only,
    LeadNew.jsx validates "Select at least one product."
  - Unassigned/unclaimed appointment warning (§160) — Notification type
    AppointmentUnassignedWarning present across schedulerService.js and
    four other files.
  - xlsx CVE fix (§157) — package.json's xlsx dependency is
    "npm:@e965/xlsx@^0.20.3", closing CVE-2023-30533/CVE-2024-22363.

RESPONSIVE-DESIGN AUDIT (§176): complete across the admin pages
(UserAdmin, AppAdmin, FeatureFlags, Integrations, LeadImport, LeadNew).
Included a real parallel-session conflict caught and corrected before
delivery — a different, later session had already extracted Manual
Entry out of LeadImport.jsx into its own LeadNew.jsx page; the fix was
re-applied to the correct, current file rather than silently reverting
that other session's work. Confirmed live: LeadNew.jsx exists as its own
page, gated on role only.

VERCEL FUNCTION COUNT: confirmed exactly 12/12 on this hydration — still
zero headroom, still Hobby's hard ceiling. Any new top-level API surface
needs a consolidation first.

BUILD HEALTH: clean `npm run build`, 48/48 tests passing, on this
hydration, 18 Aug 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0b. OUTSTANDING ITEMS — by priority
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLOSED, 18-19 Aug 2026: full data export (JSON + Excel), ID Number
visibility, and Lead/Appointment field parity — all three built and
delivered in the same session as the architecture diagram update above.

ID NUMBER: end-to-end. LeadNew.jsx (manual entry) and LeadDetail.jsx
(view/edit) both now have a 13-digit-validated ID Number field;
leadService.getLeadById() decrypts for display, updateLead() encrypts +
blind-indexes on write (mirroring createLead()'s existing pattern —
one input field, two stored columns, handled outside the generic
UPDATE_LEAD_COLUMNS loop). sarService.js's stale "the one place this is
ever shown in plaintext" comment corrected. Real, deliberate widening of
where this PII surfaces in the app — flagged to Mark explicitly at the
time, not a silent side effect.

LEAD/APPOINTMENT FIELD PARITY: AppointmentDetail.jsx now shows the same
Contact Details/Education/Insurance Information sections LeadDetail.jsx
already had (dateOfBirth, idNumber, whatsappNumber, university/year/
degree, hospitalOrPractice, existingCover, policies, medicalAid[+
provider]) — previously invisible anywhere on an Appointment, only ever
reachable via a join back to Lead nobody was doing. Deliberately NOT
added to the shared APPOINTMENT_SELECT constant in appointmentService.js
— that same constant backs the paginated Appointments list and the
claim-pool candidate query, and a Broker browsing appointments to claim
has no business seeing a Lead's ID number or insurance history before
claiming it. getAppointmentById() runs a second, detail-only query
instead, scoping the wider exposure to exactly the one view Mark asked
for.

FULL DATA EXPORT: new dataExportService.js (org-scoped queries across
Leads/Appointments/MeetingAttempts/CallAttempts + XLSX/JSON builders)
and dataExportHandlers.js (Admin/GlobalAdmin only), routed through the
existing flags-router.js (GET /api/flags/data-export) — the current live
deployment is still on Hobby's 12/12 function ceiling, so this is a
routing/packaging decision only, not a scaled-down design; the query and
file-generation logic itself targets Vercel's actual current defaults
(300s maxDuration under fluid compute, on by default on every tier),
not the old 10s Hobby figure this file mistakenly cited earlier in this
same session before being corrected. New feature flag
data.export.enabled (Operational, off by default) gates the new App
Admin "Data Export" tab — role is the real security boundary either
way, same pattern as every other flag-gated tab in this app. ID numbers
are MASKED in the export (last 4 digits only) — deliberately narrower
than the in-app plaintext views above, since a downloadable file is a
different risk profile than an access-controlled screen. This needs the
updated feature-flags.postgres.sql re-run against Neon before the flag
exists live — safe to do, confirmed ON CONFLICT (flagKey) DO NOTHING
already guards every other row in that file from being touched twice.

VERIFICATION: all four new/modified raw SQL queries actually run
against a real local Postgres 16 instance loaded from the live
schema.postgres.sql (not just read) — installed fresh in-session
specifically for this, per this project's own standing rule that SQL
correctness doesn't survive on inspection alone. Real foreign-keyed
seed data (using the schema's own pre-seeded Organisation/Portfolio/
Product rows, not invented ones) exercised every join. A second pass
ran the actual toSheetRows/XLSX-building logic from dataExportService.js
against the real row shapes node-postgres returns (confirmed: array
columns arrive as real JS arrays, DATE/TIMESTAMPTZ columns as real Date
objects — both handled correctly). Clean npm run build, 48/48 vitest,
function count unchanged at 12/12, diffed clean against a fresh
hydration — exactly the 12 files intended, nothing else touched.
Delivered as medbroker-idnumber-parity-export-20260819-0530.zip.

MID-SESSION CORRECTION WORTH RECORDING: this file's own effort-estimate
draft earlier in the same session had architected the export feature
around Vercel Hobby's old 10-second default duration and its 12-function
ceiling as if they were permanent constraints. Mark's pushback was
correct — Hobby's ToS explicitly prohibits commercial use, Pro is
already this project's own accepted target state, and Vercel's actual
current default (fluid compute, on by default on every tier) is 300s,
not 10s. The 12-function ceiling genuinely is Hobby-only and doesn't
apply on Pro at all. Corrected before building anything: the export's
business logic targets real current Vercel defaults; only the routing
decision (fold into flags-router.js vs. a dedicated function) stayed
Hobby-shaped, because that one is a real, current deployability fact
for whatever's live today, not a design constraint being carried
forward out of habit.

OUTSTANDING (unchanged from CURRENT STATE further up in this file):

1. Vercel Pro upgrade — still an open business decision, required
   before commercial launch (higher function-count ceiling, Vercel's
   own rate-limiting tier). Development has stayed on Hobby by design;
   this is the separate, later commercial-launch threshold.

2. Dev-tooling, lowest priority, zero production exposure: ESLint v10 +
   the still-missing eslint.config.js (lint cannot run at all right
   now), and the Vite v8 / Vitest v4 major version bumps.

3. Settings -> photo upload — still an honest "coming soon" disabled
   stub, deliberately parked. Not a bug, not forgotten — Mark's own call
   not to take on a paid Vercel Blob dependency without a customer
   actually asking for it.

4. UI staleness / notification gap after a broker claims an appointment
   — the agent does get notified on a successful claim (confirmed in
   code), but whether the claiming broker's own list view refreshes
   without a manual reload is still unconfirmed either way.

5. A process gap worth naming directly, since it's what necessitated
   part of the 18 Aug 2026 update: real, substantial work (the Reports
   donut redesign, §179-191) happened across at least one session that
   never appended its own entries to this log — the only surviving
   record was dated code comments. Project_Context_Vercel.md stayed
   current throughout because whatever session did the work updated it
   directly; this file didn't get the same treatment. Worth treating as
   a live risk, not a one-off: if a session does substantive work,
   log it here before the session ends, even in brief — a
   correct-but-undocumented change is functionally invisible to the
   next session reading this file "first."

CLOSED, 19 Aug 2026: two follow-ups from Mark's live testing of the
18-19 Aug data export / ID number / field parity delivery.

FLAG_META GAP — genuine miss, root-caused. Mark ran the updated
feature-flags.postgres.sql against Neon exactly as instructed, but the
new data.export.enabled flag never appeared on the Feature Flags
settings page at all — no toggle, nothing to switch on. Root cause:
FeatureFlags.jsx's settings UI does NOT read its list of togglable
flags from the database — it renders from a hardcoded FLAG_META array
in that same file, meant to mirror the seed data (the file's own header
comment says so, and even flags GET /api/flags/meta as the eventual
"real" source, which doesn't exist yet). The 18 Aug session added the
new flag to the seed file — which correctly drives the actual flag()
gating logic everywhere else in the app via listFlags() — but never
added the matching FLAG_META entry, so the settings page had nothing to
render regardless of what the database said. This was a real gap in
that session's own verification, not anything Mark did wrong: the
gating logic was checked, the render path for the settings page itself
never was. Fixed: FLAG_META entry added (FeatureFlags.jsx), matching
the seed file's label/description/tier exactly. Also added
data.export.enabled to FlagContext.jsx's DEFAULT_FLAGS while in the
same file family, closing the earlier-flagged minor gap there too.

"CONTACT DETAILS" RENAMED TO "PERSONAL DETAILS" — Mark's request,
LeadDetail.jsx and AppointmentDetail.jsx both (parity preserved). The
card holds Date of Birth, ID Number, WhatsApp, and Hospital/Practice
(LeadDetail.jsx also Email/Mobile/Job Title) — a "Contact Details"
label stopped making sense once ID Number joined it 18 Aug, particularly
for a section holding sensitive identity data. "Personal Details" is
the locally-idiomatic SA-forms heading for exactly this mix (identity +
contact info together) — no fields moved, label only.

VERIFICATION: npm run build clean, 48/48 vitest, grep-confirmed no
remaining "Contact Details" UI references (only historical comments,
correctly left referencing the old name for context). Delivered as
medbroker-flagmeta-personaldetails-20260819-0600.zip, including
Status_Vercel.md at its correct repo-root path per the corrected memory
rule (memory edit #3) — first delivery since Mark caught it missing.

CLOSED, 18 Aug 2026: architecture diagrams (MedBroker-Architecture-
Overview.html). Mark uploaded the actual file — it was never missing
from the deployment, only from this project's knowledge. Lead Pipeline
and Appointments/Token Economy ERDs regenerated via Mermaid (matched to
the existing Midnight theme) to add LeadProduct and MeetingAttempt;
table count corrected 31 -> 33 in the two live-text mentions. The
system architecture diagram's "31 tables" label is baked into a
flattened image and was deliberately left alone rather than
regenerating a whole diagram from scratch for one stale word — flagged,
not silently ignored.

CURRENT SECURITY / DEPENDENCY STATE (verified 18 Aug 2026 against a
fresh hydration):
  - react-router: 7.18.2. Open-redirect + SSR-hydration CVEs closed. One
    remaining npm audit entry (RSC Mode CSRF Bypass) confirmed NOT
    applicable — no RSC usage anywhere in this app. Real fix is v8, a
    separate future decision.
  - xlsx: CLOSED. "npm:@e965/xlsx@^0.20.3" in package.json, confirmed on
    this hydration — CVE-2023-30533 and CVE-2024-22363 both closed.
  - engines.node: pinned to "24.x" (current Active LTS, supported
    through April 2028).
  - WAF: Vercel's own built-in Firewall, included on every plan. See
    Project_Context_Vercel.md §12 for the full decision.
  - DB connection TLS: db.js sets ssl: { rejectUnauthorized: false } —
    encrypts the connection to Neon but doesn't verify Neon's
    certificate. Low practical risk, tracked, not urgent.
  - Lead.idNumber field-level encryption: KMS-hardened. Requires
    KMS_MASTER_KEY_ID/AWS_REGION/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
    all set before deploying.
  - Session token storage: httpOnly cookie (mb_session), SameSite=Strict,
    Secure hardcoded on. No CSP header configured — no defense-in-depth
    against XSS beyond React's own default JSX escaping, still an open
    item if ever wanted.
  - Still queued, lowest priority: ESLint v10 + eslint.config.js; Vite
    v8 + Vitest v4 major bump.

VERCEL FUNCTION COUNT: exactly 12/12 (Hobby's hard ceiling), zero
headroom. Check the real count before adding any new top-level API
surface — `find frontend/api -type f -name "*.js" | wc -l`.
system-config.js folding into flags-router.js is the natural next
consolidation if/when headroom is needed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERMANENT PATTERNS worth re-reading before touching adjacent code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - GlobalAdmin missing from requireRole() allow-lists is a recurring
    real bug on new routes — check every new route explicitly includes it.
  - Empty-string optional fields break Zod .optional() — apply a
    stripEmpty()-style helper to new create/update payloads.
  - HTML datetime-local inputs need z.string().datetime({ local: true }).
  - Client hides, server enforces — every permission/lock boundary in
    this app follows this split; new gates should too.
  - Backend date serialization: .toISOString().slice(0, 10) on a raw pg
    Date object, never String(dateObj).slice(0, 10) — see Project_
    Context_Vercel.md's CRITICAL IMPLEMENTATION RULES for the full story.
  - When something gets built, go back and correct every stale "not
    built yet" claim about it, not just the newest summary — a
    disclaimer alone didn't stop this exact confusion happening
    multiple times, including in this file's own §0 block above.
  - Text input font-size must stay >= 16px (1rem) — iOS Safari
    auto-zooms below that and doesn't zoom back out. Any new form
    control that doesn't route through tokens.js's shared formInput
    style needs this checked explicitly.
  - GROUP BY on computed columns joining Appointment and Lead must alias
    to `groupKey`, never a human-readable name that may collide with a
    real column — a real bug (§181), not a hypothetical.
  - `ReturnedToLeads` must never be counted as Lost anywhere in
    reporting — a standing invariant, re-affirmed at its actual query
    source in §185 after an earlier patch missed it downstream.
  - New DonutBreakdown cards must be true flex siblings within their
    row container, never separately-wrapped blocks, and must use shared
    s.card/s.metricCard tokens (colors.line/radius.md/shadow.sm), not
    one-off values — see Project_Context_Vercel.md's "Donut pattern"
    for the full current design.
  - SESSION-ISOLATION FOOTGUN: sessionStorage is per-tab but the
    mb_session cookie is shared across tabs — apparent "wrong user"
    bugs during multi-tab testing are frequently this, not a code
    defect. Ask whether multiple tabs/windows were open before
    accepting a live-testing report as evidence of a real bug.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full session-by-session build history (§21 onward, original and
reconstructed entries alike): Status_Vercel_Archive.md.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

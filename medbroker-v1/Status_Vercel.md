MedBroker Lead Management System — Project Status (VERCEL VERSION)
==================================================
Last updated: 22 August 2026
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

§192 — INDEPENDENT SECURITY AUDIT, 22 Aug 2026, AND FOUR FIXES CLOSED
SAME DAY. code-audit skill (independent-reviewer role, no fixes made
during the audit itself) ran a security/build/known-defect-regression/
POPIA-FAIS pass against a fresh hydration, producing
MedBroker_Security_Audit_Report_20260822.docx (Admin project knowledge).
No Critical findings; core auth/IDOR/SQLi/encryption/POPIA-erasure
posture confirmed sound. Two High and two Low findings were fixed in a
same-day follow-up session (separate from the audit itself, per the
skill's own independence rule):
  - F-01 (High) — GET /api/appointments/available-to-claim was
    returning Lead email/mobile to a Broker before they'd claimed the
    appointment (APPOINTMENT_SELECT is shared with other, legitimate
    full-detail views, so the fix strips leadEmail/leadMobile inside
    listAvailableToClaim()'s own result mapping, not the shared select).
  - F-02 (High) — toCsv() (SAR export, audit-log export) didn't
    neutralise a leading =/+/-/@ before writing a cell, so a prospect-
    submitted Lead name reaching a CSV opened later in Excel could
    trigger formula/DDE execution. Fixed with the standard OWASP
    leading-apostrophe guard in escapeCell(), applied before the
    existing comma/quote/newline handling. helpers.js had zero test
    coverage before this — helpers.test.js added (9 tests, including the
    combined formula+comma case) so this doesn't silently regress.
  - F-08 (Low) — four local inputStyle object literals (LeadDetail.jsx
    x3, AppointmentDetail.jsx x1) used directly by native <select>
    elements were missing color, the exact "invisible text on dark
    themes" pattern this project's known-defect list already tracks.
    Added color: 'var(--ink)' to each, matching what tokens.js's shared
    s.select/s.formInput already do correctly. Re-checked every other
    <select> in the app individually after fixing these four (not just
    the ones sharing the inputStyle variable name) — all 60 remaining
    instances route through s.formInput/s.select directly or via
    spread, all of which already carry color. No further instances.
  - F-09 (Low) — EventDetail.jsx's maxWidth: '1000px' had no
    counterpart on EventList.jsx, so opening an event visibly narrowed
    the page. Removed; EventDetail.jsx now matches EventList.jsx's
    unconstrained width, consistent with every other list/detail pair.
Verified via a second fresh GitHub hydration (confirmed zero upstream
drift since the audit), `npm run build` (clean), `npx vitest run`
(57/57, up from 48 — the 9 new helpers.test.js cases), `npm run lint`
(same single pre-existing plugin-version error as the audit found, nothing
new). Five findings remain open by design, not urgency — F-03 through
F-07 either need a platform/contractual decision (KMS funding, Neon
region confirmation, a commissioned pen test) or are low-cost follow-ups
(rate limiting, CI pipeline) appropriate for the next working session,
not this same-day patch. Full detail, evidence, and remediation guidance
for all eleven findings — fixed and open alike — is in the audit report
itself; this entry is a pointer, not a duplicate.

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

SESSION 21 AUG 2026 (CONTINUED, NINTH ROUND) — SAR REQUIRED ASSIGNMENT,
AUTO-COMPUTED DUE DATE, AND A LINKED TASK MATCHING LEAD/APPOINTMENT
BEHAVIOUR. CORRECTED AFTER A REAL DELIVERY MISTAKE, NOT JUST BUILT.

Full audit performed first, per Mark's explicit request — see that
entry for the sweep details, nothing new found there worth repeating
here.

THE FEATURE, per Mark's request: SAR assignment required, Target due
date auto-set to POPIA's response window rather than manually entered,
and the request creates a linked Task, editable only from the request
itself, mirroring Callback/Appointment tasks exactly. Full build
detail, the 30-day POPIA/PAIA sourcing, and the new migration are all
covered fully in this entry's original write-up two rounds back — not
repeated here, only what changed on correction.

A REAL DELIVERY MISTAKE, OWNED DIRECTLY: the SAR feature was built and
first delivered from a GitHub hydration that predated Mark applying the
previous entry's notification/task badge fix. Never re-checked before
packaging. The delivered ZIP's App.jsx and Tasks.jsx were therefore
STALE — applying it as given would have REVERTED Mark's already-working
badge fix. Confirmed via fresh hydration that no actual regression
reached his live environment (he hadn't applied the stale ZIP before
catching it), but the ZIP itself was wrong and needed rebuilding
properly, not just re-explaining.

FIXED PROPERLY, not by re-copying the old files: re-hydrated fresh,
confirmed exactly which files the badge fix touched (App.jsx,
Notifications.jsx, Tasks.jsx) versus which SAR-feature files never
overlapped with it (sar.js, task.js, sarService.js, taskService.js,
migration 037, schema.postgres.sql, AppAdmin.jsx — verified safe to
copy directly, not assumed). Tasks.jsx was the one genuine overlap —
manually re-applied the SAR-specific edits onto the CURRENT,
badge-fix-included file rather than letting either version clobber the
other. App.jsx and Notifications.jsx need zero changes from the SAR
work and are excluded from this delivery entirely — including them
again would just be re-litigating a file that's already correct.

CAUGHT AND ACTUALLY FIXED WHILE RE-VERIFYING (Mark's explicit
instruction: fix issues found, don't just flag and defer them) — two
real gaps, neither caught in the original build:
  - Tasks.jsx's linkTarget referenced task.linkedAppointment, which
    never matched taskService.js's TASK_SELECT (actually named
    linkedAppointmentId) — flagged only, not fixed, two rounds ago.
    Fixed properly this time, in the same edit that added the SAR
    branch, rather than left noted for later.
  - CATEGORIES — a SEPARATE, hardcoded array driving the Tasks page's
    own tab bar, entirely distinct from CATEGORY_META (which only
    controls a task row's styling/label) — had no 'sar' entry at all.
    Missed in the original build; SAR tasks would have displayed
    correctly inside "All tasks" but had no dedicated filter tab the
    way every other category does. Added, plus the matching role-
    visibility rule (hidden from Agent AND Broker — a SAR task can only
    ever be assigned to Admin/GlobalAdmin, so extending the exact
    reasoning this file already applies to hiding Callbacks from Broker
    and Appointments from Agent).

VERIFICATION, redone on the correctly-merged codebase, not assumed
carried over from the discarded delivery: npm run build clean, npm run
lint back to the stable 146-problem/1-error baseline (verified the one
extra warning above that baseline was pre-existing noise unrelated to
any of this session's changes, not new), 48/48 vitest. schema.postgres.sql
reloaded clean from scratch on this codebase specifically, confirming
migration 037's constraint changes are present and correct here too,
not just on the discarded working copy.

STILL OPEN, NAMED EXPLICITLY RATHER THAN LEFT IMPLICIT: the
MedBroker-User-Guide.docx / MedBroker-GlobalAdmin-Guide.docx format
issue (Outstanding item 0i, logged 20 Aug) has not been addressed —
raised again with Mark directly this round rather than left to keep
aging silently on the list.

STALENESS, FOUND AND FIXED, INCLUDING A REAL SCOPING BUG CAUGHT BY THE
LINT TOOLING BEFORE IT SHIPPED.

Mark: clearing/reading a notification updates the Notifications page
itself correctly, but the sidebar badge count doesn't resolve until a
full page refresh.

ROOT CAUSE: App.jsx's sidebar badge count is a completely separate
useFetch from whatever Notifications.jsx itself uses — it only
refetches on route change ([location.pathname] as its sole dependency).
Notifications.jsx's own handlers (markAllRead, markRead, dismiss,
clearRead) all correctly refetch() their OWN local list, but had no way
to signal the sidebar's independent fetch instance that anything had
changed. Checked whether Tasks had the identical issue before fixing
just the one reported — same fetch pattern, same
[location.pathname]-only trigger, same four mutating handlers
(toggleDone, deleteTaskHandler, reassignTask, addTask) each correctly
refetching their own list with no cross-component signal. Fixed both
consistently, not just the one Mark happened to test.

FIRST ATTEMPT WAS WRONG, CAUGHT BY THE LINT TOOLING BEFORE SHIPPING:
tried passing refetchNotifCount/refetchTaskCount down through the
<Route> elements directly from AppLayout, where the badge state
originally lived. npm run lint immediately flagged both as
'not defined' — no-undef, real errors, not warnings. Investigated
before assuming a typo: AppLayout and AppLayoutWrapper are SIBLING
components, not parent/child in the way that matters here — AppLayout
only ever receives {children}, which is CONSTRUCTED in
AppLayoutWrapper's own scope (where the <Routes> actually live) before
being passed in. A function declared inside AppLayout was never
reachable from a <Route>'s element prop, regardless of how the JSX
visually nests — confirmed by reading both component boundaries
directly, not guessed from the error message alone. This is exactly
the class of bug the lint infrastructure (added earlier this session,
after the LeadDetail.jsx colors crash) exists to catch, and it worked
on the very next thing built after it went in.

FIXED PROPERLY: moved the notifData/myTaskData useFetch calls (and
their refetch functions) from AppLayout to AppLayoutWrapper — the
component that actually owns the <Route> elements needing them.
AppLayout's signature changed from computing unreadCount/
pendingTaskCount itself to receiving them as plain props
({ children, unreadCount, pendingTaskCount }), same as everything else
it already receives from its parent. refetchNotifCount/refetchTaskCount
now correctly passed to <Notifications onNotificationChange={...}> and
<Tasks onTaskChange={...}>, called by those pages after every one of
their own mutating actions (4 in Notifications.jsx, 4 in Tasks.jsx),
on top of the existing route-change refetch — additive, not a
replacement for it.

VERIFICATION: npm run build clean. npm run lint — zero no-undef issues
after the fix (was 2 real errors after the first, wrong attempt;
correctly caught, correctly diagnosed, correctly fixed before this
delivery, not shipped and found later). 48/48 vitest, no regressions.

HAD A REAL FRONTEND GAP, FOUND BY MARK, FIXED.

Mark tested a ClosedWon appointment (John Wellington) and found the
"Edit Details" button still fully clickable. Traced it precisely rather
than assuming the previous entry's fix was simply incomplete in some
vague way: AppointmentDetail.jsx has TWO entirely separate edit
surfaces — the isLocked-gated fields inside the "Appointment Outcome"
card (verified correctly disabled last entry), and a completely
different editingDetails flow (Lead Details/Appointment Details/
Personal Details/Education/Insurance cards) triggered by a top-level
"Edit Details" button that was gated on canManage ONLY — zero isClosed
check, never touched by the previous fix at all. Checked for other
entry points into editingDetails before fixing anything — setEditingDetails(true)
has exactly one call site (startEditingDetails, called only from this
one button) — so a single fix at this point is genuinely sufficient,
not a guess.

WORTH BEING PRECISE ABOUT THE ACTUAL RISK HERE, NOT JUST THE SYMPTOM:
checked what handleSaveDetails actually does on save — it calls BOTH
leadsApi.update() (for Lead-owned fields this same form edits:
occupation, DOB, ID number, education, insurance info) AND
appointmentsApi.update() (for the Appointment-native fields). Both of
those server-side calls were ALREADY correctly rejected by the previous
entry's backend locks — Wellington's Lead is pipelineStatus = 'Closed'
(cascaded from his own appointment closing), so leadHandlers.js's PUT
lock already covered it independently. No data was ever actually at
risk of changing; the button being present was a misleading-UI bug —
looked editable, would have failed (confusingly, with two separate
errors) on save — not a data-integrity bug. Still a real bug worth
fixing at the entry point, not just relying on the backend to catch it
after the fact with a confusing double failure.

FIXED: the "Edit Details" button is now also gated on !isClosed,
deliberately NOT the broader !isLocked (which also covers
ReturnedToLeads — a status the backend PUT lock deliberately does NOT
block, per that check's own comment) — using isLocked here would have
hidden the button for a status the server would still accept a save
for, the identical class of frontend/backend mismatch in the opposite
direction. Also added the same isClosed check inside
startEditingDetails() itself as a defense-in-depth guard, matching this
file's own established pattern (the isLocked-gated Outcome card already
checks at both the trigger and the field level, not just one).

SWEPT BOTH files for any other edit-trigger button with the same class
of gap — grepped every onClick calling an edit-mode setter in both
AppointmentDetail.jsx and LeadDetail.jsx. LeadDetail.jsx's own "Edit
Details" button was already correctly gated on canEdit (which already
included !isClosed from the earlier entry) — confirmed, not assumed.
This was the only remaining gap.

VERIFICATION: npm run build clean, npm run lint shows the identical 145
problems as before this fix (144 pre-existing unused-var warnings, one
unrelated cosmetic notice) — zero new no-undef errors, confirming
isClosed is correctly in scope where referenced. 48/48 vitest, no
regressions. Replicated the exact fixed JSX condition against
Wellington's real values (status: 'ClosedWon') directly — button
correctly does not render.

NOW LOCKED FOR EVERYONE, WITH A REOPEN ESCAPE HATCH. Mark's explicit
request: "when a Lead or an Appointment is closed, it should be
uneditable... nobody should be allowed to change either whilst in a
closed state."

INVESTIGATED BEFORE BUILDING, SURFACED A REAL DESIGN QUESTION: a strict
permanent lock, read literally, means a mistake (a mis-logged call
outcome, a wrongly-closed appointment) becomes unfixable by anyone,
forever. Confirmed with Mark before writing anything — lock with an
Admin/Supervisor reopen escape hatch, not a permanent one-way door.

ALSO SURFACED WHILE INVESTIGATING: Lead already had a partial lock
(pipelineStatus === 'AppointmentScheduled', Agent-only — Supervisor/
Admin could already edit through it) but nothing at all for
pipelineStatus === 'Closed'. Appointment had NO lock of any kind at the
backend, for any status — AppointmentDetail.jsx's own frontend isLocked
already greyed out the fields, but updateAppointment() had zero status
checks, meaning the actual guarantee didn't exist, only the UI hint did
— exactly the "server-side enforcement, not just hidden UI" principle
this project already holds everywhere else.

ALSO FOUND A SEPARATE, PRE-EXISTING BUG directly relevant to the reopen
escape hatch: reopenLead()'s precondition only ever accepted
pipelineStatus === 'AppointmentScheduled' — but appointmentService.js's
own cascade moves a Lead to pipelineStatus = 'Closed' the moment its
Appointment reaches ClosedWon/ClosedLost, which made the existing
Reopen button already unusable for the single-appointment case it was
built for. Fixed as part of this delivery, not a separate one — the new
lock needed a working reopen path to actually be safe to ship.

BUILT:
  - leadHandlers.js — new lock: pipelineStatus === 'Closed' blocks the
    PUT edit endpoint for everyone, no role exemption (deliberately
    stricter than the existing AppointmentScheduled/Agent-only check
    right above it — Mark's own word was "nobody").
  - leadService.js — reopenLead() now accepts pipelineStatus === 'Closed'
    OR 'AppointmentScheduled' (previously only the latter); rejects only
    when the most recent appointment is genuinely ClosedWon — reversing
    a won deal is a bigger, separate decision than fixing a mistaken
    loss, not what this action is for.
  - leadHandlers.js — the reopen handler's audit log was hardcoding
    { from: 'AppointmentScheduled', ... } — now uses the actual
    pre-reopen status already fetched, not a stale assumption.
  - appointmentHandlers.js — new lock: ClosedWon/ClosedLost blocks the
    PUT edit endpoint for everyone. ReturnedToLeads deliberately NOT
    included — that already has its own separate re-assignment path
    and isn't "closed" in the sense this lock means.
  - appointmentService.js — new reopenAppointment(): ClosedLost only
    (same Won/Lost asymmetry as Lead, applied consistently), resets to
    InProgress, clears closedAt, deliberately preserves
    claimedByBrokerId/agentId/brokerId (this is about un-freezing the
    record, not un-claiming it), and cascades the linked Lead back to
    InProgress too if it's still 'Closed' — otherwise reopening the
    Appointment would leave the Lead locked and orphaned by the new
    Lead lock, with no obvious way back.
  - appointmentHandlers.js / api/appointments-router.js — new
    PUT /api/appointments/:id/reopen, Admin/Supervisor/GlobalAdmin only,
    mirrors handleAppointmentReturn's exact shape.
  - src/services/api.js — appointmentsApi.reopen() added.
  - LeadDetail.jsx — canEdit now excludes isClosed too (previously only
    isConverted); the existing Reopen banner and canReopen logic
    extended to cover the no-appointment call-stage-loss case, with new
    messaging for it specifically (baseLead.appointmentStatus is falsy
    for that case, which the new branch keys off).
  - AppointmentDetail.jsx — new Reopen button added to the existing
    "closed and can no longer be edited" notice, Admin/Supervisor only,
    ClosedLost only (doesn't render at all for ClosedWon rather than
    rendering disabled with no explanation) — mirrors LeadDetail.jsx's
    own handleReopenLead pattern exactly (direct button + loading
    state, no confirmation modal).

BUG CAUGHT DURING THE BUILD, BEFORE DELIVERY: handleReopenAppointment
was first written referencing `appointment.id` — the actual state
variable in this file is `appt`, not `appointment`. Caught by checking
the real declaration (line 649) before assuming, not by trusting the
name that felt natural to write.

BUG CAUGHT DURING VERIFICATION, IN MY OWN TEST SCRIPT NOT THE APP: the
first pass at testing reopenLead()'s precondition against real Postgres
used lead.pipelinestatus (lowercase) instead of the actual camelCase
alias the query returns (pipelineStatus) — produced a false "REJECT" on
two scenarios that should have passed. Fixed the test script itself
before trusting its output, not the other way around — a reminder that
verification code needs the same scrutiny as the thing it's verifying.

VERIFICATION: node --check and ESM import smoke test clean on all five
touched backend files (confirmed the new reopenAppointment import chain
resolves correctly too). npm run build clean, 48/48 vitest, npm run
lint shows the identical 145 problems as before this round (144 pre-
existing unused-var warnings, one unrelated cosmetic notice) — zero new
no-undef errors from any of this session's frontend changes. All four
reopenLead precondition scenarios (Closed/no-appointment,
Closed/cascaded-from-ClosedLost, Closed/cascaded-from-ClosedWon,
InProgress/never-closed) verified against real Postgres with the exact
query and logic from the file, all four correct. reopenAppointment()'s
actual UPDATE statements run against real seeded data — status,
closedAt, claimedByBrokerId/agentId all landed correctly, and the Lead
cascade correctly moved the linked Lead back to InProgress too.

EDIT, FIXED, PLUS NEW LINT INFRASTRUCTURE TO CATCH THIS CLASS OF BUG
GOING FORWARD.

Mark hit a blank white page clicking "Edit Details" on a Lead — browser
console showed "Uncaught ReferenceError: colors is not defined" in the
LeadDetail chunk, crashing the whole page render. Confirmed NOT
introduced by any of this session's work — never touched LeadDetail.jsx
before this — a pre-existing, dormant bug that had simply never been
triggered before, because Mark had been testing via direct Neon-console
edits rather than the app's own Edit UI up to this point. First time
this exact code path (the "Select a portfolio first" hint, shown when
editing with zero portfolios selected) actually rendered.

ROOT CAUSE: LeadDetail.jsx line 643 referenced colors.ink400, but this
file's imports only pull in `s` and `APPT_STATUS_META` from tokens.js —
`colors` itself was never imported at all. colors.ink400 does exist in
tokens.js (resolves to var(--mut)) — this was a real, simple oversight,
not a deeper design problem.

FIXED: replaced colors.ink400 with 'var(--mut)' directly — the exact
same CSS variable, and the identical pattern already used two lines
above for the sibling "Products" label in the same block. No new
import needed; minimal, matches the surrounding code exactly.

SWEPT THE REST OF THE FRONTEND for the same class of mistake (a
colors.X reference without importing colors) — this was the only
occurrence anywhere in src/. Confirmed via the new lint tooling below,
not just this one manual grep.

NEW: eslint.config.js — didn't exist before this. package.json already
had an npm run lint script, but with zero config behind it, so it
errored out immediately rather than checking anything; exactly why
this class of bug (a plain JS ReferenceError, invisible to npm run
build's transpile-only checking) went undetected. Deliberately narrow:
only no-undef and no-unused-vars enabled — not ESLint's full
recommended set, and no React-specific plugin (eslint-plugin-react,
Hooks rules), none of which are installed. Turning on a full ruleset in
one step risked surfacing a wave of unrelated pre-existing warnings
across the whole codebase as a surprise side effect of a bug-fix
delivery — a fuller lint setup (React Hooks rules especially, genuinely
worth having) is a separate, bigger decision for Mark to make
deliberately, not bundled in here. Added the `globals` package
explicitly to devDependencies (package.json) rather than relying on it
silently as an undeclared transitive dependency of eslint itself.

RUNNING THE NEW LINTER FOR THE FIRST TIME found exactly one real issue
across the whole src/api/api-lib tree — the LeadDetail.jsx bug already
being fixed in this same entry. Everything else was no-unused-vars
noise (144 warnings, mostly unused imports) and one harmless "rule not
found" notice from a leftover eslint-disable comment referencing a
Hooks-lint rule that isn't configured (cosmetic, not a code problem).
Zero other no-undef violations anywhere — real, useful confirmation
that this specific class of crash isn't lurking elsewhere.

VERIFICATION: npm run build clean, 48/48 vitest, no regressions. npm
run lint now actually runs (previously errored out unconditionally) and
confirms the fix — the ReferenceError-class issue it exists to catch is
gone.

THE PREVIOUS ENTRY, FOUND AND FIXED: "CLOSED WON" APPOINTMENTS WERE
BEING DOUBLE-COUNTED AS AN ADDITIONAL, SPURIOUS "CLOSED LOST."

Mark caught this live testing — a Lead (John Wellington) with a real,
genuine ClosedWon Appointment was showing up in the Region/Portfolio
Lost breakdowns too. Confirmed serious immediately, not minimised.

ROOT CAUSE: the previous entry's fix (and, it turned out, five
PRE-EXISTING report queries elsewhere in this same file) all assumed
Lead.pipelineStatus = 'Closed' meant "closed at the call stage, no
appointment ever booked." That assumption was wrong, proven wrong by
reading appointmentService.js directly: once ANY Appointment reaches
ClosedWon or ClosedLost and nothing else is left open for that Lead,
the Lead's own pipelineStatus gets set to 'Closed' too — for BOTH
outcomes equally, not just losses. A Lead whose appointment WON still
ends up with pipelineStatus = 'Closed'. The "no-appointment" branches
had no way to tell the two cases apart, so every Lead whose real
appointment had already closed — win or lose — was counted a second
time as a phantom "Lost, no appointment."

THIS BUG PREDATES THE PREVIOUS ENTRY'S FIX. Found the exact same flawed
condition in FIVE other places while searching the file properly this
time (a full grep for the pattern, not a single spot-check) — the
Dashboard pipeline overview (its own comment already flagged this exact
imprecision, unresolved until now), getLeadsBySourceReport,
getLeadsByPortfolioReport (a separate, pre-existing standalone report,
not the one touched two entries ago), and the Won-vs-Lost function's own
top-level Overall count and Lead Source breakdown. All five were wrong
before this session touched anything — this session's own Region/
Portfolio addition just extended an already-broken pattern rather than
introducing a new one from nothing. Worth being honest about the
verification gap that let it through: before shipping the Region/
Portfolio fix, only ONE invariant was checked (that a Lead reaching
'Closed' via the call-outcome path can't later book an appointment) —
correct, but too narrow. It didn't rule out the OTHER path that also
sets pipelineStatus = 'Closed', because that path was never searched
for. A full grep across the file for every place setting this status
would have caught it before shipping; a single spot-check didn't.

FIXED — all seven occurrences, one consistent condition added
everywhere: AND NOT EXISTS (SELECT 1 FROM Appointment ax WHERE
ax.leadId = l.id). Unambiguous regardless of why pipelineStatus happens
to say 'Closed' — checks directly whether the Lead has ever had an
Appointment at all, not what its own status field currently claims.

PROVEN WITH REAL DATA, NOT JUST READ: seeded a Lead exactly matching
Wellington's real situation (pipelineStatus = 'Closed', a genuine
ClosedWon Appointment) alongside one exactly matching Kaveer's (same
pipelineStatus, genuinely zero Appointments) and ran all three versions
side by side against real Postgres — the appointment-scoped query, the
FIXED no-appointment query, and the OLD buggy query kept unmodified for
comparison. The old query reproduced Mark's exact symptom precisely:
ClosedLost = 2 (both leads, Wellington wrongly included). The fixed
query correctly returns ClosedLost = 1 (Kaveer only). Re-verified
specifically for the Region breakdown too, the one in Mark's own
screenshot — Wellington no longer appears on the Lost side at all.

VERIFICATION: node --check clean, ESM import smoke test clean, npm run
build clean, 48/48 vitest, no regressions.

FOLLOW-UP AGREED WITH MARK: once this delivery is applied and verified,
move to deliberate seed data rather than continuing to layer fixes onto
the accumulated ad-hoc test records from this extended testing session
— not a substitute for this fix, a separate step after it.

BREAKDOWNS MISSED LEADS CLOSED WITHOUT AN APPOINTMENT, FIXED.

Mark noticed "By Region · Lost" and "By Portfolio · Lost" both showed
"No losses this period" while the Overall KPI card correctly showed
Lost: 1, and asked whether it was a data-capture gap. It wasn't — traced
to a genuine structural bug, confirmed by reading the actual queries,
not assumed:

ROOT CAUSE: the top-level Overall Lost count (closedLostCount, sourced
from `pipeline`) counts TWO different things as "Closed Lost" — a real
Appointment reaching ClosedLost, AND a Lead whose pipelineStatus went
straight to 'Closed' via a WrongNumber/NotInterested call outcome
(computeLeadStatus, leadStatusService.js), never having booked an
Appointment at all. The Region and Portfolio breakdown queries only
ever scanned the Appointment table — a Lead closed the second way is
structurally invisible to both, even though it's correctly counted in
the Overall total. Ruled out a simpler "region field just wasn't set"
explanation using the UI's own behaviour: the existing COALESCE(a.region,
'Not captured') already handles a captured-Appointment-with-no-region
case by showing a "Not captured" bucket — an empty breakdown specifically
only happens when the row isn't in the Appointment-scoped result set at
all, which is what Mark's screenshot actually showed.

Confirmed no double-counting risk before writing anything: computeLeadStatus's
own TERMINAL_STATUSES makes 'AppointmentScheduled' and 'Closed' mutually
exclusive — a Lead reaching 'Closed' this way can never also go on to
book and later close an Appointment, so adding a "no-appointment" branch
to these queries cannot double-count a Lead that already has a real
closed Appointment.

Worth noting the codebase already got this right once: the Leads-by-
Source breakdown (same file) already merges in an equivalent
srcNoApptClosedRows query for the identical situation. Region and
Portfolio were just never given the same treatment when built.

FIXED — Region: added regionNoApptRows, a Lead-scoped query mirroring
srcNoApptClosedRows's pattern exactly, grouped by Lead.region (COALESCE
to 'Not captured') rather than Appointment.region — there's no
Appointment row for this branch, and Lead.region is the field
Appointment.region is itself copied from at booking time anyway
(schema.postgres.sql's own comment on that column).

FIXED — Portfolio: this one had a genuine design question first
(flagged to Mark before touching it, not decided unilaterally) — an
appointment-less Lead was never linked to a portfolio via
AppointmentPortfolio, but may still carry portfolio INTEREST via the
separate LeadPortfolio table (captured independent of ever booking
anything). Used a LEFT JOIN through LeadPortfolio so a Lead with no
portfolio interest falls into "Not captured," and a Lead with MULTIPLE
portfolio interests fans out to contribute to each one — a deliberate
extension of the exact same fan-out behaviour portClosedCountRows
already has for real closed appointments spanning multiple portfolios
(COUNT(DISTINCT a.id), GROUP BY p.name), not a new inconsistency.

BUG CAUGHT DURING THE BUILD, BEFORE DELIVERY: the Portfolio fix's first
draft referenced lossReasonParams for its query parameters — that
variable isn't actually defined until later in the function (line 1662
vs. the new query at line ~1615), which would have thrown a
ReferenceError at runtime. Caught by checking the actual line numbers
of both definitions, not assumed from proximity in the diff. Fixed by
using portParams instead — already in scope one line earlier, identical
shape.

VERIFICATION: node --check and ESM import smoke test clean on
reportService.js, npm run build clean, 48/48 vitest, no regressions.
Both new queries run verbatim through the real @name-to-positional
rewriting logic against real Postgres, seeded with three Leads matching
the actual scenarios (closed-without-appointment + region captured;
closed-without-appointment + two portfolio interests + no region; and a
control Lead still InProgress, to confirm it's correctly excluded from
both breakdowns). Every result matched expectation exactly: region
breakdown correctly split Gauteng/Not captured; portfolio breakdown
correctly fanned out across both of the two-portfolio Lead's interests
plus a Not captured entry for the single-portfolio-less Lead, with the
breakdown's total (3) correctly exceeding the raw lost-lead count (2) by
exactly the expected fan-out amount — matching the pre-existing,
accepted AppointmentPortfolio precedent, not a new form of
inconsistency.

MARK'S LIVE TESTING AFTER A SUCCESSFUL ERASE, BOTH FIXED. Not bugs in
the sense of broken code — the erasure itself worked correctly — but
genuine gaps in what the workflow did afterward.

GAP 1 — SAR STUCK AT INPROGRESS AFTER A SUCCESSFUL ERASURE. Previously,
executeSarDeletion() always only auto-transitioned Received -> InProgress
(reusing markInProgressOnFirstExport, mirroring the Export flow), for
BOTH outcomes, requiring a manual "Fulfilled" click regardless. Mark's
question ("should this not be Fulfilled?") exposed a real design gap,
not just a missing convenience: the two outcomes genuinely deserve
DIFFERENT treatment, not the same one applied uniformly.
  - Erased: nothing further is pending on this Lead — the data is
    genuinely gone. Auto-jumps straight to Fulfilled now (Received rank
    0 -> Fulfilled rank 2 is a valid forward move per updateSarStatus()'s
    own rank check, verified against real Postgres, including that
    fulfilledAt/fulfilledById now get populated correctly — they never
    were before, since the request never actually reached Fulfilled).
  - Restricted: deliberately UNCHANGED, still only reaches InProgress.
    The record isn't gone — it's retained under a live FAIS obligation,
    pending a future scheduled purge that isn't built yet (logged
    separately as a follow-up). Auto-marking a still-fully-intact,
    still-retained record "Fulfilled" would misrepresent to anyone
    checking later whether the deletion was actually completed — this
    is a compliance-accuracy point, not just a UI nicety, so the
    distinction was worth getting right rather than picking the simpler
    "always auto-fulfil" option.

GAP 2 — EXPORT JSON/CSV STILL AVAILABLE AFTER A DELETION REQUEST HAD
EXECUTED. Confirmed in the code the buttons rendered unconditionally
for every request, regardless of type or state. Deliberately did NOT
just hide Export for every Deletion-type request, though — a not-yet-
executed Deletion request has a real, legitimate reason to want Export
available: a pre-erasure snapshot for the organisation's own records,
since once eraseLeadPII() runs there is no way to recover what was
held. So Export now hides specifically once a Deletion request has
already executed (Erased OR Restricted), not for Deletion requests as a
category:
  - Erased: exporting afterward would return a Lead literally named
    "[Erased]" with everything else nulled — not a real snapshot of
    anything, just noise.
  - Restricted: the PII is still intact, but POPIA s14(6) restriction
    means "stop processing" — pulling a full export is itself a form of
    processing this Lead was just locked out of, so allowing it would
    work against the point of the restriction.
Implementation: hoisted the existing "has this deletion executed"
lookup (previously computed inline inside the outcome-panel IIFE) up to
where sarLocked is already computed once per row, as a new
sarDeletionOutcome value, and reused it in both places rather than
duplicating the audit-lookup logic. Genuinely needed as its own signal,
not reducible to sarLocked alone — sarLocked now catches Erased
(post-Gap-1-fix, since Erased auto-fulfils), but Restricted stays
InProgress and sarLocked would miss it entirely.

VERIFICATION: node --check and ESM import smoke test clean on
sarService.js, npm run build clean (validates the AppAdmin.jsx JSX
changes), 48/48 vitest, no regressions. The Received -> Fulfilled status
jump verified against real Postgres using the actual updateSarStatus()
UPDATE statement run through the real @name-to-positional rewriting
logic (same discipline as the previous entry's hotfix, not hand-
substituted literals) — confirmed status, fulfilledAt, and
fulfilledById all land correctly.

FIXED. Mark hit this live testing the erasure feature after applying
both prior deliveries correctly — genuine production bug, not a
deployment-ordering issue this time.

Error: "db.js: query references @erased but no matching parameter was
supplied", thrown from anonymiseLeadRow() (leadService.js), inside
eraseLeadPII(), inside executeSarDeletion() (sarService.js). Root cause
found by reading db.js's toPositional() directly, not guessed: it
rewrites @name placeholders with a single regex pass over the WHOLE raw
query text (query.replace(/@(\w+)/g, ...)) — no awareness of SQL
string-literal boundaries. anonymiseLeadRow()'s email column was set via
`CONCAT('erased-', id::text, '@erased.invalid')` — the literal
'@erased.invalid' string contains the substring '@erased', which the
regex can't distinguish from a real parameter reference. No "erased" key
existed in the params object, so it threw.

REPRODUCED EXACTLY, NOT JUST THEORISED: copied toPositional() verbatim
into an isolated test and ran it against the old SQL — produced the
identical error message character-for-character, confirming root cause
with certainty before touching anything.

FIXED: the erased-email value is now built in JavaScript
(`erased-${leadId}@erased.invalid`) and bound as a proper @erasedEmail
parameter, rather than constructed with a literal '@' anywhere in the
raw SQL text — the only reliable fix given how the rewriter works, not
a one-off patch for this specific string. Swept the rest of api-lib/
for the same pattern (a literal '@' inside a SQL string literal,
outside an intended @paramName) — this was the only occurrence.

TESTING GAP THIS EXPOSED, WORTH RECORDING HONESTLY: when eraseLeadPII()
was originally built and verified against real Postgres, that
verification ran the SQL with literal values hand-substituted in via
psql — it never actually exercised db.js's own @name-to-positional
rewriting logic, because that requires a live Neon connection this
sandbox can't reach. The SQL's LOGIC was genuinely tested; the
MECHANICAL process of how the app actually assembles the query at
runtime was not, and that's exactly where this bug lived. Closed that
gap this time: copied toPositional() verbatim and ran the fixed SQL
through it for real, then executed the resulting positional query
($1/$2/$3) against real Postgres via a direct pg client — as close to
the actual production path as achievable without Neon itself. Row
result confirmed correct: firstName '[Erased]', lastName empty, email
correctly synthesised, existingCover/medicalAid both null, deletedAt
and erasedAt both set.

VERIFICATION: node --check clean, ESM import smoke test clean (both
leadService.js and sarService.js, which imports from it), npm run build
clean, 48/48 vitest, no regressions.

Reported against the deployed SAR/Deletion feature from the 20 Aug
sessions below, with screenshots.

BUG 1 — LEAD SEARCH: full name ("Kaveer Singh") returned zero results,
a partial name ("Kaveer") found the lead. Root cause confirmed by
reading listLeads()'s WHERE clause directly, not guessed: the search
only ever compared the term against firstName and lastName SEPARATELY
— "Kaveer Singh" (with a space) can never be a substring of "Kaveer"
alone or "Singh" alone, so a two-word search matched nothing. Fixed by
adding a fourth OR branch comparing against the concatenated
firstName || ' ' || lastName, alongside the existing three (not
replacing them — a single-word or email-fragment search still needs to
keep working). Verified against real Postgres with the exact reported
case plus three regression checks (partial name, lastname-only, email
fragment) — all four returned the correct row count. This is the same
`search` parameter behind both the general Leads list page and the SAR
form's "Find the Lead" box (leadsApi.list()) — one fix closes it
everywhere this search box appears, not just in Data Requests.

BUG 2 — 400 ON FIRST DELETION-REQUEST ATTEMPT: Mark's screenshot showed
the failing request in Vercel's Logs panel, but "No logs found for this
request" — nothing to trace. Read handleSarRequestsCollection()
directly: the ONLY 400 source on this route is CreateSarRequestSchema.
safeParse() failing — there is no other validation or business-logic
400 anywhere in that handler. Most likely specific cause, well-
evidenced rather than certain: the requestor-email field is
type="email", which looks like it enforces format, but this form (like
every other form in this app) submits via a button onClick, not a
native <form onSubmit> — so the browser's native email constraint
checking never actually fires. The old client-side guard only checked
`.trim()` (non-empty), while the server's Zod schema requires
`.email()` (valid format) — a genuine gap between what the button's
disabled state allowed through and what the server actually required.
A malformed address would pass the client check, reach the server, and
get rejected with a 400 — matching exactly "first attempt failed,
retry (presumably corrected) succeeded."
Two fixes, addressing both the specific bug and the general complaint
("not sure how to trace the error"):
  - AppAdmin.jsx: new isValidEmail() helper (a practical format check,
    deliberately matching Zod's .email() strictness rather than
    building something stricter than the server enforces), now gating
    both the Log Request button's disabled state and handleSarCreate()'s
    guard clause. A malformed email can no longer be submitted at all.
  - sarHandlers.js: the safeParse failure branch now calls console.warn
    with the actual field(s) and reason from parsed.error.flatten()
    before returning the 400. Previously this branch returned before
    ever reaching the catch block's console.error, so a validation
    failure was genuinely invisible in Vercel's Logs panel — exactly
    what Mark ran into. Any future 400 on this route, from any field,
    is now traceable without needing to reverse-engineer it from a
    screenshot.
Worth telling Mark directly, not just noting here: the on-screen error
banner on the SAR form (sarError, rendered via s.errorBox) was already
wired to show the specific field+reason via formatErrorBody() — which
already correctly unpacks Zod's fieldErrors shape into a readable
message. He likely did see something like "requestorEmail: Invalid
email" in the moment; it just wasn't anywhere he could go back and find
after the fact, which the console.warn now fixes going forward.

VERIFICATION: npm run build clean, 48/48 vitest, no regressions.
node --check clean on both touched backend files (AppAdmin.jsx is JSX —
validated via the production build instead, which compiled clean).
isValidEmail() tested against 9 cases (valid addresses, no-@, no-TLD,
empty, whitespace-only, plus-tags, subdomains) — all correct, including
the two malformed shapes ("kaveer", "kaveer@chartres") that would have
slipped past the old check specifically. Search fix verified against
real Postgres with the exact reported input plus three regression
cases, not just read.

REBUILT AND REPO DOCUMENT STRUCTURE ESTABLISHED. Mark asked for the
Technical Specification updated with POPIA/FAIS content, then clarified
it was a document Claude built in a past session (9-11 Aug 2026, v1.0,
19 pages, 6 diagrams) that never reached this repo or project
knowledge — found via conversation_search, confirmed genuinely absent
from a fresh GitHub hydration. Not recoverable (lived only in that
session's now-closed sandbox) and, separately, already ten days stale
regardless (SAR, the erasure feature, KMS, F1/F3 all postdate it) — so
rebuilt fresh (v2.0) rather than attempting to patch a version that no
longer existed anywhere accessible.

Diagrams (6, same count as v1.0): extracted 32 tables and 75 foreign-
key relationships programmatically from the current schema.postgres.sql,
same rigor the original build used, not approximated. All Mermaid
(erDiagram \u00d7 4, flowchart, sequenceDiagram), rendered via mmdc per the
solution-architecture skill. One flagged deviation: that skill specifies
Draw.io XML with UML stencils for the component/deployment diagram — no
Draw.io renderer was available in this build environment, so Mermaid
flowchart notation was used instead and stated plainly in the
document's own Document Control section, not silently substituted.

REAL BUG FOUND AND FIXED DURING THE BUILD, WORTH RECORDING: every
embedded diagram initially rendered as a tiny, unreadable sliver.
Traced to a single line — a document-wide default paragraph style
(spacing.line = 276, meant for body-text line height) was being applied
to image-containing paragraphs too, and LibreOffice's renderer clips an
inline image's paragraph to that line height instead of letting it grow
to fit the image, unlike Word's more forgiving behaviour. Isolated with
a minimal one-image test case before touching the real document, to
confirm root cause rather than guessing. Fixed by moving that spacing
into the body-text helper specifically rather than the document-wide
default. Same "verified against real output before delivery" discipline
this project already applies to SQL — applied here to a rendering
pipeline instead.

Also fixed: a duplicate consecutive PageBreak left over from an earlier
edit, which produced one wasted blank page between Document Control and
the Table of Contents. And: replaced a dynamic Word TOC field with a
static section list after confirming (via LibreOffice's headless
conversion) that the dynamic field renders blank unless a real Word
session explicitly updates it — correctness across whatever Mark
actually opens this in was judged more valuable than a clickable,
auto-updating list.

REPO STRUCTURE: Mark separately pointed out the User Guide and
GlobalAdmin Guide were in the same situation as the Technical
Specification — built by Claude, never actually in the GitHub repo,
living only in project knowledge. Confirmed via fresh hydration. Both
now added, alongside the new Technical Specification, under a proper
docs/ structure:
  docs/technical/MedBroker_Technical_Specification.docx (new)
  docs/guides/MedBroker-User-Guide.docx
  docs/guides/MedBroker-GlobalAdmin-Guide.docx
  docs/security/MedBroker_Security_Code_Review_Findings.docx (already
    in repo from an earlier delivery this session, unchanged, not
    re-copied)

FLAGGED, NOT FIXED THIS SESSION: both MedBroker-User-Guide.docx and
MedBroker-GlobalAdmin-Guide.docx are plain UTF-8 text saved with a
.docx extension, not real OOXML packages — the exact same defect the
Security Findings document had before it was corrected earlier this
session. Committed to the repo as-is per Mark's literal request (repo
inclusion), not silently propagated without mention — this needs the
same docx-js rebuild treatment the Security Findings document already
got, as a follow-up, not attempted in this already-large session.

SESSION 20 AUG 2026 (CONTINUED, SECOND ROUND) — F1/F3 SECURITY FIXES
APPLIED, at Mark's explicit request ("I want these resolved"). Same
session as the two entries below.

F3 — BROWSER SECURITY HEADERS: CLOSED. vercel.json now sets CSP, HSTS,
X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-
Policy on every route. Checked the actual build output (dist/index.html)
and every external-navigation path before writing the CSP, not assumed
from a generic template: style-src needs 'unsafe-inline' (this app
styles almost entirely via React's inline style={{}} prop — thousands
of call sites, no build-time CSP-nonce system to do it properly);
Paystack/Stripe checkout is a window.location.href full-page redirect,
not a form POST or iframe, so no CSP directive touches it; Entra SSO
uses loginPopup() (a real popup window, grepped msalAuth.js — no
acquireTokenSilent/hidden-iframe anywhere), which frame-src doesn't
govern. Full reasoning in Project_Context_Vercel.md §12.
CAUGHT BEFORE IT SHIPPED: first draft embedded the CSP reasoning as
fake "//"-prefixed keys inside the vercel.json headers rule object —
JSON has no comment syntax, and Vercel validates vercel.json against a
strict schema; unrecognised keys in a headers rule risk a deploy-time
validation failure. Caught by re-reading the file, not by testing
against a real Vercel deploy (couldn't, in this sandbox) — fixed to
clean, schema-valid JSON, with the reasoning moved to Project_Context_
Vercel.md where every other config decision's reasoning already lives.

F1 — FIELD-LEVEL ENCRYPTION EXTENDED: CLOSED. medicalAid, medicalAid
Provider, existingCover, currentInsurer, policies now field-level
encrypted (migration 036), same envelope scheme idNumber already uses.
Investigated blast radius before touching anything: grepped every SQL
use of these five fields across api-lib — confirmed none are ever
filtered/sorted/grouped on (reportService.js's hits were unrelated
English text, not the columns), so no searchable-encryption workaround
was needed, unlike idNumber's blind-index hash.
Touched: encryption.js (new encryptBoolean/decryptBoolean — no
encrypted-boolean column type exists, so booleans are encrypted as
'true'/'false' text; deliberately NOT Boolean(str) on decrypt, which
would silently coerce the literal text 'false' to true), leadService.js
(listLeads/getLeadById/createLead/UPDATE_LEAD_COLUMNS/updateLead/
eraseLeadPII's anonymiser), appointmentService.js (the Lead-join query
in getAppointmentById), sarService.js (compileSubjectData), dataExport
Service.js (the bulk export). sarHandlers.js needed zero changes —
confirmed it only ever reads from compileSubjectData's already-
decrypted output, never a raw column.
listLeads() DROPS these fields entirely rather than decrypting them —
checked LeadList.jsx first (grepped for the field names, found
nothing rendered), so this was pure unused cost being fetched on every
list page load. Same "not exposed on the list view" treatment idNumber
already had.
Export (dataExportService.js): decrypted, NOT masked, unlike idNumber.
idNumber's masking is specifically about a unique government
identifier's bulk-correlation risk; a boolean or "which medical aid"
doesn't carry that same risk tier, and this export already legitimately
showed these fields in plaintext before — F1 closes the at-rest gap,
it doesn't change export policy.
Old plaintext columns kept, not dropped (same "deprecated, unused
going forward" pattern as Lead.portfolioId elsewhere) — scripts/
backfill-encrypt-lead-fields.js (new) migrates any existing plaintext
data into the encrypted columns and nulls the old ones per row, in one
UPDATE so a row is never left half-migrated if interrupted. Not run
automatically — see that script's own header for why and how to run it.

REAL BUG FOUND WHILE TRACING F1's BLAST RADIUS, UNRELATED TO F1 ITSELF:
Lead.currentInsurer has had a working input on LeadDetail.jsx (sends a
value on every save) since that page was built, but the field was
never added to CreateLeadShape (models/lead.js) — Zod silently strips
unknown keys, so the value never reached the service layer, on any
Lead, ever, from day one. Confirmed root cause by checking UPDATE_LEAD_
COLUMNS (no currentInsurer key), createLead()'s INSERT (no
currentInsurer column), and the Zod shape itself (no currentInsurer
field) — all three independently confirmed the same gap, not assumed
from one. Fixed alongside F1 since every function that needed
encrypting it also needed to actually be able to save it — encrypting
a field that couldn't be persisted in the first place would have been
functionally meaningless. Also added to the bulk export
(dataExportService.js), which never included it before for the same
reason.

VERIFICATION: fresh npm install carried over from the F3 build, clean
npm run build, 48/48 vitest. node --check clean on all ten touched
backend files (including the new backfill script). ESM import smoke
test clean on all — confirmed no circular-import issue. grepped for any
remaining raw-SQL reference to the five old plaintext column names
anywhere in api-lib/ after the edits — zero hits, confirmed nothing
missed.
encrypt()/decrypt() themselves could not be exercised live in this
sandbox — they call getFlagMeta() (a DB read, to check security.
kmsEncryption.enabled) internally, and db.js's neon() HTTP driver
cannot reach a local Postgres instance the way a raw TCP client could
(this is a pre-existing constraint of this codebase's architecture, not
something this session introduced — idNumber's own encrypt()/decrypt()
has always had this same untestable-in-isolation property). What WAS
verified live against real local Postgres: migration 036's idempotency
(ran twice cleanly, learned from migration 035's mistake last session —
correct pg_constraint lowercase comparison used from the start this
time) and the backfill script's exact SQL shape (SELECT WHERE clause
correctly caught only rows with old plaintext data and correctly
skipped a row with none; simulated UPDATE correctly nulled all five old
columns and populated all five new ones in one statement; re-running
the same SELECT afterward correctly returned zero rows). The
encryptBoolean/decryptBoolean wrapper logic itself was code-reviewed
rather than live-tested for the same DB-dependency reason, but is
low-complexity (seven lines each) and directly mirrors the already-
proven encrypt()/decrypt() pattern.

DOCUMENTATION: Project_Context_Vercel.md §12/§12a updated — Gap 2
(F1) and the browser-headers control (F3) both marked closed with
resolution detail, backlog renumbered. MedBroker_Security_Code_Review_
Findings.docx NOT regenerated this entry — see the next entry below,
which does.

SESSION 20 AUG 2026 (CONTINUED) — FAIS HOLD / POPIA ERASURE FEATURE
BUILT, same session as the architecture/compliance review below (which
was documentation-only at the time it was written — this entry
supersedes that "no code touched" framing for the session as a whole,
not a correction to what was true when it was written). Closes backlog
item 0a from the review below. Fresh hydration was already in place
from earlier this session; no re-hydration needed since nothing external
changed underneath it.

DESIGN DECISION CONFIRMED WITH MARK BEFORE BUILDING: true erasure
anonymises the Lead row in place rather than a hard/cascading delete —
preserves referential integrity (CallAttempt/Appointment/Task/AuditLog
rows pointing at the Lead) and historical reporting counts, which a
physical DELETE would have silently corrupted. De-identification is an
explicitly valid alternative to physical deletion under POPIA s14(4),
not a compromise.

BUILT:
  - Migration 035 (frontend/db/migrations/035_popia_erasure_and_restriction.sql)
    — SubjectAccessRequest.requestType (Access|Deletion), Lead.erasedAt/
    restrictedAt/retentionExpiresAt, a partial index for the future
    purge query. schema.postgres.sql updated to match.
  - leadService.js — getLeadRetentionPosition() (FAIS obligation check:
    live if the Lead has a ClosedWon/ClosedLost Appointment, retention
    running 5 years from the most recent one; ReturnedToLeads correctly
    excluded, matching the standing "never counts as Lost" rule),
    eraseLeadPII() (true erasure — anonymise in place), restrictLead()
    (restrict-and-retain — deletedAt set, PII left intact).
  - sarService.js — executeSarDeletion() orchestrates the above,
    reusing the existing markInProgressOnFirstExport auto-transition and
    the established single-audit-write convention (§131).
  - sarHandlers.js / leads-router.js — new POST /api/leads/sar-requests/
    :id/execute-deletion, Admin/GlobalAdmin gated.
  - src/services/api.js — sarApi.executeDeletion().
  - AppAdmin.jsx — request-type toggle on the Data Requests create form,
    a Type column on the list, and an "Execute Deletion" control on the
    expanded row for Deletion-type requests (window.confirm-gated,
    matching every other irreversible action in this app), showing the
    Erased/Restricted outcome — sourced from the just-returned API
    result, falling back to the already-loaded audit trail so the
    outcome still displays correctly after a reload.
  - AuditLogList.jsx — SarDeletionExecuted formatting, distinguishing
    the two outcomes in the message text (mirrors the existing
    LeadAssigned/AppointmentBrokerAssigned pattern).

BUG CAUGHT AND FIXED DURING BUILD, BEFORE DELIVERY — worth naming, same
"verified delivery over claimed delivery" principle as every other entry
in this file: migration 035's own idempotency guard for the new CHECK
constraint compared pg_constraint.conname against the CamelCase spelling
used in the ADD CONSTRAINT statement. Postgres folds unquoted identifiers
to lowercase, so that comparison never matched — the guard was silently
a no-op, and running the migration a second time (the exact real-world
scenario it exists to protect against) failed on a duplicate constraint.
Caught by actually running it twice against a real local Postgres 16
instance, not by re-reading the SQL — the same standing rule
("Raw SQL in template literals must be verified... AND tested against a
real Postgres instance") catching a real bug it was written to catch.

VERIFICATION: fresh npm install, clean npm run build, 48/48 vitest (no
regressions). node --check clean on all five touched backend files.
ESM import smoke test on all five — confirmed no circular-dependency
issue from sarService.js's new import of leadService.js (a real risk
worth checking explicitly, not assumed safe) — failures without
DATABASE_URL set are pre-existing db.js behaviour, confirmed against an
untouched file failing identically, not something this delivery
introduced. Full logic exercise against real Postgres with three seeded
Leads (no service rendered / ClosedWon 2 years ago / ReturnedToLeads
only) — every outcome matched the design exactly, including the
ReturnedToLeads exclusion, which was the trickiest part of the rule.
Scratch test file removed before packaging, not shipped.

NOT BUILT THIS SESSION, logged as follow-ups: the scheduled purge job
once a restriction's retentionExpiresAt lapses (currently marks-only);
CallAttempt/MeetingAttempt free-text redaction (deliberately not
attempted — see Project_Context_Vercel.md §12a for why). MedBroker_
Security_Code_Review_Findings.docx's F2/6.4 status is now stale
(still shows Open) — not regenerated this session, flagged for the next
one that touches security docs.

SESSION 20 AUG 2026 — ARCHITECTURE/COMPLIANCE/SECURITY REVIEW, DOCUMENTATION
ONLY, NO CODE TOUCHED. Requested by Mark ahead of the client parking this
project until Feb 2027 — wants the record straight before the gap.
Fresh GitHub hydration, no npm build/vitest run (nothing in the app
itself changed this session, so the standing pre-delivery verification
step doesn't apply — noted explicitly rather than silently skipped).
Three deliverables:
  1. Project_Context_Vercel.md §12a (new) — POPIA/FAIS compliance gap
     analysis. Confirmed both gaps Mark suspected going in are real
     (Lead erasure is soft-delete only; field-level encryption is
     idNumber-only) and corrected one stale line in the existing §12
     (SAR endpoint marked "not built" — it is, verified by reading
     sarService.js/sarHandlers.js/models/sar.js directly). Full detail
     in that section; eight items added to the OUTSTANDING list above
     (item 0) and the backlog.
  2. MedBroker_Security_Code_Review_Findings.docx — new dated addendum,
     Vercel-only scope sweep. The Jun 2026 content is Azure-era (Bicep,
     Key Vault, Front Door/Cloudflare) and mostly no longer applicable
     to this build; superseded findings marked as such rather than
     deleted, for the historical record. Also corrected: the file on
     GitHub was plain UTF-8 text saved with a .docx extension, not a
     real OOXML package (despite §5.4 of its own prior content claiming
     otherwise) — this delivery is a genuine .docx.
  3. White-label feasibility answered in chat, not written to a file —
     cosmetic rebrand (logo mark, page title, login/SSO copy, email
     footer) is low-effort and low-risk; repurposing the data model for
     a non-medical lead-management vertical is a materially bigger
     decision, kept separate rather than conflated.

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

0. COMPLIANCE-CRITICAL, added 20 Aug 2026 (full gap analysis in
   Project_Context_Vercel.md §12a) — close before commercial go-live,
   client is picking this project back up Feb 2027:
   a. CLOSED 20 Aug 2026, same session — Lead erasure/anonymisation
      capability built: true-erasure and restrict-and-retain paths
      (leadService.js), orchestrated via a new requestType
      (Access|Deletion) on the SAR model and executeSarDeletion()
      (sarService.js). Full detail in the session entry above. Still
      open as a separate follow-up: the scheduled purge job for a
      restricted Lead once its retentionExpiresAt actually lapses —
      see Project_Context_Vercel.md §12a's "STILL OPEN" note.
   b. CLOSED — confirmed by the 22 Aug 2026 independent security audit
      (§192) against the live code: field-level encryption already
      extended to all five (medicalAid/medicalAidProvider/
      existingCover/currentInsurer/policies), not idNumber alone. This
      line had gone stale; the extension itself happened in an earlier
      session (§12a) without this OUTSTANDING entry being updated to
      match — corrected here rather than left contradicting the code.
   c. CLOSED — same audit, same correction: vercel.json already carries
      a full header set (CSP, HSTS, X-Content-Type-Options,
      X-Frame-Options, Referrer-Policy, Permissions-Policy), not just
      Cache-Control on /assets. This line was equally stale.
   d. Confirm Neon's provisioning region; cross-border transfer
      assessment if not South Africa.
   e. Operator agreements: Vercel, Neon, Paystack, SMTP provider.
   f. Breach-notification process; Information Officer registered.
   g. Formal per-record-type data retention schedule (FAIS 5-year floor
      vs. POPIA's default "no longer than necessary").
   h. Enable security.kmsEncryption.enabled + configure AWS KMS for the
      actual client production deployment before go-live — currently
      off by default; DEMO_ENCRYPTION_KEY (unrotated env var) is what's
      actually protecting idNumber until this is switched on.
   i. Reformat MedBroker-User-Guide.docx and MedBroker-GlobalAdmin-
      Guide.docx as genuine OOXML .docx files — both are currently
      plain UTF-8 text saved with a .docx extension (same defect
      MedBroker_Security_Code_Review_Findings.docx had before it was
      corrected earlier this session). Not compliance-critical, but a
      real quality gap now that both are checked into the repo proper.

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

CLOSED, 19 Aug 2026 (third fix, same day): phantom "Lead details
updated" Change Log entries — a real, pre-existing gap this session's
Appointment editing feature exposed, not something it broke. Root
cause, verified by reading the actual live code rather than trusting
memory: leadHandlers.js's PUT /leads/:id handler has ALWAYS written a
'LeadUpdated' audit entry unconditionally after every successful save —
no `if (changeDetail has keys)` guard, ever. Harmless while the only
caller was LeadDetail.jsx's own edit form, where saving with nothing
touched is a rare edge case. AppointmentDetail.jsx's new "Edit Details"
(this same day) made it common instead of rare: that form always
resends the FULL current Lead-owned field set on every save, not just
whatever was actually touched — so saving a pure Appointment field like
the meeting link, with zero Lead fields changed, produced a genuine
write with an empty changeDetail every single time. describeEntry()
(AuditLogList.jsx) falls back to the bare "Lead details updated" label
for exactly this shape of entry — {} is truthy, so its own `if
(!detail) return label` check never caught it either.

CORRECTION TO THIS SAME DAY'S EARLIER ENTRY: the note claiming the new
Appointment PUT handler's audit-diffing "mirrors leadHandlers.js's
exact pattern" was based on a misreading of code read several turns
earlier, not on checking the actual file at the time. The new handler
was built correctly (gated) from the start; the OLD handler was the one
missing the gate, not the other way around. Fixed now: leadHandlers.js
gets the same `if (Object.keys(changeDetail).length > 0)` guard the
Appointment handler already had. Also checked and ruled out a second
hypothesis before settling on this one: idNumber's encryption is
genuinely non-deterministic (random IV per call, confirmed by reading
encryption.js), so re-encrypting an unchanged idNumber on every save
does waste a redundant encrypt() call — but the AUDIT DIFF compares
already-decrypted plaintext on both sides (existing.idNumber, via
getLeadById()'s own decryption), never the raw ciphertext, so that
specific mechanism was never actually the cause here. Left alone —
real but harmless inefficiency, not a bug, not worth added complexity
to avoid.

VERIFICATION: build clean, 48/48 vitest, gate logic smoke-tested
directly against the exact empty-changeDetail scenario from Mark's
screenshot. Diffed clean against a fresh hydration — exactly 1 file
touched (leadHandlers.js). Delivered as
medbroker-leadupdated-gate-fix-20260819-1735.zip.

CLOSED, 19 Aug 2026 (later same day): two bugs Mark caught live-testing
the Appointment editing feature above, both in the Change Log path
specifically — root-caused and fixed from a single screenshot, no
guessing.

BUG 1 — AppointmentUpdated entries showed no diff at all, just the bare
action name, while the LeadUpdated entry right below it (same save,
same timestamp) correctly showed "idNumber: — → ...; WhatsApp: — → ...".
Root cause: AuditLogList.jsx's describeEntry() has a dedicated
formatting case for 'LeadUpdated' (turns changeDetail into "field: from
→ to" text) but had no equivalent case for 'AppointmentUpdated' — a
brand new action name this same day's earlier session introduced. The
WRITE side was correct from the start (verified against real Postgres
before that delivery); this was purely a display gap in a completely
different file, the same shape of miss as the FLAG_META gap earlier
this session — new backend capability shipped, a corresponding frontend
piece in an unrelated file never got the matching update. Fixed: added
the 'AppointmentUpdated' case to describeEntry(), identical formatting
to 'LeadUpdated', plus FIELD_LABELS entries for the six Appointment-
native field names (Current insurer, Meeting type, Appointment date/
time, Address, Meeting link) so they render as words, not raw
camelCase.

BUG 2 — found proactively while fixing Bug 1, before it could produce a
confusing phantom diff once the display actually started working:
firstAppointmentTime is a Postgres TIME column, confirmed this session
(and earlier this same day, independently) to come back from the driver
as "14:30:00" (HH:mm:ss, a plain string) — but a native <input
type="time"> with no step attribute normalises to "14:30" (HH:mm). The
existing diff comparison used strict !==, so this field would have
registered as "changed" on literally every save touching any Appointment
field, even when the time was never touched — exactly the same class of
bug dateOfBirth already needed Date-vs-string handling for. Fixed:
both sides sliced to HH:mm before comparing, in the diff loop
specifically (the write itself was never the problem — Postgres accepts
"14:30" as TIME input and pads it internally, so nothing needed to
change there).

VERIFICATION: both fixes smoke-tested directly (the describeEntry
formatting logic run standalone against a real changeDetail shape; the
time-normalisation confirmed "14:30:00".slice(0,5) === "14:30".slice(0,5)).
npm run build clean, 48/48 vitest. Diffed clean against a fresh
hydration — exactly 2 files touched (appointmentHandlers.js,
AuditLogList.jsx). Delivered as
medbroker-changelog-fixes-20260819-1715.zip.

CLOSED, 19 Aug 2026: Supervisor+/Admin+ can now edit Appointment detail
fields — both Lead-owned (Personal Details/Education/Insurance
Information, plus Occupation/Mobile on the pre-existing Lead Details
card) and Appointment-native (current insurer, meeting type, date/time,
address/link) — with a merged, from/to Change Log covering both.

ROOT CAUSE THIS WAS BUILT ON: the Lead "converted and locked" rule
(leadHandlers.js) blocked ALL Lead edits — via LeadDetail.jsx AND the
read-only Appointment cards built 18 Aug — the moment a Lead had an
Appointment, which is essentially always. Not a bug in the 18 Aug work;
a pre-existing gap that work exposed. Fixed by relaxing the lock at the
ROLE level, not the field level: Supervisor/Admin/GlobalAdmin can now
edit through PUT /leads/:id while converted; Agent stays fully blocked,
matching Leads' own existing edit boundary. Safe because
UPDATE_LEAD_COLUMNS never contained pipeline fields (pipelineStatus,
assignedAgentId) to begin with — only ever detail fields — so there was
no pipeline-state field for a relaxed lock to accidentally expose.

APPOINTMENT-NATIVE FIELDS: brand new capability — updateAppointment() +
UPDATE_APPOINTMENT_COLUMNS (appointmentService.js), UpdateAppointmentSchema
(models/appointment.js), and PUT support added to the existing
handleAppointmentById (appointmentHandlers.js) — completing an endpoint
the frontend already half-expected: appointmentsApi.update() existed in
api.js calling PUT /appointments/:id, but nothing implemented it
server-side and nothing called it, confirmed by grep before building
anything new. Editable: currentInsurer, meetingType,
firstAppointmentDate/Time, firstAppointmentAddress, virtualMeetingLink.
Deliberately NOT region, despite living in the same table — explicitly
documented in schema.postgres.sql as a denormalised copy of Lead.region
captured at booking time for claim-model query performance, not an
independently editable fact; exposing it here would silently desync it
from the Lead it was copied from. Also NOT status/broker/agent/
portfolio — already governed by dedicated assign/reassign/claim/return
endpoints; a generic editor touching them here would open a second,
uncoordinated path to the same state changes.

CHANGE LOG, MERGED: new listAuditLogForAppointment(appointmentId, leadId)
(auditService.js) mirrors the existing listAuditLogForLead's UNION ALL
pattern exactly. Needed because editing the Lead-owned fields from the
Appointment page correctly writes an AuditLog entry with
entityType='Lead' (same leadHandlers.js code path LeadDetail.jsx's own
edits already use, completely unchanged) — but someone looking at the
Change Log ON the Appointment page, having just made that edit from
that exact page, should see it reflected right there. Verified against
real Postgres: inserted one Appointment-entity entry and one Lead-entity
entry, confirmed the merged query returns both, correctly sorted.
From/to diffing on the Appointment side mirrors leadHandlers.js's
pattern exactly, including the same Date-vs-string normalising
dateOfBirth already needed.

TWO BUGS CAUGHT AND FIXED DURING BUILD, BEFORE SHIPPING — worth naming
since this is exactly the "verified delivery over claimed delivery"
principle earning its keep, not just a formality:
  1. updateAppointment() initially checked a `result.rowCount` that
     doesn't exist on this codebase's executeQuery() return shape (it
     returns the row array directly, matching Neon's driver — a `pg`
     package assumption bleeding in from the earlier real-Postgres
     testing setup in this same session, not this codebase's actual
     shape). Fixed to match updateLead()'s own existing convention.
  2. The audit-diffing code in the new PUT handler initially referenced
     appt.firstDate/appt.address — AppointmentDetail.jsx's OWN
     client-side state aliases, not what the service layer actually
     returns. getAppointmentById() returns the real column names
     (firstAppointmentDate, firstAppointmentAddress) directly. Caught
     by checking APPOINTMENT_SELECT's actual column aliases rather than
     assuming the frontend's naming applied server-side too.

VERIFICATION: npm run build clean, 48/48 vitest, all five touched
backend files node --check clean. Real Postgres 16 (same instance from
earlier this session): ran the exact UPDATE_APPOINTMENT_COLUMNS-shaped
query against real seed data (confirmed all six fields wrote and read
back correctly); confirmed the target Lead was genuinely in
AppointmentScheduled status before running the exact UPDATE_LEAD_COLUMNS
query the relaxed lock allows through; ran the merged audit-log UNION
ALL query with real inserted entries of both entity types. Diffed
clean against a fresh hydration — exactly 6 files touched
(appointmentHandlers.js, leadHandlers.js, models/appointment.js,
appointmentService.js, auditService.js, AppointmentDetail.jsx), nothing
else. Delivered as medbroker-appointment-editing-20260819-1330.zip.

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
    Secure hardcoded on.
  - Browser security headers: CORRECTED 22 Aug 2026 (§192) — this line
    previously read "No CSP header configured," which was stale by the
    time it was written, not current fact. vercel.json carries a full
    set (CSP, HSTS, X-Content-Type-Options, X-Frame-Options,
    Referrer-Policy, Permissions-Policy) — confirmed directly against
    the live file during the independent security audit, not assumed
    from this note's own prior wording.
  - CSV/formula injection (F-02, §192): CLOSED. toCsv() now escapes a
    leading =/+/-/@ before writing a cell (api-lib/http/helpers.js).
  - Broker claim-pool PII exposure (F-01, §192): CLOSED.
    listAvailableToClaim() no longer returns Lead email/mobile pre-claim
    (api-lib/services/appointmentService.js).
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

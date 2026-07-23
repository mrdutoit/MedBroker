MedBroker Lead Management System — Project Context
====================================================
Last updated: 23 July 2026 (session 3)
Purpose: Continuity file — load in a new chat to restore full project context.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STANDING BUILD PATTERN — confirmed 22 July 2026, updated same day (merge)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

medbroker-v1/frontend/ (React/Vite frontend + Vercel Functions backend in
api/ + backend service code in api-lib/, one combined Vercel project,
Neon Postgres, local email/password auth) is the STANDARD, PERMANENT
codebase for building and demoing MedBroker — not a temporary detour, not
a one-off proof of concept. All new backend/frontend work happens here by
default, including everything beyond this point in this document unless
stated otherwise. This was api-vercel/ as a second, separate Vercel
project until 22 July 2026, when Mark asked to collapse both into one
application — see Status.md §24.2 for the full migration detail. Route
handlers live in frontend/api/, backend service/model code lives in
frontend/api-lib/ (deliberately not inside src/, which is React-only).

medbroker-v1/api/ (Azure Functions + Azure SQL + Entra ID External) is the
PRODUCTION TARGET — touched only when a real, paying customer needs an
actual deployment. At that point, frontend/api-lib/'s code gets ported
across (schema DDL + query dialect conversion, HTTP adapter swap,
encryption.js back to the Key Vault version — see frontend/VERCEL_NOTES.md
§8 for the full lift-and-shift breakdown, kept current as the codebase
grows). Until a customer is signed, api/ is not touched, and it is
expected to fall increasingly behind in the meantime — that's
intentional, not drift to be worried about.

Practical implication for a fresh session: if asked to "build the
Appointments API" or similar with no further qualifier, build it in
frontend/api/ + frontend/api-lib/ against Postgres, following the same
pattern (service file + Vercel route handlers + real-Postgres
verification) already used for Leads, local auth, Users, and Flags. Only
touch medbroker-v1/api/ when the request is explicitly about a real
customer's production deployment.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. WHAT THE SYSTEM IS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A bespoke web application for a South African medical insurance brokerage.
Replaces a Google Sheets operation. Sells personal, practice, and malpractice
insurance products to medical doctors.

~50 employees: 5 call centre agents, ~45 brokers.
Regulated under FAIS Act, FSCA oversight, and POPIA (medical professionals'
data carries elevated obligations).
Target hosting: under R2,000/month.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. TECHNOLOGY STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Profile: A — Microsoft Azure

  Frontend       React (Vite)                Vercel (preview) → Azure SWA (production)
  Backend API    Node.js — Azure Functions v4 Consumption plan
  Database       Azure SQL Serverless         southafricanorth (Johannesburg)
  Auth           Azure Entra ID External      SSO via M365 — lazy-loaded MSAL
  File storage   Azure Blob Storage
  IaC            Bicep
  CI/CD          GitHub Actions → Azure
  Calendar       Microsoft 365 Graph API      Replaces Calendly (not required)

Repository: GitHub → mrdutoit/MedBroker (public)
            Folder structure: medbroker-v1/ at root
Live preview: Vercel — Root Directory set to medbroker-v1/frontend
Auth bypass:  Active in preview mode — role switcher <select> in sidebar footer


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ROLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GlobalAdmin   Internal staff only — never assigned to customers.
              Sees Feature Flags page. Configures feature flags per deployment.

Admin         Customer-facing administrator. Manages users, portfolios,
              subscriptions, system settings. Assigns/reassigns leads and
              appointments. Cannot see Feature Flags.

Supervisor    Manages direct reports (agents and brokers). Sees only leads
              and appointments belonging to their direct reports.
              Can assign/reassign leads and appointments.

Agent         Calls leads, logs call outcomes, books appointments.
              Sees only leads assigned to them. Never sees Appointments list.

Broker        Attends appointments. Records meeting outcomes.
              In assign model: sees appointments assigned to them.
              In claim model: sees My Appointments tab + Available to Claim tab.

Preview role switcher: GlobalAdmin / Admin / Supervisor / Agent (T. Molefe) /
                       Broker (S. van der Berg)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. DATA MODEL — KEY ENTITIES AND STATUS SETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Schema version: 2.4 (infra/schema.sql)
  (v2.3 added Lead.idNumberHash blind index; v2.4 added the Organisation table
   and organisationId on tenant-owned tables. Both additive — the status sets
   below are unchanged. See §11 for security and §12 for the tenancy model.)

LEAD pipeline statuses (5 values — unchanged; display label only changed
23 Jul 2026, see below):
  Unassigned            Imported, not yet assigned to an agent
  Assigned              Agent assigned, not yet called
  InProgress            Agent is actively working the lead
  AppointmentScheduled  Agent booked an appointment — displayed as
                         "Converted" (STATUS_META label, tokens.js).
                         Lead stays in the Leads list (23 Jul 2026, Mark's
                         request — see §34); LeadList.jsx's Active tab
                         (default view) excludes it, All/Converted tabs
                         show it.
  Closed                Pipeline ended — outcome lives on the Appointment

Lead status transitions are SERVER-SIDE only (leadStatusService.js).
Clients never write status directly.

Call outcome → Lead status transition:
  NoAnswer            → No change
  Voicemail left      → InProgress (if Unassigned or Assigned)
  Wrong number        → Closed
  Callback requested  → InProgress (if Unassigned or Assigned)
  Client contacted    → InProgress (if Unassigned or Assigned)
                        + shows Book Appointment button inline in Log Call modal
  Not interested      → Closed
  (Book Appointment)  → AppointmentScheduled (separate action, not a call outcome)

APPOINTMENT statuses (6 values — 6th added 23 Jul 2026, §36):
  Unassigned       Appointment booked, no broker assigned yet
  Assigned         Broker allocated (assign model) or claimed (claim model)
  InProgress       Meetings underway
  ClosedWon        Customer signed
  ClosedLost       Customer did not sign
  ReturnedToLeads  Sent back to the leads queue via Return to Leads (Admin/
                   Supervisor). NOT a sales outcome — deliberately kept
                   separate from ClosedWon/ClosedLost so win/loss reporting
                   isn't skewed by administrative returns. Locked, same as
                   ClosedWon/ClosedLost, but distinguishable from them.
                   Until 23 Jul 2026 Return to Leads deleted the Appointment
                   row outright instead of setting this status — changed on
                   Mark's explicit request: deleting lost the history that
                   matters for metrics (how many appointments get returned,
                   by whom, why), and orphaned the AppointmentReturnedToLeads
                   audit entry the handler already wrote (it referenced a
                   row that no longer existed, so was practically
                   unreachable even though the AuditLog row itself survived).

AppointmentList.jsx/LeadList.jsx both also expose composite Active
(Unassigned+Assigned+InProgress) and Closed quick-filter tabs, Active as
the default view on both — added 23 Jul 2026, see §34. Closed on the
Appointment side is ClosedWon+ClosedLost+ReturnedToLeads (§36) — "not
currently being worked", broader than just won/lost; ReturnedToLeads also
has its own individual filter chip for when the distinction matters. Closed
on the Lead side is just the single literal Closed status.

Appointment status driven by:
  Saving outcome with customerSigned = true  → ClosedWon
  Saving outcome with customerSigned = false → ClosedLost
  First meeting marked Seen                  → InProgress
  Return to Leads action (Admin/Supervisor)  → ReturnedToLeads (§36)
Once ClosedWon/ClosedLost/ReturnedToLeads, the appointment is LOCKED —
saveOutcome() rejects further edits server-side, not just a client-side
disable (§34, extended to cover ReturnedToLeads in §36 — a real gap found
while making this change: the server-side check had only covered
ClosedWon/ClosedLost). AppointmentDetail.jsx's isLocked covers all three;
the narrower isClosed (won/lost only) still exists for outcome-specific
messaging that shouldn't apply to an administrative return.
Meeting-level lock is separate and finer-grained: a meeting locks once
explicitly marked Held (status 'Seen', via the dedicated "Mark Meeting
Held" button — not just any recorded status). Only a Held meeting unlocks
the next one; Rescheduled/Cancelled keep the current meeting's Date field
open for a new date instead (§34). Meeting date/status/notes edits that
aren't a Held action save via a separate "Save Changes" button per meeting
(§35) — Mark Meeting Held alone wasn't a complete save path.

FLAGGED, NOT FIXED (§36): assignBroker()/reassignAppointment() in
appointmentService.js have no server-side status guard at all — reassigning
a locked appointment today relies entirely on the frontend's canReassign
check. Pre-existing, not introduced by §36; worth a look, out of scope for
what was asked at the time.

LEAD ↔ APPOINTMENT CARDINALITY — ONE-TO-MANY (changed 23 Jul 2026, §35):
  Previously hard 1:1, enforced by a UNIQUE constraint on Appointment.leadId
  at the database level, not just by convention — confirmed against the
  actual schema before this was changed, not assumed from app logic. Now
  a Lead can have several Appointment rows over its lifetime: a failed
  attempt (ClosedLost), a Reopen, a second attempt, and so on. Full history
  is preserved — nothing is deleted or archived when a lead is reopened.
  "The" appointment shown on Lead Detail / linked via View in Appointments
  is always the MOST RECENT one by createdAt (leadService.getLeadById()'s
  LATERAL join) — not "the" appointment, since there may now be several.
  AppointmentList.jsx needed no change for this: it already lists
  Appointment rows, not leads deduplicated by lead, so a lead with two
  appointments over time correctly shows as two separate rows there.

LEAD LOCK / REOPEN (added 23 Jul 2026, §35):
  A Lead is locked from editing (PUT /api/leads/:id rejected server-side,
  not just hidden client-side) whenever pipelineStatus === 'AppointmentScheduled'
  ("Converted"). This covers three real states with different implications,
  distinguished on LeadDetail.jsx's conversion banner by the current
  appointment's own status:
    - Still active (Unassigned/Assigned/InProgress on the Appointment) —
      locked while the deal is being worked.
    - ClosedWon — locked PERMANENTLY. No reopen path; the deal is done.
    - ClosedLost — locked until an Admin/Supervisor explicitly clicks
      "Reopen Lead". Mark's explicit choice: MANUAL, not automatic on
      outcome save — a person decides to re-engage.
  Reopening (leadService.reopenLead(), PUT /api/leads/:id/reopen) reverts
  pipelineStatus to InProgress — same assignedAgentId, no reassignment
  needed. Book Appointment becomes available again immediately since that
  button is already gated on Assigned/InProgress — no separate change was
  needed there. createAppointment() also needed no change: it already sets
  pipelineStatus = 'AppointmentScheduled' unconditionally on every booking,
  which correctly re-locks a reopened lead the instant a second appointment
  is booked.
  Distinct from the older Return to Leads action (Admin/Supervisor,
  Appointment Detail): Return to Leads LOCKS the Appointment (status
  ReturnedToLeads, §36 — previously deleted it, changed on Mark's request)
  and resets the Lead to Unassigned with no agent — for "this shouldn't
  have been booked". Reopen Lead keeps the Appointment as ClosedLost and
  moves the Lead to InProgress with the same agent — for "this attempt
  legitimately fell through, try again". Both now preserve full history;
  they remain two different tools for two different situations, not a
  redundant pair.

PORTFOLIO ON LEAD (added 23 Jul 2026, §35):
  Previously portfolio only existed on Appointment (portfolioId NOT NULL,
  set at booking). Lead.portfolioId is now a separate, nullable column
  (migration 004) — a Lead can exist long before anyone knows which
  portfolio it belongs to, so this is opt-in capture, not required. Editable
  via the same field-edit mechanism as Contact/Education/Insurance
  (leadService.updateLead(), resolving the name to portfolioId via
  resolvePortfolioId() — exported from appointmentService.js and reused,
  not duplicated). Book Appointment pre-fills its own portfolio field from
  the Lead's if set, but it's still changeable at booking time, not locked.

LEAD → APPOINTMENT CONVERSION (Salesforce Lead→Opportunity pattern):
  - Book Appointment on Lead Detail creates Appointment child record (leadId FK)
  - Sets Lead.pipelineStatus = 'AppointmentScheduled' (displayed "Converted")
  - Lead stays in the Leads list (changed 23 Jul 2026 — previously force-
    excluded via LeadList's EXCLUDED_STATUSES; now only the Active tab
    excludes it, matching Mark's request that it remain visible/traceable)
  - Lead is NOT deleted — remains as source of truth for contact details
  - Agent field on Appointment is resolved server-side from the Lead's own
    assignedAgentId at booking time (changed 23 Jul 2026 — previously the
    booking user's own JWT claim, which put the appointment under a
    Supervisor/Admin's name instead of the agent who owns the lead when
    they booked on the agent's behalf; see §34). Still read-only in the
    UI, only correctable via Reassign (Admin/Supervisor), not directly
    editable — just no longer wrong at creation time.
  - Return to Leads: Admin/Supervisor can return an appointment to Unassigned
    queue via "Return to Leads" button on Appointment Detail. Changed 23 Jul
    2026 (§36, Mark's request): previously a genuine delete of the
    Appointment row (no archive column existed); now sets
    status = 'ReturnedToLeads' and LOCKS it instead — preserved as history
    for metrics and audit rather than deleted. Still distinct from Reopen
    Lead above: Return to Leads says "this shouldn't have been booked" (Lead
    resets to Unassigned, no agent); Reopen says "this attempt legitimately
    fell through, keep the record, try again" (Lead goes to InProgress, same
    agent). Two different tools, deliberately not merged into one.
  - Auto-return: Azure Function (autoReturnLeads.js) runs daily at 05:00 UTC

GET LEAD BY ID — fields worth knowing about (leadService.getLeadById(),
last touched §37): joins "User" for agentName (added §37 — missing
entirely before, unlike listLeads() which always had it), LEFT JOIN
LATERAL for the most recent Appointment (appointmentId/appointmentStatus,
§35 — see LEAD ↔ APPOINTMENT CARDINALITY above), LEFT JOIN Portfolio for
portfolio (§35). Any page rendering a single Lead should read from this
function, not assume listLeads()'s field set matches — they've drifted
before (agentName) and could again.

FETCH ERROR HANDLING PATTERN (established via a real bug, §37): every
page using useFetch() for its primary data should destructure and handle
`error`, not just `data`/`loading` — LeadDetail.jsx didn't for its main
lead fetch, so a failing request rendered a silently blank page instead
of any indication something had gone wrong. currentStatus-style `?? 'Unassigned'`
fallbacks compound this failure mode: they exist for a reasonable reason
(a sensible default while state is genuinely loading) but can make a
totally broken page look like a real, if sparse, record if nothing is
checking whether the fetch actually succeeded first. When adding a new
page or a new primary fetch, check for this deliberately rather than
assuming the loading-only pattern used elsewhere is sufficient.

LEAD EDITING (added 23 Jul 2026, see §34):
  PUT /api/leads/:id — leadService.updateLead(), validated by
  UpdateLeadSchema (already existed in models/lead.js, unused until now).
  Editable by: the Lead's own assignedAgentId, Supervisor (if that agent
  is a direct report), or Admin/GlobalAdmin — same boundary as GET
  /api/leads/:id, enforced server-side in leadHandlers.js. Column scope is
  UPDATE_LEAD_COLUMNS in leadService.js — deliberately narrower than the
  full UpdateLeadSchema surface: exactly the fields LeadDetail.jsx renders
  as Field rows (Contact Details/Education/Insurance/Portfolio). title/
  firstName/lastName (page header) and idNumber (not shown on this page)
  are on the schema but not yet wired to a UI field or a DB column in this
  function — extending later is additive. portfolio (added §35) is NOT in
  UPDATE_LEAD_COLUMNS — it needs name-to-ID resolution via
  resolvePortfolioId(), handled as its own branch in updateLead() rather
  than the generic column loop, which assumes a direct value.
  LOCKED (added §35) whenever pipelineStatus === 'AppointmentScheduled' —
  the request is rejected with 400 before UpdateLeadSchema even runs. See
  LEAD LOCK / REOPEN above for the full state machine.

AUDIT LOG READ PATH (added 23 Jul 2026, see §34):
  AuditLog table existed and was written to since the A4 security fix
  (18 Jun) but nothing ever read it back. auditService.listAuditLog
  (entityType, entityId) is now the one read function both entities use —
  GET /api/leads/:id/audit and GET /api/appointments/:id/audit, same
  read-access boundary as the entity's own GET. Frontend:
  src/components/AuditLogList.jsx, shared by both LeadDetail.jsx (Audit
  Log) and AppointmentDetail.jsx (Change Log) — alternating row shading.
  changeDetail on assign/reassign entries still stores raw agentId/
  brokerId UUIDs (pre-existing, not changed this pass) — those log lines
  show the action label only, not a resolved name. LeadUpdated entries do
  diff properly (field: {from, to}) since that write path was built
  alongside the read path.

DATE/TIME DISPLAY (added 23 Jul 2026, see §34):
  src/utils/dateFormat.js — formatDate() (DD-MM-YYYY), formatTime()
  (HH:mm), getUserTimezone()/setUserTimezone() (sessionStorage key
  mb_timezone, default Africa/Johannesburg). Settings.jsx has a Date &
  Time card with a timezone <select> using this. Scope: only
  AppointmentDetail.jsx's First Appointment Date uses the formatter so
  far (the field that was showing a raw ISO timestamp) — not yet swept
  across every date display in the app. Do this via the shared utility
  when it comes up, not a page-local format() call.


  NoAnswer, Voicemail, WrongNumber, CallbackRequested,
  ClientContacted, NotInterested, AppointmentScheduled

SystemConfig (configurable in AppAdmin → System Settings):
  brokerFreeAppointmentsPerMonth  default 10
  leadAutoUnassignMonths          default 6
  maxCallAttempts                 default 3


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. FEATURE FLAG SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Managed via: Admin → Feature Flags (GlobalAdmin only)
Database table: FeatureFlag (flagKey, label, valueType, value, tier, isPhase2)
Frontend: FlagContext.jsx — fetches from GET /api/flags on startup,
          falls back to DEFAULT_FLAGS in preview mode

Tier: Core (vary per customer — review at onboarding)
  auth.sso.enabled                boolean  false
  auth.sso.provider               enum     none | microsoft | google   [sub: auth.sso.enabled = true]
  appointments.claimModel         enum     assign | claim
  appointments.tokens.paymentProvider enum none | stripe               [sub: claimModel = 'claim']
  events.enabled                  boolean  true
  leads.autoUnassign.enabled      boolean  true
  tasks.enabled                   boolean  false   ← Core (page is built, off by default)

  NOTE (18 Jun): appointments.tokens.enabled has been removed as a flag. The
  token economy is a feature of claim mode, not a separately configurable toggle.
  FlagContext.jsx DEFAULT_FLAGS and FeatureFlags.jsx FLAG_META no longer carry
  it. AppointmentList.jsx derives tokensEnabled = (claimModel === 'claim') directly.
  feature-flags.sql updated to remove the seed row and add a DELETE for re-run
  safety. tasks.enabled also corrected in the SQL from Phase2 to Core.
  The [sub: …] annotations above indicate dependsOn relationships enforced in the
  FeatureFlags.jsx UI — sub-settings are hidden unless their parent condition is met.

Tier: Operational (can be changed at any time)
  leads.importCsv.enabled         boolean  true
  leads.importSubscription.enabled boolean true
  leads.occupationFilter.enabled  boolean  true
  reports.agentDetail.enabled     boolean  true
  reports.brokerDetail.enabled    boolean  true
  notifications.email.enabled     boolean  false
  appointments.thirdMeeting.enabled boolean false

Tier: Phase2 (features NOT YET BUILT — toggling has no effect)
  broker.tokenIncentives.enabled  boolean  false
  popia.subjectAccessRequest.enabled boolean false

NOTE: tasks.enabled is Core, NOT Phase2. The Tasks page is fully built and
functional. Phase2 is reserved only for features that do not yet exist in code.

CLAIM MODEL flag (appointments.claimModel):
  'assign' — Admin/Supervisor assigns brokers to appointments.
             Assign and Reassign buttons visible in Appointments list.
  'claim'  — Brokers self-select from Available to Claim queue.
             Assign and Reassign buttons hidden.
             Broker sees two tabs: My Appointments | Available to Claim.
             Claiming is immediate (Option A — no admin confirmation step):
             clicking Claim sets the appointment to Assigned and moves it
             directly into My Appointments. The Appointment Detail page is
             where all substantive workflow happens from that point.
             In production: PUT /api/appointments/:id/claim sets
             assignedBrokerId + status = Assigned; no intermediate status.
  To test: switch to GlobalAdmin → Feature Flags → change to 'claim' → Save
           → switch to Broker → Appointments page shows two tabs.

TOKEN MODEL (active when claimModel = 'claim'):
  Monthly allocation set in AppAdmin → System Settings → Broker Token Allocation
  (this card only appears when claimModel = 'claim').
  Brokers receive brokerFreeAppointmentsPerMonth free claims per month.
  Additional claims cost tokens; buy via BuyTokensModal.
  Stripe integration gated behind appointments.tokens.paymentProvider = 'stripe'
  (this sub-setting appears only in claim mode).
  appointments.tokens.enabled no longer exists as a flag — claim mode implies
  the token economy. AppointmentList.jsx derives tokensEnabled from claimModel.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. PORTFOLIOS AND PRODUCTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Discovery (fixed GUID: A0000000-0001-0000-0000-000000000001)
  Products: Life Insurance, Income Protection, Disability Cover,
            Severe Illness Cover, Education Cover, Retirement Annuity,
            Medical Aid, Gap Cover, Vitality, Bank

Money and Medicine (fixed GUID: A0000000-0001-0000-0000-000000000002)
  Products: Unit Trust, TFSA, Endowment Policy

Agents: assigned to one portfolio
Brokers: can have both portfolios (via UserPortfolio junction table)
Broker products are a subset of their portfolio's product list

Medical Subscriptions (lead import sources, seeded):
  MedLeads SA — Monthly Bundle   (C0000000-0001-0000-0000-000000000001)
  Healthwise Doctor Database      (C0000000-0001-0000-0000-000000000002)
  SA Medical Register — Q2 2026  (C0000000-0001-0000-0000-000000000003)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

medbroker-v1/
├── frontend/
│   ├── src/
│   │   ├── context/
│   │   │   ├── RoleContext.jsx         Exports: useRole(), PERSONAS, PRODUCTS_BY_PORTFOLIO
│   │   │   │                           Does NOT export RoleContext object directly
│   │   │   ├── FlagContext.jsx         Exports: FlagProvider, useFlags()
│   │   │   │                           flag() helper, DEFAULT_FLAGS
│   │   │   └── ThemeContext.jsx        NEW — Exports: ThemeProvider, useTheme(), THEMES
│   │   │                               Sets data-theme on <html>; persists to sessionStorage
│   │   │                               DEFAULT_THEME = 'linen'. THEMES = 4 design systems.
│   │   ├── hooks/
│   │   │   ├── useFetch.js
│   │   │   └── useWindowSize.js        isMobile/isTablet/isDesktop breakpoints
│   │   ├── styles/
│   │   │   └── tokens.js               Named exports only — export const s = { ... }
│   │   │                               Also exports: colors, radius, shadow, type,
│   │   │                               CHART_PALETTE, APPT_STATUS_META, STATUS_META,
│   │   │                               MEETING_STATUS_META, PORTFOLIO_META.
│   │   │                               CRITICAL: colour values resolve to CSS variables
│   │   │                               (e.g. colors.primary = 'var(--accent)') so the
│   │   │                               whole token layer reskins on theme switch.
│   │   │                               NO default export. tableCard uses overflow:'auto'
│   │   ├── services/
│   │   │   └── api.js                  Preview-safe; MSAL lazy-loaded; null in preview
│   │   ├── components/
│   │   │   └── Logo.jsx                NEW — MB angular duotone mark (blue→cyan gradient).
│   │   │                               Props: size (default 30), withWordmark, dark.
│   │   │                               Fixed brand colours (not theme-adaptive).
│   │   ├── assets/
│   │   │   ├── logo-mark.svg           NEW — standalone SVG mark for external use
│   │   │   └── favicon.svg             NEW — mark on gradient tile, 32×32
│   │   ├── pages/
│   │   │   ├── LeadList.jsx
│   │   │   ├── LeadDetail.jsx
│   │   │   ├── LeadImport.jsx
│   │   │   ├── AppointmentList.jsx     AssignBrokerModal (agent editable on Reassign only, 23 Jul 2026)
│   │   │   ├── AppointmentDetail.jsx   ReassignBrokerModal (agent editable, 23 Jul 2026)
│   │   │   │                           ReturnToLeadsModal (red destructive confirm)
│   │   │   ├── Reports.jsx             Recharts charts (BarChart, ResponsiveContainer)
│   │   │   ├── Settings.jsx            NEW — theme picker (live), profile, avatar stub
│   │   │   │                           Route: /settings — all roles
│   │   │   ├── AgentDetail.jsx
│   │   │   ├── BrokerDetail.jsx
│   │   │   ├── UserAdmin.jsx
│   │   │   ├── AppAdmin.jsx
│   │   │   ├── FeatureFlags.jsx        GlobalAdmin only. tasks.enabled in Core tier.
│   │   │   ├── SingleSignOn.jsx
│   │   │   ├── Notifications.jsx
│   │   │   ├── Tasks.jsx               Built + functional. Gated by tasks.enabled flag.
│   │   │   ├── EventList.jsx
│   │   │   └── EventDetail.jsx
│   │   ├── themes.css                  NEW — 4 design systems on CSS-variable contract:
│   │   │                               [data-theme="midnight|ember|terra|linen"]
│   │   │                               Variables: --bg --panel --ink --mut --line
│   │   │                               --accent --accent2 --live --limited --danger
│   │   │                               --glow --disp --mesh --grain --gridline
│   │   │                               Atmosphere: grain + grid overlays via body::before/after
│   │   ├── index.css                   Structural resets + a11y (focus rings, scrollbars)
│   │   │                               Cosmetics live in themes.css not here.
│   │   ├── App.jsx                     Responsive nav, <select> role switcher,
│   │   │                               collapsible sidebar, all routes.
│   │   │                               Includes: ThemeProvider wrap, Logo lockup,
│   │   │                               footer theme swatches, /settings route.
│   │   └── main.jsx                    Imports themes.css then index.css (order matters)
│   ├── index.html                      data-theme="linen" (default theme set here to
│   │                                   prevent flash before React loads)
│   ├── vite.config.js
│   ├── vercel.json                     SPA rewrite rule — mandatory
│   └── package.json                    recharts ^2.12.7 added
├── api/
│   └── src/
│       ├── functions/                  Azure Functions v4 HTTP/timer triggers
│       │   ├── leads.js                6 routes: list/get/create/assign/calls/delete.
│       │   │                           Supervisor team-scoped + AuditLog writes (18 Jun)
│       │   ├── eventRegistration.js    event registration endpoint
│       │   └── autoReturnLeads.js      daily timer — getDbClient() is a STUB
│       ├── context/
│       │   └── tenant.js                resolveOrganisationId() — single tenancy
│       │                                chokepoint (returns config.organisationId)
│       ├── services/
│       │   ├── leadStatusService.js    computeLeadStatus + computeAppointmentStatus
│       │   ├── leadService.js          Leads data access (org-scoped reads/writes).
│       │   │                           isDirectReport() + getActiveUserById() (18 Jun)
│       │   ├── brokerMatchingService.js  broker ranking
│       │   ├── db.js                    Azure SQL pool (Managed Identity)
│       │   ├── encryption.js            field-level encryption helper
│       │   ├── auditService.js          NEW (18 Jun) — writeAuditLog() + clientIp()
│       │   └── zohoService.js           Zoho integration
│       ├── middleware/
│       │   └── auth.js                  Entra ID JWT validation (JWKS).
│       │                               Cross-checks User.isActive (18 Jun)
│       ├── models/
│       │   └── lead.js
│       └── config.js                    config.organisationId (ORG_ID env)
│   NOTE: leadStatusService.test.js (28 tests) and
│         leadService.tenant.integration.test.js are in api/src/services/
│         (correct location). Vitest is wired in api/package.json.
│   NOTE: Appointments / Flags / Config / Reports / Users API routes are NOT
│         yet built — see Status.md §4 for the contracts the frontend expects.
├── infra/
│   ├── main.bicep                      IaC
│   ├── parameters/                     dev.json, prod.json
│   ├── schema.sql                      v2.4
│   └── feature-flags.sql              17 seeded flags
├── docs/
│   └── security/
│       └── MedBroker_Security_Code_Review_Findings.docx  NEW (18 Jun) — was
│           project-knowledge content only, not an actual repo file, until
│           this session; commit it to make the repo canonical for this record
├── mobile/                             RegisterScreen.jsx (event registration)
└── DEPLOYMENT.md


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. CRITICAL IMPLEMENTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THEME SYSTEM — how it works:
  themes.css defines four [data-theme="..."] blocks with CSS variables.
  ThemeContext.jsx sets data-theme on <html> when the user switches.
  tokens.js colour values point at these variables (e.g. 'var(--panel)').
  Result: token-driven surfaces reskin instantly on theme switch.
  Default: 'linen' set in both index.html (prevents flash) and ThemeContext.

INLINE COLOUR ANTI-PATTERN — will break non-default themes:
  Never use hardcoded hex in inline style objects. Use CSS variables:
    ✅  color: 'var(--ink)'       ❌  color: '#111827'
    ✅  background: 'var(--panel)' ❌  background: 'white'
    ✅  border: '1px solid var(--line)'  ❌  border: '1px solid #e5e7eb'
    ✅  color: 'var(--accent)'    ❌  color: '#1d4ed8'
  STATUS_META / APPT_STATUS_META chip colours are the intentional exception
  (fixed semantic colours for recognisability across themes).

HOVER ANTI-PATTERN — causes stuck colours on dark themes:
  Never set element.style.background to hardcoded hex in mouse handlers.
    ✅  onMouseEnter={e => e.currentTarget.style.background =
          'color-mix(in srgb, var(--accent) 6%, var(--panel))'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
    ❌  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
        onMouseLeave={e => e.currentTarget.style.background = 'white'}
  Setting '' (empty string) on leave removes the inline style cleanly.

LOGO COMPONENT — import from components/:
  import { Logo } from '../components/Logo.jsx';
  <Logo size={30} />                    // mark only
  <Logo size={34} withWordmark />       // mark + "MedBroker / LEAD MANAGEMENT"
  <Logo size={30} dark />               // brightened variant for dark backgrounds
  Fixed brand colours (#2F4FE0→#17B6C9). Not theme-adaptive by design.

THEMECONTEXT IMPORT:
  import { useTheme, THEMES } from '../context/ThemeContext.jsx';
  const { theme, setTheme, themes } = useTheme();
  THEMES is an array: [{ id, name, mood, swatch:[c1,c2] }, ...]

AVATAR / PROFILE PERSISTENCE:
  Settings.jsx Save Changes button writes displayName and avatarColour to
  sessionStorage (mb_displayName, mb_avatarColour). Resets on browser close.
  Persistent storage across sessions requires the Users API (pending).

COLOR-MIX() IN JSX STYLE OBJECTS — must always be a quoted string:
  CSS function values are not valid JavaScript — they must appear as strings.
  Correct:   background: 'color-mix(in srgb, #15803d 14%, var(--panel))'
  Correct:   border: '1px solid color-mix(in srgb, #15803d 30%, var(--panel))'
  Wrong:     background: color-mix(in srgb, #15803d 14%, var(--panel))
  Wrong:     border: '1px solid 'color-mix(in srgb, #15803d 30%, var(--panel))''
  The third form (nested quotes) is a syntax error esbuild catches at build time.
  Always run npm run build in the sandbox before handing over any modified file.

SELECT ELEMENTS — color required; colorScheme is theme-driven, not inline:
  Browser OS defaults (black text on white) override theme colours on <select>
  without explicit CSS. Every select must have color: 'var(--ink)' — set in
  s.select and s.formInput in tokens.js.
  UPDATED 18 Jun: do not also set colorScheme inline. The original 13 Jun fix
  (colorScheme: 'light dark') let the OS's own light/dark preference choose
  native control rendering instead of MedBroker's selected theme — this is
  what caused the Event Date picker to be invisible on a light theme when the
  OS preference was dark. Corrected fix: color-scheme: light/dark is set per
  [data-theme] block in themes.css instead (an inherited CSS property, so it
  cascades to every native control without per-element styling). Any
  inline-styled select should set color explicitly but must NOT set
  colorScheme (see FeatureFlags.jsx).

QR CODE CONTAINERS — always white background:
  Never let a QR code container inherit the page theme background.
  ISO 18004 requires a white quiet zone. Use background: '#ffffff' hardcoded.
  Example: EventDetail.jsx QR modal.

DETAIL PAGE LAYOUTS — no maxWidth on BrokerDetail / AgentDetail / LeadDetail / AppointmentDetail:
  These pages must expand to full available width, the same as Reports.jsx.
  Never add maxWidth to their outer wrapper divs. (LeadDetail and
  AppointmentDetail fixed 18 Jun — the 13 Jun sweep only covered
  Broker/AgentDetail.)


  tokens.js uses NAMED exports only. There is no default export.
  Correct:  import { s, APPT_STATUS_META } from '../styles/tokens.js';
  Wrong:    import tokens from '../styles/tokens.js';  ← Rollup build failure

TOKENS.JS KEY USAGE — never invent keys:
  Before writing any component, verify exact keys on the s object by reading
  the actual tokens.js file. Do not assume s.colors, s.chip*, s.btnPrimary,
  s.pageTitle, s.fieldRow, or similar keys exist — they do not.
  Use inline styles for anything not in tokens.js.

ROLECONTEXT IMPORT — hook only, not the context object:
  Correct:  import { useRole } from '../context/RoleContext.jsx';
            const { role } = useRole();
  Wrong:    import { RoleContext } from '../context/RoleContext.jsx';
            useContext(RoleContext)  ← RoleContext object is not exported

CONTAINER RESETS — source files disappear between sessions:
  If the source files are not visible in the current session, read them from
  GitHub or ask before reconstructing any shared file from memory. Reconstructing
  from memory produces invented APIs that cause Vercel build failures.

TABLE SCROLL — mandatory on every table:
  <div style={{ ...s.tableCard, overflowX: 'auto' }}>
    <table style={{ ...s.table, minWidth: '700px' }}>
  tokens.js tableCard uses overflow:'auto' NOT overflow:'hidden'

FEATURE FLAG ENUM READING — read flags object directly:
  const claimModel = flags['appointments.claimModel'] ?? 'assign';
  NOT flag('appointments.claimModel') — the helper coerces booleans and
  can cause ambiguity on string enum values.

MSAL — never import at module level:
  const PREVIEW_MODE = !import.meta.env.VITE_CLIENT_ID;
  MSAL lazy-loaded inside getAccessToken() only when VITE_CLIENT_ID is set.

STATUS — never written directly by clients:
  POST /leads/:id/calls → computeLeadStatus() server-side
  POST /appointments/:id/outcome → computeAppointmentStatus()
  PATCH on status field must return HTTP 400.

ASSIGN/REASSIGN MODAL — agent read-only on Assign, editable on Reassign
(changed 23 Jul 2026, Mark's request — see §34):
  On first Assign (AssignBrokerModal, isAssign=true — AppointmentList),
  Agent stays a read-only locked display field — it's set from the Lead's
  assignedAgentId at booking time, not part of this flow. On Reassign
  (both AssignBrokerModal isAssign=false on AppointmentList, and
  ReassignBrokerModal on AppointmentDetail), Agent is now an editable
  <select> alongside Broker — corrects a wrong agent-on-booking without
  needing a schema or backend change; ReassignAppointmentSchema/
  reassignAppointment() already accepted an optional agentId, only the
  UI blocked it until now.

NAV SECTION LABELS — never render when all items below are hidden:
  Wrap both the label div and its NavItems in a single conditional.

GLOBALADMIN — Feature Flags gated as:
  {isGlobalAdmin && <NavItem to="/admin/flags" label="Feature Flags" />}
  Never visible to Admin or any customer-facing role.

ROLE SWITCHER — compact <select> dropdown only:
  Located in sidebar footer amber preview box.
  Never replace with individual buttons per role.

TASKS.ENABLED — Core tier, not Phase2:
  The Tasks page is built. Phase2 is reserved for unbuilt features.

RESPONSIVE:
  Sidebar: collapsible on mobile (<768px), hamburger in top bar
  Pages: padding: isMobile ? '12px' : '24px'
  Grids: gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'

VERCEL DEPLOYMENT:
  Root Directory: medbroker-v1/frontend
  No environment variables needed for preview (mock data mode)
  Production: VITE_API_BASE_URL, VITE_CLIENT_ID, VITE_AUTHORITY


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. MOCK DATA — PREVIEW PERSONAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sandra van der Berg  — Broker (brokerCode 'SB')  — Discovery + M&M, Gauteng
Pieter Joubert       — Broker (brokerCode 'PJ')  — Discovery, Gauteng
Riaan Botha          — Broker (brokerCode 'RB')  — M&M
Thabo Molefe         — Agent  (agent-001)         — Supervisor: Supervisor One
Naledi van Wyk       — Agent                      — Supervisor: Supervisor One
Kabelo Petersen      — Agent
Bongani Ntuli        — Agent
Siphiwe Mahlangu     — Agent (inactive)
Supervisor One       — Supervisor                 — Direct reports: Thabo, Naledi


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. KNOWN DECISIONS AND RATIONALE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Calendly → not required. Calendar availability via Microsoft 365 Graph API.
  m365UserPrincipalName stored on User table for Graph API lookups.
  Brokers ranked by fewest upcoming appointments in matching portfolio/region.

Lead statuses reduced to 5: Won/Lost outcome lives on Appointment (customerSigned),
  not on Lead. Lead only needs to know if the pipeline is open or closed.

AppointmentBooked renamed to AppointmentScheduled throughout (schema v2.2).
  Data migration: UPDATE Lead SET pipelineStatus = 'AppointmentScheduled'
                  WHERE pipelineStatus = 'AppointmentBooked'

UserPortfolio junction table replaces single portfolioId FK on User.
  User.portfolioId retained as convenience column for single-portfolio users.

Supervisor scoping in mock data (preview): leads filtered to Thabo Molefe
  and Naledi van Wyk as Supervisor's direct reports.

autoReturnLeads.js: runs daily, idempotent.
  getDbClient() is a stub — must be implemented with actual DB client.

tasks.enabled in Core tier (not Phase2): The Tasks page (Tasks.jsx) is fully
  built with interactive checkboxes, tabs, due date badges, and metrics.
  It is off by default but immediately functional when enabled.
  Phase2 tier is reserved only for features not yet implemented in code.

ReassignBrokerModal on AppointmentDetail: mirrored AssignBrokerModal
  exactly at the time this was built (18 Jun) — Agent read-only, only
  Broker editable. Superseded 23 Jul 2026: Agent is now also editable here
  (and on AppointmentList's Reassign, not Assign) — see §34 and the
  ASSIGN/REASSIGN MODAL note above.

Dark theme sweep (13 Jun 2026):
  All 15 pages swept for hardcoded light-mode hex. Pattern adopted for badges
  and banners: color-mix(in srgb, <semantic-colour> 14%, var(--panel)) for
  backgrounds, 30% for borders. This produces tinted surfaces that are legible
  on both light and dark panel depths. STATUS_META / APPT_STATUS_META chip
  colours are the intentional exception — fixed semantic colours for cross-theme
  recognisability.

Settings Save Changes (13 Jun 2026):
  Theme applies live with no save step (correct UX — instant preview). Display
  name and avatar colour require explicit Save. Values written to sessionStorage
  until Users API is built. The dirty-state guard prevents accidental saves.

BrokerDetail / AgentDetail layouts (13 Jun 2026):
  maxWidth: '960px' removed. Both pages now use full available width, consistent
  with Reports.jsx at the same navigation level.
  - Reports is gated to Admin/Supervisor/GlobalAdmin (route + nav + in-page
    redirect); Supervisor scoped to direct reports. Frontend authorisation
    only — the report API must re-enforce server-side when built.
  - appointmentsApi gained returnToLeads() and saveOutcome(); both were being
    called by AppointmentDetail but did not exist, so the buttons failed
    silently. Save Outcome now persists via the API and shows error/saving states.
  - Backend is partially built (Leads domain, auth, db, broker matching), not
    absent as an earlier Status.md claimed — see Status.md §4.

Claim model — no admin confirmation step (18 Jun 2026):
  Option A chosen: claiming is immediate. Broker clicks Claim → appointment
  status = Assigned → appears in My Appointments. No ClaimPending status,
  no admin confirmation queue. This is consistent with the existing five-status
  data model and the purpose of the claim model (broker self-service). The
  Appointment Detail page provides the meaningful workflow confirmation (meeting
  tracking, outcome recording). In production: PUT /api/appointments/:id/claim.

Feature flag dependsOn visibility and token flag removal (18 Jun 2026):
  FeatureFlags.jsx now enforces dependsOn metadata — sub-settings are hidden
  when their parent flag condition isn't met. This was always the design intent
  (metadata already existed); it just wasn't wired into the render.
  - auth.sso.provider: hidden unless auth.sso.enabled = true
  - appointments.tokens.paymentProvider: hidden unless claimModel = 'claim'
    (was previously gated on appointments.tokens.enabled, which is now removed)
  - appointments.tokens.enabled removed entirely: claim mode and the token
    economy are the same feature in the MedBroker business model — a separate
    toggle for "claim mode on, but no token economy" serves no real use case.
    AppointmentList.jsx derives tokensEnabled = (claimModel === 'claim') directly.
    feature-flags.sql updated in the same pass: seed row removed from MERGE
    VALUES, explicit DELETE added for re-run safety, and tasks.enabled corrected
    from Phase2/isPhase2=1 to Core/isPhase2=0 (pre-existing inconsistency
    between SQL and frontend — the Tasks page is built and functional).

Frontend UI/UX fixes (18 Jun 2026):
  - LeadDetail / AppointmentDetail joined BrokerDetail/AgentDetail/Reports in
    dropping maxWidth on the outer wrapper — missed in the 13 Jun sweep.
  - Meeting creation flow (AppointmentDetail): Second and Third meetings used
    to render unconditionally (Third just dimmed/disabled when the third-
    meeting flag was off). Redesigned so Second/Third only exist once
    explicitly created via an "+ Add Meeting" button, unlocked once the prior
    meeting's status has been recorded. First is unaffected — it's set at
    booking time and was never the issue. Third's button is gated the same
    way as before on appointments.thirdMeeting.enabled, but now the gate
    hides the feature entirely rather than rendering it disabled.
  - Portfolio pills + duplicate removal: AppointmentDetail's top "status bar"
    (Status + Portfolio + first-appointment summary) was a straight duplicate
    of the Lead Details/Appointment Details cards below it and is gone;
    Portfolio now renders as a pill in Appointment Details only. LeadDetail
    gained an equivalent "Lead Detail" card (Status/Portfolio pills + lead
    source + agent + date created), replacing a smaller status badge that
    used to sit under the lead's name.
  - AppAdmin System Settings: Broker Token Allocation and Lead Auto-Return
    had no flag check at all — both rendered unconditionally regardless of
    the Appointment Workflow setting or whether auto-return was toggled on.
    Now flag-gated on appointments.claimModel === 'claim' and
    leads.autoUnassign.enabled respectively.
  - Theme-aware native controls (root-cause fix, not a per-page patch): the
    13 Jun colorScheme: 'light dark' fix made native control rendering (date
    pickers, <select> chrome) follow the OS's light/dark preference instead
    of MedBroker's selected theme — invisible on a light theme with a dark OS
    preference is exactly that mismatch, first noticed on the Event Date
    field. Corrected by moving color-scheme to themes.css, one declaration
    per [data-theme] block, and removing the inline override from
    tokens.js (s.select, s.formInput) and FeatureFlags.jsx's inline select.
    color-scheme is an inherited CSS property, so this fixes every native
    control across the app from one place rather than per-field.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. SECURITY POSTURE & MANDATORY CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Added 09 June 2026 after a review-method correction. The earlier security pass
was code-led and surfaced code-level issues well (JWT claims, injection,
encryption, query bugs) but under-weighted controls that live OUTSIDE the code.
All reviews now run against the mandatory control checklist in the app-builder
skill (Pre-Handover Review → Security pass), not by code reading alone.

A Web Application Firewall is a BASELINE requirement for MedBroker — it is
internet-facing and processes special personal information (ID numbers, medical
detail) under POPIA. The WAF must front every public surface, not only the QR
registration endpoint. Options: Azure Front Door Premium (managed OWASP +
rate limiting), or a cheaper equivalent — Cloudflare in front of the Azure
origin, or Application Gateway WAF v2 — chosen on cost vs feature need.
DECISION (10 June 2026): Cloudflare Pro in front of the Azure origin (~R400/mo:
OWASP managed ruleset + always-on DDoS + rate limiting), chosen over Front Door
Premium (~R6,000/mo) while keeping SQL Server, Managed Identity and SA residency
on Azure. Lock the origin to Cloudflare; TLS terminates at Cloudflare's global
edge (record as a POPIA transit note).

Controls to confirm BEFORE go-live (none are live exposure yet — the DB is not
deployed and no client data flows; but each must be closed before it does):

  EDGE / TRANSPORT
    ⬜ WAF across all public surfaces (managed ruleset + rate limiting)
    ⬜ DDoS protection at the edge
    ⬜ HTTPS enforced, min TLS 1.2, HSTS
    ⬜ Browser security headers (CSP, frame-ancestors, X-Content-Type-Options,
       Referrer-Policy, Permissions-Policy)

  LOGGING / AUDIT (POPIA/FAIS accountability)
    ⬜ Special PI never written to logs (App Insights scrubbing) — encryption is
       moot if ID/medical data lands in plaintext telemetry
    🟢 Tamper-evident audit trail of who VIEWED and CHANGED special PI — Lead
       create/assign/reassign/delete now write AuditLog (18 Jun); extend to
       Appointments when that API is built

  APPLICATION
    🟢 IDOR swept on Leads — Supervisor team-scoping closed 18 Jun (was the
       most material gap: Supervisor previously had unrestricted org-wide
       access, identical to Admin); re-audit when Appointments/broker access
       is built
    ⬜ Token lifecycle: expiry, refresh, logout/revocation
    ⬜ CSV import hardening: formula injection (= + - @), row/size caps
    ⬜ Bulk-export / report exfiltration limits
    ⬜ Rate limiting on authenticated endpoints (not just the public one)

  CLOUD POSTURE
    🟡 Least-privilege RBAC; Managed Identity scoped (network isolation /
       SQL private endpoint / deny-public unconfirmed)
    ⬜ Backup + geo-redundancy + tested restore

  SUPPLY CHAIN / ASSURANCE
    ⬜ Dependency + secret scanning; SAST/DAST in CI
    ⬜ Penetration test before go-live

  POPIA / THIRD PARTIES
    ⬜ Operator (sub-processor) agreements: Microsoft, Calendly, Zoho (§20–21)
    ⬜ Cross-border transfer assessment for any data processed outside SA
    ⬜ Breach-notification process (§22); Information Officer registered
    🟡 Consent captured; SAR + erasure paths (SAR endpoint still Phase 2)

ALREADY ADDRESSED (09 June backend pass): parameterised queries; Entra JWT
issuer + audience + token-type validation; AES-256-GCM authenticated encryption;
ID-number blind index; public endpoint rate limit + Front Door origin lock;
strict UUID validation; generic error responses; Key Vault + Managed Identity.

UPDATE (10–12 June): full eight-area checklist + fresh code review completed —
report at docs/security/MedBroker_Security_Code_Review_Findings.docx; the live
remediation backlog (fixed-vs-parked, severity-tagged) is in Status.md §5.
Fixed this session (safe, no demo impact): C1 — corrected the @azure/keyvault-keys
dependency that would have crashed encryption at runtime; C3 — SQL admin password
moved to a @secure() Bicep parameter; C9 — CORS prod-excludes localhost, Zoho
calls time-bounded. autoReturnLeads kept as an inert stub with an injection-trap
banner. All larger controls above remain parked for the deployment phase.

UPDATE (18 June): a follow-up Security Architect pass specifically targeting
encryption and access control (requested in response to a general breach/data-
theft concern), reading the actual code in api/src rather than the control
checklist alone. Findings logged as A1-A6 (access control) and E1-E5
(encryption) in docs/security/MedBroker_Security_Code_Review_Findings.docx §5.
A1-A4 fixed in code this session: Supervisor was not scoped to direct reports
on any Lead route (the role's stated security boundary was unenforced — the
most material finding), User.isActive was never checked at the auth layer
(deactivated users kept full access until their Entra token expired), and
nothing wrote to AuditLog despite the table already existing with an
INSERT-only grant. A5/A6/E1/E2/E3/E5 are parked (severity-tagged in Status.md
§4); E4 is a POPIA-sign-off decision, not a code change. Cryptographic design
(AES-256-GCM envelope, Key Vault wrap/unwrap, TLS everywhere) and the DB
least-privilege grant design were both found sound on review — A5 is that the
grants are dormant pending a manual activation step, not that the design itself
is wrong. This document also did not previously exist as a real .docx in the
repo (only as project-knowledge content) — the version now in docs/security/
is a properly packaged file; commit it to close that gap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. TENANCY & DELIVERY MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Decided 12 June 2026. Full internal playbook (pipeline/IaC/repo examples):
docs/delivery/MedBroker_Delivery_MultiTenancy_Playbook.docx.

MODEL: single-tenant, multi-tenant-ready. One product codebase; each customer
runs an isolated instance (own resource group, database, Key Vault, config)
provisioned from one parameterised Bicep template. Customer differences are
expressed through configuration and feature flags — never code forks. Separate
repositories only when the APP is a different product, not per customer. This
keeps clean POPIA isolation and simple offboarding (delete the resource group),
and flexibility to become a product for other brokerages OR stay bespoke.

THREE KEEP-THE-DOOR-OPEN RULES (so a future multi-tenant move is bounded, not a
rebuild) — implemented in schema v2.4 and the data layer:
  1. organisationId on every tenant-owned table (NOT NULL, DEFAULT = the seeded
     default organisation D0000000-0000-0000-0000-000000000001, so single-tenant
     sets nothing). Region + SystemConfig stay global; junctions inherit via FK.
  2. One tenant-resolution chokepoint: api/src/context/tenant.js
     resolveOrganisationId() — returns config.organisationId today; multi-tenant
     later changes ONLY this function. Threaded through leadService,
     eventRegistration, brokerMatchingService.
  3. UUID keys throughout (no merge-collision risk).

Isolation guardrail: leadService.tenant.integration.test.js (currently at the
medbroker-v1/ root — relocate to api/src/services/ with the unit test;
DB-gated; runs in CI/at deployment). Proves cross-org dedup is blocked.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. DESIGN SYSTEM (added 13 June 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FOUR THEMES — ported from html-design-studio skill token contract:
  linen    Light · cool · minimal      (DEFAULT for the app)
  terra    Light · earthy · editorial
  midnight Dark · technical · premium
  ember    Dark · warm · confident

Each theme defines the same CSS variable contract in themes.css, plus a
native color-scheme declaration (added 18 Jun — see §8 SELECT ELEMENTS):
  --bg --bg2 --panel --panel2 --ink --mut --line --glass
  --accent --accent2 --live --limited --na --danger --glow
  --disp (display font) --mesh (background gradient)
  --grain (noise texture opacity) --gridop --gridline (grid overlay)
  color-scheme: light (linen, terra) or dark (midnight, ember) — drives
    native control rendering (date pickers, <select> chrome); inherited,
    so it must not be overridden by an inline colorScheme on individual
    elements or the theme-correct value is lost.

Theme atmosphere: body::before (grain texture) + body::after (masked grid).
These only render when themes.css is loaded via main.jsx.

LOGO — "MB Angular Duotone" mark (final as of 13 June 2026):
  Geometry: M (round caps, two open peaks, left leg down, no right descender)
            + B (flat horizontal runs, tight Q-arc corners, square caps,
                 equal-height bowls, spine offset 6px right of M peak — no overlap)
  Gradient: #2F4FE0 → #1A7FCF → #17B6C9 (left to right, userSpaceOnUse)
  Dark variant: #4F6FFF → #2090DD → #22D3EE (Logo dark prop)
  Assets: Logo.jsx (React), logo-mark.svg (standalone), favicon.svg (32×32 tile)

COLOUR SWEEP — completed 13 June 2026:
  All 15 frontend pages swept. Every hardcoded hex replaced with CSS variables.
  onMouseEnter/Leave anti-pattern fixed across all 7 affected pages.
  See §8 CRITICAL IMPLEMENTATION RULES for the correct patterns.

SETTINGS PAGE (/settings — all roles):
  Three sections: Appearance (live theme picker), Profile (name/email/role),
  Avatar (accent colour picker; photo upload is a stub pending Users API).
  Theme choice saved to sessionStorage; Users API will persist it server-side.

RECHARTS — added to package.json (^2.12.7):
  Used in Reports.jsx for BarChart / ResponsiveContainer.
  Chart colours driven by CHART_PALETTE from tokens.js (→ CSS variables).
  Tooltip surface uses var(--panel) / var(--ink) so it themes correctly.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. DEMO BACKEND — PARALLEL TRACK (added 21 July 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE: a genuinely working demo (real backend + real DB, not mock data)
to show as proof of a working application, kept separate from the client
production system. Profile A (Azure) is UNCHANGED as the confirmed
production target — this is not a re-platform decision, it's a parallel,
disposable demo environment.

LOCATION: medbroker-v1/api-vercel/ — new folder in the same repo. Full detail
in api-vercel/VERCEL_NOTES.md; summary in Status.md §21.

STACK: Vercel Functions + Neon Postgres, both free tier — legitimate here
specifically because this is non-commercial demo use (the reasoning that
ruled out Vercel/Neon for the real client — Vercel Hobby's ToS prohibits
commercial use; neither Neon nor Supabase offer a South African region —
doesn't apply to a demo with synthetic data and no paying customer).
Auth: role-switcher bypass (x-demo-user-id / x-demo-role headers), not
real Entra SSO — kept deliberately simple for faster API iteration.

KEY FINDING FROM THIS WORK: the A1-A4 access-control fixes Status.md
documents as complete on the Azure side (18 June session — Supervisor
scoping, isActive enforcement, AuditLog writes) are NOT actually present
in the hydrated GitHub source. See Status.md §21.2. This is an open
discrepancy on the Azure/production codebase, independent of the demo,
and needs resolving before treating those controls as live.

KEY FIX FROM THIS WORK: the leadSource/assignedBrokerId known outstanding
item (previously unresolved) was root-caused and fixed — see Status.md
§21.3. The fix (computed sourceLabel, stored manualSourceName, working
source filter) applies the same way on the Azure side.

LIFT-AND-SHIFT: when a real customer needs the production deployment, port
api-vercel/'s Lead-domain code (and whatever's added to it — Appointments/
Flags/Config/Reports/Users) back to the Azure api/ folder. Bounded,
mechanical work — schema DDL and query dialect conversion, HTTP adapter
layer swap, encryption.js back to the Key Vault version. Business logic,
authorization logic, and the Entra auth design port unchanged. Full
breakdown in api-vercel/VERCEL_NOTES.md §8.

LOCAL AUTH (added 21 July 2026, same session): completes
auth.sso.enabled=false, which FeatureFlag seed data already described but
nothing had implemented — coexists with Entra SSO, doesn't replace it, and
is a real feature for the Azure side too, not demo-only. Bootstrap
(env-secret-gated, one-time-per-instance), login (bcryptjs + hand-rolled
JWT), admin-configurable password rotation and lockout (SystemConfig,
0 = off). Full detail in api-vercel/VERCEL_NOTES.md §9 and Status.md §21.6.
Still needed: Users API to create additional users, and the frontend
Login page / UserAdmin create-user form.

FRONTEND AUTH WIRING (added 22 July 2026): the actual React frontend now
has a real Login page and JWT session handling — new AuthContext.jsx +
authStore.js, RoleContext deriving role from the real logged-in user in
demo mode. Additive: api.js gained a third mode (DEMO_MODE, keyed off
VITE_API_BASE_URL) alongside the existing preview/mock and Entra modes;
preview mode is unaffected. Verified in both modes with real-browser
Playwright tests, not just reviewed. Full detail in Status.md §22.
Deployment note: requires VITE_API_BASE_URL set on the FRONTEND Vercel
project specifically (separate from api-vercel's own env vars).

LEADS WIRED TO REAL DATA (added 22 July 2026): LeadList/LeadDetail/
LeadImport now run against the real backend instead of mock data — four
real bugs found and fixed along the way (GlobalAdmin missing from route
role checks; empty-string optional fields breaking Zod validation in two
separate files; HTML datetime-local format needing an explicit Zod
option). Full detail in Status.md §25. The "create a user, assign a role,
they log in, see their own real work" loop now genuinely works end to
end. Appointments is next (Mark's confirmed order), then Reports.

LEAD INTAKE FIELDS MATCHED TO CLIENT'S FORM (added 22 July 2026): Title,
Date of Birth added; Job Title (was Occupation) and Contact Number
(mobileNumber) moved from optional to required — all seven core fields
(Title/First/Last/DOB/Job Title/Contact/Email) now match the client's
real Appointment Tracking intake sheet. IMPORTANT: Mark's live Neon
database needs db/migrations/002_add_lead_title_dob.sql run against it —
the master schema file alone won't add columns to an already-existing
table. Full detail in Status.md §26.

LEAD PORTAL — queued, not yet started (decided 22 July 2026): a
prospect-facing portal (QR-scan registration at events + a real returning
login, not just a one-time form) so the client avoids building native
iOS/Android apps. Deliberately sequenced AFTER Appointments and Reports —
a separate app surface from the staff MedBroker app, not an extension of
it. Builds on existing-but-unwired pieces (Event.qrToken, EventAttendee
with a popiConsent flag already on it). Real technical finding worth
remembering when this starts: the native BarcodeDetector browser API
doesn't work on any iOS browser — needs a JS/WASM decoding library
instead (jsQR/ZXing/html5-qrcode), not the "obvious" native API. Full
detail, including what's still genuinely undecided (what a logged-in
prospect can actually do, the separate auth model needed, the POPIA
design question of prospect self-access to their own Lead record), in
Status.md §27.

APPOINTMENTS BUILT — ASSIGN MODEL (added 22 July 2026): full booking ->
assign/reassign -> outcome -> Closed Won/Lost -> Return to Leads flow now
works end to end against real data, including live broker matching
(region + product filtering, degraded-mode-safe without a real Calendly
account). Claim model + token economy deliberately deferred (real Stripe
dependency, separate scope). IMPORTANT: at the start of this session,
several GlobalAdmin role-check fixes and two whole route files from the
EARLIER Leads-wiring session were found reverted on GitHub — re-applied
and re-verified, but the cause is unknown; worth checking what happened
with that delivery. Two pending Neon migrations to run (schema.postgres.sql
alone won't reach an already-live database): db/migrations/
002_add_lead_title_dob.sql and 003_add_calendly_uri.sql. Full detail in
Status.md §28.

VERCEL FUNCTION COUNT CONSOLIDATED (22 July 2026): hit Hobby's 12-function
limit at ~20 functions. Consolidated to 8 by collapsing each domain's
route files into one dispatcher per domain (auth, leads, users, flags,
appointments) using Vercel's catch-all file convention. Zero business
logic changed — only how a request reaches it. IMPORTANT: this delivery
requires DELETING 17 old route files from GitHub, not just adding new
ones — leaving both in place makes the function count worse. One thing
flagged as not fully verifiable from the sandbox: whether Vercel's
catch-all convention behaves identically outside Next.js (strong
supporting evidence from this project's own working [id].js usage
throughout, but only a real deployment confirms it for certain). Full
detail and exact file list in Status.md §29.

FUNCTION CONSOLIDATION FIX (22 July 2026): §19/§29's bracket catch-all
approach ([...slug].js) broke production immediately on deploy — Vercel
doesn't recognize that file convention outside Next.js, confirmed by
testing the live deployment directly. Fixed by switching to vercel.json
rewrites (the mechanism already proven working here for the SPA
fallback) pointing at 5 new plain router files instead. Function count
unchanged at 8. This SUPERSEDES the previous delivery's file list — see
Status.md §30 for the current, correct delete/add list before touching
anything under api/auth, api/leads, api/users, api/flags, or
api/appointments.

MOCK-DATA FLASH + ERROR DISPLAY FIXED (22 July 2026): §30's routing fix
confirmed applied and working. Two further, separate bugs found and
fixed: (1) every wired page briefly showed the original hardcoded demo
data before real data replaced it, even in real/demo mode, because the
fallback logic checked "is data loaded yet" instead of "are we actually
in preview mode" — fixed in LeadList.jsx, UserAdmin.jsx, and
AppointmentList.jsx; (2) validation errors displayed as literal
"[object Object]" everywhere in the app, because the backend's structured
Zod error object was being stored directly as the error message instead
of formatted into readable text — fixed once at the root in
src/services/api.js so every form benefits. Full detail in Status.md §31.

ASSIGN LEAD MODAL FIXED — WAS NEVER WIRED (22 July 2026): found via
Mark's own testing of the §31 mock-flash fix, this was a different and
more serious bug — the Assign/Reassign Lead modal had never been
connected to real data at all, always showing 5 hardcoded mock agent
names and, if used, would have sent an invalid value to the backend.
Fixed, along with the same-class bug in the agent filter dropdown and a
Supervisor-access gap (the real agents fetch was Admin-only despite
Supervisors needing it too), plus LeadDetail.jsx's own instance of the
§31 mock-flash pattern. Verified end-to-end against a real database,
including a direct DB check that a real assignment actually persists
correctly, not just what the UI shows. One related gap deliberately
left unfixed and flagged separately: the Medical Subscription import
tab's dropdown needs a new backend endpoint that doesn't exist yet.
Full detail in Status.md §32.

PREVIEW MODE REMOVED (22 July 2026): Mark confirmed the app always runs
against a real backend now, so the original zero-backend preview/demo
mode was removed entirely from the 4 already-wired domains (Leads,
Users, Flags, Appointments) — api.js's PREVIEW_MODE constant and every
MOCK_* fallback tied to it. IMPORTANT distinction: pages with NO backend
built yet (Events, Notifications, Tasks, App Admin, LeadImport's
Subscription tab) still show hardcoded data, but that's unbuilt
functionality, not preview mode — left untouched, needs real backends
built first. GOING FORWARD: new pages (Reports next) should be built
without this pattern from the start, per Mark's explicit instruction.
Also found and fixed: AppointmentDetail.jsx had never gotten the
mock-flash loading-gate fix LeadDetail.jsx got earlier, and
LeadDetail.jsx's call-logging error handler was silently treating every
failure as a success. This delivery supersedes and includes §32's
changes. Full detail in Status.md §33.

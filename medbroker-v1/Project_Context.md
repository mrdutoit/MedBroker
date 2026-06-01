MedBroker Lead Management System — Project Context
====================================================
Last updated: 01 June 2026
Purpose: Continuity file — load in a new chat to restore full project context.

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

Repository: GitHub → mrdutoit/MedBroker (private)
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

Schema version: 2.2 (infra/schema.sql)

LEAD pipeline statuses (5 values):
  Unassigned            Imported, not yet assigned to an agent
  Assigned              Agent assigned, not yet called
  InProgress            Agent is actively working the lead
  AppointmentScheduled  Agent booked an appointment (lead moves to Appointments)
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

APPOINTMENT statuses (5 values):
  Unassigned   Appointment booked, no broker assigned yet
  Assigned     Broker allocated (assign model) or claimed (claim model)
  InProgress   Meetings underway
  ClosedWon    Customer signed
  ClosedLost   Customer did not sign

Appointment status driven by:
  Saving outcome with customerSigned = true  → ClosedWon
  Saving outcome with customerSigned = false → ClosedLost
  First meeting marked Seen                  → InProgress

LEAD → APPOINTMENT CONVERSION (Salesforce Lead→Opportunity pattern):
  - Book Appointment on Lead Detail creates Appointment child record (leadId FK)
  - Sets Lead.pipelineStatus = 'AppointmentScheduled'
  - Lead disappears from Leads list; appears in Appointments list
  - Lead is NOT deleted — remains as source of truth for contact details
  - Agent field on Appointment is set from the booking agent's JWT (never editable)
  - Return to Leads: Admin/Supervisor can return an appointment to Unassigned queue
    via "Return to Leads" button on Appointment Detail
  - Auto-return: Azure Function (autoReturnLeads.js) runs daily at 05:00 UTC

CallAttempt outcomes (CHECK constraint):
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
  auth.sso.provider               enum     none | microsoft | google
  appointments.claimModel         enum     assign | claim
  appointments.tokens.enabled     boolean  false
  appointments.tokens.paymentProvider enum none | stripe
  events.enabled                  boolean  true
  leads.autoUnassign.enabled      boolean  true
  tasks.enabled                   boolean  false   ← Core (page is built, off by default)

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
  To test: switch to GlobalAdmin → Feature Flags → change to 'claim' → Save
           → switch to Broker → Appointments page shows two tabs.

TOKEN MODEL:
  Monthly allocation set in AppAdmin → System Settings.
  Brokers receive brokerFreeAppointmentsPerMonth free claims per month.
  Additional claims cost tokens; buy via BuyTokensModal.
  Stripe integration gated behind appointments.tokens.paymentProvider = 'stripe'.


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
│   │   │   └── FlagContext.jsx         Exports: FlagProvider, useFlags()
│   │   │                               flag() helper, DEFAULT_FLAGS
│   │   ├── hooks/
│   │   │   ├── useFetch.js
│   │   │   └── useWindowSize.js        isMobile/isTablet/isDesktop breakpoints
│   │   ├── styles/
│   │   │   └── tokens.js               Named exports only — export const s = { ... }
│   │   │                               Also exports: APPT_STATUS_META, STATUS_META, etc.
│   │   │                               NO default export. tableCard uses overflow:'auto'
│   │   ├── services/
│   │   │   └── api.js                  Preview-safe; MSAL lazy-loaded; null in preview
│   │   ├── pages/
│   │   │   ├── LeadList.jsx
│   │   │   ├── LeadDetail.jsx
│   │   │   ├── LeadImport.jsx
│   │   │   ├── AppointmentList.jsx     AssignBrokerModal (agent always read-only)
│   │   │   ├── AppointmentDetail.jsx   ReassignBrokerModal (agent always read-only)
│   │   │   │                           ReturnToLeadsModal (red destructive confirm)
│   │   │   ├── Reports.jsx
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
│   │   ├── App.jsx                     Responsive nav, <select> role switcher,
│   │   │                               collapsible sidebar, all routes
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json                     SPA rewrite rule — mandatory
│   └── package.json
├── api/
│   └── src/
│       ├── functions/                  Azure Functions v4 HTTP/timer triggers
│       │   ├── leads.js                6 routes: list/get/create/assign/calls/delete
│       │   ├── eventRegistration.js    event registration endpoint
│       │   └── autoReturnLeads.js      daily timer — getDbClient() is a STUB
│       ├── services/
│       │   ├── leadStatusService.js    computeLeadStatus + computeAppointmentStatus
│       │   ├── leadStatusService.test.js  28 Vitest tests (passing)
│       │   ├── leadService.js          Leads data access
│       │   ├── brokerMatchingService.js  broker ranking
│       │   ├── db.js                    Azure SQL pool (Managed Identity)
│       │   ├── encryption.js            field-level encryption helper
│       │   └── zohoService.js           Zoho integration
│       ├── middleware/
│       │   └── auth.js                  Entra ID JWT validation (JWKS)
│       ├── models/
│       │   └── lead.js
│       └── config.js
│   NOTE: Appointments / Flags / Config / Reports / Users API routes are NOT
│         yet built — see Status.md §4 for the contracts the frontend expects.
├── infra/
│   ├── main.bicep                      IaC
│   ├── parameters/                     dev.json, prod.json
│   ├── schema.sql                      v2.2
│   └── feature-flags.sql              17 seeded flags
├── mobile/                             RegisterScreen.jsx (event registration)
└── DEPLOYMENT.md


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. CRITICAL IMPLEMENTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOKENS.JS IMPORT — mandatory pattern, Vercel build will fail otherwise:
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

ASSIGN/REASSIGN MODAL — agent always read-only:
  Both AssignBrokerModal (AppointmentList) and ReassignBrokerModal
  (AppointmentDetail) show agent as a read-only locked display field.
  Agent is set from the booking user's JWT and is immutable.
  Never render agent as a <select> in the appointments context.

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

ReassignBrokerModal on AppointmentDetail: mirrors AssignBrokerModal exactly.
  Agent field is always a read-only display (lock icon, "read only" label).
  Only broker field is editable and pre-populated with current broker.
  Broker must be changed before Save is enabled.

Code review fixes (01 Jun 2026):
  - Reports is gated to Admin/Supervisor/GlobalAdmin (route + nav + in-page
    redirect); Supervisor scoped to direct reports. Frontend authorisation
    only — the report API must re-enforce server-side when built.
  - appointmentsApi gained returnToLeads() and saveOutcome(); both were being
    called by AppointmentDetail but did not exist, so the buttons failed
    silently. Save Outcome now persists via the API and shows error/saving states.
  - Backend is partially built (Leads domain, auth, db, broker matching), not
    absent as an earlier Status.md claimed — see Status.md §4.

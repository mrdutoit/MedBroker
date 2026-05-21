MedBroker Lead Management System — Project Status
==================================================
Last updated: 20 May 2026
Purpose: Current build state — paste into a new chat alongside Project_Context.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. WHAT HAS BEEN BUILT AND IS WORKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEPLOYED
  ✅ React frontend live on Vercel (preview URL via GitHub → medbroker-v1)
  ✅ Auth bypassed in preview — role switcher <select> dropdown in sidebar footer
  ✅ All pages render with mock data — no backend required for demo

FRONTEND — ALL PAGES BUILT AND VERIFIED BUILDING ON VERCEL
  ✅ LeadList           Status chips, source/occupation/agent filters,
                        Assign (unassigned) / Reassign (assigned) buttons,
                        Import Leads button (flag-gated)
  ✅ LeadDetail         Contact/education/insurance detail panels,
                        Log Call modal with status transition preview,
                        Call history with outcome badges,
                        Book Appointment modal (M365 broker ranking),
                        Status badge updates immediately after log call,
                        Conversion banner + View in Appointments link
  ✅ LeadImport         3 tabs: Historical CSV / Medical Subscription / Manual Entry
  ✅ AppointmentList    Assign model: metrics, status chips, source/portfolio/broker
                        filters, Assign/Reassign (agent read-only in both modals),
                        Claim model: My Appointments tab + Available to Claim tab,
                        Token balance card with progress bar and Buy tokens modal,
                        Claim model indicator for Admin/Supervisor
  ✅ AppointmentDetail  Lead details panel (read-only), appointment logistics,
                        Meeting tracking (1st required, 2nd required, 3rd optional),
                        Appointment outcome (customerSigned, broker switch, products sold),
                        Reassign Broker button (Admin/Supervisor only — broker editable,
                          agent read-only with lock icon and clarifying note),
                        Return to Leads button + red confirmation modal
  ✅ Reports            Pipeline funnel, monthly trend, broker performance,
                        agent activity — View links to drill-down pages
  ✅ AgentDetail        Call outcomes breakdown, daily activity chart, recent leads
  ✅ BrokerDetail       Products sold, meeting outcome summary, recent appointments
  ✅ UserAdmin          Role filter, supervisor assignment, portfolio checkboxes,
                        product checkboxes per portfolio, SSO invite notice
  ✅ AppAdmin           4 tabs: Portfolios / Products / Subscriptions / System Settings
                        System Settings: monthly tokens, auto-return months, max calls
  ✅ FeatureFlags       3 tiers: Core / Operational / Phase2
                        Toggle (boolean) and select (enum) controls per flag
                        Save per row with confirmation
                        tasks.enabled is in Core tier (editable)
  ✅ SingleSignOn       M365 (Entra ID) config + 4-step flow / Google Workspace tab
  ✅ Notifications      Tabbed inbox — All / Unread / Assignments / Reminders
  ✅ Tasks              Interactive placeholder — tabs (All/Appointments/Rescheduling/
                        Reminders), checkboxes, due date badges, pending count metrics.
                        Flag-gated: tasks.enabled (Core tier, default false, editable)
  ✅ EventList          Existing (not modified in this build)
  ✅ EventDetail        Existing (not modified in this build)

INFRASTRUCTURE FILES
  ✅ schema.sql         v2.2 — all tables, constraints, indexes, seed data,
                        migration SQL documented in version history comments
  ✅ feature-flags.sql  FeatureFlag table + 17 seeded flags (3 tiers)
  ✅ autoReturnLeads.js Azure Function timer trigger — daily auto-return
                        (getDbClient() is a stub — needs DB client connected)
  ✅ leadStatusService.js computeLeadStatus() + computeAppointmentStatus()

RESPONSIVENESS
  ✅ Collapsible sidebar on mobile with hamburger button and dark overlay
  ✅ All tables: overflowX:'auto' + unconditional minWidth
  ✅ Page padding, grids, and modals adapt to isMobile breakpoint


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. BUGS FIXED IN THIS SESSION (20 May 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The following bugs were identified, diagnosed, and fixed across multiple
Vercel build iterations today. All are now resolved and deployed.

  ✅ AppointmentDetail — Reassign Broker modal was titled "Reassign Appointment"
     and had an editable agent field. Fixed: modal now titled "Reassign Broker",
     agent shown as read-only locked display (lock icon, "read only" label,
     clarifying note). Only broker is editable. Matches AssignBrokerModal behaviour.

  ✅ Vercel build — unused destructured variable `flags` in AppointmentDetail.jsx
     (destructured from useFlags() but never used). Removed.

  ✅ Vercel build — `import tokens from '../styles/tokens.js'` (default import)
     against a named-export-only file. Fixed: `import { s, APPT_STATUS_META }
     from '../styles/tokens.js'`. Also removed all invented token keys
     (s.colors, s.chip*, s.btnPrimary etc.) and replaced with real token keys
     or inline styles.

  ✅ Vercel build — `import { RoleContext, ... } from '../context/RoleContext'`
     RoleContext object is not exported — only the useRole() hook is.
     Fixed: replaced useContext(RoleContext) with useRole().

  ✅ Reports.jsx — duplicate `overflowX: 'auto'` key in object literal (line 142).
     Fixed in repo directly. Not related to this session's changes.

  ✅ Tasks.jsx — not showing in nav/routing. Root cause: tasks.enabled was in
     Phase2 tier in FeatureFlags.jsx with isPhase2:true, making the toggle
     disabled and read-only. Fixed: moved to Core tier, isPhase2:false.
     The Tasks page is built and functional — Phase2 is reserved for features
     not yet implemented.

  ✅ App.jsx — role switcher regressed from <select> dropdown to individual
     buttons per role. Fixed: restored to compact amber <select> dropdown in
     sidebar footer, matching the original HTML demo pattern.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. WHAT IS NOT YET BUILT (PHASE 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These are explicitly deferred — schema stubs and feature flag gates exist
for all of them. None of the frontend placeholders should be removed.

  ⬜ Task backend        Tasks.jsx UI is complete. Server-side task generation
                         from appointment events, callbacks, and rescheduling
                         not yet built. Flag: tasks.enabled (Core, default false)

  ⬜ Token economy       Claim model works. Token purchase flow shows
                         BuyTokensModal with Phase 2 notice.
                         Stripe integration not connected.
                         Flag: appointments.tokens.paymentProvider

  ⬜ Email notifications notifications.email.enabled flag exists.
                         Azure Communication Services not configured.

  ⬜ POPIA SAR endpoint  popia.subjectAccessRequest.enabled flag exists.
                         Admin endpoint not built.

  ⬜ Broker incentives   broker.tokenIncentives.enabled flag exists.

  ⬜ CrewAI agents       Deferred until first paying customer project.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. BACKEND — NOT YET BUILT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The entire Node.js / Azure Functions API layer is not yet built.
The frontend runs entirely on mock data in preview mode.

Critical API contracts already documented in frontend + leadStatusService.js:

  POST   /api/leads/:id/calls
         Body: { outcome, notes, callbackDateTime? }
         Server calls computeLeadStatus(currentStatus, outcome)
         Returns: { callAttempt, newPipelineStatus }

  POST   /api/appointments
         Derives agentId from JWT — never accepted from request body
         Creates Appointment child record
         Sets Lead.pipelineStatus = 'AppointmentScheduled'

  PUT    /api/appointments/:id/assign
         Body: { brokerId }  ← agentId from Appointment record, NOT body
         Sets status Unassigned → Assigned

  PUT    /api/appointments/:id/reassign
         Body: { brokerId }  ← agentId never accepted here either
         Updates broker, keeps status, writes audit log

  PUT    /api/appointments/:id/return
         No body. Admin/Supervisor only.
         Sets Lead.pipelineStatus = 'Unassigned', archives Appointment.
         Must validate customerSigned IS NOT TRUE.

  GET    /api/leads/sources
         Returns distinct source labels for LeadList filter dropdown.

  GET/PATCH /api/flags
         GET: all roles — FlagContext calls on startup
         PATCH: GlobalAdmin only

  GET/PUT /api/config
         Read/write SystemConfig (Admin/GlobalAdmin only).

  NEVER expose direct PATCH on pipelineStatus or Appointment.status.
  Status always computed by service layer, never accepted from clients.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. PENDING ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CLIENT / BUSINESS
  ⬜ Client sign-off on Stage 1 Requirements Summary v0.3
  ⬜ Client sign-off on Stage 2 Architecture and Design Specification v1.1
  ⬜ Confirm FAIS record retention periods per entity
  ⬜ Client's Information Officer name and contact for POPIA privacy notice

DOCUMENT PRODUCTION
  ⬜ Stage 2 diagrams rendered as PNG — Mermaid CLI available (mmdc v11.12.0)
     but Chrome headless shell not installed.
     Fix: npx puppeteer browsers install chrome-headless-shell
     Then: mmdc -i diagram.mmd -o diagram.png -t neutral -b white
           --width 2400 -p puppeteer-config.json
     Then rebuild docx with ImageRun embedding the PNGs.

SKILLS INSTALLATION
  ⬜ Install updated app-builder.skill
     (includes tokens.js import rules and container-reset guard — added today)
     Settings → Custom Skills → find app-builder → replace content
  ⬜ Install updated code-nodejs-SKILL.md
  ⬜ Install updated code-azure-SKILL.md
  ⬜ Install updated mark-persona-SKILL.md

GITHUB — files changed and confirmed working since last full sync:
  ✅ frontend/src/App.jsx                          (role switcher restored)
  ✅ frontend/src/pages/AppointmentDetail.jsx      (reassign bug fixed)
  ✅ frontend/src/pages/FeatureFlags.jsx           (tasks.enabled → Core)
  ✅ frontend/src/pages/Tasks.jsx                  (restored + wired)
  ✅ frontend/src/pages/Reports.jsx                (duplicate overflowX fixed)

  Files in the previous Status.md sync list that are unchanged:
     frontend/src/styles/tokens.js
     frontend/src/hooks/useWindowSize.js
     frontend/src/context/FlagContext.jsx
     frontend/src/pages/LeadList.jsx
     frontend/src/pages/LeadDetail.jsx
     frontend/src/pages/AppointmentList.jsx
     frontend/src/pages/UserAdmin.jsx
     frontend/src/pages/AppAdmin.jsx
     frontend/src/pages/AgentDetail.jsx
     frontend/src/pages/BrokerDetail.jsx
     api/src/services/leadStatusService.js
     api/src/functions/autoReturnLeads.js
     infra/schema.sql
     infra/feature-flags.sql

BACKEND (when ready to build)
  ⬜ Provision Azure SQL Serverless in southafricanorth
  ⬜ Run schema.sql then feature-flags.sql
  ⬜ Build Azure Functions API layer (see Section 4 for API contracts)
  ⬜ Connect autoReturnLeads.js to real DB client
  ⬜ Set Vercel environment variables:
       VITE_API_BASE_URL    https://[functions-app].azurewebsites.net/api
       VITE_CLIENT_ID       Entra ID app registration client ID
       VITE_AUTHORITY       https://login.microsoftonline.com/[tenant-id]
  ⬜ Configure Entra ID External — send invitations to users
  ⬜ Connect Microsoft 365 Graph API for broker calendar availability


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. THINGS NOT TO CHANGE IN A NEW CHAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These decisions caused rework when changed — preserve them in every session:

  tokens.js import      NAMED exports only — no default export.
                        Always: import { s, APPT_STATUS_META } from '../styles/tokens.js'
                        Never:  import tokens from '../styles/tokens.js'
                        Before writing any component, read tokens.js to verify
                        exact keys available on the s object. Do not invent keys.
                        If a key doesn't exist in tokens.js, use inline styles.

  tokens.js tableCard   overflow:'auto' NOT overflow:'hidden'
                        Changing to hidden breaks all table scroll.

  RoleContext export    useRole() hook is exported, not RoleContext object.
                        Always: import { useRole } from '../context/RoleContext.jsx'
                        Never:  import { RoleContext } from '../context/RoleContext.jsx'
                        Never:  useContext(RoleContext)

  MSAL lazy-load        Never import authConfig.js or @azure/msal-browser at
                        module level in api.js — causes Vercel build failure.

  Status values         Do not add statuses without updating schema CHECK
                        constraints AND leadStatusService.js AND frontend mock
                        data AND tokens.js status objects.

  AppointmentScheduled  Replaced 'AppointmentBooked' in schema v2.2.
                        Do not revert or mix the two.

  Agent on Appointment  Set from booking user's JWT. Never editable.
                        Assign Broker modal: agent always read-only.
                        Reassign Broker modal: agent always read-only.
                        Never make agent a select/input in appointment context.

  Claim model flag      Read flags['appointments.claimModel'] directly —
                        do not use flag() helper for enum comparison.

  Role switcher         Compact <select> dropdown in sidebar footer amber box.
                        Never replace with individual buttons per role.

  Section labels in nav Wrap both the label div and its NavItems in a single
                        conditional — never render a section label without items.

  tasks.enabled tier    Core (not Phase2) — the Tasks page is built and
                        functional. Phase2 is reserved for unbuilt features.

  Container resets      If the source files are not visible in the current
                        session, read from GitHub or ask before reconstructing
                        any shared file from memory.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. HOW TO START A NEW CHAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Start a new conversation in the MedBroker project
2. Claude will load project files automatically — no need to paste them
3. Say: "Please read the Project_Context.md and Status.md files and confirm
   you have full context before I give you a task."
4. Claude will confirm.
5. Give your task.

If picking up a pending item from Section 5, reference it by name.
e.g. "I want to work on the Stage 2 diagram rendering blocker."

MedBroker Lead Management System — Project Status
==================================================
Last updated: 13 June 2026
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
                        agent activity — View links to drill-down pages.
                        Agent booking rate column shows mini bar + percentage.
  ✅ AgentDetail        Call outcomes breakdown, daily activity chart, recent leads.
                        View button navigates to /leads/:id (LeadDetail).
                        Full-width layout (no maxWidth constraint).
  ✅ BrokerDetail       Products sold, meeting outcome summary, recent appointments.
                        Full-width layout (no maxWidth constraint).
  ✅ UserAdmin          Role filter, supervisor assignment, portfolio checkboxes,
                        product checkboxes per portfolio, SSO invite notice
  ✅ AppAdmin           4 tabs: Portfolios / Products / Subscriptions / System Settings
                        System Settings: monthly tokens, auto-return months, max calls
  ✅ FeatureFlags       3 tiers: Core / Operational / Phase2
                        Toggle (boolean) and select (enum) controls per flag
                        Save per row with confirmation
                        tasks.enabled is in Core tier (editable)
                        select elements: color + colorScheme set for dark theme
  ✅ SingleSignOn       M365 (Entra ID) config + 4-step flow / Google Workspace tab
  ✅ Notifications      Tabbed inbox — All / Unread / Assignments / Reminders
  ✅ Tasks              Interactive placeholder — tabs (All/Appointments/Rescheduling/
                        Reminders), checkboxes, due date badges, pending count metrics.
                        Flag-gated: tasks.enabled (Core tier, default false, editable)
  ✅ EventList          Event status badges and attendance bar — dark theme clean
  ✅ EventDetail        QR code modal: white container background (ISO spec compliant,
                        scannable on all themes). Attendance breakdown chart.
  ✅ Settings           Theme switcher (live, 4 themes), profile display name,
                        avatar colour picker. Save Changes button with dirty-state
                        guard and success feedback. Persists to sessionStorage.

DESIGN SYSTEM
  ✅ 4 themes: Linen (default/light), Terra (light/earthy), Midnight (dark),
                Ember (dark/warm). Switcher in sidebar and Settings page.
  ✅ ThemeContext.jsx — exports ThemeProvider and useTheme() hook
  ✅ themes.css — [data-theme] variable blocks for all four themes
  ✅ tokens.js — s.select and s.formInput include colorScheme: 'light dark'
                 so native <select> chrome renders correctly on dark themes
  ✅ Full colour sweep completed — all 15 pages use CSS variables and
     color-mix() tints; no hardcoded light-mode hex remaining

INFRASTRUCTURE FILES
  ✅ schema.sql         v2.4 — all tables, constraints, indexes, seed data,
                        migration SQL documented in version history comments
  ✅ feature-flags.sql  FeatureFlag table + 17 seeded flags (3 tiers)
  ✅ autoReturnLeads.js Azure Function timer trigger — daily auto-return
                        (getDbClient() is a stub — needs DB client connected)
  ✅ leadStatusService.js computeLeadStatus() + computeAppointmentStatus()
  ✅ leadStatusService.test.js  28 Vitest tests — in api/src/services/
  ✅ leadService.tenant.integration.test.js — in api/src/services/
  ✅ api/package.json   test script wired: "test": "vitest run"
                        devDependencies: vitest ^2.0.0

RESPONSIVENESS
  ✅ Collapsible sidebar on mobile with hamburger button and dark overlay
  ✅ All tables: overflowX:'auto' + unconditional minWidth
  ✅ Page padding, grids, and modals adapt to isMobile breakpoint


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. BUGS FIXED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── 13 June 2026 session (dark theme sweep + UX fixes) ──
All changed files verified with a full Vite production build in the sandbox
before handover. Build passes: 1294 modules, zero errors.

  ✅ All 15 pages — comprehensive sweep of hardcoded light-mode hex values.
     Every badge background, banner, border, progress bar track, tab chip,
     and dropdown now uses CSS variables and color-mix() tints. No page has
     light backgrounds or dark text that becomes unreadable on Ember or Midnight.
     color-mix() pattern: color-mix(in srgb, <semantic-colour> 14%, var(--panel))
     for backgrounds; 30% for borders.

  ✅ AgentDetail / BrokerDetail — View → /leads (list) changed to /leads/:id
     (LeadDetail). leadId field added to RECENT_LEADS mock data.

  ✅ AgentDetail / BrokerDetail — maxWidth: '960px' removed from outer wrapper.
     Both pages now expand to full available width, consistent with Reports.jsx.

  ✅ Reports.jsx — Agent Activity booking rate column now renders a mini bar
     + percentage, matching the Broker Performance conversion column.

  ✅ Settings.jsx — Save Changes button added below Profile + Avatar sections.
     Includes dirty-state guard (disabled when nothing changed), Saving… state,
     ✓ Changes saved feedback, and "You have unsaved changes" hint. Values
     written to sessionStorage (mb_displayName, mb_avatarColour). Theme remains
     live-apply with no save step required.

  ✅ EventDetail.jsx — QR code container forced to background: '#ffffff'.
     ISO 18004 requires a white quiet zone; the container was inheriting
     var(--panel2) which is near-black on Midnight/Ember themes.

  ✅ tokens.js — colorScheme: 'light dark' added to s.select and s.formInput.
     Without this, the browser renders the native dropdown arrow and option
     list using OS defaults (black on white) regardless of the page theme.

  ✅ FeatureFlags.jsx — enum <select> had no explicit color; added
     color: 'var(--ink)' and colorScheme: 'light dark'.

  ✅ Multiple files — build failures caused by unquoted color-mix() values
     and nested single-quote collisions in border strings. Root cause: patch
     scripts emitted color-mix() as bare JS values or wrapped them inside
     already-quoted strings. Resolved by scanning from the live repo, applying
     precise string replacements, and running npm run build before handover.
     See §6 for the permanent rule.

── 09 June 2026 session (backend security + correctness pass) ──
All changed files verified building (esbuild) and the 28 status tests pass.

  ✅ leadService.logCallAttempt — three fixes in one:
       1. Wired computeLeadStatus() in — call outcomes now progress the lead
          (previously the status machine was never called).
       2. Fixed INSERT columns: callbackDateTime→followUpDateTime,
          attemptedAt→callTime (the old names do not exist in the v2.2 schema,
          so the insert would have thrown).
       3. Auto-close after max failed attempts now writes 'Closed' (not the
          old 'Uncontactable', which the v2.2 CHECK constraint rejects).
  ✅ models/lead.js — PipelineStatus enum reconciled to the canonical 5
       (Unassigned, Assigned, InProgress, AppointmentScheduled, Closed) and
       CallAttempt outcomes to the 7 the CHECK allows (ClientContacted /
       AppointmentScheduled, not Interested / AppointmentBooked).
  ✅ brokerMatchingService — fixed the appointment over-count (window over a
       fanned-out join → scalar subquery), the invalid bp.productType column
       (now BrokerProduct→Product.name), and the phantom 'Cancelled'/'NoShow'
       status filter (now real statuses).
  ✅ auth.js — added JWT issuer (iss) validation and an access-token-type check
       (requires the scp claim; rejects ID tokens). New config: ENTRA_ISSUER,
       ENTRA_API_SCOPE.
  ✅ encryption.js — AES-256-CBC → AES-256-GCM (authenticated); reads legacy
       v1 CBC blobs. Added blindIndex() HMAC helper. New config: ID_NUMBER_INDEX_KEY.
  ✅ leadService — dedup by ID number via the blind index (idNumberHash),
       falling back to email. schema.sql v2.3 adds the idNumberHash column + index.
  ✅ eventRegistration — Front Door origin lock (FRONT_DOOR_ID) + best-effort
       in-app rate limit (per IP + event token).
  ✅ leads.js — strict UUID validation on all id routes; logCall returns
       newPipelineStatus.
  ✅ host.json added (concurrency, timeout, App Insights sampling).

  New app settings required: ENTRA_ISSUER (or accept default), optional
  ENTRA_API_SCOPE, ID_NUMBER_INDEX_KEY (random 32-byte secret), FRONT_DOOR_ID.

── 01 June 2026 session (code review + fixes) ──
All four files verified building (esbuild parse) and the status tests pass.

  ✅ api.js — appointmentsApi was MISSING returnToLeads() and saveOutcome().
     AppointmentDetail called appointmentsApi.returnToLeads(), which was
     undefined, so the Return to Leads button threw a TypeError swallowed by
     an empty catch — it did nothing, silently, in preview and production.
     Added both methods: PUT /appointments/:id/return and
     POST /appointments/:id/outcome.

  ✅ AppointmentDetail — Save Outcome was a no-op that showed "Outcome saved"
     without calling any API. Now calls appointmentsApi.saveOutcome(), applies
     the server-computed status, shows a Saving… state and an error on failure.

  ✅ AppointmentDetail — ReturnToLeadsModal empty catch now surfaces an error
     to the user instead of silently resetting.

  ✅ Reports — page and routes were ungated: any Agent or Broker could view
     org-wide pipeline, every broker's policy values, and every agent's
     activity (and any drill-down by URL). Now gated to Admin / Supervisor /
     GlobalAdmin in App.jsx (route + nav), with a defence-in-depth redirect in
     Reports.jsx and Supervisor scoped to direct reports. NOTE: this is
     frontend authorisation only — the report API must re-enforce server-side.

── 20 May 2026 session ──
The following bugs were identified, diagnosed, and fixed across multiple
Vercel build iterations. All are now resolved and deployed.

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
4. BACKEND — PARTIALLY BUILT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Correction (01 Jun 2026): an earlier version of this file said the backend was
entirely unbuilt. That is not accurate. A real Node.js / Azure Functions API
layer exists in api/src. The frontend still runs on mock data in preview mode
(PREVIEW_MODE when VITE_ENTRA_CLIENT_ID is unset), so the live demo needs no
backend — but the API is not a blank slate.

BUILT (api/src):
  ✅ functions/leads.js          6 routes: GET /leads, GET /leads/{id},
                                 POST /leads, PUT /leads/{id}/assign,
                                 POST /leads/{id}/calls (calls computeLeadStatus),
                                 DELETE /leads/{id}
  ✅ functions/eventRegistration.js  event registration endpoint
  ✅ services/leadService.js     data access for the Leads domain
  ✅ services/brokerMatchingService.js  broker ranking (parameterised queries)
  ✅ services/leadStatusService.js  status machines (+ tests)
  ✅ services/db.js              Azure SQL pool, Managed Identity + local pwd fallback
  ✅ services/encryption.js      field-level encryption helper
  ✅ services/zohoService.js     Zoho integration
  ✅ middleware/auth.js          Entra ID JWT validation (signature, aud, iss,
                                 token-type/scp) against JWKS
  ✅ models/lead.js, config.js

  NOTE (09 Jun 2026): the Leads domain had a security + correctness pass —
  computeLeadStatus is now wired into call logging; encryption is AES-GCM;
  ID-number blind-index dedup; broker-matching query corrected; public endpoint
  rate-limited + origin-locked; host.json added. See §2 (09 June) for the list.

NOT YET BUILT (frontend calls these; server side is missing):
  ⬜ Appointments API   POST /appointments, GET /appointments[/:id],
                        PUT /appointments/:id/assign, /reassign,
                        PUT /appointments/:id/return,
                        POST /appointments/:id/outcome (computeAppointmentStatus)
                        — appointmentsApi in api.js calls all of these.
                        computeAppointmentStatus() exists + is tested but is NOT
                        yet wired to a route (no appointments function file yet).
                        Wire it into POST /appointments/:id/outcome when this API
                        is built — same pattern as logCallAttempt→computeLeadStatus.
  ⬜ Flags API          GET/PATCH /flags
  ⬜ Config API         GET/PUT /config (SystemConfig)
  ⬜ Reports API        GET /reports/pipeline, /reports/broker-activity
                        MUST enforce role + Supervisor team scoping server-side
                        (frontend gating added 01 Jun is presentation only).
  ⬜ Users API          GET /users, /users/me, POST /users
  ⬜ autoReturnLeads.js getDbClient() is a stub — throws "not implemented".
                        Connect the real DB client (services/db.js getPool()).

API contracts (the spec for the routes still to build):

  POST   /api/leads/:id/calls          [BUILT]
         Body: { outcome, notes, callbackDateTime? }
         Server calls computeLeadStatus(currentStatus, outcome)
         Returns: { callAttempt, newPipelineStatus }

  POST   /api/appointments             [TO BUILD]
         Derives agentId from JWT — never accepted from request body
         Creates Appointment child record
         Sets Lead.pipelineStatus = 'AppointmentScheduled'

  PUT    /api/appointments/:id/assign  [TO BUILD]
         Body: { brokerId }  ← agentId from Appointment record, NOT body
         Sets status Unassigned → Assigned

  PUT    /api/appointments/:id/reassign  [TO BUILD]
         Body: { brokerId }  ← agentId never accepted here either
         Updates broker, keeps status, writes audit log

  PUT    /api/appointments/:id/return  [TO BUILD]
         No body. Admin/Supervisor only.
         Sets Lead.pipelineStatus = 'Unassigned', archives Appointment.
         Must validate customerSigned IS NOT TRUE.

  POST   /api/appointments/:id/outcome  [TO BUILD]
         Body: { customerSigned, productsSold, meetings }
         Server calls computeAppointmentStatus(currentStatus, customerSigned, meetingsSeen)
         Returns the updated appointment (incl. server-computed status).

  GET    /api/leads/sources            [TO BUILD]
         Returns distinct source labels for LeadList filter dropdown.

  GET/PATCH /api/flags                 [TO BUILD]
         GET: all roles — FlagContext calls on startup
         PATCH: GlobalAdmin only

  GET/PUT /api/config                  [TO BUILD]
         Read/write SystemConfig (Admin/GlobalAdmin only).

  NEVER expose direct PATCH on pipelineStatus or Appointment.status.
  Status always computed by service layer, never accepted from clients.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. PENDING ITEMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MULTI-TENANCY READINESS (12 Jun 2026)
  Model: single-tenant, multi-tenant-ready (see docs/delivery playbook).
  ✅ DONE (pre-deployment, while cheap):
     - schema.sql v2.4: Organisation table + seeded default org
       (D0000000-0000-0000-0000-000000000001); organisationId NOT NULL on 15
       tenant-owned tables, DEFAULT = default org (single-tenant sets nothing);
       org indexes on Lead/Appointment/CallAttempt. Region + SystemConfig stay
       global; junction tables inherit org via their parent FK.
     - config.organisationId (ORG_ID env, defaults to the default org).
     - context/tenant.js — single resolveOrganisationId() chokepoint.
     - organisationId threaded through the data layer: leadService (all reads +
       writes), eventRegistration (public path), brokerMatchingService.
     - UUID keys already in use (no merge-collision risk).
  ⬜ MULTI-TENANT ACTIVATION (only if/when we leave single-tenant — NOT now):
     - Change resolveOrganisationId() to resolve org from the validated token /
       host (one function — nothing else changes shape).
     - DROP the DF_*_Org DEFAULT constraints so a missing org errors instead of
       silently defaulting.
     - Enable row-level security (organisationId predicate per table) as the
       enforcement boundary; scope any remaining/edge read queries.
     - Consolidate instance DBs (or DB-per-tenant on one server).
  NOTE (separate, pre-existing): leadService SELECTs reference l.leadSource and
  l.assignedBrokerId, absent from schema v2.4 (source = the four linked* columns;
  broker lives on Appointment). App-vs-schema drift to fix when the lead read
  path is next worked — NOT touched by this tenancy change.

SECURITY & CODE REVIEW REMEDIATION (10 Jun 2026)
  Full report: docs/security/MedBroker_Security_Code_Review_Findings.docx
  Control posture & detail: Project_Context.md §11.
  Nothing below is live exposure yet (DB not deployed); all are go-live gates.

  ✅ FIXED this session (safe, no demo impact):
     C1  @azure/keyvault-keys dependency corrected (encrypt/decrypt would have
         crashed at runtime); unused @azure/keyvault-secrets + node-fetch removed
     C3  SQL admin password placeholder → @secure() Bicep parameter
     C9  CORS localhost excluded in prod; 8s timeout on Zoho calls
     C2  autoReturnLeads safety banner added (kept as stub; injection trap flagged)

  ⬜ PARKED for the deployment / implementation phase:
     [High]   C2  Rewrite autoReturnLeads parameterised against db.js (or leave
                  disabled) — currently inert (getDbClient throws)
     [Med]    C4  db.js: refresh MI token on reconnect; memoise pool init; add
                  transient-fault retry/backoff
     [Med]    C5  Network isolation: SQL private endpoint, remove 0.0.0.0 rule,
                  Key Vault publicNetworkAccess off
     [Med]    C6  Identity-based AzureWebJobsStorage (drop storage account key)
     [Med]    C7  Wire pino structured logging + add /health endpoint
     [Med]    C8  Geo-redundant backups + a tested restore
     EDGE / TRANSPORT
     [High]   WAF across all public surfaces — adopt Cloudflare Pro in front of
              the Azure origin (~R400/mo) vs Front Door Premium (~R6,000/mo);
              lock the origin to Cloudflare. (Decision recorded; see below.)
     [High]   DDoS protection (included once Cloudflare/edge is in front)
     [Med]    HSTS + browser security headers (CSP, frame-ancestors,
              X-Content-Type-Options, Referrer-Policy) via SWA config
     ABUSE / LOGGING
     [Med]    Rate limiting on authenticated endpoints (not just public)
     [High]   Special PI never written to logs — App Insights/console scrubbing
     [High]   Audit trail of who viewed/changed special PI (write to AuditLog)
     [Med]    Bulk-export / report exfiltration limits (when reports API built)
     ASSURANCE
     [Med]    Dependency + secret scanning in CI; SAST/DAST
     [High]   Penetration test before go-live
     POPIA
     [High]   Operator agreements: Microsoft, Calendly, Zoho, Cloudflare (§20-21)
     [High]   Cross-border transfer assessment (Zoho global, Calendly US,
              Cloudflare edge); Information Officer registration; breach process
     [Med]    SAR + erasure endpoint (Phase 2)
     WHEN CsvImportBatch IS BUILT
     [High]   CSV/file-import hardening: formula injection (= + - @), row/size caps

  WAF DECISION (10 Jun 2026): Cloudflare Pro in front of the Azure origin,
  chosen over Azure Front Door Premium on cost (~R400 vs ~R6,000/mo) while
  keeping SQL Server, Managed Identity and SA residency on Azure. Caveats: lock
  the origin to Cloudflare, confirm the rate-limiting tier, and record that TLS
  terminates at Cloudflare's global edge (POPIA transit note).


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

TESTING
  ✅ Vitest wired: api/package.json has "test": "vitest run" and vitest ^2.0.0
     in devDependencies.
  ✅ Both test files are in api/src/services/ (correct location for discovery).
  ⬜ Add tests for the Appointments, Flags, and Reports endpoints as they are
     built (validation + role authorisation per route).

SKILLS INSTALLATION
  ✅ app-builder.skill — INSTALLED (09 Jun 2026). Now includes the commercial/
     handover pack, observability/test/standalone-auth patterns, Profile D —
     Vercel, the concurrency-based sizing method, and the Pre-Handover Review
     (security/performance/sizing gate).
  ✅ document-output — INSTALLED (commercial + POPIA operational document types)
  ✅ code-nodejs — INSTALLED (Vitest, pino logging, standalone auth, migrations)
  ⬜ app-builder.skill — needs update with 13 June learnings (see §0).
  ⬜ code-nodejs skill — needs update with JSX quoting rule (see §0).

GITHUB — files changed 13 June 2026 (dark theme sweep + UX fixes):
  All files verified with full Vite production build before handover.
  ✅ frontend/src/styles/tokens.js              (colorScheme added to s.select + s.formInput)
  ✅ frontend/src/pages/AgentDetail.jsx         (colour sweep, maxWidth removed, View→/leads/:id)
  ✅ frontend/src/pages/AppAdmin.jsx            (colour sweep)
  ✅ frontend/src/pages/AppointmentDetail.jsx   (colour sweep)
  ✅ frontend/src/pages/AppointmentList.jsx     (colour sweep)
  ✅ frontend/src/pages/BrokerDetail.jsx        (colour sweep, maxWidth removed)
  ✅ frontend/src/pages/EventDetail.jsx         (QR white bg, colour sweep)
  ✅ frontend/src/pages/EventList.jsx           (colour sweep)
  ✅ frontend/src/pages/FeatureFlags.jsx        (colour sweep, select color+colorScheme)
  ✅ frontend/src/pages/LeadDetail.jsx          (colour sweep)
  ✅ frontend/src/pages/LeadImport.jsx          (colour sweep)
  ✅ frontend/src/pages/Notifications.jsx       (colour sweep)
  ✅ frontend/src/pages/Reports.jsx             (agent booking rate bar added)
  ✅ frontend/src/pages/Settings.jsx            (Save Changes button added)
  ✅ frontend/src/pages/SingleSignOn.jsx        (colour sweep)
  ✅ frontend/src/pages/Tasks.jsx               (colour sweep)
  ✅ frontend/src/pages/UserAdmin.jsx           (colour sweep)

GITHUB — files changed 01 June 2026 (code-review fixes, verified building):
  ✅ frontend/src/App.jsx                          (Reports route + nav gated)
  ✅ frontend/src/pages/Reports.jsx                (role guard + Supervisor scope)
  ✅ frontend/src/pages/AppointmentDetail.jsx      (Save Outcome wired; error states)
  ✅ frontend/src/services/api.js                  (added returnToLeads + saveOutcome)
  ✅ api/src/services/leadStatusService.test.js    (28 tests)
  ✅ api/package.json                              (test script + vitest devDep)

GITHUB — files changed 20 May 2026 (confirmed working):
  ✅ frontend/src/App.jsx                          (role switcher restored)
  ✅ frontend/src/pages/AppointmentDetail.jsx      (reassign bug fixed)
  ✅ frontend/src/pages/FeatureFlags.jsx           (tasks.enabled → Core)
  ✅ frontend/src/pages/Tasks.jsx                  (restored + wired)
  ✅ frontend/src/pages/Reports.jsx                (duplicate overflowX fixed)

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

  Reports access        Gated to Admin / Supervisor / GlobalAdmin only.
                        Route guard in App.jsx + redirect in Reports.jsx +
                        nav item hidden for other roles. Supervisor sees only
                        direct reports. Never expose Reports to Agent or Broker.
                        Must also be enforced server-side in the report API.

  appointmentsApi       Must include returnToLeads() and saveOutcome().
                        AppointmentDetail depends on both; their absence makes
                        the Return and Save Outcome buttons fail silently.

  Section labels in nav Wrap both the label div and its NavItems in a single
                        conditional — never render a section label without items.

  tasks.enabled tier    Core (not Phase2) — the Tasks page is built and
                        functional. Phase2 is reserved for unbuilt features.

  Container resets      If the source files are not visible in the current
                        session, read from GitHub or ask before reconstructing
                        any shared file from memory.

  color-mix() in JSX    Must always be a quoted string in style objects.
                        Never unquoted. Never nested inside another quoted string.
                        Correct:   background: 'color-mix(in srgb, #15803d 14%, var(--panel))'
                        Correct:   border: '1px solid color-mix(in srgb, #15803d 30%, var(--panel))'
                        Wrong:     background: color-mix(in srgb, #15803d 14%, var(--panel))
                        Wrong:     border: '1px solid 'color-mix(in srgb, #15803d 30%, var(--panel))''
                        Always run npm run build in the sandbox before handing over any file.

  <select> elements     Always set color: 'var(--ink)' and colorScheme: 'light dark'
                        explicitly on every <select>. Browser OS defaults override
                        theme colours without these. Both are now in s.select and
                        s.formInput in tokens.js. Any inline-styled select must
                        include them too (see FeatureFlags.jsx as the reference).

  Detail page layouts   BrokerDetail and AgentDetail must not have maxWidth on
                        their outer wrapper. They use full available width, the
                        same as Reports.jsx. Never reintroduce a maxWidth constraint
                        on these pages.

  QR code containers    Always background: '#ffffff' — hardcoded, never themed.
                        ISO 18004 requires a white quiet zone. The theme
                        background makes QR codes unscannable on dark themes.

  Vite build gate       Before presenting any modified .jsx or .js file, run
                        npm run build in the sandbox from medbroker-v1/frontend/
                        and confirm it passes. Do not hand over files that have
                        not been build-verified in the current session.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0. NEXT ACTION  (update this block at the end of every session)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Priority: Appointments API build (see §4 + §5).

DARK THEME SWEEP — COMPLETE AS OF 13 JUNE 2026
  All 15 pages pass a full Vite production build (1294 modules, zero errors).
  No hardcoded light-mode hex remains. All colour-mix() values are correctly
  quoted. All <select> elements have color + colorScheme set.

SKILLS TO UPDATE (prompts ready — paste into "Creating personalised AI skills"):
  ⬜ app-builder.skill — add: color-mix() quoting rule; <select> colorScheme
     rule; QR code white container rule; Vite build gate before handover;
     detail pages must not have maxWidth constraint.
  ⬜ code-nodejs skill — add: JSX CSS function quoting rule; build-verify
     before handover.

KNOWN HOUSEKEEPING (non-blocking, no build impact):
  - Stray files in repo: frontend/src/pages/Status.md and frontend/main.jsx
  - docs/ folder referenced in context files does not exist in repo
  - User avatar and theme preference persist in sessionStorage only until
    Users API is built


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW TO START A NEW CHAT
1. Start a new conversation in the MedBroker project
2. Claude will load project files automatically — no need to paste them
3. Say: "Please read the Project_Context.md and Status.md files and confirm
   you have full context before I give you a task."
4. Claude will confirm.
5. Give your task.

If picking up a pending item from Section 5, reference it by name.
e.g. "I want to work on the Appointments API build."

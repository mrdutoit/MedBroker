MedBroker — Project Context (VERCEL VERSION)
==================================================
Scope: this file describes ONLY the Vercel + Neon Postgres deployment of
MedBroker — the version actually built, deployed, and tested every
session since 21 July 2026. It does not cover the separate Azure
Functions / Azure SQL production-target codebase (api/src/, infra/) that
predates this pivot — that work is frozen, tracked in the original
(pre-30 Jul 2026) Project_Context.md/Status.md, and out of scope for this
project going forward per Mark's direction (30 Jul 2026): a separate
Claude project will be started for any future Azure customer build.
Read this file alongside Status_Vercel.md — that one has current build
state and full session history; this one is architecture and standing
conventions.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. WHAT THE SYSTEM IS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MedBroker — a FAIS/POPIA-compliant lead management and broker-matching
platform for a South African medical insurance brokerage. ~50 users
across five roles (GlobalAdmin, Admin, Supervisor, Agent, Broker). Leads
come in, get worked by Agents through a call pipeline, convert into
Appointments, get matched to Brokers, and the Broker records the meeting
outcome (products sold, won/lost). Tasks and Notifications generate
automatically off real events in that pipeline. A public-facing Lead
Portal lets prospects self-register and check in to events without staff
involvement.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. TECHNOLOGY STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Frontend       React 18 (Vite) — client-side SPA, no SSR
  Hosting        Vercel — Root Directory: medbroker-v1/frontend
  Backend API    Vercel Serverless Functions (Node.js), one file per
                 domain under frontend/api/, each a thin router
                 delegating to frontend/api-lib/ (handlers -> services)
  Database       Neon Postgres (serverless Postgres)
  Auth           Local email/password, JWT (HS256), 8-hour expiry —
                 signJwt()/verifyJwt() in api-lib/services/authService.js.
                 No refresh-token flow or explicit revocation exists yet
                 (§ below, SECURITY POSTURE).
  Routing        react-router v7 (declarative mode — BrowserRouter/
                 Routes/Route, no data loaders/actions/RSC)
  Edge security  Vercel Firewall (WAF) — built into the platform itself,
                 not a separate vendor. See SECURITY POSTURE.
  Repository     GitHub -> mrdutoit/MedBroker (public)
                 Folder structure: medbroker-v1/ at repo root
  Deploy         github.dev drag-and-drop upload (Mark has no local CLI
                 on his usual work PC) -> Vercel auto-deploys on push to
                 main. A GitHub Codespace was used once (28 Jul 2026) for
                 an npm-install-from-a-non-registry-source task; not the
                 normal workflow.

NOT part of this stack (was the ORIGINAL plan, superseded 21-22 July
2026, now tracked separately): Azure Functions, Azure SQL, Azure Entra
ID/MSAL, Azure Blob Storage, Bicep, Microsoft 365 Graph API, Calendly,
Zoho. None of these are integrated into the Vercel version. If asked
about any of them, the honest answer is "not part of this build."

THIRD PARTIES actually in play for this version: Vercel (hosting +
edge/WAF), Neon (database), Stripe (token purchase checkout/webhook,
§134, 6 Aug 2026 — only when appointments.tokens.paymentProvider =
'stripe'; not usable for this specific deployment since Stripe doesn't
support South African merchants), Paystack (same, §135, 7 Aug 2026,
only when the flag = 'paystack' — this is the one actually usable in
South Africa), and whichever SMTP provider is configured for email
notifications (Resend by default — see emailService.js). That's the
operator/sub-processor list that actually matters for this deployment
— see SECURITY POSTURE and POPIA / THIRD PARTIES below.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ROLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GlobalAdmin   Internal staff only — never assigned to customers.
              Sees Feature Flags page. Configures feature flags per deployment.

Admin         Customer-facing administrator. Manages users, portfolios,
              subscriptions, system settings. Assigns/reassigns leads and
              appointments. Cannot see Feature Flags.

Supervisor    Manages direct reports (agents and brokers). Sees only leads,
              appointments, tasks, etc. belonging to their direct reports
              (+ their own). Server-enforced everywhere this matters, not
              just a frontend filter — see CRITICAL IMPLEMENTATION RULES.

Agent         Calls leads, logs call outcomes, books appointments.
              Sees only leads/tasks assigned to them. Never sees Appointments list.

Broker        Attends appointments. Records meeting outcomes.
              In assign model: sees appointments assigned to them.
              In claim model: sees My Appointments tab + Available to Claim tab.

Demo-mode role switcher: none — role comes from the real logged-in user
(RoleContext.jsx derives it from AuthContext's user object). CORRECTED
§121 (4 Aug 2026) — this paragraph used to describe a "PERSONAS-based
preview role switcher" and "apiMode.DEMO_MODE" as if both still existed;
neither does. The preview switcher was removed entirely 1 Aug 2026 (§87);
apiMode/DEMO_MODE/ENTRA_MODE (a dead, pre-§114 parallel auth scheme —
see api.js's own header) were removed 4 Aug 2026 as part of SSO stage 4
(§120). Role has been derived from the real authenticated user, local or
SSO, this whole time regardless of what this paragraph claimed.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. DATA MODEL — KEY ENTITIES AND STATUS SETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Schema of record: frontend/db/schema.postgres.sql (+ frontend/db/
migrations/*.sql for incremental changes — Mark runs these against Neon
by hand; Claude has no live DB access from the sandbox, ever).

Lead
  pipelineStatus: Unassigned | Assigned | InProgress | AppointmentScheduled
                  | ClosedLost
  One Lead can have MANY Appointment rows over its lifetime (one-to-many
  since a 23 Jul 2026 schema change) — a failed attempt, a Reopen, and a
  second attempt all leave separate rows, preserved as history.
  Special/sensitive fields (idNumber) are field-level encrypted
  (AES-256-GCM) with a blind-index hash column for exact-match lookups
  without decrypting (encryption.js).
  Portfolio and Products are both many-to-many (LeadPortfolio,
  LeadProduct — migration 028, 14 Aug 2026, §157/§158/§159) — a Lead can
  declare interest across more than one of each, mirroring
  UserPortfolio/BrokerProduct. Both mandatory on the manual "Create Lead"
  form specifically (leadSource === 'ManualEntry'), exempt on CSV/
  subscription bulk import; both editable afterward on LeadDetail.jsx;
  both pre-fill into Book Appointment, still fully editable there. Products
  is scoped to whichever portfolio(s) are currently selected (same
  dependent-selection shape Book Appointment already used for its own
  product picker) — there is no Lead-level product list independent of
  portfolio.

Appointment
  status: Unassigned | Assigned | InProgress | ClosedWon | ClosedLost |
          ReturnedToLeads | Claimed
  Child of Lead. Won/Lost outcome (customerSigned) lives here, not on Lead.
  claimModel flag switches between Admin/Supervisor-assigns-broker vs
  Broker-self-claims-from-a-queue (token economy attaches to claim mode
  specifically — see FEATURE FLAG SYSTEM). claimedByBrokerId/claimedAt/
  claimTokenCost are all real now (§117) — set by claimAppointment()
  (appointmentService.js) when a broker claims from the pool.

Task
  type: Callback | Appointment | Reschedule | Reminder | Outcome | Manual
  entityType/entityId: nullable, polymorphic (Lead OR Appointment OR
  neither for a manually created task). Five system-generation rules,
  all event-driven (no scheduled job needed) — see Status_Vercel.md for
  exactly where each one hooks in. Cascade cleanup (reassign/delete) runs
  when the Lead/Appointment a task is about changes owner or closes out.
  createdById (§69): nullable, always NULL for system-generated tasks,
  always populated for manual ones. A creator's own tasks are always
  visible to them regardless of who they're assigned to — enforced via
  a single shared canSeeTask() helper (§71) used by both the list-view
  scoping and the single-task visibility check; these two used to be
  separate, drift-prone copies, which is exactly how a real visibility
  bug slipped through §69 (list view fixed, single-task check wasn't).

TaskComment (§71)
  taskId, authorId, body, createdAt. No edit/delete — a discussion
  thread is a record of what was said and when, not a document to
  revise (matches AuditLog's own philosophy). ON DELETE CASCADE on
  taskId. Visibility matches the parent Task's — whoever can see a task
  can read and post to its comment thread, no separate permission tier.

Notification
  type: LeadAssigned | AppointmentAssigned | AppointmentReminder |
        CallbackReminder | LeadAutoReturned — all five now wired to real
        triggers (§61 for the first two, action-driven; §68 for the
        last three, a daily Vercel Cron scan — needs CRON_SECRET set in
        Vercel's env vars to actually fire, see Status_Vercel.md §68)
  Always self-scoped — recipientId = the viewer, full stop, no
  cross-user visibility the way Task's admin/supervisor scoping has.

User
  role: GlobalAdmin | Admin | Supervisor | Agent | Broker
  Local auth: passwordHash (NULL for an SSO-only user — real as of §114,
  4 Aug 2026: JIT-provisioned SSO users are created this way), passwordSetAt,
  passwordMustChange, failedLoginAttempts, isLocked.
  Entra SSO (§114, stage 1+2 — see Status_Vercel.md, entraAuthService.js):
  entraObjectId is the primary match key once linked; first-ever SSO login
  matches an existing local row by email and backfills entraObjectId onto
  it rather than creating a duplicate — every FK already pointing at that
  user's id (Lead.assignedAgentId, Appointment.brokerId, AuditLog.
  performedById, etc.) keeps working with no separate merge step. A
  genuinely new identity (no match by oid or email) is JIT-provisioned
  INACTIVE with role='Agent' — that's the review gate; a GlobalAdmin
  activates and sets the real role/portfolio/supervisor via User Admin,
  same surface PUT /api/users/:id/link-identity (GlobalAdmin-only email
  correction + manual identity link/unlink) uses. Stage 3 (password-
  fallback toggle + offboarding sync) and stage 4 (frontend MSAL wiring —
  the actual "Sign in with Microsoft" button) are NOT built yet; see
  Status_Vercel.md §0 NEXT ACTION.
  Password policy (§72, fully real): createUserFull() always sets
  passwordMustChange=true whenever a password is set at creation — a
  manually created user is always forced to set their own on first
  login. Rotation (SystemConfig.passwordRotationDays) and lockout
  (passwordLockoutAttempts) were already enforced at login before §72;
  what changed is they're now admin-configurable (AppAdmin -> System
  Settings), not just backend-enforced with no UI. Self-service and
  forced changes both go through PUT /api/auth/change-password.
  Self-service profile fields (added for Settings, §55-era work):
  themePreference, avatarColour, timezone — separate from admin-editable
  fields (role, portfolios, isActive) via a deliberately narrow
  self-service schema, never a permissive subset of the admin one.

PasswordHistory (§72)
  userId, passwordHash, createdAt. Every hash a user's password has ever
  held. Checked (via bcrypt verifyPassword() against each entry from the
  current calendar year, one at a time — hashes are one-way, no direct
  comparison possible) whenever a new password is set, if
  SystemConfig.passwordPreventReuse is on (default). ON DELETE CASCADE.

TokenLedger / TokenTransaction (§117, token economy)
  One TokenLedger row per Broker (balance = paid tokens, freeRemaining =
  this calendar month's free allocation, lazily reset on read — no cron
  in this stack). TokenTransaction is the append-only history (Credit/
  Debit), never edited. TokenTransaction.externalRef (§134, nullable,
  partial UNIQUE index WHERE NOT NULL) holds a Stripe Checkout Session id
  OR a Paystack transaction reference (§135) for a webhook-originated
  credit ONLY — provider-agnostic by design, this is the idempotency
  mechanism against either provider's documented at-least-once webhook
  redelivery: the guarded INSERT itself is the atomic check, not a
  read-then-write existence lookup. Both providers' webhook handlers call
  the same tokenService.creditPurchasedTokens() to apply it — that
  function was originally named creditStripeTokens() and generalized
  the moment a second provider needed the identical logic (§135), since
  it never actually inspected anything Stripe-specific in the first
  place. NULL for every other transaction type (claim debits, refunds,
  manual admin top-ups, §117).

IntegrationCredential (§134, 6 Aug 2026; extended §135, 7 Aug 2026)
  One row per (organisationId, provider), provider IN
  ('stripe','smtp','paystack'). The ENTIRE per-provider config is
  JSON-encoded and encrypted as a single opaque blob (encryptedConfig)
  via encryption.js's existing envelope encryption — the same
  'kms1'/'demo1' format-aware encrypt()/decrypt() pair Lead.idNumber
  already uses, so this inherits AWS-KMS-when-the-flag-is-on / demo1-
  when-it's-not for free. Deliberately NOT SystemConfig — that table's
  GET is open to any authenticated staff member by design; a payment
  provider secret key or SMTP password needs a different (GlobalAdmin-
  only, both directions) access model entirely. Read/written exclusively
  through api-lib/services/integrationCredentialService.js, which is
  also the ONLY place a decrypted config is ever produced (getRawConfig()
  — internal use only, by stripeService.js/paystackService.js/
  emailService.js; never returned from an HTTP handler). getMaskedStatus()
  is what any handler actually returns — secret fields become
  `<field>Set: boolean` + a last-4-characters preview, never the raw
  value, once saved. Not every provider has the same field shape — see
  integrationCredentialService.js's own SECRET_FIELDS map: stripe has
  two secret fields (secretKey, webhookSigningSecret), paystack has one
  (secretKey — Paystack reuses it for both API calls and webhook
  signing, no separate signing secret exists), smtp has one (password).

Organisation
  Multi-tenancy-ready, single-tenant today. resolveOrganisationId() in
  api-lib/context/tenant.js is the one chokepoint every query goes
  through — currently always returns the single seeded default org.
  Activating real multi-tenancy later is a change to that one function,
  not a rewrite of every query (already parameterised on organisationId
  throughout).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. FEATURE FLAG SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Managed via: Admin -> Feature Flags (GlobalAdmin only)
Database table: FeatureFlag (flagKey, label, valueType, value, tier, isPhase2)
Frontend: FlagContext.jsx — fetches from GET /api/flags on startup

Tier: Core (vary per customer — review at onboarding)
  auth.sso.enabled                boolean  false  (real backend gate since §114, 4 Aug 2026 —
                                                     POST /api/auth/entra-login checks this and
                                                     403s if off; frontend MSAL login button
                                                     (stage 4) not built yet, so nothing on the
                                                     UI actually reaches that endpoint today)
  auth.sso.provider               enum     none | microsoft | google   [sub: auth.sso.enabled = true;
                                                     Google is NOT built — Entra ID first, per
                                                     §110's decision, Google deferred to a future
                                                     customer-demand-driven release]
  appointments.claimModel         enum     assign | claim
  appointments.tokens.paymentProvider enum none | stripe               [sub: claimModel = 'claim']
  events.enabled                  boolean  true
  leads.autoUnassign.enabled      boolean  true
  tasks.enabled                   boolean  false   (real backend since 28 Jul 2026 — still off by default)

Tier: Operational (can be changed at any time)
  leads.importCsv.enabled         boolean  true
  leads.importSubscription.enabled boolean true   (this channel is a UI mockup only —
                                                     see LeadImport.jsx's own header comment)
  leads.occupationFilter.enabled  boolean  true
  reports.agentDetail.enabled     boolean  true
  reports.brokerDetail.enabled    boolean  true
  notifications.email.enabled     boolean  false  (real email sending not built — Notifications
                                                     the in-app inbox is separate and partially real)
  appointments.thirdMeeting.enabled boolean false

Tier: Phase2 (features NOT YET BUILT — toggling has no effect)
  broker.tokenIncentives.enabled  boolean  false
  popia.subjectAccessRequest.enabled boolean false

CLAIM MODEL flag (appointments.claimModel):
  'assign' — Admin/Supervisor assigns brokers to appointments.
  'claim'  — Brokers self-select from an Available to Claim queue
             (region + product matched, same rule brokerMatchingService.js
             uses for the assign model's own matching); claiming is
             immediate (no admin confirmation step), and debits
             TokenLedger via tokenService.js. REAL as of §117 (4 Aug 2026)
             — was frontend-mock-only before that (see models/appointment.js's
             pre-§117 header if ever curious what the staging note used to
             say). appointments.tokens.paymentProvider has THREE real
             values now: 'stripe' (§134, 6 Aug 2026) — built, but not
             usable for this deployment since Stripe doesn't support
             South African merchants at all; 'paystack' (§135, 7 Aug
             2026, Stripe-owned, ZAR-native, South-Africa-supported) —
             the one actually usable here; and 'none' (§117, manual
             top-up by Admin/GlobalAdmin via UserAdmin.jsx's Token
             Balance section). All three are independent, coexisting
             funding rails, not a staged replacement of one by another
             — switching the flag doesn't remove any of them. Stripe and
             Paystack share almost everything underneath (raw-body
             webhook verification, TokenTransaction.externalRef
             idempotency, tokenService.creditPurchasedTokens()) — see
             Status_Vercel.md §134/§135 for the full build and
             verification of each.


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

Medical Subscriptions (lead import sources, seeded — the import channel
itself is a UI mockup, not wired to anything real):
  MedLeads SA — Monthly Bundle, Healthwise Doctor Database,
  SA Medical Register — Q2 2026


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

medbroker-v1/
└── frontend/                          <- the entire Vercel app lives here
    ├── src/
    │   ├── context/
    │   │   ├── AuthContext.jsx         Real session state over authStore.js.
    │   │   │                           Consumes ThemeContext (applies saved
    │   │   │                           theme on login) — safe because
    │   │   │                           AuthProvider is nested under ThemeProvider.
    │   │   ├── RoleContext.jsx         useRole(), PERSONAS (Entra-branch
    │   │   │                           fallback only — see §3)
    │   │   ├── FlagContext.jsx         FlagProvider, useFlags(), flag()
    │   │   ├── ThemeContext.jsx        ThemeProvider, useTheme(), THEMES,
    │   │   │                           THEME_IDS (exported for AuthContext)
    │   │   └── ProspectAuthContext.jsx Separate auth entirely for the
    │   │                               public Lead Portal — own JWT
    │   │                               signing secret, own session store
    │   ├── hooks/
    │   │   ├── useFetch.js
    │   │   └── useWindowSize.js
    │   ├── styles/tokens.js            Named exports only, no default export.
    │   │                               s, colors, radius, shadow, type,
    │   │                               CHART_PALETTE, APPT_STATUS_META,
    │   │                               STATUS_META, PORTFOLIO_META.
    │   │                               Colours resolve to CSS variables —
    │   │                               the whole layer reskins on theme switch.
    │   ├── services/
    │   │   ├── api.js                  Every *Api client object (leadsApi,
    │   │   │                           appointmentsApi, tasksApi,
    │   │   │                           notificationsApi, usersApi,
    │   │   │                           brokerMatchingApi, etc.), plus
    │   │   │                           ApiError, request()
    │   │   ├── msalAuth.js             NEW §120 — the ONLY place MSAL is
    │   │   │                           touched beyond static config
    │   │   │                           (authConfig.js); dynamically
    │   │   │                           imported from AuthContext's
    │   │   │                           ssoLogin(), not a static import,
    │   │   │                           so a deployment that never enables
    │   │   │                           SSO never ships MSAL to its users
    │   │   └── authStore.js            Session persistence + updateUser()
    │   │                               for patching cached session state
    │   │                               after a self-service profile save
    │   ├── constants/
    │   │   ├── leadOptions.js          TITLES, JOB_TITLES
    │   │   └── avatarOptions.js        AVATAR_OPTIONS, avatarColourValue()
    │   ├── components/
    │   │   ├── Logo.jsx
    │   │   └── AuditLogList.jsx
    │   ├── pages/                      One file per route — LeadList,
    │   │   │                           LeadDetail, LeadImport,
    │   │   │                           AppointmentList, AppointmentDetail,
    │   │   │                           AgentDetail, BrokerDetail, Reports,
    │   │   │                           Settings, UserAdmin, AppAdmin,
    │   │   │                           FeatureFlags, SingleSignOn,
    │   │   │                           Notifications, Tasks, EventList,
    │   │   │                           EventDetail
    │   │   └── portal/                 Public Lead Portal — PortalRegister,
    │   │                               PortalActivate, PortalLogin,
    │   │                               PortalDashboard, PortalCheckIn,
    │   │                               PortalCheckinConfirm
    │   ├── themes.css                  4 themes: linen (default) | terra |
    │   │                               midnight | ember. CSS-variable contract.
    │   ├── App.jsx                     Single BrowserRouter for the whole
    │   │                               app (both StaffApp and PortalApp
    │   │                               nest under it, no second Router).
    │   │                               Sidebar badges (Tasks, Notifications)
    │   │                               fetch real counts in this mode.
    │   └── main.jsx
    ├── api/                            <- Vercel Serverless Functions.
    │   │                               ONE FILE = ONE FUNCTION on Vercel,
    │   │                               regardless of vercel.json rewrites —
    │   │                               currently sitting at exactly 12,
    │   │                               Hobby plan's hard ceiling. Check
    │   │                               `find frontend/api -type f -name
    │   │                               "*.js" | wc -l` (nested files count
    │   │                               too) before adding any new one.
    │   ├── auth-router.js
    │   ├── leads-router.js             + /sources, /check-duplicates sub-routes
    │   ├── users-router.js             + /me sub-route
    │   ├── flags-router.js
    │   ├── appointments-router.js      + /broker-matching, /:id/assign,
    │   │                               /:id/reassign, /:id/return,
    │   │                               /:id/outcome, /:id/audit,
    │   │                               /tokens/* (incl. §134's checkout +
    │   │                               webhook) sub-routes. bodyParser
    │   │                               disabled file-wide (§134, for the
    │   │                               Stripe webhook's raw-body
    │   │                               signature check) — see this
    │   │                               file's own header for how it
    │   │                               still serves its five pre-
    │   │                               existing JSON routes unchanged.
    │   ├── reports-router.js
    │   ├── events-router.js
    │   ├── portal-router.js            Public Lead Portal's own auth path
    │   ├── tasks-router.js             + /mark-all-read... no, that's notifications.
    │   │                               Plain GET/POST/:id PATCH/DELETE
    │   ├── notifications-router.js     + /mark-all-read sub-route
    │   ├── health.js                   Standalone diagnostic — DB connectivity check
    │   └── system-config.js            Admin-only settings, + /integrations
    │                                   slug sub-tree (§134, Stripe + SMTP
    │                                   credentials — GlobalAdmin only,
    │                                   unlike this file's own base GET) —
    │                                   candidate for folding into
    │                                   flags-router.js if the function
    │                                   count needs headroom later
    ├── api-lib/                        Everything the routers above delegate to.
    │   ├── handlers/                   One per domain — parses/validates
    │   │                               requests, calls services, shapes responses
    │   ├── services/                   Actual data access + business logic —
    │   │                               leadService, appointmentService,
    │   │                               taskService, notificationService,
    │   │                               userService, authService,
    │   │                               brokerMatchingService, auditService,
    │   │                               encryption, db, eventService,
    │   │                               leadPortalService, reportService,
    │   │                               flagService, systemConfigService,
    │   │                               portfolioService, sarService,
    │   │                               schedulerService, entraAuthService
    │   │                               (+ tests), entraGraphService,
    │   │                               tokenService (§117 — token economy;
    │   │                               creditPurchasedTokens() is shared by
    │   │                               both payment providers below, §135),
    │   │                               tokenPacks (§135 — pack/pricing
    │   │                               definitions shared by stripeService
    │   │                               and paystackService, extracted the
    │   │                               moment a second provider needed the
    │   │                               identical numbers),
    │   │                               integrationCredentialService (§134 —
    │   │                               encrypted Stripe/Paystack/SMTP
    │   │                               credential storage),
    │   │                               stripeService (§134 — not usable for
    │   │                               this deployment, Stripe doesn't
    │   │                               support South Africa),
    │   │                               paystackService (§135 — the payment
    │   │                               provider actually usable here,
    │   │                               ZAR-native, no SDK dependency),
    │   │                               emailService (§78, DB-first/env-
    │   │                               fallback since §134),
    │   │                               appointmentStatusService (+ tests),
    │   │                               leadStatusService (+ tests)
    │   ├── models/                     Zod schemas — one per domain
    │   ├── middleware/
    │   │   ├── auth.js                 Local JWT validation (staff)
    │   │   └── portalAuth.js           Separate JWT validation (prospects)
    │   ├── context/tenant.js           resolveOrganisationId()
    │   └── http/helpers.js             applyCors, parseSlug, isUuid
    ├── db/
    │   ├── schema.postgres.sql         Schema of record — kept cumulative
    │   │                               (a fresh DB from this file matches
    │   │                               production exactly)
    │   ├── feature-flags.postgres.sql
    │   └── migrations/                 Incremental ALTER-style files,
    │                                   numbered — Mark runs these by hand
    │                                   against Neon; no live DB access
    │                                   exists from the sandbox, ever
    ├── vercel.json                     Rewrites (one per router) +
    │                                   Cache-Control on /assets. NO
    │                                   security headers configured yet
    │                                   (CSP, HSTS, etc.) — see SECURITY POSTURE.
    ├── vite.config.js
    └── package.json                    react-router@7.18.2,
                                        xlsx: aliased to
                                        npm:@e965/xlsx@^0.20.3* (fixed
                                        14 Aug 2026, §157 in
                                        Status_Vercel.md),
                                        stripe@22.4.0 (§134, 6 Aug 2026),
                                        engines.node: "24.x"
                                        *SheetJS can no longer publish to
                                        the npm registry under the name
                                        xlsx at all (npm account issue on
                                        their end) — 0.18.5, with two
                                        known CVEs, is a permanent
                                        ceiling for that package name.
                                        @e965/xlsx is an automated,
                                        npm-registry-native mirror of
                                        SheetJS's own patched releases;
                                        the alias means no import
                                        statement anywhere needed to
                                        change.

NOT part of this project (separate, frozen, tracked elsewhere): api/src/
(Azure Functions), infra/ (Bicep), mobile/.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. CRITICAL IMPLEMENTATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THEME SYSTEM: 4 themes on a CSS-variable contract (themes.css). tokens.js
resolves everything to var(--whatever) so the design-token layer reskins
automatically — never hardcode a hex value in a component; use tokens.js
or a CSS variable directly.

tokens.js NAMED EXPORTS ONLY — never `import tokens from`. Always read
tokens.js before touching any component.

useRole() HOOK ONLY — never import the RoleContext object directly.

COLOR-MIX() IN JSX STYLE OBJECTS must always be a quoted string:
  Correct: background: 'color-mix(in srgb, #15803d 14%, var(--panel))'
  Wrong:   background: color-mix(in srgb, #15803d 14%, var(--panel))
  The unquoted form is a syntax error esbuild catches at build time.

SELECT ELEMENTS need explicit color: 'var(--ink)' — browser OS defaults
override theme colours on <select> without it. color-scheme is
theme-driven (set per [data-theme] block in themes.css), never set
inline on individual inputs — that makes native controls follow the OS's
light/dark preference instead of MedBroker's selected theme.

BACKEND DATE SERIALIZATION: the Postgres driver returns TIMESTAMPTZ/DATE
columns as native JS Date objects, not strings — still true after §137's
move from pg.Pool to @neondatabase/serverless's HTTP driver (12 Aug
2026): confirmed via the installed package's own source and its
documented guarantee that HTTP-driver results match its WebSocket Pool/
Client, which itself uses the same pg-types OID-to-parser mapping pg
does (DATE/TIMESTAMPTZ -> Date object). Not exercised against a live
Neon endpoint from this sandbox (no network path to neon.tech here), so
worth Mark spot-checking one date-bearing field for real post-deploy —
but this is not expected to have changed, and nothing in this rule's own
advice below changes either way. String(dateObj) calls .toString(), which
omits the year in a way that silently defaults to 2001 if ever re-parsed
via new Date(...) on the frontend (a real bug this cost — "Overdue
9129d" on a task due in 3 days). Always .toISOString().slice(0, 10) on a
raw Date object from a query result, never String(...).slice(0, 10).
Frontend code slicing a value already received via a JSON API response
is safe (JSON.stringify already calls .toISOString() on any Date object
crossing that boundary) — this only bites backend code serializing a raw
pg result directly.

GlobalAdmin MISSING FROM requireRole() ALLOW-LISTS is a recurring real
bug on new routes — check every new route explicitly includes it
alongside Admin.

EMPTY-STRING OPTIONAL FIELDS break Zod .optional() — apply a
stripEmpty()-style helper to new create/update payloads.

HTML datetime-local INPUTS need z.string().datetime({ local: true }) —
the default z.string().datetime() requires a timezone offset the input
never produces.

CLIENT HIDES, SERVER ENFORCES — every permission/lock boundary in this
app follows this split (Supervisor scoping, Lead edit-lock/Reopen,
Task's admin-vs-assignee split, etc.). Any new gate should too — never
trust a frontend-only check for anything that actually matters.

VERCEL FUNCTION COUNT: every file directly under frontend/api/ is a
separate serverless function on Vercel, REGARDLESS of what vercel.json's
rewrites do — a nested file (frontend/api/broker-matching/index.js) once
got missed in a count for exactly this reason. Hobby plan hard limit is
12. Currently sitting at exactly 12/12 — check the real count (`find
frontend/api -type f -name "*.js" | wc -l`) before adding any new
top-level API surface; system-config.js folding into flags-router.js is
the natural next consolidation if headroom is needed.

RAW-BODY ROUTES ON A SHARED VERCEL FUNCTION (§134, 6 Aug 2026) — a
function file's `export const config = { api: { bodyParser: false } }`
is FILE-WIDE, not per-route, because one file is one Vercel function
regardless of how many logical routes vercel.json's rewrite dispatches
to it (see VERCEL FUNCTION COUNT above — same underlying fact, different
consequence). appointments-router.js needed this for the Stripe webhook
(signature verification needs the exact raw bytes; re-serializing an
already-JSON-parsed body doesn't reliably round-trip byte-for-byte), but
five OTHER routes already living in that same file needed req.body to
stay a plain parsed object exactly as before. The fix, now the standing
pattern for this situation: disable bodyParser file-wide, read the raw
stream once via readRawBody() (http/helpers.js) before dispatching, and
for every route except the one that genuinely needs raw bytes,
immediately JSON.parse the raw buffer into req.body — reproducing
exactly what Vercel's automatic parser used to do, so none of those
other routes' handlers need to know this ever happened. If a future
raw-body need (another webhook, a file upload, etc.) lands in a
different existing router file, follow this same shape rather than
re-deriving it — see appointments-router.js's own header comment for
the worked example.

CSV/EXCEL FORMULA INJECTION: any free-text field populated from an
externally-supplied file (bulk lead import) gets a leading-quote prefix
if it starts with =, +, -, or @ (neutralizeFormulaInjection() in
leadService.js's createLead(), applied unconditionally — manual entry
too). Closed 28 Jul 2026; don't reintroduce a raw-write path that skips it.

FEATURE FLAGS, TWO DIFFERENT ENFORCEMENT PATTERNS — know which one a new
flag needs before building it. Most flags (tasks.enabled,
popia.subjectAccessRequest.enabled) are frontend-visibility-only: they
gate a nav item/tab/route client-side via useFlags(), never re-checked
server-side, because the real security boundary for those features is
role (requireRole()), already enforced independently. A smaller set
(notifications.email.enabled, security.kmsEncryption.enabled, §112) gate
actual backend BEHAVIOUR — which code path runs, not just what's visible
— and those are read server-side via getFlagMeta() (services/
flagService.js), a live DB query, not the frontend's cached FlagContext
value. Don't assume a new flag only needs the frontend pattern just
because most existing ones use it — ask whether the flag is hiding a UI
element or actually changing what the server does, and pick accordingly.

STAFF SESSION AUTH: httpOnly cookie (mb_session), not a bearer token in
sessionStorage — changed 4 Aug 2026, §113. setAuthCookie()/
clearAuthCookie()/getAuthCookie() in http/helpers.js; every request from
the frontend needs credentials: 'same-origin' explicitly set for the
cookie to attach (services/api.js's request() and the two direct-fetch
export functions all do this — match that pattern for any new direct-
fetch call that bypasses request()). The permissive CORS Origin-
reflection in applyCors() is safe with this cookie in play ONLY because
of two things holding together: SameSite=Strict on the cookie, and
Access-Control-Allow-Credentials never being set to true. Don't loosen
either without re-examining CORS at the same time — see applyCors()'s
own comment for the full reasoning. Lead Portal auth (a structurally
separate JWT/cookie boundary, ProspectAuthContext) got the SAME
treatment as of §115 (4 Aug 2026) — its own httpOnly cookie
(mb_portal_session), its own setPortalAuthCookie()/clearPortalAuthCookie()/
getPortalAuthCookie() trio, deliberately not the staff functions
parameterised with a different name — see http/helpers.js for why. Both
cookies coexist safely in the same browser: separate names, separate
signing secrets (config.localAuth vs config.portalAuth), same SameSite=
Strict/no-credentials-header CORS reasoning applying to both.

MANAGED KEY/SECRET SERVICES ON THIS STACK: AWS KMS, not a self-hosted
option (Vault, etc.) — chosen 4 Aug 2026 for encryption.js's field-level
encryption (§111/§112) specifically to avoid adding a standing service
to run and maintain; stays a managed API call, consistent with the
Vercel+Neon-only infrastructure philosophy elsewhere in this project.
Precedent for any future "we need real secret/key custody, not an env
var" need on this stack.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. TEST ACCOUNTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CORRECTED §121 (4 Aug 2026) — this section used to be titled "MOCK DATA —
PREVIEW PERSONAS" and described PERSONAS in RoleContext.jsx as "a
fallback for a theoretical Entra branch that was never actually wired to
a real identity source," with role/identity said to come from
"apiMode.DEMO_MODE." None of that has been true since 1 Aug 2026 (§87
removed the preview switcher) and 4 Aug 2026 (§114/§120 built and wired
real Entra SSO, and removed apiMode/DEMO_MODE entirely). What's left and
still genuinely true: these are real local-auth accounts used throughout
development, nothing more special than that. Test accounts used
throughout development: Chantelle Hattingh (Supervisor), Steve Madden
(Agent), Sandra van der Berg (Broker), Werner Hattingh (Admin).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. TENANCY & DELIVERY MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model: single-tenant, multi-tenant-ready.
  organisationId is NOT NULL on every tenant-owned table, DEFAULT'd to a
  single seeded default org — single-tenant deployment sets nothing extra.
  resolveOrganisationId() (api-lib/context/tenant.js) is the one
  chokepoint every query resolves organisationId through. Activating
  real multi-tenancy later is a change to that one function's internals
  (resolve from validated token/host instead of a hardcoded default) —
  not a rewrite of the data layer, which is already parameterised on
  organisationId throughout (leadService, appointmentService, taskService,
  notificationService, eventService, brokerMatchingService — everything).
  NOT YET DONE if/when multi-tenancy actually activates: enable
  row-level security as the real enforcement boundary (today's DEFAULT
  constraint is a convenience, not a security control by itself);
  consolidate/plan instance DBs.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11. DESIGN SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4 themes on a CSS-variable contract: linen (default, light), terra,
midnight, ember. Variables: --bg --panel --ink --mut --line --accent
--accent2 --live --limited --danger --glow. Theme choice is real and
persisted server-side (User.themePreference, PUT /api/users/me) for the
logged-in user, applied instantly on selection and again automatically
on a fresh login (AuthContext consumes ThemeContext for this specifically).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. SECURITY POSTURE & MANDATORY CONTROLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rewritten 30 Jul 2026 for the Vercel-only scope of this project. The
control CATEGORIES below are unchanged from general security practice;
what changed is which specific technology answers each one, since this
build was never actually deployed on Azure.

EDGE / TRANSPORT
  WAF — DECISION CHANGED 30 Jul 2026: the original plan (Cloudflare Pro
    in front of an Azure origin, ~R400/mo) is void — there is no Azure
    origin. Use Vercel's own built-in Firewall instead:
      - Included on EVERY Vercel plan, including Hobby (free) — DDoS
        mitigation and Attack Mode are on by default, no configuration
        needed. IP blocking and Custom Rules are available immediately
        (Hobby: up to 3 rules each; Pro, $20/mo: up to 100 IP-block
        rules, up to 40 Custom Rules; Enterprise adds Managed Rulesets).
      - Rate limiting specifically is a Pro-plan-and-above feature, not
        included on Hobby — relevant to the still-open "rate limiting on
        authenticated endpoints" control below.
      - CONFIRMED 3 Aug 2026 (§100, checked against Vercel's current
        docs directly): rate limiting is NOT automatic on Pro. Being on
        the plan only makes it available to configure — someone must
        create a Custom Rule in the Firewall tab (or vercel.json / the
        @vercel/firewall SDK) specifying target paths, threshold,
        algorithm, and action. It's also a separately metered cost
        (~$0.50/million allowed requests), not bundled into the flat
        Pro subscription. Mark's decision: defer to this rather than
        build a custom Postgres-backed limiter, given the customer's
        real deployment will be on Pro — but the Custom Rule itself
        still needs to be configured against the customer's actual
        Vercel account before it does anything. See §100 for the
        specific endpoints to prioritise (the public,
        unauthenticated ones — staff/portal login, portal
        register/activate/walkin) and suggested starting thresholds.
      - Do NOT add Cloudflare in front of Vercel as well — per Vercel's
        own published guidance, running Cloudflare in proxy mode ahead of
        Vercel degrades client signals and creates two overlapping WAF
        layers in the same request path (Vercel's is already embedded at
        its own edge, not sitting behind a separate origin the way the
        Azure comparison assumed). One edge security layer, not two.
      - Configure via the Firewall tab in the Vercel dashboard, or
        vercel.json for rule-as-code. Not yet configured beyond the
        platform defaults — this is the standing action item, not
        something this delivery can complete on its own (it's a
        dashboard action against a real Vercel account, not a code
        change) — do this before go-live.
  ⬜ Browser security headers (CSP, X-Content-Type-Options, Referrer-
     Policy, Permissions-Policy, HSTS) — vercel.json currently only sets
     Cache-Control on /assets, nothing else. Configure via vercel.json's
     headers array.
  ✅ HTTPS — Vercel auto-provisions TLS for every deployment; nothing to
     configure.

LOGGING / AUDIT (POPIA/FAIS accountability)
  ✅ Tamper-evident audit trail of who viewed/changed special PI —
     writeAuditLog() (auditService.js) is called from every state-
     changing route across Leads, Appointments, Users, Tasks — this is
     an enforced convention, not a one-off (the "A4 gate" — no new
     state-changing route ships without an audit write).
  ⬜ Special PI (ID numbers, medical detail) never written to logs —
     Vercel's own function logs are the relevant surface now, not Azure
     App Insights. Not specifically audited yet.

APPLICATION
  ✅ IDOR / Supervisor scoping — enforced server-side, consistently,
     across every domain that needs it: Leads, Appointments, Tasks
     (Agent/Broker: own only; Supervisor: self + direct reports; Admin/
     GlobalAdmin: everything). Notifications sidesteps this entirely by
     being always self-scoped regardless of role.
  ✅ CSV/Excel formula injection — closed (§ CRITICAL IMPLEMENTATION RULES).
  ✅ Password policy (§72) — rotation, lockout, and calendar-year reuse
     prevention all admin-configurable and enforced; manually created
     users always forced to change their password on first login. See
     PasswordHistory above and Status_Vercel.md §72 for the full build.
  ✅ Token lifecycle — RESOLVED 3 Aug 2026 (§97). A single
     sessionsRevokedAt timestamp on User, checked as part of the same
     per-request lookup validateToken() already does for the isActive/
     isLocked check — no new query. A self-service password change now
     revokes every previously-issued token and immediately reissues a
     fresh one for the session that just made the request; an Admin can
     also force-logout a specific user without deactivating their
     account. A stolen token can no longer outlive a password change by
     up to 8 hours.
  ⬜ Rate limiting on authenticated endpoints — DECISION 3 Aug 2026
     (§100): defer to Vercel's Pro-plan WAF rate limiting rather than
     build a custom Postgres-backed limiter, since the customer's real
     deployment will be on Pro. Confirmed directly against Vercel's
     current docs that this is NOT automatic — it requires a Custom
     Rule actually configured in the Firewall tab against the
     customer's real Vercel account (dashboard action, not a code
     change), and it's a separately metered cost on top of the base
     subscription. Still an open, standing action item until that
     configuration is actually done — see §100 for the specific
     endpoints to prioritise and suggested starting thresholds.
  ⬜ Bulk-export / report exfiltration limits — not implemented.

CLOUD POSTURE
  Neon Postgres — connection via a standard connection string
    (executeQuery/executeQueryOne in db.js), not Azure's Managed
    Identity model. UPDATED §137 (12 Aug 2026): db.js runs on
    @neondatabase/serverless's neon() HTTP driver now, not pg.Pool — no
    persistent connection held between invocations at all, which is
    what actually fixed the Audit Log/Reports/Integrations failures
    §137 was built for (a stale pooled connection surviving Vercel's
    freeze/thaw cycle with no error handler on it, not a query bug).
    DATABASE_URL is unchanged either way. Backup/PITR is Neon's own
    built-in capability (point-in-time recovery), not something to
    configure separately the way Azure SQL geo-redundancy was.
  ✅ TLS certificate verification — RESOLVED AS A SIDE EFFECT OF §137
     (12 Aug 2026), not independently tightened. Originally found 30 Jul
     2026 (§70): db.js set ssl: { rejectUnauthorized: false } on the
     pg.Pool, so the connection was encrypted but the certificate wasn't
     verified. The HTTP driver has no equivalent override — it goes over
     standard HTTPS via fetch(), which validates the certificate by
     default with nothing in this codebase disabling that. Confirmed by
     reading the installed package's connection options (arrayMode/
     fullResults/fetchOptions/isolationLevel/readOnly/deferrable/
     authToken/disableWarningInBrowsers — no TLS-skipping option among
     them), not assumed from the driver switch alone.
  ⬜ Backup/restore actually tested (Neon's PITR capability exists;
     hasn't been exercised).
  ⬜ Least-privilege DB role/grants — the app currently connects with
     whatever privilege level the connection string grants; not
     reviewed for least-privilege specifically.

SUPPLY CHAIN / ASSURANCE
  ⬜ Dependency + secret scanning; SAST/DAST in CI — none configured.
     Manual npm audit review has been the practice this session (see
     Status_Vercel.md for the specific findings and decisions on
     react-router, xlsx, ESLint, Vite/Vitest).
  ⬜ Penetration test before go-live.

POPIA / THIRD PARTIES
  Operator (sub-processor) list for THIS version: Vercel, Neon, and —
  UPDATED §135 (7 Aug 2026) — Stripe (only once
  appointments.tokens.paymentProvider is actually set to 'stripe'; not
  usable for this specific deployment, Stripe doesn't support South
  African merchants at all), Paystack (same, only when the flag =
  'paystack' — the one actually usable here, Stripe-owned but a
  legally/operationally separate processor relationship), and whichever
  SMTP provider is configured (Resend by default, or a customer's own
  mail server/M365 — see emailService.js). Microsoft/Calendly/Zoho were
  part of the original Azure plan and were never integrated here.
  ⬜ Operator agreements: Vercel, Neon, Paystack (once enabled — the
     provider actually relevant to this deployment), SMTP provider.
     Stripe's own agreement only matters if a future non-SA customer of
     this codebase actually enables that provider — not relevant here.
  ⬜ Cross-border transfer assessment — relevant if Vercel/Neon's actual
     data-residency region isn't South Africa (worth explicitly
     confirming which region Neon is provisioned in). Neither Stripe nor
     Paystack ever see card details directly — both checkout flows are
     redirect-based (§134/§135) — but the broker's name/email/token
     purchase record still crosses to whichever processor is active,
     worth the same assessment as Vercel/Neon once actually enabled for
     a customer. Paystack specifically: South Africa-based Paystack
     accounts settle in ZAR and are themselves a South African-relevant
     entity for this purpose, which may simplify this assessment
     relative to Stripe — worth checking Paystack's own current data-
     residency/sub-processor documentation when this becomes live,
     rather than assuming either way from here.
  ⬜ Breach-notification process; Information Officer registered.
  ⬜ POPIA Subject Access Request (SAR) endpoint — flag exists
     (popia.subjectAccessRequest.enabled), admin endpoint not built.

None of the ⬜ items above are live exposure today in the sense of an
active breach — they're go-live gates, appropriate to close before real
client PI flows through this system, not before then.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. KNOWN DECISIONS AND RATIONALE (SELECTED — VERCEL-RELEVANT ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Lead statuses reduced to 5: Won/Lost outcome lives on Appointment
  (customerSigned), not on Lead. Lead only needs to know if the pipeline
  is open or closed.

Lead <-> Appointment cardinality is one-to-many (changed 23 Jul 2026): a
  Lead can accumulate multiple Appointment rows over time (a failed
  attempt, a Reopen, a second attempt), all preserved as history. "The"
  appointment shown on Lead Detail is the most recent by createdAt; the
  full set is surfaced via LeadDetail's Appointment History card and
  GET /api/appointments?leadId=.

Claim model — no admin confirmation step: claiming is immediate. Broker
  clicks Claim -> appointment status = Assigned -> appears in My
  Appointments. No ClaimPending status, no admin confirmation queue.

Products on Lead — built 14 Aug 2026 (§157/§158/§159, migration 028).
  Mandatory only on the manual Create Lead form (leadSource ===
  'ManualEntry'), exempt on CSV/subscription bulk import — Mark's
  decision, mirrors exactly how Portfolio-on-Lead already worked (§142
  item 2). Built as a full parallel to Portfolio throughout, not just the
  creation-form slice: also editable afterward on LeadDetail.jsx, also
  pre-fills into Book Appointment. Scoped to the Lead's selected
  portfolio(s) — no portfolio-independent product list.

Mixed-basis conversion metrics — ratio, not '%', wherever the shape is
  closedAt-scoped numerator over createdAt-scoped denominator (can
  exceed 100% in a period where more deals close than were newly
  booked). Started with Agent booking rate (§154, 13 Aug 2026), extended
  to Broker conversion and all four §151 breakdown-report Conversion
  columns 14 Aug 2026 (§158) — Mark's standing instruction going
  forward: this shape should read as a ratio, not a percentage, anywhere
  it appears; don't reintroduce a '%'-formatted version of it.

Task generation — REDESIGNED 12 Aug 2026 (session 20 design, session 21
  build — see Status_Vercel.md §138 for the full history). Core test,
  Mark's own framing: a Task needs BOTH a concrete action owed AND a
  real due date. If either is missing — the action already happened at
  the moment of the triggering event, or the resulting state is already
  visible elsewhere without a dedicated queue item — it's a Notification
  or nothing, not a Task. Down to 2 event-driven rules (Callback,
  Assign-broker) from an original 5; Reschedule and Held/Outcome-pending
  both dropped to zero events entirely, not moved to Notification —
  their state is already visible on the entity itself. System-generated
  Tasks (Callback, Assign-broker) are deliberately NOT completable from
  the Task list — completion only happens by acting on the actual
  entity (logging a call on the Lead; assigning a broker on the
  Appointment), which auto-completes the Task as a side effect. Manual
  tasks keep direct completion. This has a nice side effect: it makes
  Tasks.jsx role-scoped without any filter code to maintain — Callback
  only ever reaches Agents, Assign-broker only ever reaches Supervisors,
  so a Broker's task list is Manual-only by construction.

Supervisor routing for Assign-broker tasks is by REGION, not by the
  agent's own line management — an agent's supervisor has nothing to do
  with broker capacity. Every User row (Agent/Broker/Supervisor/Admin
  alike) carries its own region and supervisorId columns already,
  region isn't broker- or agent-specific. Ties to a creation-time
  validation requirement: Agent/Broker require supervisorId at
  creation, Supervisor requires region at creation — otherwise the
  region-based lookup this depends on can silently come up empty.

SESSION-ISOLATION CAUTION (found 12 Aug 2026, session 20): AuthContext
  caches the active user in sessionStorage, which is genuinely per-tab —
  but the actual auth boundary, the mb_session httpOnly cookie, is
  shared across every tab in the same browser, InPrivate windows
  included if more than one tab shares one window. Testing multiple
  roles/users at once in tabs of the same browser WILL silently
  cross-contaminate which session is actually live for a given request,
  while each tab's own UI keeps showing whichever user it last rendered
  for. Produced at least one apparent "bug report" this session that
  turned out to likely be this, not a code defect — before accepting a
  live-testing bug report involving "the wrong user" as evidence of a
  code problem, ask whether multiple tabs/windows of the same browser
  were open with different logins at the time.

Self-service vs admin-editing split: PUT /api/users/me (self, narrow
  schema — displayName/avatarColour/themePreference/timezone only) is
  structurally separate from PUT /api/users/:id (Admin/GlobalAdmin,
  broader schema — role/portfolios/isActive). Deliberately not a
  permissive subset relationship — a self-edit can never reach a
  privilege field even by accident. The same admin-vs-self split pattern
  repeats for Task's isComplete-vs-everything-else permission boundary.

Cascade cleanup for Task exists because nothing else did: reassigning or
  deleting a Lead/Appointment now correctly reassigns or deletes any
  incomplete Task tied to it (deleteTasksForEntity/reassignTasksForEntity
  in taskService.js) — this didn't exist when Task's generation rules
  were first built, and was a real, if narrow, gap until fixed.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. STANDING SESSION PROTOCOL (unchanged from before the split)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Hydrate from GitHub via codeload tarball at session start:
   https://codeload.github.com/mrdutoit/MedBroker/tar.gz/refs/heads/main
   Watch for the nested medbroker-v1/medbroker-v1/ double-folder
   artifact and flatten it before doing anything else.
2. Read Status_Vercel.md's current-state summary and this file before
   accepting any task.
3. Read tokens.js before touching any frontend component.
4. Flag scope decisions upfront before building.
5. Run npm run build + npx vitest run + node --check + an ESM import
   smoke test on every edited backend file before packaging.
6. Re-hydrate from GitHub and diff every file in a delivery against live
   state before packaging, when in doubt.
7. Update both Status_Vercel.md and this file at the end of every
   session — and, learned the hard way twice in one week: when
   something gets built, go back and correct EVERY place that used to
   say it wasn't, not just the newest summary. A disclaimer pointing to
   the "real" current-state section doesn't reliably stop someone
   reading the stale section first.

Delivery packaging (unchanged): single ZIP preserving repo-relative
folder structure, filename medbroker-<topic>-YYYYMMDD-HHMM.zip using the
actual current date/time, Status_Vercel.md/Project_Context_Vercel.md
presented standalone as well as inside the zip whenever either changes.

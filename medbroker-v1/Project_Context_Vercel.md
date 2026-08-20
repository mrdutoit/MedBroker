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
                  | Closed
  Corrected 14 Aug 2026 (§166) — this line previously said "ClosedLost",
  which was never a real value (checked the actual CK_Lead_Status
  constraint directly: the fifth value has always been 'Closed'). Set in
  two places: leadService.js's call-outcome-close path (a lead closed
  via a direct call outcome, never reached an appointment), and — new,
  §166 — appointmentService.saveOutcome(), the moment an Appointment
  closes ClosedWon or ClosedLost, GUARDED against another still-open
  Appointment for the same Lead. Before §166 this second path didn't
  exist at all — a lead whose deal was genuinely finished stayed
  permanently stuck at whatever status it last held, the specific bug
  Mark found while testing.
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
  region (migration 032, 14 Aug 2026, §166): nullable VARCHAR(50), one
  of the nine SA provinces (REGIONS, leadOptions.js). Mandatory on
  manual Create Lead only, same split as Portfolio/Products. No
  backfill for existing leads — same "don't invent a field with no
  home" reasoning throughout this session. Carried onto Appointment.region
  at booking time; what assignLead() (leadService.js) checks the target
  Agent's own region against, rejecting a cross-region assignment when
  both are set and genuinely differ (lenient, not strict, when either
  side is unset); what claim-model broker matching
  (listAvailableToClaim, appointmentService.js) reads first now, falling
  back to the Appointment's own Agent's region only for pre-migration
  appointments that never had a Lead.region to carry forward. Full
  account of the architectural finding underneath this (region was
  ALREADY captured, but only ephemerally, in Book Appointment's own
  broker-search dropdown, never persisted) lives in Status_Vercel.md
  §166.

Appointment
  status: Unassigned | Assigned | InProgress | ClosedWon | ClosedLost |
          ReturnedToLeads | Claimed
  Child of Lead. Won/Lost outcome (customerSigned) lives here, not on Lead.
  lostReason (§163, 14 Aug 2026, migration 030): nullable VARCHAR(50),
  CHECK-constrained to six fixed categories (PriceTooHigh/ChoseCompetitor/
  NoLongerInterested/Uncontactable/NotEligible/Other) — Claude's own
  design choice, not an exhaustive taxonomy. Captured in the same
  outcome-save flow as customerSigned = false (AppointmentDetail.jsx),
  not a separate action; the frontend blocks saving until one's picked,
  the Zod schema itself stays optional.
  claimModel flag switches between Admin/Supervisor-assigns-broker vs
  Broker-self-claims-from-a-queue (token economy attaches to claim mode
  specifically — see FEATURE FLAG SYSTEM). claimedByBrokerId/claimedAt/
  claimTokenCost are all real now (§117) — set by claimAppointment()
  (appointmentService.js) when a broker claims from the pool.
  region (migration 032, 14 Aug 2026, §166): nullable VARCHAR(50),
  carried straight from Lead.region at booking time (createAppointment(),
  appointmentService.js) — not independently editable, a copy for query
  convenience. This is what claim-model broker matching
  (listAvailableToClaim) reads first now, COALESCE-falling-back to the
  Appointment's own Agent's region only when this is null (a pre-
  migration appointment that never had a Lead.region to carry forward).
  See Lead's own region entry above for the fuller account.

MeetingAttempt (§138 spec, session 20; §164 build, 14 Aug 2026, migration
  031) — replaces the old flat meeting{1,2,3}Date/Status/Feedback columns
  on Appointment (still present on the table, deliberately NOT dropped —
  unused by application code, kept until the backfill is confirmed
  correct in production, a follow-up cleanup migration removes them
  later). Append-only, one row per ATTEMPT of a meeting number, matching
  CallAttempt's own established pattern exactly (organisationId,
  recordedById, createdAt as the natural ordering) — a reschedule creates
  a NEW row rather than editing the old one, so history is never
  silently overwritten the way it was before.
  meetingNumber: 1, 2, or 3 (3 only reachable when
  appointments.thirdMeeting.enabled is on).
  status: Scheduled (default, not yet decided) | HeldInterested |
  HeldNotInterested | Rescheduled | Cancelled | Missed. Cancelled/Missed
  added back 15 Aug 2026 (§172, migration 034) — REVERSES the 14 Aug
  decision (this same entry, one day earlier) to collapse them into
  Rescheduled. Mark's real-world case: a client cancelling or not
  showing, with no reschedule happening at that moment, is genuinely
  different from one being actively rebooked, worth reporting on
  separately — even though all three route IDENTICALLY at the mechanics
  level (a new row, same meeting number, no outcome form; "it's still
  the first meeting if a subsequent one gets set up," Mark's own
  framing). Migration 034 also RECOVERED the original Cancelled/
  Rescheduled distinction for data migration 031 had already collapsed —
  possible because the old flat meeting{1,2,3}Status columns were never
  dropped, so the source values were still there to recover from, not
  guessed at.
  cancelReason: nullable, only meaningful when status = 'Cancelled' —
  Missed has nothing to categorise (no communication happened by
  definition), so free-text `notes` is the only place to record context
  for a no-show. Structured, not free text, same reasoning as
  Appointment.lostReason.
  followUpRequired: nullable boolean, asked ONLY when status is saved as
  HeldInterested AND this isn't the last configured meeting number —
  resolved server-side (saveMeetingAttemptOutcome, appointmentService.js),
  never trusted from the client.
  Full routing table (this IS the redesign's actual logic, not just its
  schema) lives in saveMeetingAttemptOutcome()'s own header comment — see
  that function directly, or Status_Vercel.md §164/§172 for the build
  account, including two real bugs found during §164's own manual
  frontend review (neither caught by the build or test suite).
  status is now OPTIONAL on the save endpoint (SaveMeetingAttemptSchema)
  as of 16 Aug 2026 (§176) — a real gap Mark found: saving a row still
  required BOTH date and status together, so there was no way to record
  just a follow-up meeting's DATE without being forced to also record
  its OUTCOME before the meeting had even happened. Omitting status now
  saves the date only (recordedById, notes too) and leaves the row at
  'Scheduled', still open, still awaiting a real outcome later —
  handled as an early-return branch in saveMeetingAttemptOutcome(), not
  the four-branch routing table (which only ever applies once a real
  status is actually being recorded). recordedById doubles as the
  frontend's own signal for "has this row been touched since creation"
  (AppointmentDetail.jsx's isOriginalMeeting1Date, see below) — null
  only on the pristine row createAppointment() creates at booking time;
  every other row, including one that's only ever had its date saved,
  gets it stamped.

isOriginalMeeting1Date (AppointmentDetail.jsx, MeetingAttemptForm) — the
  signal for locking a meeting-1 row's date field, since only the
  original booking-time row's date should be immutable there. CHANGED
  16 Aug 2026 (§176) from `!!attempt.date` to `attempt.recordedById ===
  null` — the date-based check broke the moment a date-only save (above)
  became possible: saving just a date onto a rebooked meeting-1 row
  makes attempt.date truthy, which under the old check would have
  locked that same row right back up, reintroducing the exact bug §174
  had just fixed. recordedById is the more robust signal — true only
  for the row nobody has ever saved anything onto since createAppointment()
  created it.

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
        CallbackReminder | LeadAutoReturned | TaskAssigned |
        TaskDueReminder | AppointmentUnassignedWarning — eight now (this
        line was stale before 14 Aug 2026, §160 — missed TaskAssigned/
        TaskDueReminder, added §98, 3 Aug 2026; corrected here alongside
        adding the newest one rather than compounding the gap). First
        two/action-driven ones wired §61; TaskAssigned §98;
        AppointmentReminder/CallbackReminder/LeadAutoReturned/
        TaskDueReminder/AppointmentUnassignedWarning all run off the
        same daily Vercel Cron scan (schedulerService.js) — needs
        CRON_SECRET set in Vercel's env vars to actually fire, see
        Status_Vercel.md §68.
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
  ✅ POPIA Subject Access Request (SAR) endpoint — CORRECTED 20 Aug 2026,
     this line was stale (previously read "flag exists, admin endpoint
     not built"). Confirmed live this session, direct code read:
     sarService.js/sarHandlers.js/models/sar.js implement full request
     tracking (Received → InProgress → Fulfilled/Rejected, locked once
     terminal — assertNotLocked()), assignment to Admin/GlobalAdmin, a
     comment thread (SarComment), and compileSubjectData() — a genuine
     full export of everything MedBroker holds on a Lead (profile incl.
     decrypted ID number, call attempts, appointments + meeting history,
     tasks, the Lead's own audit trail), gated Admin/GlobalAdmin
     (sarHandlers.js requireRole). This is the POPIA right-of-ACCESS
     path (s23-s25) — see the new gap analysis immediately below for
     what it does not cover.

None of the ⬜ items above are live exposure today in the sense of an
active breach — they're go-live gates, appropriate to close before real
client PI flows through this system, not before then.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12a. POPIA / FAIS COMPLIANCE — GAP ANALYSIS AND BACKLOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Added 20 Aug 2026, at Mark's request, going into the client's Feb 2027
pickup break. Verified against a fresh GitHub hydration, code read
directly rather than inferred from prior session notes. Two specific
gaps Mark flagged going in are both confirmed real; a third
(unencrypted browser transport of security headers) was already tracked
above and is repeated here only because it's genuinely POPIA/FAIS-
relevant, not edge hygiene for its own sake.

GAP 1 — RIGHT TO ERASURE (POPIA s14(5), s24(1)(b)): SOFT-DELETE ONLY,
DOES NOT ACTUALLY DESTROY DATA.
  deleteLead() (leadService.js) sets Lead.deletedAt = NOW() and removes
  the Lead's incomplete Tasks. Nothing else changes. Every other
  column — idNumberEncrypted, idNumberHash, dateOfBirth, medicalAid/
  medicalAidProvider/existingCover/currentInsurer/policies, email,
  mobile/whatsapp numbers, university/degree, hospitalOrPractice —
  stays fully intact and, for idNumber, still decryptable. The route is
  correctly role-gated (Admin/GlobalAdmin) and audited (LeadDeleted),
  and its own code comment already labels it "POPIA right to erasure" —
  the labelling is right, the implementation only does half the job.
  s14(5) requires destruction or deletion "in a manner that prevents
  its reconstruction in an intelligible form"; a soft-delete flag is
  the opposite of that by design — it exists specifically to filter a
  record out of active queries while leaving it fully reconstructable,
  which is exactly what deletedAt IS NULL indexes throughout this
  schema do.

  This is not simply "call the real DELETE statement instead" — FAIS's
  own record-keeping obligation (General Code of Conduct: client
  records kept a minimum of five years from termination of the
  financial service) is itself a lawful basis under POPIA s14(1) to
  keep some of what a Lead/Appointment holds, even against an erasure
  request. POPIA anticipates exactly this conflict: s14(6) provides a
  RESTRICTION path — stop actively processing the record, but don't
  destroy it — for information the responsible party is still
  authorised to retain (s14(6)(a): "retention of the record is
  required or authorised by law"). Two distinct capabilities are
  missing, not one:
    - TRUE ERASURE, for Leads with no live FAIS retention obligation
      (never progressed past initial contact, no appointment/advice
      ever given) — irreversibly strip or de-identify PII fields in
      place, not just flag deletedAt.
    - RESTRICT-AND-RETAIN, for Leads where a FAIS retention window is
      still running — PII locked from further display, processing, or
      export; the transactional/compliance skeleton (that advice was
      given, when, appointment outcome) kept for the statutory window,
      then purged on schedule.

GAP 2 — FIELD-LEVEL ENCRYPTION SCOPED TO idNumber ONLY.
  Carried forward from the Jun 2026 code review (finding E4,
  MedBroker_Security_Code_Review_Findings.docx) — confirmed unchanged
  by reading encryption.js directly this session. idNumberEncrypted/
  idNumberHash use genuinely solid envelope encryption (AES-256-GCM,
  random per-value data key, KMS- or DEMO_ENCRYPTION_KEY-wrapped,
  format-versioned for clean key-scheme migration) — this is not the
  weak point. Every other Lead field sits in application-layer
  plaintext: dateOfBirth, email/mobile/whatsapp, hospitalOrPractice,
  occupation, university/degree, and — the fields closest to POPIA
  s26's "special personal information" (health) — medicalAid/
  medicalAidProvider/existingCover/currentInsurer/policies.
  Neon provides disk-level encryption at rest as a platform default,
  which covers "someone steals the physical storage volume" — it does
  not cover "someone with valid DB credentials, or a SQL injection
  foothold, reads the table," which is the more realistic exposure for
  a hosted Postgres deployment and the actual reason idNumber got
  field-level treatment in the first place.
  RECOMMENDATION: extend field-level encryption to the health/insurance
  fields at minimum (medicalAid, medicalAidProvider, existingCover,
  currentInsurer, policies) — closest to s26 and to FAIS advice-record
  sensitivity. dateOfBirth/contact fields are lower priority: genuinely
  useful in plaintext for search/matching, less damaging in isolation.
  This is a Mark decision to make explicitly, not a default to drift
  into — matches finding E4's own original framing.

GAP 3 — BROWSER SECURITY HEADERS (repeated from the control list above
for POPIA s19 "appropriate technical measures" framing specifically).
  vercel.json sets no CSP/HSTS/X-Content-Type-Options/Referrer-Policy/
  Permissions-Policy — only Cache-Control on /assets. No defense-in-
  depth against XSS beyond React's default JSX escaping. Cheap, low-
  risk fix — see the security audit addendum (docs/security/) for the
  actual header block to add.

CARRIED FORWARD, UNCHANGED FROM THE EXISTING CONTROL LIST ABOVE:
operator agreements (Vercel/Neon/Paystack/SMTP), the cross-border
transfer assessment (confirm Neon's actual provisioning region),
breach-notification process, and Information Officer registration.

BACKLOG — ADD TO Status_Vercel.md OUTSTANDING ITEMS, COMPLIANCE-CRITICAL,
CLOSE BEFORE COMMERCIAL GO-LIVE (none are live exposure today — same
framing as the ⬜ list above):
  1. Lead erasure/anonymisation capability — both the true-erasure and
     restrict-and-retain paths from Gap 1. Wire to the SAR workflow: a
     SAR currently models only an access request (SarStatus has no
     request-type distinction) — needs a requestType field
     (Access | Deletion) and deletion-specific fulfilment logic that
     checks the Lead's live FAIS retention position before choosing
     erase vs. restrict.
  2. Decide and implement field-level encryption scope beyond idNumber
     (Gap 2) — Mark's decision, recommend the five health/insurance
     fields listed above as the minimum bar.
  3. vercel.json security headers (Gap 3).
  4. Confirm Neon's provisioning region; complete the cross-border
     transfer assessment if it isn't South Africa.
  5. Operator agreements: Vercel, Neon, Paystack, SMTP provider.
  6. Breach-notification process documented; Information Officer
     registered with the Information Regulator.
  7. Formal data retention schedule — per-record-type, not ad hoc:
     FAIS's five-year minimum for transaction/advice records against
     POPIA's default "no longer than necessary for the purpose" for
     everything else. Item 1's erase-vs-restrict decision needs this as
     a concrete ruleset, not a per-request judgement call.
  8. Enable security.kmsEncryption.enabled for the actual client
     production deployment before go-live. Off by default today, which
     means DEMO_ENCRYPTION_KEY — an unrotated Vercel env var — is what
     actually protects idNumber in practice until this flag is switched
     on and AWS KMS is configured.


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

Unassigned Appointment Warning — built 14 Aug 2026 (§160, migration
  029), Claude's design (Mark delegated full scoping authority: "yes,
  please scope and build"). Fires N days (SystemConfig.
  appointmentUnassignedWarningDays, default 2, admin-configurable) before
  an Appointment's own date if it's still status = 'Unassigned' — the
  same status both claim and assign model leave a broker-less
  appointment at, so one check covers both with no claimModel branching.
  Deliberately NOT feature-flag-gated, unlike leads.autoUnassign.enabled
  — this is a pure notification (matching AppointmentReminder/
  CallbackReminder/TaskDueReminder, none of which are flag-gated
  either), not a job that mutates data. Recipient routing pattern worth
  reusing elsewhere if a similar need comes up: LEFT JOIN the relevant
  open Task (if one exists) and notify whoever currently holds it
  (respects manual reassignment since creation) rather than
  re-deriving a routing decision from scratch; only fall back to a
  fresh region-based lookup when no such Task exists at all.

Donut pattern (DonutBreakdown, ReportsWidgets.jsx) — CURRENT DESIGN as
  of 16 Aug 2026 (§187), a structural rebuild after six earlier passes
  (§175, §178, §179, §180, §183, §184, §186 — seven, actually) each
  fixed something real without ever landing Mark's actual point: the
  component had almost no visual weight of its own, so no amount of
  show/hide or interactivity logic could make a row of them read as
  intentional. §187 was built directly from a reference dashboard Mark
  supplied, keeping this app's own theme tokens throughout (Mark's
  explicit instruction — structural rebuild, not a re-skin). Read this
  note, not the git-archaeology of how it got here, for what the
  component actually does today:

  Card is 360px wide (up from 220px — needs to hold a donut AND a real
  side legend together, not stacked in a narrow column), donut 104px
  with a CENTRE LABEL (the total count, via a position:absolute overlay
  div — simpler and more controllable than fighting Recharts' own
  <Label> geometry). Legend sits BESIDE the donut, not below it, one row
  per category, each showing the VALUE AND PERCENTAGE inline, ALWAYS —
  never hover-only. Hover still works (Tooltip unchanged from §179,
  cursor={false} still mandatory — see below) but is a bonus on top of
  always-visible numbers now, not the only way to see them. Each legend
  row uses alignItems:'flex-start' (not centre) so a long label
  (cancellation/loss reasons routinely run 25-35 characters) wraps onto
  a second line without dragging the value/% column down with it.

  ONE CONSISTENT TREATMENT for 1 category or many — §184's separate
  "compact stat" branch (no ring, just a bare number, for a single real
  category) is GONE. A real donut with a centre label and a legend row
  is MORE informative at n=1 than a bare number ever was — it still
  shows the count, the label, AND the percentage in the same visual
  language as every other card — and having two different visual
  treatments for "one category" vs "many" was itself part of why the
  page didn't read as one coherent product. A genuine 0-value category
  (e.g. Closed Lost when nothing's been lost yet) now gets its own
  explicit legend row too ("Closed Lost: 0 (0%)") rather than being
  omitted — more complete information, not less, matching "show real
  numbers always."

  Both empty branches (total===0, "no data at all"; realTotal===0,
  "data exists but it's entirely the Not-captured bucket" — a
  genuinely different fact, wireable via the optional
  notCapturedMessage prop) still render inside the SAME card chrome as
  the populated case. Don't let either branch fall through to the
  generic EmptyState component — differently-sized, built for a
  different job (a whole section being empty, not one card in a set).

  Used ONLY for genuine parts-of-a-whole data (every item sums to 100%
  of something real), never for ranked tables or the sequential
  pipeline stages — §156's original restraint principle, unchanged.
  Optional `title` prop labels an individual donut when more than one
  is shown side by side (e.g. "Region · Won" / "Region · Lost" as a
  pair) — the parent section's own heading isn't enough to distinguish
  them at that point; ALWAYS reserved (visibility:hidden when absent),
  never conditionally rendered — a title-less card and a titled card
  need identical internal structure for flexbox's own align-items:
  stretch to equalise a row of them correctly.

  cursor={false} on the Tooltip — MANDATORY on any <Pie> in this
  codebase, not optional. Recharts' Tooltip cursor prop defaults to
  true, built for Cartesian charts; a <Pie> has no "column" for it to
  highlight, so leaving the default on renders a stray rectangle
  unrelated to the chart (§179's own finding).

  shadow.sm on the card — same shared token s.card/s.metricCard already
  use everywhere else on this page and this app. CORRECTED 16 Aug 2026
  (§189) — §187's own first pass used one-off values (border:
  colors.lineSoft, radius.lg, shadow.xs) instead of these shared tokens
  (colors.line, radius.md, shadow.sm), a real inconsistency: the
  rebuilt donut cards had a visibly different border weight and shadow
  than their own immediate neighbours (KPI cards, Section wrappers).
  STANDING RULE: any new card-shaped element on this page should reach
  for s.card/s.metricCard's own values first, not invent a new
  one-off — "contemporary design system" means applying the existing
  system consistently, not introducing a second one beside it.

  CATEGORICAL_PALETTE is six fixed hex values, deliberately NOT theme
  CSS variables — needs to stay mutually distinct regardless of active
  accent theme, which a single rotating theme variable can't guarantee.
  Leaves the --pl-unassigned/--pl-assigned/--pl-progress/--pl-booked/
  --pl-won/--pl-lost tokens in themes.css (added 13 Aug 2026, §151
  follow-up, for a donut removed in the §156/§162 rebuild) genuinely
  orphaned — zero references in frontend/src as of 16 Aug 2026.

  STANDING RULE FOR THE ROW AROUND THESE CARDS, 16 Aug 2026 (§187): cap
  the wrapping row at maxWidth: 1160px (fits 3 of the current 360px
  cards per line) — with cards this wide, an uncapped row with only 1-2
  items (§186 correctly suppresses the rest some periods) will stretch
  across an entire wide monitor with nothing filling the remainder. A
  bounded, intentional grid, not open-ended width waiting to be filled
  — check this is still in place before adding a new breakdown row.

  EXTENDED 16 Aug 2026 (§189) — EVERY card meant to sit in this row
  must be a TRUE FLEX CHILD of the row's own container, never a
  separately-wrapped <div> below or beside it, even if it looks
  visually similar. Loss reasons was built as its own block with
  marginTop instead of a sibling inside the flex row — worked fine in
  isolation, but could never flow into leftover space in the row above
  it (By Portfolio · Won/Lost only filled 2 of 3 slots), so it always
  forced a new line regardless of how much room was actually available.
  Exact same failure shape as §183's own WonLostPair fix (a card
  outside the flex container can't be equalised or flowed by CSS on the
  container alone) — check for this specific pattern (a donut/card
  wrapped in its own <div> "just to add spacing") whenever adding
  anything new to one of these rows.

  LABEL LENGTH, 16 Aug 2026 (§189) — this page's own display labels
  (CANCEL_REASON_LABELS, LOST_REASON_LABELS, Reports.jsx) don't have to
  match the fuller, more descriptive labels used in the actual
  selection UI (AppointmentDetail.jsx's own dropdowns) word-for-word.
  The legend column here has real width constraints a full-width
  <select> doesn't; a label that reads fine in a dropdown can still
  wrap awkwardly in a 360px card's legend. When a legend label is
  flagged as too long, shorten the DISPLAY copy specifically rather
  than trying to fix it purely with layout (wrapping/truncation) —
  check whether the category name itself has an obvious shorter form
  first, and only reach for CSS truncation if it genuinely doesn't.

STANDING LAYOUT PRINCIPLE, 16 Aug 2026 (§182) — don't give related
  content its own separate full-width block/card just because it was
  built in a different session or a different pass. Before adding a new
  breakdown/chart/table to Reports.jsx, check whether it's the same
  underlying theme as something already on the page (Won/Lost by any
  cut, any breakdown of the same appointment set, etc.) and if so, put
  it in the SAME section, in the SAME flex-wrap row, not a new stacked
  block below it. Mark's own direct question after the §175-through-
  §181 saga: "why could these not be displayed next to each other?" —
  the honest answer was "no good reason, they were just built at
  different times." A single donut (or any card) floating alone in an
  otherwise-empty full-width row is the visible symptom; the actual
  fix is consolidation, not making that one card bigger.

  EXTENDED 16 Aug 2026 (§183) — consolidating into one flex-wrap row
  isn't enough on its own if any item in that row is wrapped in its own
  extra <div> (a group heading, a label, anything). align-items:stretch
  (flexbox's own default) only equalises TRUE SIBLINGS at the same DOM
  level — it can't reach through an intermediate wrapper to equalise a
  card two levels deep against one that's a direct child. When putting
  multiple DonutBreakdowns in one row, every one of them must be a
  direct child of that row — if a set needs its own label (a Won/Lost
  pair, for instance), put the label INSIDE each DonutBreakdown via its
  own `title` prop (compound titles like "Region · Won" work fine),
  never as a separate wrapping <div> around the group. This is why
  WonLostPair returns a bare fragment of two DonutBreakdowns now, not a
  labelled wrapper — check that pattern before adding a new paired or
  grouped donut anywhere on this page.

  EXTENDED AGAIN 16 Aug 2026 (§186), THEN REVERTED THE SAME DAY (§188)
  — §186's own reasoning: several secondary breakdowns in a row could
  each independently degenerate to "100% of the one thing that exists"
  — technically correct, still decorative, since they were each just
  restating the same headline number a different way. §186 suppressed
  any such breakdown that had fewer than 2 distinct real categories to
  compare. That reasoning was built against the PRE-§187 card design —
  §184's compact stat, a bare number with minimal visual weight. §187
  rebuilt DonutBreakdown to carry real weight (a centre label, a full
  legend with values and percentages) regardless of category count,
  which quietly removed the actual justification for §186's
  suppression: a single-category card isn't decorative anymore, it
  confirms real data and shows the exact count in the same visual
  language as every other card. Mark's own reaction on seeing §187
  applied — "where are all the other graphs?" — confirmed the
  suppression was hiding real, working data for no remaining reason.

  CURRENT STANDING RULE, post-§188: don't suppress a breakdown just
  because it's currently single-category. DonutBreakdown's own design
  (§187) is meant to carry real weight at any category count — trust
  that, rather than re-deriving a "is this worth showing" threshold at
  the call site. Show a breakdown whenever there's genuinely any data
  for it (the simple non-empty check, not a variety threshold). If a
  future pass finds a genuine reason to suppress something again, make
  sure that reason survives independently of whatever DonutBreakdown's
  own visual weight happens to be at the time — §186's mistake was
  coupling a display decision to a card design that was itself still
  being iterated on, so a later, unrelated change to the card silently
  invalidated the suppression logic without anyone revisiting it.

STANDING SKILL OBLIGATION, 16 Aug 2026 (§182) — this environment has a
  frontend-design skill (/mnt/skills/public/frontend-design/SKILL.md)
  that should be read before any UI/visual layout work on this page (or
  any page), not just component logic changes. It wasn't consulted once
  across the entire §175-§181 donut saga, and its own stated principles
  ("Structure is information," "treat failure and emptiness as moments
  for direction, not mood," "elegance is executing the chosen vision
  well") directly diagnose problems Mark had to point out manually that
  should have been caught before delivery. Load it before touching
  layout/spacing/empty-state design on this page again.

WonLostPair (Reports.jsx, page-local — NOT exported from
  ReportsWidgets.jsx) — built 16 Aug 2026 (§180) for Won vs Lost's new
  "By Region" / "By Portfolio" breakdowns, Mark's own explicit request
  for genuinely different data rather than a redundant re-rendering of
  the same Won/Lost split. Two DonutBreakdowns side by side (Won |
  Lost) under one shared heading, not a single combined donut — a
  "dimension × outcome" donut would need up to 18 slices (9 SA
  regions × 2 outcomes) for no real gain over two clean, honest donuts
  capped at 9 slices each. Deliberately kept page-local rather than
  promoted into ReportsWidgets.jsx — this specific "two donuts paired
  under one label" composition is a Won-vs-Lost-section concern, not a
  generic building block the way DonutBreakdown itself is; promote it
  only if a second, genuinely different section needs the exact same
  shape, not preemptively.

  wonVsLost.wonByRegion/lostByRegion/wonByPortfolio/lostByPortfolio
  (reportService.js, getDashboardData()) — region needed a genuinely
  new query (no existing breakdown grouped by region anywhere in this
  file before); portfolio needed none at all, derived directly from
  portfolioTable, already computed earlier in the same function for
  the existing Portfolio Performance table. Region's COALESCE to 'Not
  captured' matters — Appointment.region is nullable, only populated
  since 14 Aug 2026 (§166, migration 032), so any appointment booked
  before that carries none; same honest-labelling pattern as loss/
  cancel reasons rather than silently dropping those rows.

  REAL BUG, 16 Aug 2026 (§181), caught by Mark's own testing within
  minutes of delivery: the region query's first draft aliased its
  COALESCE output as `region` — but Lead ALSO has its own region
  column, joined into the same query, so `GROUP BY region` was
  genuinely ambiguous (three candidates: the output alias, l.region,
  a.region) and Postgres correctly threw rather than guess. STANDING
  RULE for this file, not just this one query: always alias a computed
  GROUP BY column to "groupKey" (matching every other breakdown query
  here — Lead Source, Portfolio, Meeting Type, loss/cancel reasons all
  already do this), never to a human-readable name that might match a
  real column on anything joined into the query. Region is the one
  dimension in this codebase that's a genuine column on BOTH Appointment
  and Lead simultaneously — the collision risk is real, not theoretical,
  and will recur for any future query that groups by it under any alias
  other than groupKey.

  THE REAL BUG, 16 Aug 2026 (§185) — "Lost" means status = 'ClosedLost',
  STRICTLY, everywhere in this file. mergeClosedMetrics() used to fold
  ANY non-ClosedWon row into "lost" (an `else`, not an `else if`),
  silently including ReturnedToLeads appointments — sent back to the
  pool, not a sales rejection. This directly contradicted an EXPLICIT
  design decision already on record from when ReturnedToLeads was first
  built, months earlier: "it's not a sales outcome, so lumping it in
  would skew win/loss reporting." §151 built mergeClosedMetrics()
  without cross-referencing that decision, and it silently spread to
  nine breakdowns through the shared helper alone, plus three more
  inline queries that hand-rolled the same pattern (getReportSummary's
  own pipeline bucket, and getDashboardData's own inline Trend/pipeline
  copies) — twelve locations total, found by grepping the whole file
  for every ReturnedToLeads reference and checking each one in context,
  not assumed identical from one match. Caught when Mark checked the
  RAW appointment table directly and found zero ClosedLost rows against
  a report showing "Lost: 1" — a genuinely different and more powerful
  verification method than anything used earlier in this saga (§180's
  region query was itself an attempt to FIX a symptom of this bug by
  matching the broken convention, making things worse, not better).

  STANDING RULE, not just for this specific bug: when a shared
  aggregation helper's behaviour seems surprising or hard to explain,
  check whether an EARLIER, more specific design decision already
  answered the question — grep Status_Vercel.md for the relevant status/
  concept before assuming a later, broader convention is the authoritative
  one. The broader convention here (mergeClosedMetrics' catch-all else)
  was actually the newer, less-considered one; the narrower, more
  specific decision (ReturnedToLeads excluded, stated with an explicit
  reason) predated it and should have won.

  Two OTHER ReturnedToLeads references in this same file were correctly
  left unchanged (checked in context, not assumed identical): the CASE-
  statement checks classifying whether a lead's most recent appointment
  is "still active" (AppointmentBooked pipeline stage) — a genuinely
  different question (is this appointment still open) from whether it
  represented a sales loss. Don't conflate these if touching either area
  again.

List sort — two genuinely different implementations on this codebase,
  by design, not inconsistency. AppointmentList.jsx sorts CLIENT-SIDE:
  the whole page is built on fetching every matching appointment in one
  request and filtering/sorting/counting KPIs against that in-memory
  array — no pagination UI at all. LeadList.jsx sorts SERVER-SIDE
  (LeadListQuerySchema.sortKey/sortDir, models/lead.js; listLeads(),
  leadService.js, mapping the validated enum through a fixed
  SORT_COLUMN whitelist of real column expressions, never interpolating
  the value itself) — Leads is genuinely paginated (25/page), so a
  client-side sort would only ever reorder whatever page happened to be
  loaded, silently ignoring every other page's rows. Building a new
  sortable list: check whether it already fetches everything (client-
  side sort is fine, simpler) or paginates (needs the real,
  server-side, whitelisted-column version — the Leads implementation is
  the template).

Appointments pageSize — REAL BUG, found 16 Aug 2026 (§177) while
  building the sort work above, not something Mark asked about
  directly: AppointmentList.jsx called appointmentsApi.list({}) with no
  pageSize, silently defaulting to AppointmentListQuerySchema's own 25
  (cap was 100) while the entire page treats the result as if it were
  complete. Cap raised to 2000, frontend now requests it explicitly —
  not real pagination, a deliberate choice to keep this page's existing
  fetch-everything architecture rather than rebuild it just to fix a
  default that was set too low. A visible warning banner
  (apptData.total > apptData.appointments.length) now covers the case
  where even 2000 isn't enough, so a future silent truncation is no
  longer possible the way this one was — if that banner ever actually
  fires, that's the signal real pagination has become genuinely
  warranted, not a signal to raise the cap again.

Manual Entry — its own page as of 16 Aug 2026 (§177), LeadNew.jsx,
  route /leads/new, gated on role only (Admin/Supervisor/GlobalAdmin,
  matching handleCreateLead's own requireRole() — leadHandlers.js).
  Previously tab 3 of LeadImport.jsx; moved out because it was
  accidentally also gated on that page's CSV/Subscription import
  feature flags purely by living inside it, despite having nothing to
  do with either. If any future feature needs "can this user create a
  lead" as a gate, requireRole()'s own list is the source of truth —
  don't infer it from which page/button happens to lead there.

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

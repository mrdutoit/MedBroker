# Code Review Fixes (30 Sep 2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every verified Critical/Important finding from the 30 Sep 2026 code review of the Vercel codebase, plus the confirmed frontend Minors and repo housekeeping.

**Architecture:** Targeted fixes in place — no restructuring. Server-side enforcement is added where only the client gated; one shared access helper replaces four copies of appointment scoping; one migration (039) replaces a full unique constraint with a partial index.

**Tech Stack:** Node 24, Vercel functions (`frontend/api`, `frontend/api-lib`), Neon Postgres via `db.js` (`executeQuery(query, { name: { type, value } })`), zod, React 18 + Vite, vitest, Playwright.

**Spec:** the verified findings tables (authority for root cause and fix location):
- `/private/tmp/claude-501/-Users-markdutoit-Documents-GitHub-MedBroker/8e1afd4a-d840-4ec6-a131-8db7597beabc/scratchpad/review/verified-security.md` (IDs `S-C1`, `S-I2`… below = its `C1`, `I2`…)
- `…/scratchpad/review/verified-logic.md` (`L-I1`… = its `I1`…; `L-I1` = getPriorPeriodRange, confirmed by controller)
- `…/scratchpad/review/verified-frontend.md` (`F-I1`…)
- `…/scratchpad/review/tests-ci.md` (`T-I1`…)
Owner rulings (Mark, 30 Sep 2026): sensitive-field changes are kept in the audit log encrypted and hidden, and anonymised on POPIA erasure (Task 4/5); existing lead registering on the portal is **always refused and sent to Activate**; a claimed token is **never refunded** on return/reassign (forfeited); POPIA erasure **is extended** in this pass.

All paths below are relative to `medbroker-v1/frontend/` unless they start with `medbroker-v1/` or `.github/`.

## Global Constraints

- No dependency changes: package.json and both lockfiles stay untouched.
- Every `requireRole()` allow-list keeps `GlobalAdmin`.
- "Client hides, server enforces": every rule added in the UI must also be enforced server-side (and vice versa where the plan says so).
- Closed records are immutable: an Appointment in `ClosedWon` / `ClosedLost` / `ReturnedToLeads`, or a Lead with `pipelineStatus = 'Closed'`, is not changed by any write path except the existing Reopen endpoints and POPIA erasure.
- South African time: Johannesburg is UTC+02:00 with no daylight saving; Vercel runs in UTC. Use a fixed `+02:00` offset where a wall-clock SAST value must become an instant.
- Read-only dates display as `d MMM yyyy`.
- HTTP errors keep the existing shape: `res.status(n).json({ error: '<message>' })`; services signal with `throw { status, message }` as they already do.
- Comments match the codebase's dated-narrative style, briefly: `// 30 Sep 2026 — <why>` at the change. No essays.
- Tests: vitest files live beside the module (`*.test.js`). Service/handler tests mock `../services/db.js` (or the service modules) with `vi.mock`; no test may need a real database.
- After every task: `npm test --prefix medbroker-v1/frontend` and `npm run build --prefix medbroker-v1/frontend` pass. After frontend-touching tasks also `npm run test:e2e` (run from `medbroker-v1/`, needs `export PATH=~/.local/node/bin:$PATH`).
- Commit per task on branch `fix/code-review-20260930`; message `fix(<area>): <what>` ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A Supervisor acting on an appointment whose agent is not a direct report and not themself → 403 (not silently allowed). Pinned in Task 1.
2. A Broker recording a meeting result on an unclaimed appointment (brokerId null) → 403. Pinned in Task 1.
3. Reassigning an already-`AppointmentScheduled` lead keeps its status. Pinned in Task 7.
4. A callback typed as 09:00 in the browser is stored as 07:00Z. Pinned in Task 10.
5. Erasing a lead leaves no plaintext email/ID number in any AuditLog.changeDetail for that lead. Pinned in Task 5.

---

### Task 1: Appointment access scoping (S-C1, S-I4, S-I5)

**Files:**
- Create: `api-lib/handlers/appointmentAccess.js`
- Modify: `api-lib/handlers/appointmentHandlers.js` (GET by id :151-177, audit :488-513, assign :307, reassign :363, return :411, reopen :452, outcome :534, meeting-attempt :597, create :112-135)
- Test: `api-lib/handlers/appointmentAccess.test.js`, `api-lib/handlers/appointmentHandlers.access.test.js`

**Interfaces:**
- Produces: `export async function assertAppointmentAccess(claims, appt): Promise<void>` — throws `{ status: 403, message: 'Forbidden' }` when: Agent-only caller and `appt.agentId !== claims.oid`; Broker (not Admin/GlobalAdmin) and `appt.brokerId !== claims.oid`; Supervisor-only caller and `appt.agentId` neither `claims.oid` nor in `await getDirectReportIds(claims.oid)`. Admin/GlobalAdmin always pass. Logic moved verbatim from the existing block at :166-177.
- Produces: `export async function assertLeadBookable(claims, lead): Promise<void>` — Agent-only: `lead.assignedAgentId === claims.oid`; Supervisor-only: `lead.assignedAgentId` in direct reports or self; else 403. Mirrors leadHandlers.js PUT :238-246.

- [ ] **Step 1: Write failing unit tests** for `assertAppointmentAccess` (vi.mock the module providing `getDirectReportIds`): Agent own → resolves; Agent other → rejects `{status:403}`; Broker own → resolves; Broker with `brokerId: null` → rejects; Supervisor with agent in reports → resolves; Supervisor with agent not in reports → rejects; GlobalAdmin → resolves. Same shape for `assertLeadBookable`.
- [ ] **Step 2: Write failing handler tests** (`appointmentHandlers.access.test.js`, vi.mock `../middleware/auth.js` `validateToken` to return chosen claims, and `../services/appointmentService.js`): `handleAppointmentOutcome` as an Agent not owning the appointment → 403 and `saveOutcome` not called; `handleSaveMeetingAttempt` as a Broker with `brokerId: null` → 403; `handleAppointmentReassign` as Supervisor with `agentId` in body not in direct reports → 403; POST create as Agent on another agent's lead → 403 and `createAppointment` not called.
- [ ] **Step 3: Run** `npx vitest run api-lib/handlers` from `frontend/` — expect FAIL (module missing / 200s).
- [ ] **Step 4: Implement** the helper; replace the two inline blocks (GET, audit) with it; call it after loading the appointment in outcome, meeting-attempt (load via `getAppointmentById` first; 404 if missing), assign, reassign, return, reopen. In reassign, if `parsed.data.agentId` is present and caller is Supervisor-only, the new agent must also be a direct report or self. In POST create, load the lead and call `assertLeadBookable` before `createAppointment`. Keep the staff-caller broker-of-record behaviour (Mark's decision) unchanged for callers who pass the check.
- [ ] **Step 5: Run** `npx vitest run` — PASS; `npm run build` — PASS.
- [ ] **Step 6: Commit** `fix(appointments): enforce ownership/team scope on every appointment write`

### Task 2: Portal registration cannot bind to an existing lead (S-C2)

**Files:**
- Modify: `api-lib/services/leadPortalService.js:158-205` (`registerProspect`), and the walk-in path `walkInCheckin` :473 if it has its own lookup
- Modify (copy only if needed): `api-lib/handlers/portalHandlers.js` register/walk-in error mapping
- Modify: `src/pages/portal/PortalRegister.jsx` / walk-in page — show the server message with a link to `/portal/activate` when the 409 carries `code: 'USE_ACTIVATE'`
- Test: `api-lib/services/leadPortalService.test.js`

**Interfaces:**
- Produces: `registerProspect` throws `{ status: 409, code: 'USE_ACTIVATE', message: 'We already have your details. Please activate your account instead.' }` when `findDuplicate(data.email, null)` returns a lead id, before any INSERT. Handlers pass `code` through in the JSON body: `{ error, code }`.

- [ ] **Step 1: Failing tests** (vi.mock `./db.js` and `./leadService.js`): existing lead email → rejects with `status 409, code 'USE_ACTIVATE'`, and no `INSERT INTO LeadPortalAccount` issued; new email → creates lead + account as before; walk-in with existing lead email → same 409.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the refusal (both paths share `registerProspect`; confirm walk-in does, else apply the same guard there); map `code` through the handler; frontend shows the message and an `<a href="/portal/activate">Activate your account</a>` link.
- [ ] **Step 4: Run** vitest + build + e2e — PASS.
- [ ] **Step 5: Commit** `fix(portal): existing leads must activate, never self-register over their record`

### Task 3: User admin protections and SSO matching (S-I2, S-I3)

**Files:**
- Modify: `api-lib/handlers/userHandlers.js:~141-148` (PUT), `api-lib/services/userService.js:814-826`
- Test: `api-lib/handlers/userHandlers.test.js`, `api-lib/services/userService.test.js`

- [ ] **Step 1: Failing tests:** PUT on a user whose `role === 'GlobalAdmin'` by an Admin (not GlobalAdmin) caller → 403, `updateUserFull` not called; same by a GlobalAdmin caller → proceeds. `getUserForSsoMatch('a_b@x.co.za')` issues SQL containing `LOWER(email) = LOWER(@email)` and not `ILIKE` (assert on the query string passed to the mocked `executeQueryOne`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the 403 guard after `existing` loads; change the SSO WHERE clause. Unlock and force-logout stay allowed for Admins (recovery path).
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `fix(users): admins cannot modify GlobalAdmins; exact SSO email match`

### Task 4: No plaintext sensitive values in the audit log (S-I6)

**Files:**
- Create: `api-lib/services/sensitiveFields.js`
- Modify: `api-lib/handlers/leadHandlers.js:324-377` (lead diff), `api-lib/handlers/appointmentHandlers.js:249-278` (appointment diff incl. idNumber / currentInsurer), `src/components/AuditLogList.jsx` (LeadUpdated / AppointmentUpdated formatting)
- Test: `api-lib/services/sensitiveFields.test.js`

Owner ruling (Mark, 30 Sep 2026): the audit log KEEPS the real before/after values of every sensitive field so a change stays traceable, but stores them ENCRYPTED (same `encrypt()` as the Lead row), never shows them in the UI, the audit API or the CSV export, and POPIA erasure removes them (Task 5).

**Files:** also `api-lib/services/auditService.js` (`listAuditLog*` result mapping, :55-110) and `api-lib/handlers/auditHandlers.js` (CSV export).

**Interfaces:**
- Produces: `export const SENSITIVE_LEAD_FIELDS = ['idNumber','existingCover','currentInsurer','policies','medicalAid','medicalAidProvider']` and `export async function sealChange(field, change): Promise<object>` — for a sensitive field returns `{ changed: true, sealed: await encrypt(JSON.stringify({ from, to })) }`; any other field returns `change` unchanged. Uses `encrypt` from `./encryption.js` (async, base64 out).
- Produces: `export function stripSealed(changeDetail): object` — returns a copy with every `sealed` key removed (recursively one level into field entries); applied in auditService's result mapping so no API response or CSV row ever carries `sealed`. No endpoint decrypts it in this pass.
- AuditLogList renders an entry with `changed: true` as `"<Field label> changed"` (no arrow, no values).

- [ ] **Step 1: Failing tests** (vi.mock `./encryption.js` so `encrypt(x)` returns `'ENC(' + x + ')'`): `sealChange('idNumber', {from:'9403140000000', to:'9403145000000'})` → `{changed:true, sealed:'ENC({"from":"9403140000000","to":"9403145000000"})'}`; `sealChange('email', c)` → `c`; `stripSealed` removes `sealed`; handler-level: the `changeDetail` passed to the mocked `writeAuditLog` for an idNumber edit has no plaintext digits outside `sealed`; auditService mapping output has no `sealed` key.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**, use `sealChange` in both diffs, `stripSealed` in auditService mapping (covers API and CSV); update AuditLogList. **Step 4: Run** vitest + build + e2e — PASS.
- [ ] **Step 5: Commit** `fix(audit): sensitive field changes kept encrypted and never displayed`

### Task 5: POPIA erasure removes PII everywhere it lives (S-I7)

**Files:**
- Modify: `api-lib/services/leadService.js` (`eraseLeadPII` :1052, `anonymiseLeadRow` :969-1009), `api-lib/services/sarService.js:474-484`
- Test: `api-lib/services/leadService.erasure.test.js`

**Interfaces:**
- Consumes: `SENSITIVE_LEAD_FIELDS` from Task 4.
- `eraseLeadPII(leadId)` additionally, for that lead only: (1) deletes its `LeadPortalAccount` row(s) (soft-delete if the table has `deletedAt`, else hard delete); (2) rewrites `AuditLog.changeDetail` for rows with `entityType='Lead' AND entityId=@leadId`, and for `entityType='Appointment'` rows of that lead's appointments: removes keys `leadName`, `notes`, and for `LeadUpdated`/`AppointmentUpdated` replaces every field change of `email, mobileNumber, whatsappNumber, firstName, lastName, dateOfBirth, hospitalOrPractice` and every `SENSITIVE_LEAD_FIELDS` entry with `{ changed: true }` (this drops the encrypted `sealed` values Task 4 stores — erasure is the point where they are anonymised) — do it in JS (select, transform, update per row) so it works on the JSON-text column; (3) nulls `notes` on that lead's `CallAttempt` rows and its appointments' `MeetingAttempt` rows; (4) deletes `Notification` rows whose entity is that lead or one of its appointments (check the Notification columns; if it has no entity link, match on `entityId`/`linkUrl` as the schema allows and note the choice in the report).
- `executeSarDeletion` audit entry no longer includes `leadName`.
- Restricted (FAIS retention) path is unchanged — only the Erased outcome runs this.

- [ ] **Step 1: Failing tests** (vi.mock `./db.js`, capture every query + params): after `eraseLeadPII('L1')` a `LeadPortalAccount` delete/soft-delete for L1 was issued; a CallAttempt notes-null UPDATE for L1 was issued; given a mocked AuditLog row `{changeDetail: '{"email":{"from":"a@b.co","to":"c@d.co"},"idNumber":{"changed":true,"sealed":"ENC(x)"},"leadName":"Jo Soap"}'}` the UPDATE writes JSON with `email: {changed:true}`, `idNumber: {changed:true}` (no `sealed`) and no `leadName`; `executeSarDeletion`'s audit changeDetail has no `leadName`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(popia): erasure also clears portal account, audit values, notes and notifications`

### Task 6: Security headers allow the app's own camera and Entra (T-I1, T-I2)

**Files:**
- Modify: `vercel.json` (Permissions-Policy, CSP connect-src)
- Modify: `medbroker-v1/Project_Context_Vercel.md:~944-958` (correct the "none of which this app uses" note)
- Test: `api-lib/http/vercelHeaders.test.js` (reads `../../vercel.json`)

- [ ] **Step 1: Failing test:** parsed vercel.json Permissions-Policy contains `camera=(self)`; CSP `connect-src` includes `'self'` and `https://login.microsoftonline.com`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (`camera=(self)`; `connect-src 'self' https://login.microsoftonline.com`). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(headers): allow same-origin camera for QR check-in and Entra token calls`

### Task 7: Lead assignment and status rules (L-I7, L-I12, L-I6)

**Files:**
- Modify: `api-lib/services/leadService.js:739-743` (`assignLead`), `:817-845` (uncontactable rule), `api-lib/handlers/leadHandlers.js` (assign ~:437 reject Closed; POST calls ~:648 reject Closed / AppointmentScheduled), `api-lib/services/schedulerService.js:246-256` (auto-return clock)
- Test: `api-lib/services/leadService.assign.test.js`, `api-lib/services/schedulerService.test.js`

- [ ] **Step 1: Failing tests:** `assignLead` SQL sets status via `CASE WHEN pipelineStatus = 'Unassigned' THEN 'Assigned' ELSE pipelineStatus END`; assign handler on a Closed lead → 409 `'This lead is closed. Reopen it first.'`; POST call on Closed or AppointmentScheduled lead → 409; uncontactable rule not applied when current status is AppointmentScheduled or Closed; uncontactable count only includes attempts with `callTime > COALESCE(<last LeadReopened audit performedAt>, '-infinity')` (query the AuditLog for the lead's latest `LeadReopened`); auto-return SQL uses `GREATEST(COALESCE(MAX(callTime), l.createdAt), l.updatedAt)`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(leads): reassign keeps status; closed leads locked; uncontactable and auto-return clocks reset`

### Task 8: Appointment lifecycle guards (L-I8, L-I9, L-I10, L-I11, L-I5, L-I18)

**Files:**
- Modify: `api-lib/services/appointmentService.js` (assignBroker :693, reassignAppointment ~:902, returnToLeads :1107, claimAppointment ~:754-813, updateAppointment :432-455, createAppointment ~:494-510, InProgress allow-list :1488, saveMeetingAttemptOutcome :1381-1483), `api-lib/handlers/appointmentHandlers.js` (PUT :207-232 conflict check), `src/pages/AppointmentList.jsx:694`, `src/pages/AppointmentDetail.jsx:~986`
- Test: `api-lib/services/appointmentService.guards.test.js`

**Rules (spec: verified-logic.md I5, I8-I11, I18):**
- assignBroker: only when `status = 'Unassigned'`, else 409.
- reassignAppointment: 409 on ClosedWon/ClosedLost/ReturnedToLeads; 400 on null brokerId; on an Unassigned appointment in claim mode → 409 `'Use the claim queue for unassigned appointments.'`; in assign mode an Unassigned target moves to Assigned. No token refund (owner ruling).
- returnToLeads: only from Unassigned/Assigned/Claimed/InProgress, else 409.
- claimAppointment: before the token debit, `hasBrokerConflict(brokerId, appt.firstAppointmentDate, appt.firstAppointmentTime, id)` → 409 `'You already have an appointment at that time.'`; re-check region/product eligibility with the predicate `listAvailableToClaim` uses → 403.
- PUT update: if date or time changes and brokerId set → conflict check excluding this id → 409; updateAppointment also syncs meeting 1's `MeetingAttempt.date` when that attempt is still `Scheduled` and unrecorded.
- createAppointment: lead `pipelineStatus` must be Assigned or InProgress, else 409.
- InProgress allow-list gains `'Claimed'`.
- saveMeetingAttemptOutcome: move the staff broker-assign + task delete below the attempt lookup/Scheduled check; that UPDATE gets `AND brokerId IS NULL`; the attempt UPDATE gets `AND status = 'Scheduled' RETURNING id`, 409 if no row.
- UI: AppointmentList Reassign hidden on closed rows; AppointmentDetail Reassign hidden for Unassigned appointments when claim model is on (use the flag the page already reads for claim mode).

- [ ] **Step 1: Failing tests** — one per rule above (mock `./db.js` responses to drive each branch; assert status codes and that the debit / writes did not run on rejection).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** vitest + build + e2e — PASS.
- [ ] **Step 5: Commit** `fix(appointments): lifecycle guards, broker conflicts on claim/edit, meeting-1 date sync`

### Task 9: Reports period boundaries (L-I1, L-I2)

**Files:**
- Modify: `api-lib/services/reportService.js:55-120` (`getPeriodRange`, `getTrendBuckets`), `:1223-1229` (`getPriorPeriodRange`); extract the three to `api-lib/services/reportPeriods.js` (pure, no db import) and re-export from reportService so callers are unchanged
- Test: `api-lib/services/reportPeriods.test.js`

**Interfaces:**
- Produces: `getPeriodRange(period, referenceDate = new Date(), now = new Date())`, `getPriorPeriodRange(period, referenceDate = new Date(), now = new Date())`, `getTrendBuckets(period, referenceDate = new Date(), now = new Date())` — the extra `now` parameter replaces the internal `new Date()` so tests are deterministic. All boundaries are SAST calendar boundaries expressed as UTC instants (SAST midnight = 22:00Z the previous day).

- [ ] **Step 1: Failing tests** (run under `TZ=UTC`): `getPriorPeriodRange('Monthly', 2026-10-31T10:00Z)` → start `2026-08-31T22:00:00.000Z` (1 Sep SAST), end `2026-09-30T21:59:59.999Z`; same for 30 Mar → February; Quarterly on 31 Dec → Jul–Sep; `getPeriodRange('Monthly', 2026-10-01T00:30+02:00, now same)` → October (start `2026-09-30T22:00:00.000Z`); week buckets start at SAST midnight.
- [ ] **Step 2: Run** `TZ=UTC npx vitest run api-lib/services/reportPeriods.test.js` — FAIL.
- [ ] **Step 3: Implement** with SAST calendar arithmetic (shift instant +2h, compute Y/M/D with UTC getters, build boundaries with `Date.UTC(...) - 2h`); prior period computed from the period's own start (day pinned to 1), not by `setMonth` on the reference date.
- [ ] **Step 4: Run** — PASS, and existing tests still pass. **Step 5: Commit** `fix(reports): SAST period boundaries; prior period no longer collapses on the 29th-31st`

### Task 10: Callback times are SAST (L-I16) and Save call & Book logs the call (F-I4)

**Files:**
- Modify: `src/pages/LeadDetail.jsx` (:~400-414 handleLogCall payload; :899-916 Save call & Book), `api-lib/models/lead.js:~227` (callbackDateTime)
- Test: `api-lib/models/lead.test.js`; e2e `medbroker-v1/e2e/interactions.spec.js` (Save call & Book issues POST /calls)

**Interfaces:**
- Server normalises: a `callbackDateTime` with no offset (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/`) gets `+02:00` appended by a zod `.transform`; values with an offset pass unchanged.

- [ ] **Step 1: Failing tests:** schema parse of `'2026-10-05T09:00'` → `'2026-10-05T09:00+02:00'`; e2e: clicking "Save call & Book Appointment" sends `POST /api/leads/:id/calls` before the booking modal opens (use the fixtures' request log / `page.waitForRequest`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement:** the transform; Save call & Book awaits `leadsApi.logCall(id, payload)` (same payload/refetch as handleLogCall), shows `submitError` on failure and does not open the modal, and only sets the status override after success.
- [ ] **Step 4: Run** vitest + build + e2e — PASS. **Step 5: Commit** `fix(calls): callbacks stored in SAST; Save call & Book saves the call`

### Task 11: Token crediting is atomic and pack-derived (L-I14, S-I8)

**Files:**
- Modify: `api-lib/services/tokenService.js:292-326`, `api-lib/handlers/appointmentHandlers.js:~942` (Stripe) and `:1015-1040` (Paystack)
- Test: `api-lib/services/tokenService.test.js`, `api-lib/handlers/tokenWebhook.test.js`

- [ ] **Step 1: Failing tests:** the credit is ONE `executeQuery` call whose SQL contains `ON CONFLICT DO NOTHING` and updates the ledger from the inserted row (CTE); Paystack webhook with `metadata.tokens: 9999` and a valid `packIndex` credits `TOKEN_PACKS[packIndex].tokens`; `verification.currency !== 'ZAR'` → no credit, 200 acknowledged with a logged warning; Stripe path also uses the pack's token count.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(tokens): atomic idempotent credit; tokens from the pack, not payment metadata`

### Task 12: Event attendees can be re-added (L-I13)

**Files:**
- Create: `db/migrations/039_event_attendee_partial_unique.sql` (idempotent: `ALTER TABLE EventAttendee DROP CONSTRAINT IF EXISTS UQ_EventAttendee; CREATE UNIQUE INDEX IF NOT EXISTS UQ_EventAttendee_active ON EventAttendee(eventId, leadId) WHERE deletedAt IS NULL;`) — note `db/migrations/` is not tracked by git today; `git add -f` this file so the fix travels with the branch, and say so in the report
- Modify: `db/schema.postgres.sql:828` to the partial index form
- Test: `api-lib/services/schemaConstraints.test.js` (reads schema file: no full `UNIQUE (eventId, leadId)`, has the partial index)

- [ ] Steps: failing test → FAIL → implement → PASS → commit `fix(events): partial unique index so removed attendees can be re-added (migration 039)`

### Task 13: Reminders reach claimed/in-progress appointments; safe email HTML; safe backfill (L-I4, L-I17, L-I15)

**Files:**
- Modify: `api-lib/services/schedulerService.js:48`, `api-lib/services/notificationService.js:82-87`, `scripts/backfill-encrypt-lead-fields.js:41-74`
- Test: `api-lib/services/notificationService.test.js`, extend `api-lib/services/schedulerService.test.js`

- [ ] **Step 1: Failing tests:** reminder SQL contains `a.status IN ('Assigned','Claimed','InProgress')`; `escapeHtml('<a href=x>Jo</a> & co')` → `'&lt;a href=x&gt;Jo&lt;/a&gt; &amp; co'` and the sent `html` uses the escaped body; backfill UPDATE uses `COALESCE(<col>Encrypted, @<col>)` for each of the five columns (assert on the SQL string; export the SQL builder from the script if needed so it is testable without running it).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `fix(notifications): reminders for claimed/in-progress, escaped email HTML, non-destructive backfill`

### Task 14: Frontend correctness (F-I1, F-I5, F-I6, F-I7 + confirmed Minors)

**Files:**
- Modify: `src/context/AuthContext.jsx:77,122`; `src/hooks/useFetch.js`; `src/pages/LeadList.jsx:194,345`; `src/pages/Tasks.jsx:130,180,713-727`; `src/pages/LeadDetail.jsx:380-382` + `src/pages/AppointmentDetail.jsx:1253-1262` + `api-lib/models/lead.js` (clearable optional fields) + the lead/appointment update services if they filter nulls; `src/pages/AppointmentDetail.jsx:802,1160` (`persona.displayName`); `src/components/ReportsWidgets.jsx:40` (+ same idiom in `src/components/viz/*.jsx`); `src/pages/EventList.jsx:110`; `src/pages/EventDetail.jsx:60`; `src/App.jsx:386,390`
- Test: `src/hooks/useFetch.test.js`, `src/components/formatMoney.test.js`, e2e additions in `medbroker-v1/e2e/interactions.spec.js`

**Rules:**
- Login shows `err.message` (a string) — never the raw body.
- `useFetch` ignores a response whose request is not the latest (request-counter ref), and the `// eslint-disable-next-line react-hooks/exhaustive-deps` line (names a plugin that isn't loaded — the repo's one lint error, T-I3) is removed. LeadList search input debounced 300 ms; the page reset happens in the same state update as the filter change (no second fetch).
- Tasks: `sar` not offered in the create form; create awaited before closing; failure shown in the modal.
- Clearable optional fields (`whatsappNumber, hospitalOrPractice, policies, universityAttended, degreeAttained, yearOfAttendance, medicalAidProvider, currentInsurer`): UI sends `null` for a field the user emptied; schema accepts `.nullable()` for exactly these; required fields still cannot be cleared.
- Money: one formatter `formatRand(v)` → `R4,000`, `R45k`, `R1.84m` (≥1m → 2dp millions; ≥10k → k, 0dp; else full rands with thousands separator); `null/undefined` → `—`.
- EventList past-event check uses `String(event.eventDate).slice(0, 10)`.
- EventDetail CSV `esc` prefixes `'` when a value starts with `= + - @ \t \r`.
- `/leads/import` and `/leads/new` routes allow only Admin, Supervisor, GlobalAdmin.

- [ ] **Step 1: Failing tests:** useFetch stale-response test (two deferred promises resolved out of order → data equals the second call's); formatRand table (4000→'R4,000', 45000→'R45k', 1840000→'R1.84m', null→'—'); e2e: login with `a@b` shows an error message and the form stays rendered; Tasks create with a server 400 shows an error in the modal.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** vitest + build + e2e — PASS.
- [ ] **Step 5: Commit** `fix(frontend): login errors, stale fetches, task categories, clearing fields, money format, small UI fixes`

### Task 15: Housekeeping (T-I3, T-I4 note, hygiene)

**Files:**
- Modify: `.github/workflows/ci.yml` (add a `lint` job: `npm ci --prefix frontend` then `npm run lint --prefix frontend`; fix the stale "57 tests" comment to not state a count)
- Modify: `medbroker-v1/.gitignore` (add `.DS_Store`, `.env*` except any tracked example, `.vercel/`, `playwright-report/`, `test-results/`); create repo-root `.gitignore` with `.DS_Store` and `.superpowers/`
- Remove from index: repo-root `.DS_Store` (`git rm --cached .DS_Store`)
- Test: `npm run lint --prefix medbroker-v1/frontend` exits 0 (warnings allowed)

- [ ] Steps: run lint (expect 1 error) → fix → lint exits 0 → vitest/build pass → commit `chore: lint clean, CI lint job, gitignore, untrack .DS_Store`

### Task 16: Status docs

**Files:** `medbroker-v1/Status_Vercel.md` (new top entry in section 0 and a SESSION 30 SEP 2026 entry in 0b), `medbroker-v1/Project_Context_Vercel.md` (record the owner rulings: portal existing-lead refusal, token forfeiture, erasure scope, sensitive audit values kept encrypted/hidden until erasure; migration 039 must be run on Neon)

- [ ] Write the entries in the files' existing style (what changed, why, verified counts from the final test runs, deployment note: migration 039). Commit `docs: status for 30 Sep 2026 code-review fixes`.

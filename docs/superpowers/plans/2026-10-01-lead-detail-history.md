# Lead Detail Journey + History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead Detail gets (1) a journey hero for this lead (calls → booking → meetings → outcome) and (2) one full-width vertical History timeline that replaces the Call History, Appointment History and Audit Log cards.

**Architecture:** Pure models (unit-tested, no React/DOM) + thin components, the same split as `viz/leadJourneyModel.js` / `viz/LeadJourney.jsx`. History merges the lead's audit entries with its appointments' audit entries server-side (one more UNION branch in `listAuditLogForLead`). No new endpoints, no migration.

**Tech Stack:** React 18 + Vite, date-fns, vitest (node env, no DOM), Playwright e2e with `medbroker-v1/e2e/fixtures.js`.

**Spec:** the approved Design canvas https://claude.ai/artifact/21EdLnbYwHTy88mCouEeS8 (artboards Main, Timeline, States, Phone) and Mark's two screenshots of 1 Oct 2026: History exactly as the canvas Timeline artboard; placed UNDER the detail cards, FULL page width. Owner rulings (1 Oct 2026): build the journey hero too; fold the Audit Log card into History.

All paths are relative to `medbroker-v1/frontend/` unless stated.

## Global Constraints
- No dependency changes.
- Every colour from theme tokens (`themes.css`): hero uses `--hero-*` / `--path-*` (never hard-coded on a `.pj-panel` descendant); History uses `--panel`, `--panel2`, `--ink`, `--mut`, `--line`, `--accent`, `--pl-*`, `--na`, `--danger`. Must read correctly in all four themes (midnight, ember, terra, linen).
- Dates: Johannesburg calendar days (reuse `toDay`/`fmtDate` from `viz/leadJourneyModel.js`); History day headers `d MMM yyyy`, times `HH:mm` (SAST, browser-local is fine — users are in SA).
- Personal information: call notes and meeting notes never appear on the journey or in History (they stay in their own records). Sensitive audit values are already `{ changed: true }` server-side — render "<Field> changed".
- Accessibility: every journey waypoint/marker and every filter chip is a real `<button>`; chips use `aria-pressed`; History is a `<section aria-label="History">` with `<ol>` per day.
- Phone (≤ 640px): journey runs vertically (as `LeadJourney` does); History stays one column.
- Comments: short dated `// 1 Oct 2026 — <why>`. Tests beside modules. Commit per task on `feat/lead-detail-history`.
- After every task: `npm test` and `npm run build` pass; tasks touching `src/` also run `npm run test:e2e` from `medbroker-v1/` (baseline 124/124).

## Review Focus
1. A lead with no calls and no appointments: journey shows "Lead created" + Today only; History shows the created/assigned entries; nothing crashes. Pinned in Tasks 2 and 3.
2. A reopened lead with two appointments: journey uses the latest appointment's meetings; History shows both appointments' entries. Pinned in Tasks 1 and 2.
3. A Closed lead with no appointment (lost at call stage): outcome "Closed" at updatedAt. Pinned in Task 2.
4. An entry action the History model doesn't know: falls back to the existing `describeEntry` label, category "Other", never blank. Pinned in Task 3.
5. Filter chip with no matching entries: shows "Nothing in this category yet." Pinned in Task 3.

---

### Task 1: Appointment entries in the lead's history (backend)

**Files:** Modify `api-lib/services/auditService.js` (`listAuditLogForLead` ~:100-127). Test: `api-lib/services/auditService.lead.test.js`.

**Interfaces — Produces:** every row of `listAuditLogForLead(leadId)` gains `entityType` (`'Lead' | 'SubjectAccessRequest' | 'Appointment'`) and `entityId` (text). A third `UNION ALL` branch returns `AuditLog` rows with `entityType = 'Appointment' AND entityId IN (SELECT id::text FROM Appointment WHERE leadId = @leadId::uuid AND organisationId = @organisationId)`, same columns, same `stripSealed` mapping, same `ORDER BY "performedAt" DESC`.

- [ ] Failing test (vi.mock `./db.js`): the SQL has three SELECT branches, the third filtering `entityType = 'Appointment'` via the lead's appointments; each branch selects `al.entityType AS "entityType"` and `al.entityId AS "entityId"`; mapping still strips `sealed`.
- [ ] Verify the SQL on real Postgres with the scratchpad PGlite harness (`/private/tmp/claude-501/-Users-markdutoit-Documents-GitHub-MedBroker/8e1afd4a-d840-4ec6-a131-8db7597beabc/scratchpad/pgl/`, copy run.mjs → run-lead-history.mjs): lead L1 with two appointments gets both appointments' entries; lead L2's entries never appear.
- [ ] Implement; `npm test`, build. Commit `feat(history): lead history includes its appointments' change log`.

### Task 2: Lead journey model + hero

**Files:** Create `src/components/viz/leadPathModel.js`, `src/components/viz/leadPathModel.test.js`, `src/components/viz/LeadPathJourney.jsx`; Modify `src/components/viz/viz.css` (only new `lpj-` rules if the existing `lj-`/`pj-` rules don't cover something), `src/pages/LeadDetail.jsx` (render the hero between the title row and the detail cards; fetch the latest appointment's detail with `appointmentsApi.get(latestId)` only when the lead has an appointment).

**Interfaces — Produces:** `export function buildLeadPath({ lead, calls, appointments, latestAppt }, todayDn): { events, spans, bands, todayRel, endRel, open, title, subtitle }`
- `lead`: `{ createdAt, updatedAt, pipelineStatus, sourceLabel, agentName, firstName, lastName }`; `calls`: `[{ attemptedAt, outcome }]`; `appointments`: `[{ id, createdAt, status }]` (any order); `latestAppt`: the full `GET /appointments/:id` payload of the newest appointment by `createdAt` (has `meetingAttempts`, `closedAt`, `productsSold`, `lostReasonLabel`, `brokerName`, `agentName`) or null.
- Events (same shape as `buildJourney` events: `{ key, kind, tone, dn, rel, title, detail }`): `lead` (major, "Lead created", detail = source); one `call` per call (kind `'call'`, tone `'reached'` unless outcome ∈ NoAnswer/Voicemail/WrongNumber → `'missed'`; title `Call N`); `booked` (major, "Appointment booked", at the latest appointment's createdAt, detail `by <agentName>`); meetings and friction markers exactly as `buildJourney` computes them for `latestAppt` (reuse it — call `buildJourney` and take its meeting/marker/outcome events, don't duplicate the rules); outcome: from `latestAppt` (Signed / Lost / Returned to leads) else, if `lead.pipelineStatus === 'Closed'`, "Closed" at `updatedAt`.
- `spans`: as `buildJourney`, but the first span is "N days, K calls to book" (lead → booked); with no booking, "N days, K calls so far" to Today.
- `bands`: `[{ from, to, label }]` — "With the agent · N days" (lead → booked or → today/outcome if never booked), "With the broker · <brokerName> · N days so far|N days" (booked → today/outcome). Omit the broker band when there is no booking.
- `title`/`subtitle`: title like `buildJourney`'s ("Day 59: second meeting on 7 Oct", "Signed after 40 days", "Closed after 9 days", or "Day N, not booked yet"); subtitle: "Reached on the third of four calls and booked by <agent> on day 12." + `buildJourney`'s meeting sentence when there is an appointment; "No calls yet." when none. Ordinals by hand (first…tenth, else "call N").
- `LeadPathJourney({ lead, calls, appointments, latestAppt, isMobile, todayDn })` renders like `LeadJourney.jsx` (`pj-panel lj-panel`, same eyebrow/title/subtitle, horizontal real-time scale on desktop, vertical on phone, hover/focus detail cards, legend "Call, reached · Call, not reached · Rescheduled, cancelled or no-show · Still to come"), plus call dots (small; reached filled `--hero-accent`, missed hollow `--hero-strong`) and the two bands under the waypoint labels as in the canvas Main artboard. Call detail card: Call N, date, day of the journey, outcome label (from `OUTCOME_LABELS` in LeadDetail — move it to `src/constants/leadOptions.js` if not already exported there), callback date if any. Never notes.

- [ ] Failing model tests (todayDn fixed): (a) canvas example — created 2 Aug, calls 4/6/11/14 Aug (NoAnswer, Voicemail, CallbackRequested, AppointmentScheduled), booked 14 Aug, first meeting rescheduled 21 Aug then held 28 Aug, second meeting scheduled 7 Oct, today 30 Sep → title "Day 59: second meeting on 7 Oct", first span "12 days, 4 calls to book", bands "With the agent · 12 days" and "With the broker · Anika van der Merwe · 47 days so far", 2 missed + 2 reached call events; (b) no calls, no appointments → events = [lead], title "Day N, not booked yet", subtitle "No calls yet."; (c) Closed lead, no appointment → outcome "Closed" at updatedAt, title "Closed after N days"; (d) reopened lead with two appointments → meetings from the newest only, booked at newest createdAt.
- [ ] Implement model, then component, then wire into LeadDetail. e2e fixtures: give the existing lead fixture calls + an appointment so the hero renders (read `e2e/fixtures.js`).
- [ ] `npm test`, build, e2e. Commit `feat(lead-detail): the lead's journey`.

### Task 3: History model + timeline component

**Files:** Create `src/components/history/historyModel.js`, `src/components/history/historyModel.test.js`, `src/components/history/HistoryTimeline.jsx`, `src/components/history/history.css`. Modify `src/components/AuditLogList.jsx` only to export `describeEntry`, `ACTION_LABELS`, `FIELD_LABELS` (AppointmentDetail keeps using `AuditLogList` unchanged).

**Interfaces — Produces:**
- `export function buildHistory(entries): { days: [{ key, label, items }], counts: { all, calls, appointment, edits, assignments } }` — entries newest first as the API returns them. Each item `{ id, category, title, time, who, meta, diff, hollow, appointmentId }`:
  - category: `calls` (CallLogged), `appointment` (any entityType 'Appointment' row, AppointmentCreated), `edits` (LeadUpdated, AppointmentUpdated), `assignments` (LeadAssigned, LeadReassigned, AppointmentBrokerAssigned, AppointmentReassigned), `created` (LeadCreated), `popia` (SarDeletionExecuted, AppointmentClosedForErasure, other SubjectAccessRequest rows), `other` (anything else). Chip filters: All, Calls, Appointment, Edits, Assignments (`created`/`popia`/`other` show under All only).
  - title: calls → `Call: <outcome label lower-cased after the first word>` e.g. "Call: callback requested"; meeting attempt saves → "First meeting held, interested" / "First meeting rescheduled" style from changeDetail (meetingNumber + status, using `STATUS_TEXT` from leadJourneyModel); everything else → `describeEntry(entry)`; edits → title "Details updated" with the field changes as `diff: [{ field, from, to } | { field, changed: true }]` (labels via FIELD_LABELS; dates formatted `d MMM yyyy`; arrays joined with ", "; null → "—").
  - meta: the category label shown coloured (`Call N` for calls, numbered oldest-first across the lead; "Appointment", "Edit", "Assignment", "Created", "POPIA", "Other") plus `· <performedByName>`; calls add `· first time reached` on the first reached call.
  - hollow: true for not-reached calls and Rescheduled/Cancelled/Missed meeting attempts.
  - time `HH:mm`; day label `d MMM yyyy`; days grouped by SAST calendar day.
  - appointmentId: for Appointment-entity rows, so the title links to `/appointments/:id`.
- `HistoryTimeline({ entries, error, onRetry })` renders exactly the canvas Timeline artboard: "HISTORY" heading + "N entries · newest first", filter chips (All pressed by default, `aria-pressed`), day headers, a vertical rail, a dot per entry coloured by category (`calls` `--pl-progress`, `appointment` `--pl-booked` (held meetings `--pl-won`), `edits` `--na`, `assignments` `--pl-assigned`, `created` `--pl-unassigned`, `popia` `--danger`, `other` `--mut`), hollow dots where `hollow`, title + right-aligned time, coloured category label + "· who", diff block (field | ~~from~~ → **to**; "<Field> changed" for sealed), "Show N older entries" after 15 entries (expands in place). Empty: "No history yet. Entries appear here as the lead is assigned, called and booked." Error: alert + "Try again" button calling `onRetry`. Filter with nothing: "Nothing in this category yet."

- [ ] Failing model tests: categorisation of each action listed; call numbering oldest-first with "first time reached"; edit diff with a date, an array, a null and a sealed `{changed:true}` field; meeting-attempt titles; unknown action → describeEntry label + category other; day grouping across SAST midnight (an entry at 23:30Z belongs to the next SAST day); counts.
- [ ] Implement model + component.
- [ ] `npm test`, build. Commit `feat(history): History timeline model and component`.

### Task 4: Lead Detail layout, e2e, docs

**Files:** Modify `src/pages/LeadDetail.jsx`, `medbroker-v1/e2e/fixtures.js`, `medbroker-v1/e2e/interactions.spec.js`, `medbroker-v1/Status_Vercel.md`.

- Remove the Call History, Appointment History and Audit Log cards. Detail cards stay a grid (Lead Detail, Personal Details, Insurance Information, Education — 3 columns on desktop as in Mark's screenshot, 1 on phone). Below them, full page width: `<HistoryTimeline>` fed by the existing `leadsApi.auditLog(id)` fetch (keep `refetchAudit` after every action that already calls it, and also call it after Log Call / Save call & Book / booking so new entries appear).
- Keep the calls fetch (the journey needs it) and the appointments fetch (journey + anything else still using it).
- e2e (Playwright, existing fixture style): History renders with day headers and entries; clicking "Calls" shows only call entries and sets `aria-pressed`; an appointment entry links to `/appointments/:id`; a sealed edit shows "ID Number changed" with no digits; the journey hero headline renders; the old Call History / Audit Log headings are gone. Update fixtures: lead audit entries covering each category (incl. an Appointment-entity row with `entityType`/`entityId`).
- Screenshots (Playwright `page.screenshot` into the scratchpad, not the repo) of Lead Detail desktop in midnight and linen and phone in midnight; look at them and fix anything clipped or unreadable before committing.
- Status_Vercel.md: section-0 block + 0b session entry in the house style (what was built, verified counts, delivery = branch `feat/lead-detail-history` stacked on `fix/code-review-20260930`, no migration).
- [ ] `npm test`, build, e2e, lint. Commit `feat(lead-detail): History replaces call, appointment and audit cards; docs`.

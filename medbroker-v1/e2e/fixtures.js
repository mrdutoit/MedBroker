/*
 * Mock API for the browser regression suite. Shapes mirror the real
 * services (reportService.js, leadService.js, …) — confirmed by reading
 * those services directly while building this suite and the screenshot
 * harness it grew out of (see Status_Vercel.md, 24 Sep 2026), not
 * guessed. When a service's response shape changes, update the matching
 * fixture here — a page that renders against a stale fixture is the
 * failure mode this suite exists to catch.
 *
 * Session/theme mechanism confirmed against the real app before writing
 * this (services/authStore.js, context/ThemeContext.jsx) — genuinely
 * different from a typical JWT-in-localStorage app: MedBroker keeps its
 * real auth in an httpOnly cookie (irrelevant here — every /api/* call
 * is mocked, never reaches a real backend) and a plain user object in
 * sessionStorage for the frontend's own display/role logic.
 */
import { expect } from '@playwright/test';

const today = new Date();
const iso = (daysAgo) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
const day = (daysAgo) => iso(daysAgo).slice(0, 10);

export const PIPELINE_STAGES = [
  { status: 'Unassigned', count: 34 }, { status: 'Assigned', count: 61 },
  { status: 'In Progress', count: 47 }, { status: 'Appointment Booked', count: 29 },
  { status: 'Closed Won', count: 18 }, { status: 'Closed Lost', count: 12 },
];
export const PIPELINE_STAGE_CONVERSION = [
  { from: 'Unassigned', to: 'Assigned', ratio: 0.78 },
  { from: 'Assigned', to: 'In Progress', ratio: 0.52 },
  { from: 'In Progress', to: 'Appointment Booked', ratio: 0.24 },
];

const DASHBOARD = {
  period: { start: day(30), end: day(0), priorStart: day(60), priorEnd: day(31) },
  appliedFilters: { brokerId: null, portfolio: null, source: null, scoped: false },
  kpis: [
    { key: 'leads', label: 'Total Leads', format: 'count', current: 221, prior: 198, deltaPct: 11.6, direction: 'up' },
    { key: 'appts', label: 'Appointments Booked', format: 'count', current: 76, prior: 81, deltaPct: -6.2, direction: 'down' },
    { key: 'closedWon', label: 'Closed Won', format: 'count', current: 18, prior: 14, deltaPct: 28.6, direction: 'up' },
    { key: 'conversion', label: 'Conversion Ratio', format: 'ratio', current: 0.081, prior: 0.071, deltaPct: 14.1, direction: 'up' },
    { key: 'policyValue', label: 'Total Policy Value', format: 'currency', current: 4820000, prior: 3910000, deltaPct: 23.3, direction: 'up' },
    { key: 'avgDaysToCloseWon', label: 'Avg Days to Close (Won)', format: 'days', current: 18.4, prior: 21.7, lowerIsBetter: true, deltaPct: -15.2, direction: 'down' },
  ],
  // 27 Sep 2026 — trend/wonVsLost/appointmentAnalysis/policyValueBreakdown
  // rewritten to the REAL response shape (reportService.js,
  // getDashboardReport). The previous fixture had the wrong field names
  // (wonVsLost.won as an array, avgDaysWon, policyValueBreakdown as an
  // array), so Won vs Lost, Appointment Analysis and Policy Value always
  // fell through to their empty states and nothing in them was ever
  // exercised in a browser. Labels use the real weekly format (W<n>); the
  // last bucket is a real `future` bucket (flag added 27 Sep).
  trend: [
    { label: 'W36', leads: 48, appts: 16, won: 3, lost: 2, policyValue: 780000 },
    { label: 'W37', leads: 55, appts: 19, won: 4, lost: 3, policyValue: 1120000 },
    { label: 'W38', leads: 61, appts: 21, won: 5, lost: 2, policyValue: 1340000 },
    { label: 'W39', leads: 57, appts: 20, won: 6, lost: 4, policyValue: 1580000 },
    { label: 'W40', future: true, leads: 0, appts: 0, won: 0, lost: 0, policyValue: 0 },
  ],
  pipeline: { stages: PIPELINE_STAGES, stageConversion: PIPELINE_STAGE_CONVERSION },
  sourceTable: [], portfolioTable: [],
  policyValueBreakdown: { total: 4820000, avgPerDeal: 267777.78, perAppointment: 63421.05, perLead: 21809.95, trend: [] },
  wonVsLost: {
    // 27 Sep 2026 (later): one lost lead closed with NO appointment (counts in
    // Lost and region, has no loss reason) — so lost 12 vs 11 reasons, which
    // OutcomeFlow must show as a "Closed before an appointment" branch.
    won: 18, lost: 12, winRate: 60.0, avgDaysToCloseWon: 18.4, avgDaysToCloseLost: 26.2,
    hasLossReasons: true,
    lossReasons: [
      { reason: 'PriceTooHigh', count: 4 }, { reason: 'ChoseCompetitor', count: 3 },
      { reason: 'NoLongerInterested', count: 2 }, { reason: 'Not captured', count: 2 },
    ],
    wonByRegion: [{ region: 'Gauteng', count: 11 }, { region: 'Western Cape', count: 5 }, { region: 'Not captured', count: 2 }],
    lostByRegion: [{ region: 'Gauteng', count: 8 }, { region: 'KwaZulu-Natal', count: 4 }],
    wonByPortfolio: [{ portfolio: 'Medical Aid', count: 12 }, { portfolio: 'Gap Cover', count: 6 }],
    lostByPortfolio: [{ portfolio: 'Medical Aid', count: 8 }, { portfolio: 'Gap Cover', count: 3 }],
  },
  appointmentAnalysis: {
    booked: 76, perLead: 0.34, bookedToWonConversion: 23.7,
    byMeetingType: [{ meetingType: 'InPerson', booked: 49 }, { meetingType: 'Virtual', booked: 27 }],
    cancelled: 9, missed: 4,
    cancelReasons: [{ reason: 'SchedulingConflict', count: 5 }, { reason: 'NoLongerInterested', count: 3 }, { reason: 'Not captured', count: 1 }],
    hasCancelledMissedTracking: true,
  },
  insights: [],
};

const LEADS = { leads: [
  { id: 'lead-1', firstName: 'Thabo', lastName: 'Nkosi', email: 'thabo.nkosi@example.com', pipelineStatus: 'Unassigned', occupation: 'Cardiologist', createdAt: iso(3) },
  { id: 'lead-2', firstName: 'Priya', lastName: 'Naidoo', email: 'priya.naidoo@example.com', pipelineStatus: 'Assigned', occupation: 'General Practitioner', createdAt: iso(5) },
], total: 2 };

const APPOINTMENTS = { appointments: [
  { id: 'appt-1', leadId: 'lead-2', firstName: 'Priya', lastName: 'Naidoo', status: 'Assigned', firstAppointmentDate: day(-2), firstAppointmentTime: '10:00', portfolio: 'Discovery' },
], total: 1 };

const APPOINTMENT_DETAIL = {
  id: 'appt-1', leadId: 'lead-2', firstName: 'Priya', lastName: 'Naidoo', dateOfBirth: '1985-04-12',
  firstAppointmentTime: '10:00', portfolio: 'Discovery',
  // 28 Sep 2026 — the real shape (appointmentService.getAppointmentById):
  // the old fixture still carried `meetings` (retired §164), so the page
  // rendered with no meetings at all. Journey: lead 26 days ago, booked 7
  // days later, first meeting rescheduled once then held, second meeting
  // 5 days ahead — "Day 26: second meeting on …".
  status: 'InProgress', firstAppointmentDate: day(17),
  leadCreatedAt: iso(26), createdAt: iso(19), updatedAt: iso(12), closedAt: null,
  agentName: 'Thandi Mokoena', brokerName: 'Werner Hattingh', sourceLabel: 'Referral',
  meetingAttempts: [
    { id: 'ma1', meetingNumber: 1, status: 'Rescheduled', date: day(17), createdAt: iso(18), cancelReason: null, notes: null },
    { id: 'ma2', meetingNumber: 1, status: 'HeldInterested', date: day(12), createdAt: iso(12), cancelReason: null, notes: null },
    { id: 'ma3', meetingNumber: 2, status: 'Scheduled', date: day(-5), createdAt: iso(11), cancelReason: null, notes: null },
  ],
  productsSold: [],
  changeLog: [],
};

// portfolios/products/region/supervisor included deliberately, not
// omitted — a real, found-by-running-the-suite bug: UserAdmin.jsx reads
// user.portfolios.length and user.products.length directly (no ?.
// guard), so a fixture without them crashed the whole page render
// (confirmed via the actual thrown TypeError before fixing this, not
// assumed).
const USERS = { users: [
  { id: 'u1', displayName: 'Mark du Toit', email: 'mark@medbroker.test', role: 'GlobalAdmin', region: null, supervisor: null, portfolios: [], products: [] },
  { id: 'u2', displayName: 'Werner Hattingh', email: 'werner@medbroker.test', role: 'Broker', region: 'Gauteng', supervisor: 'Mark du Toit', portfolios: ['Discovery'], products: ['Life Insurance', 'Income Protection'] },
] };

const TASKS = { tasks: [
  { id: 'task-1', title: 'Call Thabo Nkosi', category: 'manual', priority: 'Medium', dueDate: day(-1), done: false, assignedTo: 'u1', createdAt: iso(2) },
] };

// Wrapped in { event: {...} }, NOT the raw object directly — confirmed
// against EventDetail.jsx's own `data?.event ?? null` before fixing this
// (a genuine fixture bug found by running the suite: the unwrapped shape
// left the page permanently showing "Event not found."). NOTE this is
// genuinely inconsistent across this codebase's own endpoints — 
// appointmentsApi.get() returns the raw object unwrapped, leadsApi.get()
// does too — eventsApi.get() is the one that wraps. Checked each
// individually rather than assumed a uniform pattern.
const EVENTS = { events: [
  { id: 'event-1', name: 'Wits Medical School Career Day', university: 'Wits', venue: 'Wits Medical School', eventDate: day(-10), description: '', rsvpCount: 0, attendedCount: 0, walkinCount: 0 },
] };

const NOTIFICATIONS = { notifications: [] };
const PORTFOLIOS = { portfolios: [
  { name: 'Discovery', products: [{ name: 'Life Insurance' }, { name: 'Income Protection' }] },
  { name: 'Money and Medicine', products: [{ name: 'Medical Aid' }, { name: 'Gap Cover' }] },
] };
const FLAGS = { flags: { 'events.enabled': true, 'tasks.enabled': true, 'data.export.enabled': true, 'auth.sso.enabled': false } };

/** Route table: first match wins. Each entry is [method, RegExp on the /api path, body]. */
function routes() {
  return [
    ['GET', /^\/reports\/dashboard/, DASHBOARD],
    // 27 Sep 2026 — real row shape (reportService.js, broker report):
    // without appts/signed/policyValue the Broker Performance table showed
    // "RNaNm" / "NaN" — a fixture gap, never an app bug.
    ['GET', /^\/reports\/brokers/, { brokers: [{ id: 'u2', name: 'Werner Hattingh', appts: 31, signed: 12, portfolios: ['Medical Aid'], policyValue: 2140000 }], rows: [] }],
    ['GET', /^\/reports\/agents/, { agents: [], rows: [] }],
    // 27 Sep 2026 — real response shapes (reportService.js,
    // getAgentDetailReport / getBrokerDetailReport). Previously no fixture
    // existed, so Agent/Broker detail pages rendered their error state in
    // the browser suite. Includes a future activity bucket and a quiet
    // PAST week (W37: zero calls) — the old page greyed that out as if it
    // were future.
    ['GET', /^\/reports\/agent\//, {
      meta: { name: 'Thandi Mokoena', region: 'Gauteng', portfolios: ['Medical Aid', 'Gap Cover'] },
      kpi: { leads: 64, calls: 142, callbacks: 7, noAnswer: 41, appts: 11, conversion: '0.2' },
      callOutcomes: [
        { label: 'No Answer', count: 41, pct: 29 }, { label: 'Voicemail', count: 22, pct: 15 },
        { label: 'Client Contacted', count: 31, pct: 22 }, { label: 'Callback Requested', count: 18, pct: 13 },
        { label: 'Appointment Booked', count: 12, pct: 8 }, { label: 'Not Interested', count: 14, pct: 10 },
        { label: 'Wrong Number', count: 4, pct: 3 },
      ],
      activity: [
        { label: 'W36', calls: 38, booked: 3 }, { label: 'W37', calls: 0, booked: 0 },
        { label: 'W38', calls: 61, booked: 5 }, { label: 'W39', calls: 43, booked: 3 },
        { label: 'W40', future: true, calls: 0, booked: 0 },
      ],
      recentLeads: [
        { leadId: 'l1', name: 'Sipho Dlamini', source: 'Website', status: 'AppointmentScheduled', lastCallTime: '2026-09-24T09:12:00Z', lastOutcome: 'AppointmentScheduled' },
        { leadId: 'l2', name: 'Anna van Wyk', source: 'Referral', status: 'InProgress', lastCallTime: '2026-09-23T14:40:00Z', lastOutcome: 'CallbackRequested' },
      ],
      avgDaysToClose: { won: 16.5, lost: null },
    }],
    ['GET', /^\/reports\/broker\//, {
      meta: { name: 'Werner Hattingh', region: 'Western Cape', portfolios: ['Medical Aid'] },
      kpi: { appts: 31, signed: 12, switches: 2, meetingsHeld: 24, policyValue: 2140000, conversion: '0.4' },
      productsSold: [
        { name: 'Comprehensive Medical Aid', count: 7, value: 1240000 }, { name: 'Gap Cover', count: 9, value: 410000 },
        { name: 'Hospital Plan', count: 4, value: 355000 }, { name: 'Life Cover', count: 2, value: 135000 },
        { name: 'Funeral Cover', count: 1, value: 0 },
      ],
      meetingSummary: [],
      meetingBreakdown: {
        first:  { HeldInterested: 17, HeldNotInterested: 5, Rescheduled: 4, Cancelled: 3, Missed: 2, Scheduled: 3 },
        second: { HeldInterested: 9, HeldNotInterested: 2, Scheduled: 4 },
      },
      // 28 Sep 2026 — the 31 appointments booked this period by current
      // status (sums to kpi.appts): 5 signed, 6 lost (one with no reason),
      // 2 returned to leads, 18 open (9 met, 9 not yet).
      appointmentFlow: [
        { status: 'ClosedWon', lostReason: null, met: true, count: 5 },
        { status: 'ClosedLost', lostReason: 'PriceTooHigh', met: true, count: 3 },
        { status: 'ClosedLost', lostReason: 'ChoseCompetitor', met: true, count: 2 },
        { status: 'ClosedLost', lostReason: null, met: false, count: 1 },
        { status: 'ReturnedToLeads', lostReason: null, met: false, count: 2 },
        { status: 'InProgress', lostReason: null, met: true, count: 9 },
        { status: 'Assigned', lostReason: null, met: false, count: 6 },
        { status: 'Claimed', lostReason: null, met: false, count: 3 },
      ],
      recentAppointments: [
        { id: 'a1', name: 'Sipho Dlamini', portfolio: 'Medical Aid', portfolios: ['Medical Aid'], m1: 'HeldInterested', m2: 'Scheduled', signed: null, products: [], totalValue: 0 },
      ],
      avgDaysToClose: { won: 21.3, lost: 14.0 },
    }],
    ['GET', /^\/reports\/closed-won-by-product/, { rows: [] }],
    ['GET', /^\/leads\/portfolios/, PORTFOLIOS],
    ['GET', /^\/leads\/[^/]+$/, { ...LEADS.leads[1], portfolios: ['Discovery'], products: ['Life Insurance'] }],
    ['GET', /^\/leads/, LEADS],
    ['GET', /^\/appointments\/[^/]+$/, APPOINTMENT_DETAIL],
    ['GET', /^\/appointments/, APPOINTMENTS],
    ['GET', /^\/tasks/, TASKS],
    ['GET', /^\/events\/[^/]+$/, { event: { ...EVENTS.events[0], attendees: [] } }],
    ['GET', /^\/events/, EVENTS],
    ['GET', /^\/notifications/, NOTIFICATIONS],
    ['GET', /^\/users/, USERS],
    ['GET', /^\/flags/, FLAGS],
    ['GET', /^\/audit-log/, { entries: [] }],
    ['GET', /^\/system-config/, { config: { appointmentUnassignedWarningDays: 2 } }],
    ['GET', /^\/health/, { status: 'ok' }],
  ];
}

/** Answer every /api/* call from the fixtures; unfixtured endpoints fail loudly as 501. */
export async function mockApi(page) {
  const table = routes();
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const hit = table.find(([method, re]) => method === req.method() && re.test(path));
    if (!hit) return route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: `No e2e fixture for GET ${path}` }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit[2]) });
  });
  // Fonts are cosmetic; never let the tests depend on Google being reachable.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, body: '' }));
}

/**
 * Sign in as `role` the way services/authStore.js reads a session — a
 * plain user object in sessionStorage, not a token. Visits '/' first
 * (any same-origin page) purely to get a document context to call
 * page.evaluate against before navigating to the real target.
 */
export async function signInAs(page, role) {
  await mockApi(page);
  await page.goto('/');
  await page.evaluate(({ role }) => {
    sessionStorage.setItem('medbroker.session', JSON.stringify({
      user: { id: 'u1', displayName: 'Mark du Toit', email: 'mark@medbroker.test', role },
    }));
    sessionStorage.setItem('medbroker.theme', 'linen');
  }, { role });
}

/** Collect uncaught page errors and console errors for the life of the page. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource/.test(text)) return; // logged for every non-2xx fetch; pages handle those deliberately
    errors.push(`console: ${text}`);
  });
  return errors;
}

/**
 * The assertions every page must pass. Deliberately NOT a hard
 * `getByRole('heading', level:1)` requirement — a real finding from
 * running this suite, not assumed: AppointmentDetail.jsx has zero
 * heading elements of any level anywhere in the file (confirmed by
 * reading it directly), so a strict h1-required check would fail a page
 * that genuinely works. That's its own separate, worth-flagging
 * semantic-HTML gap (see Status_Vercel.md, 24 Sep 2026) — not something
 * this suite should silently paper over by weakening what "healthy"
 * means everywhere, but also not something a REDESIGN-verification
 * suite should be the one to fix. So: try for an h1 first (most pages
 * have one); if none appears quickly, fall back to confirming `main`
 * rendered real content instead of being blank. Either way, if `heading`
 * text is supplied, it must appear somewhere visible on the page — not
 * scoped to a specific tag, since which tag carries the title isn't
 * consistent across this app.
 */
export async function expectHealthyPage(page, errors, heading) {
  const h1 = page.getByRole('heading', { level: 1 }).first();
  const hasH1 = await h1.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasH1) {
    // 26 Sep 2026 — REAL BUG in this helper itself, found by chasing what
    // looked like a genuine app hang on Supervisor/Reports and turned out
    // not to be one: dashboardLoading/brokersLoading/agentsLoading/
    // productLoading all correctly became false (confirmed by temporarily
    // logging them from inside Reports.jsx directly, not guessed) — the
    // page genuinely finishes loading. This fallback just took a SINGLE
    // textContent() snapshot immediately after the h1 wait already timed
    // out, with no retry of its own — if the real render happened to
    // land a moment after that single snapshot, this failed a perfectly
    // healthy page. expect.poll() retries the read itself until it
    // passes or its own timeout elapses, instead of reading once at a
    // moment that was never guaranteed to be after rendering finished.
    await expect.poll(
      async () => ((await page.locator('main').textContent().catch(() => '')) ?? '').trim().length,
      { timeout: 5000, message: 'main rendered no content and no <h1> was found either — likely blank/crashed' }
    ).toBeGreaterThan(20);
  }
  if (heading) await expect(page.getByText(heading).first()).toBeVisible();
  await page.waitForTimeout(300); // let late renders (charts, lazy panels) settle
  expect(errors, errors.join('\n')).toEqual([]);
}

/**
 * <main>'s own height/overflow is locked (a real, separate finding from
 * building this suite's screenshot-harness ancestor — see
 * Project_Context_Vercel.md, 24 Sep 2026): document.body.scrollHeight
 * stays pinned to the viewport height because <main> is the true scroll
 * container. Playwright's own scroll/viewport handling already copes
 * with an internally-scrolling element fine for interaction tests
 * (click, fill, etc. all auto-scroll the right container) — this helper
 * is only for a test that needs the FULL rendered content unclipped,
 * e.g. asserting something below the fold without scrolling to it first.
 */
export async function expandMainForFullContent(page) {
  await page.evaluate(() => {
    const m = document.querySelector('main');
    if (m) {
      m.style.setProperty('height', 'auto', 'important');
      m.style.setProperty('overflow', 'visible', 'important');
      m.style.setProperty('max-height', 'none', 'important');
    }
  });
}

import { test, expect } from '@playwright/test';
import { signInAs, watchErrors, expandMainForFullContent, mockApi } from './fixtures.js';

/*
 * Regression tests for bugs that only a real browser could show — each
 * one has already happened once (see Status_Vercel.md for the dates).
 */

test('Create User: dragging to select the email field does not close the modal (24 Sep 2026 bug)', async ({ page }) => {
  // Exactly the bug Mark reported live-testing: a browser's native click
  // event fires on the nearest COMMON ANCESTOR of the mousedown and
  // mouseup targets when they land on different elements, so a text
  // selection that starts inside an input and ends outside the modal
  // card produces a click whose target genuinely IS the overlay —
  // closing the modal mid-selection, even though the user never clicked
  // it. Same underlying bug closed in 12 overlay handlers across 7
  // files that day; this is the one Mark actually hit.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/admin/users');
  await page.getByRole('button', { name: '+ Add User' }).click();
  const email = page.getByPlaceholder('jane.smith@medbroker.co.za');
  await expect(email).toBeVisible();
  await email.fill('thabo.nkosi@example.com');

  const box = await email.boundingBox();
  // Mousedown inside the input, drag to a point clearly outside the
  // modal card (near the viewport's top-left corner, over the darkened
  // overlay backdrop), mouseup there — a real drag-select, not a click.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, 10, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();
  await expect(email).toHaveValue('thabo.nkosi@example.com');
});

test('Reports pipeline hero: hovering a waypoint shows its tooltip, not clipped to invisible (24 Sep 2026 bug)', async ({ page }) => {
  // The hero panel's overflow:hidden (added for its background gradient
  // washes) was silently clipping the Tooltip to nothing whenever its
  // computed position landed outside the panel's own box — the tooltip
  // was genuinely in the DOM with opacity:1, just invisible. Fixed by
  // moving the background onto its own ::before layer instead of the
  // element that also has to host content which must not be clipped.
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const waypoint = page.getByRole('button', { name: /Appointment Booked/ });
  await expect(waypoint).toBeVisible();
  await waypoint.hover();
  const tooltip = page.locator('.mbv-tip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Appointment Booked');
  // Genuinely on screen, not just display:block with zero size/off-canvas.
  const box = await tooltip.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Reports pipeline hero: the headline total uses only consistently-scoped stages (24 Sep 2026 bug)', async ({ page }) => {
  // The original headline summed all six pipeline buckets, but they're
  // scoped by three different clocks (Lead.createdAt for the four
  // sequential stages, Appointment.closedAt for Closed Won/Lost, and a
  // third basis again for a lead closed with no Appointment at all) —
  // summing them was never a coherent "leads this period" count.
  // Fixture's four sequential stages: 34+61+47+29 = 171 — NOT 200 (all
  // six summed, the original bug) and not 221 (the unrelated, separately
  // -computed Total Leads KPI a few rows down).
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  await expect(page.getByText('171 leads still in play')).toBeVisible();
});

test('Reports pipeline hero: Won/Lost fork renders as two branches, not a straight sixth stage', async ({ page }) => {
  // The real data semantics this whole component is built around:
  // Closed Won/Lost are parallel terminal outcomes reached FROM
  // "Appointment Booked", not a 5th/6th sequential stage — confirmed
  // against reportService.js before this was ever built. A regression
  // here would mean someone "simplified" the fork back into a straight
  // line, silently reintroducing the mixed-basis bug above.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  // Scoped to the hero (27 Sep 2026): the Won vs Lost ring's legend rows
  // are now buttons named "Closed Won" / "Closed Lost" too.
  const hero = page.locator('.pj-panel');
  await expect(hero.getByRole('button', { name: /Closed Won/ })).toBeVisible();
  await expect(hero.getByRole('button', { name: /Closed Lost/ })).toBeVisible();
});

// ── Reports page completion, 27 Sep 2026 (app-design-pass) ─────────────

test('Reports trend: keyboard steps through periods, and future periods are never read out as zeros', async ({ page }) => {
  // The trend used to draw buckets that hadn't happened yet as real
  // zeros, so every line crashed to 0 at "today". The last fixture bucket
  // (W40) is flagged future: the chart must stop at W39.
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const plot = page.getByRole('group', { name: /Trend over the period/ });
  await plot.focus();
  const tip = plot.locator('.mbv-tip');
  await expect(tip).toContainText('W39');          // focus lands on the last REAL period
  await page.keyboard.press('ArrowLeft');
  await expect(tip).toContainText('W38');
  await expect(tip).toContainText('61');           // W38 leads
  await page.keyboard.press('End');
  await expect(tip).toContainText('W39');          // End stops at the last real period, not W40
  await expect(tip).not.toContainText('W40');
  expect(errors).toEqual([]);
});

test('Reports trend: legend buttons hide and show a series', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const lost = page.getByRole('button', { name: 'Lost', exact: true });
  await expect(lost).toHaveAttribute('aria-pressed', 'false');   // hidden by default, as before
  await lost.click();
  await expect(lost).toHaveAttribute('aria-pressed', 'true');
  const plot = page.getByRole('group', { name: /Trend over the period/ });
  await plot.focus();
  await expect(plot.locator('.mbv-tip')).toContainText('Lost');
});

test('Reports outcome flow: focusing a region traces it and shows its detail card', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const gauteng = page.getByRole('button', { name: /^Gauteng: 19 closed, 11 won, 8 lost/ });
  await gauteng.focus();
  const card = page.locator('.mbv-flow .mbv-tip');
  await expect(card).toContainText('Gauteng');
  await expect(card).toContainText('58%');           // 11 of 19
  // Tracing dims what isn't connected: at least one band is lit, others dimmed.
  await expect(page.locator('.mbv-flow-band.lit').first()).toBeVisible();
  expect(await page.locator('.mbv-flow-band.dim').count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Reports outcome flow: lost leads with no appointment get their own branch, not a missing slice', async ({ page }) => {
  // Lost includes leads closed without ever booking an appointment; loss
  // reasons only exist on appointments. The fixture has 12 lost and 11
  // reasons, so the difference (1) must appear as its own branch.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const branch = page.getByRole('button', { name: /^Closed before an appointment: 1 of 12 lost deals/ });
  await expect(branch).toBeAttached();
  await expect(page.getByRole('button', { name: /^Lost: 12 deals, 1 closed before an appointment/ })).toBeAttached();
});

test('Reports portfolio split: a deal counted in two portfolios is explained, not shown as shares', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  await expect(page.getByRole('button', { name: 'Medical Aid: 12 won, 8 lost, win rate 60%' })).toBeVisible();
  // Fixture portfolios sum to 18 won / 11 lost against 18 / 12 — no overlap,
  // so the general note shows, not the "add up to more" one.
  await expect(page.getByText('each portfolio is compared on its own')).toBeVisible();
});

test('Reports reason rows: cancellation reasons keep value and share visible, Not captured hatched', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const list = page.getByRole('list', { name: 'Why meetings were cancelled' });
  await expect(list.getByRole('button', { name: 'Scheduling conflict: 5, 56%' })).toBeVisible();
  await expect(list.locator('.mbv-reason-bar.hatched')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'In person: 49, 64%' })).toBeVisible();   // meeting type, plain language
});

test('Reports metric strip: a sparkline reads out each period by keyboard', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  const spark = page.getByRole('group', { name: /Total Leads trend/ });
  await spark.focus();
  await page.keyboard.press('ArrowLeft');
  const cell = spark.locator('xpath=ancestor::div[contains(@class,"mbv-strip-cell")]');
  await expect(cell.locator('.mbv-strip-readout')).toHaveText('W38: 61');
  await page.keyboard.press('Escape');
  await expect(cell.locator('.mbv-strip-readout')).toHaveCount(0);   // delta line returns
});

test('Lead Import: a YYYY-MM-DD dateOfBirth column parses correctly, not as a serial number (25 Aug 2026 bug)', async ({ page }) => {
  // SheetJS's default CSV parsing auto-detects a date-shaped string and
  // silently converts it to an Excel serial number before parseRows()
  // ever saw it — "1978-03-14" became 28563, failing every row's
  // dateOfBirth validation with no visible reason. Fixed with
  // raw:true + cellDates:true at XLSX.read() time (LeadImport.jsx).
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/import');
  const csv = 'title,firstName,lastName,dateOfBirth,occupation,mobileNumber,email\n'
    + 'Dr,Thabo,Nkosi,1978-03-14,Cardiologist,0821002001,thabo.nkosi@example.com\n';
  await page.setInputFiles('input[type="file"]', {
    name: 'test-leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
  });
  // The preview table shows the real date, not a serial number and not
  // a row-level parsing error.
  await expect(page.getByText('28563')).toHaveCount(0);
  await expect(page.getByText(/1978-03-14|14 Mar 1978/)).toBeVisible();
});

test('mobile navigation opens and a link works (existing pattern, kept honest)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page).toHaveURL(/\/reports$/);
});

test('User Admin: a user record without portfolio/product arrays does not crash the list (27 Sep 2026)', async ({ page }) => {
  // Status_Vercel.md (27 Sep) logged this as fixed, but only the edit-form
  // init in UserModal was guarded — the list render still read
  // user.portfolios.length directly and took the whole page down. The live
  // API always COALESCEs these to [] (userService.js), so this is defence
  // in depth, not a production incident. Proven against the unfixed code:
  // this test failed there before the guard was added.
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  // Registered after mockApi's catch-all, so it takes precedence.
  await page.route(/\/api\/users(\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ users: [
      { id: 'u9', displayName: 'Legacy Record', email: 'legacy@medbroker.test', role: 'Agent', region: null, supervisor: null },
    ] }),
  }));
  await page.goto('/admin/users');
  await expect(page.getByText('Legacy Record')).toBeVisible();
  expect(errors).toEqual([]);
});

// KNOWN, NOT YET FIXED — found while building this suite (24 Sep 2026),
// out of scope for the Reports redesign this suite grew out of, flagged
// to Mark rather than fixed silently. test.fail() so CI shows this as a
// known, tracked issue rather than either hiding it or blocking every
// unrelated push — remove test.fail() the day this is actually fixed,
// at which point this test starts passing and Playwright will error to
// say so (a fail() test that starts passing is itself a build failure,
// which is the point — it stops this from being forgotten).
test.fail('tasks.enabled defaults to false and the route redirects before the async flag fetch can override it', async ({ page }) => {
  // FlagContext.jsx's DEFAULT_FLAGS has 'tasks.enabled': false, used as
  // the INITIAL state before the real /flags fetch resolves. App.jsx's
  // /tasks route reads flag('tasks.enabled') synchronously on first
  // render and redirects immediately if false — before any fetch,
  // however fast, can possibly have resolved yet. So even when the real
  // server says the flag is on, the route redirects away first and
  // never re-evaluates once flags actually load. Confirmed this isn't
  // just a mocked-API artifact: /events has the exact same shape of
  // gate (flag('events.enabled')) and never shows this, because ITS
  // default already happens to be true — the bug only bites a flag
  // whose default is false but which the server has turned on.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/tasks$/);
});

test('the internally-scrolling <main> can be expanded to show its full content unclipped', async ({ page }) => {
  // Real finding from building this suite's screenshot-harness ancestor:
  // document.body.scrollHeight stays pinned to the viewport because
  // <main> (not the page) is the true scroll container — confirmed by
  // measuring scrollHeight vs clientHeight directly. This test protects
  // the helper itself, not app behaviour: if <main> is ever refactored
  // away, this is the test that will notice and say why other tests
  // relying on expandMainForFullContent() started failing. A short
  // viewport forces real overflow deterministically — relying on a
  // fixture's own content happening to be tall enough failed once
  // already when a sparser fixture fit inside a taller viewport with
  // nothing left to reveal (900 in, 900 out, no assertion possible).
  await page.setViewportSize({ width: 1440, height: 400 });
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports');
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => document.body.scrollHeight);
  await expandMainForFullContent(page);
  const after = await page.evaluate(() => document.body.scrollHeight);
  expect(after).toBeGreaterThan(before);
});

// ── Agent Detail and Broker Detail, 27 Sep 2026 (app-design-pass) ──────

test('Agent Detail orbit: focusing Not reached lights it and puts its share in the centre', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/agent/u3');
  await expect(page.getByRole('heading', { name: '142 calls this period' })).toBeVisible();
  // Not reached = no answer 41 + voicemail 22 + wrong number 4 = 67 of 142.
  await page.getByRole('button', { name: 'Not reached: 67 calls, 47%' }).focus();
  // 28 Sep 2026: drawn as an Orbit — the centre is the detail readout.
  await expect(page.locator('.mbv-orbit-figure')).toHaveText('67');
  await expect(page.locator('.mbv-orbit-caption')).toHaveText('Not reached, 47%');
  expect(await page.locator('.mbv-orbit-seg.dim').count()).toBeGreaterThan(0);
  // A child lights its parent: focusing Voicemail keeps Not reached lit.
  await page.getByRole('button', { name: 'Voicemail: 22 calls, 15%' }).focus();
  await expect(page.locator('.mbv-orbit-row.lit', { hasText: 'Not reached' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Agent Detail activity: a quiet past week is a real zero, the future week is never read', async ({ page }) => {
  // The old bars greyed out ANY week with no calls and no bookings as if it
  // were future. W37 (zero calls, in the past) must read as 0; W40 (future)
  // must be unreachable.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/agent/u3');
  const plot = page.getByRole('group', { name: /Calls and bookings/ });
  await plot.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const tip = plot.locator('.mbv-tip');
  await expect(tip).toContainText('W37');
  await expect(tip).toContainText('Calls made');
  await page.keyboard.press('End');
  await expect(tip).toContainText('W39');
});

test('Agent Detail table shows lead status in plain language, not the enum', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/agent/u3');
  await expect(page.getByText('Appointment booked', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('AppointmentScheduled')).toHaveCount(0);
});

test('Broker Detail appointment orbit: every appointment by where it stands, open split by met / not met', async ({ page }) => {
  // 28 Sep 2026 — Mark: "should the Broker not get a similar report showing
  // Appointments?" One cohort (booked this period), current status, sums to 31.
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/broker/u2');
  await expect(page.getByRole('heading', { name: '31 appointments this period' })).toBeVisible();
  await page.getByRole('button', { name: 'Still open: 18 appointments, 58%' }).focus();
  await expect(page.locator('.mbv-orbit-caption')).toHaveText('Still open, 58%');
  // 31 appointments: one tick each, and no "each tick marks" note.
  await expect(page.locator('.mbv-orbit-tick')).toHaveCount(31);
  await expect(page.locator('.mbv-orbit-note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Met, still deciding: 9 appointments, 29%' })).toBeAttached();
  // A lost appointment with no recorded reason is its own, hatched branch.
  await expect(page.getByRole('button', { name: 'Not captured: 1 appointment, 3%' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Returned to leads: 2 appointments, 6%' })).toBeAttached();
  expect(errors).toEqual([]);
});

test('Broker Detail signed value: stroke and rows carry value and share; zero-value products still listed', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/broker/u2');
  await expect(page.getByRole('heading', { name: 'Signed policy value' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Comprehensive Medical Aid: R1\D?240\D?000, 58% of the value$/ })).toBeVisible();
  // Sold, but no value recorded: a row, but no segment to draw.
  await expect(page.getByRole('button', { name: /^Funeral Cover: 1 sold/ })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Policy value by product' }).getByRole('button', { name: /^Funeral Cover/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Broker Detail meeting outcomes: counts drawn from numbers, with shares of attempts', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/broker/u2');
  const first = page.getByRole('list', { name: 'First meetings' });
  await expect(first.getByRole('button', { name: 'Held, interested: 17, 50%' })).toBeVisible();   // 17 of 34 attempts
  await expect(page.getByRole('list', { name: 'Second meetings' }).getByRole('button', { name: 'Scheduled, not yet held: 4, 27%' })).toBeVisible();
});

test('Agent Detail orbit: past 120 calls each tick stands for several, and the panel says so', async ({ page }) => {
  // 142 calls would crowd into a solid band at one tick each; the orbit
  // switches to one tick per 2 calls (71 ticks) and states it on screen.
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/reports/agent/u3');
  await expect(page.locator('.mbv-orbit-tick')).toHaveCount(71);
  await expect(page.getByText('Each tick on the outer ring marks 2 calls.')).toBeVisible();
});

// ── Appointment Detail, 28 Sep 2026 (app-design-pass) ──────────────────

test('Appointment Detail journey: headline, stretches, and a friction marker with its detail', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/appointments/appt-1');
  await expect(page.getByRole('heading', { name: /^Day 26: second meeting on \d{1,2} [A-Z][a-z]{2}$/ })).toBeVisible();
  await expect(page.getByText('Booked by Thandi Mokoena on day 7. One meeting held with Werner Hattingh, with 1 reschedule along the way.')).toBeVisible();
  const marker = page.getByRole('button', { name: /^First meeting: Rescheduled, .*, day 9/ });
  await marker.focus();
  await expect(page.locator('.lj-panel .mbv-tip')).toContainText('Rescheduled');
  await expect(page.getByRole('button', { name: /^Second meeting, .*, day 31, Scheduled/ })).toBeAttached();
  expect(errors).toEqual([]);
});

// ── Lead Detail journey, 1 Oct 2026 ─────────────────────────────────────

test('Lead Detail journey: headline, calls, bands, legend, and a call dot with its detail card', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/lead-2');
  const hero = page.getByRole('region', { name: 'Priya Naidoo’s journey' });
  await expect(hero.getByRole('heading', { name: /^Day 26: second meeting on \d{1,2} [A-Z][a-z]{2}$/ })).toBeVisible();
  await expect(hero.getByText('Reached on the third of four calls and booked by Thandi Mokoena on day 7. One meeting held with Werner Hattingh, with 1 reschedule along the way.')).toBeVisible();
  await expect(hero.locator('.lpj-call')).toHaveCount(4);
  await expect(hero.locator('.lpj-band-text', { hasText: 'With the agent · 7 days' })).toBeVisible();
  await expect(hero.locator('.lpj-band-text', { hasText: 'With the broker · Werner Hattingh · 19 days so far' })).toBeVisible();
  const legend = hero.getByLabel('Legend');
  for (const t of ['Call, reached', 'Call, not reached', 'Rescheduled, cancelled or no-show', 'Still to come']) await expect(legend).toContainText(t);
  const call3 = hero.getByRole('button', { name: /^Call 3, .*, day 5, Callback requested$/ });
  await call3.hover();
  const card = hero.locator('.mbv-tip');
  await expect(card).toContainText('Call 3');
  await expect(card).toContainText('Callback requested');
  await call3.blur();
  await page.mouse.move(0, 0);
  await hero.getByRole('button', { name: /^Call 1, / }).focus();
  await expect(card).toContainText('No answer');
  expect(errors).toEqual([]);
});

test('Lead Detail journey: a lead back with the agent after a lost appointment keeps an open journey (1 Oct 2026)', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  const ago = d => new Date(Date.now() - d * 86400000).toISOString();
  // lead-2 is Assigned in the fixtures; its latest appointment was lost 5 days ago.
  await page.route(/\/api\/appointments\/appt-1$/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: 'appt-1', leadId: 'lead-2', firstName: 'Priya', lastName: 'Naidoo', status: 'ClosedLost', lostReason: 'ChoseCompetitor',
    leadCreatedAt: ago(26), createdAt: ago(19), updatedAt: ago(5), closedAt: ago(5),
    agentName: 'Thandi Mokoena', brokerName: 'Werner Hattingh', productsSold: [],
    meetingAttempts: [{ id: 'ma1', meetingNumber: 1, status: 'HeldNotInterested', date: ago(12).slice(0, 10), createdAt: ago(12), cancelReason: null, notes: null }],
  }) }));
  await page.goto('/leads/lead-2');
  const hero = page.getByRole('region', { name: 'Priya Naidoo’s journey' });
  await expect(hero.getByRole('heading', { name: 'Day 26, back with the agent' })).toBeVisible();
  await expect(hero.getByRole('button', { name: /^Lost: Chose a competitor, / })).toBeAttached();
  await expect(hero.locator('.lpj-band-text', { hasText: /5 days so far$/ })).toBeVisible(); // full or short label, by width
  expect(errors).toEqual([]);
});

// ── Lead Detail History, 1 Oct 2026 (canvas Timeline artboard) ─────────

test('Lead Detail History: replaces the call, appointment and audit cards, under the journey hero', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/lead-2');
  await expect(page.getByRole('region', { name: 'Priya Naidoo’s journey' }).getByRole('heading', { name: /^Day 26: / })).toBeVisible();
  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(history.getByText('9 entries · newest first')).toBeVisible();
  // Day headers ("d MMM yyyy"), one <ol> per day, entries in each.
  await expect(history.locator('.tl-day').first()).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  expect(await history.locator('ol').count()).toBeGreaterThan(3);
  await expect(history.locator('li')).toHaveCount(9);
  await expect(history.getByText('Call: no answer')).toBeVisible();
  // What the old cards showed lives here now — and the cards are gone.
  for (const old of [/^Call History/, /^Appointment History/, /^Audit Log/]) await expect(page.getByText(old)).toHaveCount(0);
  for (const card of ['Lead Detail', 'Personal Details', 'Insurance Information', 'Education']) await expect(page.getByText(card, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Lead Detail History: the Calls chip shows only calls and is pressed', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/lead-2');
  const history = page.getByRole('region', { name: 'History' });
  const all = history.getByRole('button', { name: 'All', exact: true });
  const calls = history.getByRole('button', { name: 'Calls', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(calls).toHaveAttribute('aria-pressed', 'false');
  await calls.click();
  await expect(calls).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(history.locator('li')).toHaveCount(4);
  for (const label of await history.locator('.tl-cat').allTextContents()) expect(label).toMatch(/^Call \d$/);
  await expect(history.getByText('Details updated')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Lead Detail History: an appointment entry links to its appointment; a sealed edit shows no digits', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/lead-2');
  const history = page.getByRole('region', { name: 'History' });
  const edit = history.locator('li', { hasText: 'Details updated' });
  await expect(edit.getByText('ID Number changed')).toBeVisible();
  await expect(edit).not.toContainText(/\d{6,}/);
  await expect(edit).toContainText('priya.naidoo@example.com');
  const booked = history.getByRole('link', { name: 'Appointment booked' });
  await expect(booked).toHaveAttribute('href', '/appointments/appt-1');
  await booked.click();
  await expect(page).toHaveURL(/\/appointments\/appt-1$/);
  expect(errors).toEqual([]);
});

// ── Leads list journey band, 28 Sep 2026 (app-design-pass) ─────────────

test('Leads list journey: every caption state, and a quiet lead explains itself on focus', async ({ page }) => {
  const errors = watchErrors(page);
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  for (const text of ['No call yet', 'Quiet for 18 days', 'Called 2 days ago', 'Booked 31 days ago', 'Signed 31 days ago']) {
    await expect(page.locator('.lrj-caption', { hasText: text })).toHaveCount(1);
  }
  const quiet = page.getByRole('button', { name: /^Journey: Quiet for 18 days\. 1 call in total, 0 of the last 1 reached the client\.$/ });
  await quiet.focus();
  const card = page.locator('.lrj-card');
  await expect(card).toContainText('Priya Naidoo');
  await expect(card).toContainText('Event: Wits Career Day');
  await expect(card).toContainText('priya.naidoo@example.com');
  expect(errors).toEqual([]);
});

test('Leads list journey: clicking a journey still opens the lead', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  await page.getByRole('button', { name: /^Journey: Called 2 days ago/ }).click();
  await expect(page).toHaveURL(/\/leads\/lead-3$/);
});

// ── Leads list follow-ups, 29 Sep 2026 ─────────────────────────────────

test('Leads list: narrowing the window redraws the journey band live (no refresh)', async ({ page }) => {
  // Mark's screenshot: after the window narrowed, the band stayed at its old
  // width — today line and captions off-screen until a refresh. Proven to
  // FAIL against the pre-fix LeadRowJourney.
  await page.setViewportSize({ width: 1600, height: 900 });
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  await expect(page.locator('.lrj-caption').first()).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.waitForTimeout(400);
  const band = await page.locator('td.lrj-band').first().boundingBox();
  const table = await page.locator('table').first().evaluate(t => t.parentElement.getBoundingClientRect().right);
  expect(band.x + band.width).toBeLessThanOrEqual(table + 1);
  for (const c of await page.locator('.lrj-caption').all()) {
    const b = await c.boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(band.x + band.width + 1);
  }
});

test('Leads list: source shows under the job title', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  await expect(page.getByText('Source: Event: Wits Career Day')).toBeVisible();
});

test('Leads list: "Longest without contact" asks the server for the quiet sort, and toggles off', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads');
  const btn = page.getByRole('button', { name: /Longest without contact/ });
  const req = page.waitForRequest(r => /\/api\/leads\?/.test(r.url()) && r.url().includes('sortKey=quiet'));
  await btn.click();
  await req;
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
});

test('Lead Detail: "Save call & Book Appointment" logs the call (POST /calls) before the booking modal opens (30 Sep 2026)', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.goto('/leads/lead-2');
  await page.getByRole('button', { name: 'Log Call' }).click();
  await page.getByRole('combobox').first().selectOption('ClientContacted');
  const posted = page.waitForRequest(r => r.method() === 'POST' && /\/api\/leads\/lead-2\/calls$/.test(r.url()));
  await page.getByRole('button', { name: /Save call & Book Appointment/ }).click();
  const req = await posted;
  expect(req.postDataJSON()).toMatchObject({ outcome: 'ClientContacted' });
  await expect(page.getByRole('heading', { name: /Book Appointment/ })).toBeVisible();
});

test('Lead Detail: a failed call save shows the error and does not open the booking modal (30 Sep 2026)', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.route(/\/api\/leads\/lead-2\/calls$/, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Lead is closed' }) })
    : route.fallback());
  await page.goto('/leads/lead-2');
  await page.getByRole('button', { name: 'Log Call' }).click();
  await page.getByRole('combobox').first().selectOption('ClientContacted');
  await page.getByRole('button', { name: /Save call & Book Appointment/ }).click();
  await expect(page.getByText('Lead is closed')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Book Appointment/ })).toHaveCount(0);
});

test('Login: a server validation error shows a message and the form stays rendered (30 Sep 2026)', async ({ page }) => {
  const errors = watchErrors(page);
  await mockApi(page);
  await page.route(/\/api\/auth\/login$/, route => route.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ error: { formErrors: [], fieldErrors: { email: ['Invalid email'] } } }),
  }));
  await page.goto('/');
  await page.locator('#login-email').fill('a@b.c');
  await page.locator('#login-password').fill('whatever123');
  await page.getByRole('button', { name: /^Sign in$/ }).click();
  await expect(page.getByText('email: Invalid email')).toBeVisible();
  await expect(page.locator('#login-email')).toBeVisible();
  expect(errors.filter(e => e.startsWith('pageerror'))).toEqual([]);
});

test('Tasks: a failed create shows the error in the modal and keeps it open; "POPIA Request" is not offered (30 Sep 2026)', async ({ page }) => {
  await signInAs(page, 'GlobalAdmin');
  await page.route(/\/api\/tasks$/, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Task rejected by server' }) })
    : route.fallback());
  // In-app navigation: a direct goto('/tasks') hits the known flag-default redirect (test.fail above).
  await page.goto('/leads');
  await page.getByRole('link', { name: /^Tasks/ }).first().click();
  await page.getByRole('button', { name: /New Task/ }).click();
  await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible();
  await expect(page.locator('option', { hasText: 'POPIA Request' })).toHaveCount(0);
  await page.getByPlaceholder('e.g. Follow up with Dr Smith').fill('Call back Dr Smith');
  await page.getByRole('button', { name: /^(Create Task|Create|Save)/ }).click();
  await expect(page.getByText('Task rejected by server')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Task' })).toBeVisible();
});

test('Agent typing /leads/new or /leads/import is sent back to the leads list (30 Sep 2026)', async ({ page }) => {
  await signInAs(page, 'Agent');
  for (const path of ['/leads/new', '/leads/import']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/leads$/);
  }
});

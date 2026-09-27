import { test, expect } from '@playwright/test';
import { signInAs, watchErrors, expandMainForFullContent } from './fixtures.js';

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

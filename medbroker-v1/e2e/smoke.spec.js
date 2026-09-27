import { test } from '@playwright/test';
import { signInAs, watchErrors, expectHealthyPage } from './fixtures.js';

/*
 * Every page, for every role that can reach it: renders a heading, throws
 * nothing, logs no console errors. Runs on desktop and a phone-sized
 * viewport (see playwright.config.js — the 'mobile' project only runs
 * this file). Route/role gating confirmed against App.jsx directly
 * before writing this list (isBroker/isAgent/isAdminOrAbove/
 * isGlobalAdmin, and each flag('...') gate), not assumed.
 */
// 'tasks.enabled' deliberately excluded from every role's page list — a
// real, separate bug found while building this suite (see
// interactions.spec.js's own dedicated, marked-as-failing test for the
// full explanation), not something to paper over by testing around it
// here. This smoke list is for pages that DO render correctly today.
const COMMON = [
  ['/notifications', 'Notifications'], ['/settings', 'Settings'],
  ['/change-password', 'Change password'],
];

const PAGES = {
  // isBroker -> /leads and /leads/* redirect to /appointments instead.
  Broker: [
    ['/appointments', 'Appointments'], ['/appointments/appt-1', null],
    ['/events', 'Events'], ['/events/event-1', 'Wits Medical School Career Day'],
    ...COMMON,
  ],
  // isAgent -> /appointments and /appointments/* redirect to /leads instead.
  Agent: [
    ['/leads', 'Leads'], ['/leads/lead-2', null], ['/leads/new', 'Add Lead'],
    ['/events', 'Events'], ...COMMON,
  ],
  Supervisor: [
    ['/leads', 'Leads'], ['/leads/import', 'Import Leads'], ['/appointments', 'Appointments'],
    ['/reports', 'Reports'], ['/events', 'Events'], ...COMMON,
  ],
  Admin: [
    ['/leads', 'Leads'], ['/appointments', 'Appointments'], ['/reports', 'Reports'],
    ['/admin/users', 'User'], ['/admin/app', null], ...COMMON,
  ],
  GlobalAdmin: [
    ['/leads', 'Leads'], ['/appointments', 'Appointments'], ['/reports', 'Reports'],
    ['/admin/users', 'User'], ['/admin/app', null], ['/admin/flags', 'Feature Flags'],
    ['/admin/integrations', 'Integrations'], ...COMMON,
  ],
};

for (const [role, pages] of Object.entries(PAGES)) {
  test.describe(`${role}`, () => {
    for (const [path, heading] of pages) {
      test(`${path} renders cleanly`, async ({ page }) => {
        const errors = watchErrors(page);
        await signInAs(page, role);
        await page.goto(path);
        await expectHealthyPage(page, errors, heading);
      });
    }
  });
}

test('signed out, the app shows the sign-in screen instead of a broken page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expectHealthyPage(page, errors);
});

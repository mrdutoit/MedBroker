import { describe, it, expect } from 'vitest';
import { buildHistory, filterDays, limitDays, HISTORY_LIMIT } from './historyModel.js';

// historyModel.test.js — 1 Oct 2026. The rules behind Lead Detail's History
// timeline. Times are asserted in SAST whatever the machine's zone.
let seq = 0;
const e = (action, performedAt, changeDetail = null, extra = {}) => ({
  id: `e${++seq}`, action, performedAt, changeDetail,
  performedByName: 'Thabo Molefe', entityType: 'Lead', entityId: 'lead-1', ...extra,
});
const appt = (action, performedAt, changeDetail = null) =>
  e(action, performedAt, changeDetail, { entityType: 'Appointment', entityId: 'appt-9', performedByName: 'Anika van der Merwe' });
const all = h => h.days.flatMap(d => d.items);
const one = entry => all(buildHistory([entry]))[0];

describe('buildHistory — categories', () => {
  it.each([
    ['CallLogged', 'Lead', 'calls'],
    ['AppointmentCreated', 'Appointment', 'appointment'],
    ['AppointmentOutcomeSaved', 'Appointment', 'appointment'],
    ['AppointmentReturnedToLeads', 'Appointment', 'appointment'],
    ['MeetingAttemptSaved', 'Appointment', 'appointment'],
    ['AppointmentReopened', 'Appointment', 'appointment'],
    ['LeadUpdated', 'Lead', 'edits'],
    ['AppointmentUpdated', 'Appointment', 'edits'],
    ['LeadAssigned', 'Lead', 'assignments'],
    ['LeadReassigned', 'Lead', 'assignments'],
    ['AppointmentBrokerAssigned', 'Appointment', 'assignments'],
    ['AppointmentReassigned', 'Appointment', 'assignments'],
    ['LeadCreated', 'Lead', 'created'],
    ['SarDeletionExecuted', 'SubjectAccessRequest', 'popia'],
    ['AppointmentClosedForErasure', 'Appointment', 'popia'],
    ['SarDataExported', 'SubjectAccessRequest', 'popia'],
    ['LeadReopened', 'Lead', 'assignments'],
    ['AppointmentClaimed', 'Appointment', 'assignments'],
    ['PortalRegistration', 'Lead', 'other'],
  ])('%s (%s) → %s', (action, entityType, category) => {
    const detail = action === 'CallLogged' ? { outcome: 'NoAnswer' } : action === 'MeetingAttemptSaved' ? { meetingNumber: 1, status: 'Scheduled' } : null;
    expect(one(e(action, '2026-08-02T10:00:00Z', detail, { entityType })).category).toBe(category);
  });

  it('category labels and colours', () => {
    const lbl = (x) => { const i = one(x); return [i.label, i.color]; };
    expect(lbl(e('LeadCreated', '2026-08-02T10:00:00Z'))).toEqual(['Created', 'var(--pl-unassigned)']);
    expect(lbl(e('LeadAssigned', '2026-08-02T10:00:00Z'))).toEqual(['Assignment', 'var(--pl-assigned)']);
    expect(lbl(e('LeadUpdated', '2026-08-02T10:00:00Z', { email: { from: 'a', to: 'b' } }))).toEqual(['Edit', 'var(--na)']);
    expect(lbl(appt('AppointmentCreated', '2026-08-02T10:00:00Z'))).toEqual(['Appointment', 'var(--pl-booked)']);
    expect(lbl(e('SarDeletionExecuted', '2026-08-02T10:00:00Z', null, { entityType: 'SubjectAccessRequest' }))).toEqual(['POPIA', 'var(--danger)']);
    expect(lbl(e('LeadReopened', '2026-08-02T10:00:00Z'))).toEqual(['Reopened', 'var(--pl-assigned)']);
    expect(lbl(e('PortalRegistration', '2026-08-02T10:00:00Z'))).toEqual(['Other', 'var(--mut)']);
    expect(lbl(e('CallLogged', '2026-08-02T10:00:00Z', { outcome: 'NoAnswer' }))).toEqual(['Call 1', 'var(--pl-progress)']);
  });

  it('unknown action falls back to the describeEntry label, category other, never blank', () => {
    const i = one(e('SomethingNew', '2026-08-02T10:00:00Z', { x: 1 }));
    expect(i).toMatchObject({ category: 'other', title: 'SomethingNew', label: 'Other' });
    expect(one(e('', '2026-08-02T10:00:00Z')).title).toBeTruthy();
  });

  it('appointment-entity rows carry appointmentId for the link; lead rows do not', () => {
    expect(one(appt('AppointmentCreated', '2026-08-02T10:00:00Z')).appointmentId).toBe('appt-9');
    expect(one(appt('AppointmentUpdated', '2026-08-02T10:00:00Z', { meetingType: { from: 'InPerson', to: 'Virtual' } })).appointmentId).toBe('appt-9');
    expect(one(e('LeadCreated', '2026-08-02T10:00:00Z')).appointmentId).toBeNull();
  });

  it('describeEntry titles for assignments; who is the performer', () => {
    const i = one(e('LeadReassigned', '2026-08-02T10:00:00Z', { previousAgentName: 'Thabo Molefe', newAgentName: 'Zanele Khumalo' }, { performedByName: 'Lindiwe Dube' }));
    expect(i.title).toBe('Lead reassigned from Thabo Molefe to Zanele Khumalo');
    expect(i.who).toBe('Lindiwe Dube');
    expect(i.meta).toBe('Lindiwe Dube');
  });

  it('no performer (system) → meta has no name', () => {
    expect(one(appt('AppointmentClosedForErasure', '2026-08-02T10:00:00Z', { lostReason: 'ConsentWithdrawn' })).who).toBe('Anika van der Merwe');
    const sys = one(e('PortalRegistration', '2026-08-02T10:00:00Z', null, { performedByName: null }));
    expect(sys.who).toBeNull();
    expect(sys.meta).toBe('');
  });
});

describe('buildHistory — reopened and outcomes', () => {
  it('LeadReopened: assignments, label "Reopened", describeEntry title', () => {
    expect(one(e('LeadReopened', '2026-08-02T10:00:00Z', { from: 'Closed', to: 'InProgress' }))).toMatchObject({
      category: 'assignments', label: 'Reopened', title: 'Lead reopened after Closed Lost', color: 'var(--pl-assigned)',
    });
    expect(one(e('LeadAssigned', '2026-08-02T10:00:00Z')).label).toBe('Assignment');
  });

  it.each([
    [{ newStatus: 'ClosedWon', customerSigned: true }, 'Signed', 'var(--pl-won)'],
    [{ customerSigned: true, newStatus: 'InProgress' }, 'Signed', 'var(--pl-won)'],
    [{ newStatus: 'ClosedLost', lostReason: 'ChoseCompetitor' }, 'Closed Lost: Chose a competitor', 'var(--pl-lost)'],
    [{ newStatus: 'ClosedLost', lostReason: 'Mystery' }, 'Closed Lost: Mystery', 'var(--pl-lost)'],
    [{ newStatus: 'ClosedLost', customerSigned: false }, 'Closed Lost', 'var(--pl-lost)'],
    [{ newStatus: 'InProgress', meetings: [{ number: 1, status: 'HeldInterested' }] }, 'Meeting 1: HeldInterested; Status → InProgress', 'var(--pl-booked)'],
  ])('AppointmentOutcomeSaved %j → "%s"', (detail, title, color) => {
    expect(one(appt('AppointmentOutcomeSaved', '2026-09-01T10:00:00Z', detail))).toMatchObject({ category: 'appointment', label: 'Appointment', title, color });
  });
});

describe('buildHistory — calls', () => {
  it('numbers calls oldest-first across the lead and marks the first reached one', () => {
    const h = buildHistory([
      e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'AppointmentScheduled', notes: 'secret' }),
      e('CallLogged', '2026-08-11T13:45:00Z', { outcome: 'CallbackRequested' }),
      e('LeadUpdated', '2026-08-10T09:00:00Z', { email: { from: 'a', to: 'b' } }),
      e('CallLogged', '2026-08-06T09:10:00Z', { outcome: 'Voicemail' }),
      e('CallLogged', '2026-08-04T07:32:00Z', { outcome: 'NoAnswer' }),
    ]);
    const calls = all(h).filter(i => i.category === 'calls');
    expect(calls.map(c => [c.title, c.label, c.meta, c.hollow])).toEqual([
      ['Call: appointment scheduled', 'Call 4', 'Thabo Molefe', false],
      ['Call: callback requested', 'Call 3', 'Thabo Molefe · first time reached', false],
      ['Call: voicemail left', 'Call 2', 'Thabo Molefe', true],
      ['Call: no answer', 'Call 1', 'Thabo Molefe', true],
    ]);
  });

  it('never carries call notes anywhere on the item', () => {
    const i = one(e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'ClientContacted', notes: 'private note' }));
    expect(JSON.stringify(i)).not.toContain('private note');
  });

  it('unknown outcome still gives a title', () => {
    expect(one(e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'Mystery' })).title).toBe('Call: mystery');
    expect(one(e('CallLogged', '2026-08-14T08:02:00Z', null)).title).toBe('Call logged');
  });
});

describe('buildHistory — meeting attempts', () => {
  it.each([
    [1, 'HeldInterested', 'First meeting held, interested', false, 'var(--pl-won)'],
    [1, 'HeldNotInterested', 'First meeting held, not interested', false, 'var(--pl-won)'],
    [1, 'Rescheduled', 'First meeting rescheduled', true, 'var(--pl-booked)'],
    [2, 'Cancelled', 'Second meeting cancelled', true, 'var(--pl-booked)'],
    [2, 'Missed', 'Second meeting no-show', true, 'var(--pl-booked)'],
    [3, 'Scheduled', 'Third meeting scheduled', false, 'var(--pl-booked)'],
  ])('meeting %i %s → "%s"', (meetingNumber, status, title, hollow, color) => {
    const i = one(appt('MeetingAttemptSaved', '2026-08-28T14:40:00Z', { meetingNumber, status }));
    expect(i).toMatchObject({ title, hollow, color, category: 'appointment', label: 'Appointment', appointmentId: 'appt-9' });
  });
});

describe('buildHistory — edits', () => {
  it('"Details updated" with a diff: date, array, null and a sealed field', () => {
    const i = one(e('LeadUpdated', '2026-08-12T09:20:00Z', {
      dateOfBirth: { from: '1990-03-04', to: '1990-04-03' },
      portfolios: { from: ['Medical aid'], to: ['Medical aid', 'Life cover'] },
      whatsappNumber: { from: null, to: '083 555 0142' },
      idNumber: { changed: true },
      mysteryField: { from: [], to: 'x' },
      email: {},
    }));
    expect(i.title).toBe('Details updated');
    expect(i.label).toBe('Edit');
    expect(i.diff).toEqual([
      { field: 'Date of Birth', from: '4 Mar 1990', to: '3 Apr 1990' },
      { field: 'Portfolio', from: 'Medical aid', to: 'Medical aid, Life cover' },
      { field: 'WhatsApp', from: '—', to: '083 555 0142' },
      { field: 'ID Number', changed: true },
      { field: 'mysteryField', from: '—', to: 'x' },
      { field: 'Email', changed: true },
    ]);
  });

  it('appointment edits format the appointment date too', () => {
    const i = one(appt('AppointmentUpdated', '2026-09-18T12:12:00Z', { firstAppointmentDate: { from: '2026-08-28', to: '2026-10-07' } }));
    expect(i.diff).toEqual([{ field: 'Appointment date', from: '28 Aug 2026', to: '7 Oct 2026' }]);
  });

  it('an edit with no detail still has a title and an empty diff', () => {
    expect(one(e('LeadUpdated', '2026-08-12T09:20:00Z', null))).toMatchObject({ title: 'Details updated', diff: [] });
  });
});

describe('buildHistory — days, times, counts', () => {
  it('groups by SAST calendar day: 23:30Z belongs to the next SAST day', () => {
    const h = buildHistory([
      e('LeadAssigned', '2026-08-02T23:30:00Z'),
      e('LeadCreated', '2026-08-02T21:59:00Z'),
    ]);
    expect(h.days.map(d => [d.label, d.items.map(i => i.time)])).toEqual([
      ['3 Aug 2026', ['01:30']],
      ['2 Aug 2026', ['23:59']],
    ]);
  });

  it('several entries on one day stay newest first in one group', () => {
    const h = buildHistory([
      appt('AppointmentCreated', '2026-08-14T08:07:00Z'),
      e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'AppointmentScheduled' }),
    ]);
    expect(h.days).toHaveLength(1);
    expect(h.days[0].items.map(i => i.time)).toEqual(['10:07', '10:02']);
  });

  it('sorts newest first even if handed out of order', () => {
    const h = buildHistory([e('LeadCreated', '2026-08-01T10:00:00Z'), e('LeadAssigned', '2026-08-05T10:00:00Z')]);
    expect(h.days.map(d => d.label)).toEqual(['5 Aug 2026', '1 Aug 2026']);
  });

  it('counts per chip', () => {
    const h = buildHistory([
      e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'NoAnswer' }),
      e('CallLogged', '2026-08-13T08:02:00Z', { outcome: 'NoAnswer' }),
      appt('AppointmentCreated', '2026-08-14T08:07:00Z'),
      appt('MeetingAttemptSaved', '2026-08-20T08:07:00Z', { meetingNumber: 1, status: 'Scheduled' }),
      e('LeadUpdated', '2026-08-12T09:20:00Z', { email: { from: 'a', to: 'b' } }),
      e('LeadAssigned', '2026-08-02T11:05:00Z'),
      e('LeadCreated', '2026-08-02T11:01:00Z'),
      e('LeadReopened', '2026-08-30T11:01:00Z'),
    ]);
    expect(h.counts).toEqual({ all: 8, calls: 2, appointment: 2, edits: 1, assignments: 2 });
  });

  it('empty / missing entries', () => {
    expect(buildHistory([])).toEqual({ days: [], counts: { all: 0, calls: 0, appointment: 0, edits: 0, assignments: 0 } });
    expect(buildHistory(undefined).days).toEqual([]);
  });

  it('a lead with no calls and no appointments: created + assigned only', () => {
    const h = buildHistory([e('LeadAssigned', '2026-08-02T11:05:00Z', { newAgentName: 'Thabo Molefe' }), e('LeadCreated', '2026-08-02T11:01:00Z')]);
    expect(all(h).map(i => i.title)).toEqual(['Lead assigned to Thabo Molefe', 'Lead created']);
  });
});

describe('filterDays / limitDays', () => {
  const h = buildHistory([
    e('CallLogged', '2026-08-14T08:02:00Z', { outcome: 'NoAnswer' }),
    e('LeadAssigned', '2026-08-02T11:05:00Z'),
    e('LeadCreated', '2026-08-02T11:01:00Z'),
  ]);

  it('all keeps every day; a chip keeps only its items and drops empty days', () => {
    expect(filterDays(h.days, 'all')).toBe(h.days);
    expect(filterDays(h.days, 'calls').map(d => d.items.length)).toEqual([1]);
    expect(filterDays(h.days, 'assignments').map(d => d.label)).toEqual(['2 Aug 2026']);
    expect(filterDays(h.days, 'edits')).toEqual([]);
  });

  it('shows the first 15 entries and counts the rest, splitting a day if needed', () => {
    expect(HISTORY_LIMIT).toBe(15);
    const many = buildHistory(Array.from({ length: 18 }, (_, k) =>
      e('LeadUpdated', `2026-08-${String(20 - Math.floor(k / 4)).padStart(2, '0')}T10:${String(59 - k).padStart(2, '0')}:00Z`, null)));
    const { days, hidden } = limitDays(many.days, HISTORY_LIMIT);
    expect(days.flatMap(d => d.items)).toHaveLength(15);
    expect(hidden).toBe(3);
    const lim = limitDays(many.days, Infinity);
    expect(lim.hidden).toBe(0);
    expect(lim.days.flatMap(d => d.items)).toHaveLength(18);
  });
});

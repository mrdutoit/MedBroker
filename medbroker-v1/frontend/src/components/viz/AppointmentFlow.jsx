import OrbitPanel from './OrbitPanel.jsx';

/**
 * components/viz/AppointmentFlow.jsx — NEW, 28 Sep 2026 (app-design-pass,
 * Broker Detail; Mark: "should the Broker not get a similar report showing
 * Appointments?"). The broker's counterpart to the agent's CallFlow and
 * the page's signature panel: every appointment booked for this broker in
 * the period, and where each one stands now — signed, lost (and why),
 * returned to leads, or still open (and whether they've met yet).
 *
 * Drawn as an ORBIT since 28 Sep 2026 (Mark's pick from four canvas
 * options; OrbitPanel.jsx, shared with Agent Detail's CallFlow).
 *
 * DATA SEMANTICS (reportService.js, getBrokerDetailReport →
 * appointmentFlow): ONE cohort, one clock — appointments CREATED in the
 * period — each counted once by its CURRENT status, so the bands sum to
 * the Appointments figure. That makes "Signed" here "signed so far, of
 * this period's appointments": deliberately different from the Signed
 * figure in the strip below (deals CLOSED this period, whenever booked),
 * and labelled so on screen. "Met" = at least one meeting attempt held
 * (HeldInterested or HeldNotInterested). A lost appointment with no
 * recorded reason is "Not captured", hatched.
 */

const OPEN = new Set(['Unassigned', 'Assigned', 'Claimed', 'InProgress']);

export default function AppointmentFlow({ rows, lossLabels, isMobile }) {
  const sum = pred => (rows ?? []).filter(pred).reduce((t, r) => t + r.count, 0);
  const total = sum(() => true);
  const signed = sum(r => r.status === 'ClosedWon');
  const lostByReason = new Map();
  for (const r of (rows ?? []).filter(r => r.status === 'ClosedLost')) {
    const k = r.lostReason ?? 'Not captured';
    lostByReason.set(k, (lostByReason.get(k) ?? 0) + r.count);
  }
  const lostChildren = [...lostByReason.entries()]
    .map(([k, count]) => ({ key: k, label: lossLabels[k] ?? k, count, colour: 'var(--pl-lost)', hatched: k === 'Not captured' }))
    .sort((a, b) => (a.hatched !== b.hatched ? (a.hatched ? 1 : -1) : b.count - a.count));
  const openMet = sum(r => OPEN.has(r.status) && r.met);
  const openNotMet = sum(r => OPEN.has(r.status) && !r.met);
  const returned = sum(r => r.status === 'ReturnedToLeads');
  const open = openMet + openNotMet;

  return (
    <OrbitPanel
      eyebrow="Where this broker’s appointments stand"
      title={`${total.toLocaleString()} ${total === 1 ? 'appointment' : 'appointments'} this period`}
      subtitle={total > 0
        ? `Booked this period, and where each one stands today: ${signed} signed so far, ${open} still open.`
        : 'No appointments booked this period.'}
      total={total}
      unit="appointments"
      unitOne="appointment"
      isMobile={isMobile}
      branches={[
        { key: 'signed', label: 'Signed so far', colour: 'var(--pl-won)', count: signed },
        { key: 'open', label: 'Still open', colour: 'var(--hero-accent)', children: [
          { key: 'met', label: 'Met, still deciding', count: openMet, colour: 'var(--pl-booked)' },
          { key: 'notmet', label: 'Not met yet', count: openNotMet, colour: 'var(--pl-unassigned)', muted: true },
        ] },
        { key: 'lost', label: 'Lost', colour: 'var(--pl-lost)', children: lostChildren },
        { key: 'returned', label: 'Returned to leads', colour: 'var(--pl-unassigned)', count: returned },
      ]}
    />
  );
}

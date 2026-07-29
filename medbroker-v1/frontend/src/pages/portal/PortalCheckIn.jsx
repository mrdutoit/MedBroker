/**
 * pages/portal/PortalCheckIn.jsx — FIXED, 24 Jul 2026.
 * In-app camera scanner, reached from the dashboard's "Check in to an
 * event" link (protected route — only useful once already logged in).
 * Deliberately thin: decodes the scanned QR, extracts the checkinToken,
 * and hands off to /portal/checkin/:checkinToken — the SAME landing page
 * a phone camera app opening the QR's URL directly would reach — rather
 * than duplicating the confirm-attendance logic here too.
 *
 * FIX, same day: the hand-off after a successful scan used to be a React
 * Router client-side navigate() — Mark hit a real "browser stuck until I
 * manually refresh" bug from this. Root cause: a client-side transition
 * doesn't tear down the page's JS context, so html5-qrcode's camera
 * stream (which has known incomplete-teardown issues on some browsers,
 * iOS Safari especially) kept running underneath the confirmation page
 * — the check-in itself had actually already succeeded, the UI just
 * never repainted until a real reload forced full cleanup. Fixed by
 * using a genuine full-page navigation (window.location.href) instead:
 * the browser tears down the camera stream itself as part of unloading
 * the document, which is more reliable than depending on the library's
 * own stop() to fully release it. Also guards against calling stop()
 * twice (once on scan success, once again on unmount) — a known way to
 * put this library into a bad state — and caps how long it waits for a
 * graceful stop before moving on regardless, so a hang there can't block
 * the hand-off either.
 *
 * html5-qrcode rather than the native BarcodeDetector API — confirmed
 * earlier that BarcodeDetector isn't supported on iOS Safari/any iOS
 * browser, which rules it out given the prospect base is largely iPhones.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Html5Qrcode } from 'html5-qrcode';
import { s } from '../../styles/tokens.js';

const SCANNER_ELEMENT_ID = 'portal-qr-reader';
const STOP_TIMEOUT_MS = 800;

/**
 * The attendance QR encodes a full URL ({origin}/portal/checkin/:checkinToken)
 * — extract the token whether the scanned text is that full URL or,
 * defensively, just a bare token.
 */
function extractCheckinToken(scannedText) {
  try {
    const url = new URL(scannedText);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  } catch {
    return scannedText.trim();
  }
}

/**
 * Best-effort stop, capped at STOP_TIMEOUT_MS — if the camera doesn't
 * release promptly, move on anyway rather than let a hung promise block
 * the hand-off. The following full-page navigation is what actually
 * guarantees cleanup either way.
 */
function stopWithTimeout(scanner) {
  return Promise.race([
    scanner.stop().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, STOP_TIMEOUT_MS)),
  ]);
}

export default function PortalCheckIn() {
  const [status, setStatus] = useState('scanning'); // scanning | confirming | permission-denied
  const [message, setMessage] = useState('');
  const stoppedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);

    async function stopOnce() {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      await stopWithTimeout(scanner);
    }

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        if (stoppedRef.current) return; // already handling a scan — ignore any further hits
        setStatus('confirming');
        await stopOnce();
        const checkinToken = extractCheckinToken(decodedText);
        // Full page navigation, not React Router's navigate() — see file
        // header for why this is the actual fix, not just a workaround.
        window.location.href = `/portal/checkin/${checkinToken}`;
      },
      () => { /* per-frame "no QR found" — expected constantly while aiming, not an error */ }
    ).catch(() => {
      setMessage('Camera access was denied or is unavailable. Check your browser\'s camera permission for this site and try again.');
      setStatus('permission-denied');
    });

    return () => { stopOnce(); };
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <Link to="/portal/dashboard" style={{ ...s.backBtn, display: 'inline-block', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
          Check in
        </h1>

        {(status === 'scanning' || status === 'confirming') && (
          <>
            <div
              id={SCANNER_ELEMENT_ID}
              style={{ width: '100%', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}
            />
            <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center' }}>
              {status === 'confirming'
                ? 'Code found — confirming your attendance…'
                : 'Point your camera at the attendance QR code on display at the venue.'}
            </p>
          </>
        )}

        {status === 'permission-denied' && (
          <div style={s.errorBox}>{message}</div>
        )}
      </div>
    </div>
  );
}

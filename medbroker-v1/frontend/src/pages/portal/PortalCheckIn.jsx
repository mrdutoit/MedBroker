/**
 * pages/portal/PortalCheckIn.jsx — REWRITTEN, 24 Jul 2026.
 * In-app camera scanner, reached from the dashboard's "Check in to an
 * event" link (protected route — only useful once already logged in).
 * Deliberately thin: decodes the scanned QR, extracts the checkinToken,
 * and navigates to /portal/checkin/:checkinToken — the SAME landing page
 * a phone camera app opening the QR's URL directly would reach — rather
 * than duplicating the confirm-attendance logic here too.
 *
 * html5-qrcode rather than the native BarcodeDetector API — confirmed
 * earlier that BarcodeDetector isn't supported on iOS Safari/any iOS
 * browser, which rules it out given the prospect base is largely iPhones.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { s } from '../../styles/tokens.js';

const SCANNER_ELEMENT_ID = 'portal-qr-reader';

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

export default function PortalCheckIn() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('scanning'); // scanning | permission-denied
  const [message, setMessage] = useState('');
  const scannerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        if (cancelled) return;
        await scanner.stop().catch(() => {});
        const checkinToken = extractCheckinToken(decodedText);
        navigate(`/portal/checkin/${checkinToken}`);
      },
      () => { /* per-frame "no QR found" — expected constantly while aiming, not an error */ }
    ).catch(() => {
      if (cancelled) return;
      setMessage('Camera access was denied or is unavailable. Check your browser\'s camera permission for this site and try again.');
      setStatus('permission-denied');
    });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
    };
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <Link to="/portal/dashboard" style={{ ...s.backBtn, display: 'inline-block', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
          Check in
        </h1>

        {status === 'scanning' && (
          <>
            <div
              id={SCANNER_ELEMENT_ID}
              style={{ width: '100%', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}
            />
            <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center' }}>
              Point your camera at the attendance QR code on display at the venue.
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

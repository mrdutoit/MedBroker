/**
 * pages/portal/PortalCheckIn.jsx — NEW, 24 Jul 2026.
 * Self-service venue check-in — scans the SAME Event.qrToken already
 * rendered on EventDetail.jsx's staff QR modal (encoded as
 * {origin}/portal/register/:qrToken), extracts the token, and confirms
 * attendance. html5-qrcode rather than the native BarcodeDetector API —
 * confirmed earlier that BarcodeDetector isn't supported on iOS Safari/
 * any iOS browser, which rules it out given the prospect base is largely
 * on iPhones.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { portalApi } from '../../services/portalApi.js';
import { s } from '../../styles/tokens.js';

const SCANNER_ELEMENT_ID = 'portal-qr-reader';

/**
 * The QR encodes a full URL ({origin}/portal/register/:qrToken) — extract
 * the token whether the scanned text is that full URL or, defensively,
 * just a bare token (in case the QR content ever changes shape).
 */
function extractQrToken(scannedText) {
  try {
    const url = new URL(scannedText);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  } catch {
    return scannedText.trim();
  }
}

export default function PortalCheckIn() {
  const [status, setStatus] = useState('idle'); // idle | scanning | checking | success | already | error | permission-denied
  const [message, setMessage] = useState('');
  const scannerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;
    setStatus('scanning');

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 240 },
      async (decodedText) => {
        if (cancelled) return;
        // Stop scanning as soon as we get a hit — avoid double-fires while the check-in call is in flight.
        await scanner.stop().catch(() => {});
        setStatus('checking');
        try {
          const qrToken = extractQrToken(decodedText);
          const result = await portalApi.checkin(qrToken);
          if (cancelled) return;
          setStatus(result.alreadyCheckedIn ? 'already' : 'success');
        } catch (err) {
          if (cancelled) return;
          setMessage(err.message ?? 'Could not check you in.');
          setStatus('error');
        }
      },
      () => { /* per-frame "no QR found" — expected constantly while aiming, not an error */ }
    ).catch((err) => {
      if (cancelled) return;
      setMessage('Camera access was denied or is unavailable. Check your browser\'s camera permission for this site and try again.');
      setStatus('permission-denied');
    });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {});
    };
  }, []);

  function handleScanAgain() {
    setStatus('scanning');
    setMessage('');
    const scanner = scannerRef.current;
    if (scanner) {
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        async (decodedText) => {
          await scanner.stop().catch(() => {});
          setStatus('checking');
          try {
            const qrToken = extractQrToken(decodedText);
            const result = await portalApi.checkin(qrToken);
            setStatus(result.alreadyCheckedIn ? 'already' : 'success');
          } catch (err) {
            setMessage(err.message ?? 'Could not check you in.');
            setStatus('error');
          }
        },
        () => {}
      ).catch(() => {
        setMessage('Camera access was denied or is unavailable.');
        setStatus('permission-denied');
      });
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>
        <Link to="/portal/dashboard" style={{ ...s.backBtn, display: 'inline-block', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back
        </Link>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 16px' }}>
          Check in
        </h1>

        {(status === 'scanning' || status === 'checking') && (
          <>
            <div
              id={SCANNER_ELEMENT_ID}
              style={{ width: '100%', borderRadius: '10px', overflow: 'hidden', marginBottom: '12px' }}
            />
            <p style={{ fontSize: '0.8125rem', color: 'var(--mut)', textAlign: 'center' }}>
              {status === 'checking' ? 'Confirming your attendance…' : 'Point your camera at the event QR code on display at the venue.'}
            </p>
          </>
        )}

        {status === 'success' && (
          <div style={s.noticeSuccess}>You're checked in — enjoy the event!</div>
        )}
        {status === 'already' && (
          <div style={s.noticeSuccess}>You're already checked in for this event.</div>
        )}
        {status === 'error' && (
          <>
            <div style={{ ...s.errorBox, marginBottom: '12px' }}>{message}</div>
            <button onClick={handleScanAgain} style={s.primaryBtn}>Try again</button>
          </>
        )}
        {status === 'permission-denied' && (
          <div style={s.errorBox}>{message}</div>
        )}
      </div>
    </div>
  );
}

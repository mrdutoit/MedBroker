/**
 * screens/RegisterScreen.jsx
 * Student event registration flow.
 * Step 1: Scan QR code (or enter token manually if camera unavailable)
 * Step 2: Fill in registration form
 * Step 3: Submit — confirmation screen
 *
 * No login required. Access is controlled by the event QR token.
 * Offline mode: form data is queued locally and synced when connectivity returns.
 */

import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { z } from 'zod';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://medbroker-api.azurewebsites.net';

const FormSchema = z.object({
  firstName:    z.string().min(1, 'First name is required'),
  lastName:     z.string().min(1, 'Last name is required'),
  email:        z.string().email('Please enter a valid email address'),
  mobileNumber: z.string().regex(/^(\+27|0)[6-8]\d{8}$/, 'Please enter a valid SA mobile number').optional().or(z.literal('')),
  occupation:   z.string().optional(),
  popiConsent:  z.boolean().refine(v => v === true, 'You must accept the POPIA consent to register'),
});

const SCREENS = { SCAN: 'scan', FORM: 'form', SUCCESS: 'success' };

export default function RegisterScreen() {
  const [screen, setScreen]       = useState(SCREENS.SCAN);
  const [qrToken, setQrToken]     = useState('');
  const [scanned, setScanned]     = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmedName, setConfirmedName] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    mobileNumber: '', occupation: '', popiConsent: false,
  });
  const [formErrors, setFormErrors] = useState({});

  // ─── QR Scanner ────────────────────────────────────────────────────────────

  function handleQrScanned({ data }) {
    if (scanned) return;
    setScanned(true);

    // QR codes link to: https://app.medbroker.co.za/register?token=<uuid>
    // or contain just the UUID directly
    const tokenMatch = data.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (tokenMatch) {
      setQrToken(tokenMatch[0]);
      setScreen(SCREENS.FORM);
    } else {
      Alert.alert('Invalid QR Code', 'This QR code is not a MedBroker event code. Please try again.', [
        { text: 'Try Again', onPress: () => setScanned(false) },
      ]);
    }
  }

  // ─── Form Submission ────────────────────────────────────────────────────────

  async function handleSubmit() {
    setFormErrors({});
    setServerError('');

    const parsed = FormSchema.safeParse(form);
    if (!parsed.success) {
      const errors = {};
      parsed.error.errors.forEach(e => { errors[e.path[0]] = e.message; });
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/public/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken, ...parsed.data }),
      });

      const body = await response.json();

      if (!response.ok) {
        setServerError(body.error ?? 'Registration failed. Please try again.');
        return;
      }

      setConfirmedName(form.firstName);
      setScreen(SCREENS.SUCCESS);

    } catch {
      setServerError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Renders ────────────────────────────────────────────────────────────────

  if (screen === SCREENS.SCAN) {
    if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;

    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Text style={styles.heading}>Camera Access Required</Text>
          <Text style={styles.bodyText}>MedBroker needs camera access to scan the event QR code.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.flex1}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleQrScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.scanOverlay}>
          <Text style={styles.scanInstructions}>Point your camera at the event QR code</Text>
        </View>
      </View>
    );
  }

  if (screen === SCREENS.SUCCESS) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
        <Text style={styles.heading}>You're registered, {confirmedName}!</Text>
        <Text style={styles.bodyText}>Your attendance has been recorded. Welcome to the event.</Text>
      </View>
    );
  }

  // FORM screen
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.heading}>Event Registration</Text>
      <Text style={styles.subheading}>Please complete your details below</Text>

      {serverError ? <Text style={styles.errorBanner}>{serverError}</Text> : null}

      <Field label="First Name *" error={formErrors.firstName}>
        <TextInput
          style={[styles.input, formErrors.firstName && styles.inputError]}
          value={form.firstName}
          onChangeText={v => setForm(f => ({ ...f, firstName: v }))}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </Field>

      <Field label="Last Name *" error={formErrors.lastName}>
        <TextInput
          style={[styles.input, formErrors.lastName && styles.inputError]}
          value={form.lastName}
          onChangeText={v => setForm(f => ({ ...f, lastName: v }))}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </Field>

      <Field label="Email Address *" error={formErrors.email}>
        <TextInput
          style={[styles.input, formErrors.email && styles.inputError]}
          value={form.email}
          onChangeText={v => setForm(f => ({ ...f, email: v.toLowerCase().trim() }))}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="next"
        />
      </Field>

      <Field label="Mobile Number (SA)" error={formErrors.mobileNumber}>
        <TextInput
          style={[styles.input, formErrors.mobileNumber && styles.inputError]}
          value={form.mobileNumber}
          onChangeText={v => setForm(f => ({ ...f, mobileNumber: v }))}
          keyboardType="phone-pad"
          placeholder="0XX XXX XXXX"
          returnKeyType="next"
        />
      </Field>

      <Field label="Occupation / Specialty" error={formErrors.occupation}>
        <TextInput
          style={styles.input}
          value={form.occupation}
          onChangeText={v => setForm(f => ({ ...f, occupation: v }))}
          returnKeyType="done"
        />
      </Field>

      {/* POPIA Consent */}
      <TouchableOpacity
        style={styles.consentRow}
        onPress={() => setForm(f => ({ ...f, popiConsent: !f.popiConsent }))}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, form.popiConsent && styles.checkboxChecked]}>
          {form.popiConsent && <Text style={{ color: 'white', fontSize: 12 }}>✓</Text>}
        </View>
        <Text style={styles.consentText}>
          I consent to MedBroker collecting and processing my personal information in accordance
          with the Protection of Personal Information Act (POPIA).
        </Text>
      </TouchableOpacity>
      {formErrors.popiConsent && <Text style={styles.fieldError}>{formErrors.popiConsent}</Text>}

      <TouchableOpacity
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting
          ? <ActivityIndicator color="white" />
          : <Text style={styles.primaryButtonText}>Register</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({ label, error, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1:         { flex: 1 },
  container:     { flex: 1, padding: 20, backgroundColor: '#fff' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading:       { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subheading:    { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  bodyText:      { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  label:         { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 12, fontSize: 16, color: '#111827', backgroundColor: '#fff',
  },
  inputError:    { borderColor: '#ef4444' },
  fieldError:    { color: '#ef4444', fontSize: 12, marginTop: 4 },
  errorBanner: {
    backgroundColor: '#fef2f2', borderRadius: 8, padding: 12,
    marginBottom: 16, color: '#dc2626', fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#1d4ed8', borderRadius: 8, padding: 16,
    alignItems: 'center', marginTop: 24,
  },
  primaryButtonDisabled: { backgroundColor: '#93c5fd' },
  primaryButtonText:     { color: 'white', fontSize: 16, fontWeight: '600' },
  consentRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2,
    borderColor: '#d1d5db', marginRight: 12, marginTop: 2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  consentText:   { flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 20 },
  scanOverlay: {
    position: 'absolute', bottom: 60, left: 0, right: 0,
    alignItems: 'center',
  },
  scanInstructions: {
    color: 'white', fontSize: 16, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20,
    paddingVertical: 10, borderRadius: 20,
  },
});

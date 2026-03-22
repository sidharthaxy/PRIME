import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, ActivityIndicator, Alert } from 'react-native';
import ScanningAnimation from './ScanningAnimation';

// ── BLE UUIDs (must match ESP32 firmware exactly) ──────────────────
const SERVICE_UUID   = '12345678-1234-1234-1234-123456789abc';
const WIFI_CRED_UUID = '12345678-1234-1234-1234-123456789001'; // WRITE
const STATUS_UUID    = '12345678-1234-1234-1234-123456789002'; // NOTIFY

// ── Pairing steps ──────────────────────────────────────────────────
type Step = 'idle' | 'scanning' | 'wifi_form' | 'provisioning' | 'pairing' | 'done' | 'error';

interface PairingSession {
  deviceId: string;
  token: string;
  name: string;
}

interface Props {
  /** Called when pairing completes — hand off deviceId + token to your Firebase callable */
  onPairingRequest?: (session: PairingSession) => Promise<void>;
  incomingPairingSession?: PairingSession | null;
}

export default function WebScanner({ onPairingRequest, incomingPairingSession: pairingSession }: Props) {
  const [step, setStep]           = useState<Step>('idle');
  const [deviceName, setDeviceName] = useState('');
  const [statusMsg, setStatusMsg] = useState('Not connected');
  const [ssid, setSsid]           = useState('');
  const [wifiPass, setWifiPass]   = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');

  // Keep refs to BLE objects so we can clean up and reuse the connection
  const bleDeviceRef    = useRef<any>(null);
  const statusCharRef   = useRef<any>(null);
  const serviceRef      = useRef<any>(null); // Added this to keep the service alive

  // ── Safety: web only ──────────────────────────────────────────────
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Use the Mobile Scanner on iOS/Android.</Text>
      </View>
    );
  }

  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  const bluetoothSupported = nav && nav.bluetooth;

  // ── Helpers ───────────────────────────────────────────────────────
  const setError = (msg: string) => {
    setErrorMsg(msg);
    setStep('error');
  };

  const reset = () => {
    if (bleDeviceRef.current?.gatt?.connected) {
      bleDeviceRef.current.gatt.disconnect();
    }
    bleDeviceRef.current  = null;
    statusCharRef.current = null;
    serviceRef.current    = null; // Reset the service ref
    setStep('idle');
    setDeviceName('');
    setStatusMsg('Not connected');
    setSsid('');
    setWifiPass('');
    setErrorMsg('');
    setDeviceLabel('');
  };

  // ── Step 1: Scan & Connect ────────────────────────────────────────
  const scanAndConnect = async () => {
    if (!bluetoothSupported) {
      setError('Web Bluetooth not supported. Use Chrome or Edge on desktop/Android.');
      return;
    }

    try {
      setStep('scanning');
      setStatusMsg('Scanning for PRIME devices...');

      const device = await nav.bluetooth.requestDevice({
        filters: [{ namePrefix: 'PRIME-Setup' }],
        optionalServices: [SERVICE_UUID],
      });

      bleDeviceRef.current = device;
      setDeviceName(device.name || 'PRIME Device');
      setStatusMsg('Connecting to device...');

      device.addEventListener('gattserverdisconnected', () => {
        setStatusMsg('Disconnected');
        if (step !== 'done') setError('Device disconnected unexpectedly. Please try again.');
      });

      const server  = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      
      // Save the service so we don't have to reconnect the GATT server later
      serviceRef.current = service;

      // Subscribe to STATUS notifications
      const statusChar = await service.getCharacteristic(STATUS_UUID);
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', onStatusNotify);
      statusCharRef.current = statusChar;

      setStatusMsg('Connected! Enter your WiFi details.');
      setStep('wifi_form');

    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        setStep('idle'); // user cancelled — not an error
      } else {
        setError(`Scan failed: ${err?.message ?? String(err)}`);
      }
    }
  };

  // ── Step 2: Handle STATUS notifications from ESP32 ────────────────
  const onStatusNotify = (event: any) => {
    const value   = event.target.value as DataView;
    const decoder = new TextDecoder();
    const msg     = decoder.decode(value);
    setStatusMsg(msg);

    if (msg === 'WIFI_OK') {
      setStatusMsg('WiFi connected! Waiting for pairing...');
      setStep('pairing');
    }

    if (msg === 'WIFI_FAIL') {
      setStatusMsg('WiFi failed. Check credentials and try again.');
      setStep('wifi_form'); // let user retry
    }

    if (msg === 'WIFI_CONNECTING') {
      setStatusMsg('ESP32 is connecting to WiFi...');
    }
  };

  // ── Step 3: Send WiFi credentials over BLE ────────────────────────
  const sendWifiCredentials = async () => {
    if (!ssid.trim()) {
      Alert.alert('Missing SSID', 'Please enter your WiFi network name.');
      return;
    }

    try {
      setStep('provisioning');
      setStatusMsg('Sending WiFi credentials to device...');

      // Reuse the active service connection instead of reconnecting
      if (!serviceRef.current) {
         throw new Error("Lost connection to the device's BLE service.");
      }

      const wifiChar = await serviceRef.current.getCharacteristic(WIFI_CRED_UUID);
      const payload  = JSON.stringify({ ssid: ssid.trim(), password: wifiPass });
      const encoder  = new TextEncoder();
      
      await wifiChar.writeValue(encoder.encode(payload));

      setStatusMsg('Credentials sent! Waiting for ESP32 to connect...');

    } catch (err: any) {
      setError(`Failed to send credentials: ${err?.message ?? String(err)}`);
    }
  };

  // ── Step 4: Confirm pairing (called by parent passing session) ────
  const confirmPairing = async () => {
    if (!pairingSession || !onPairingRequest) return;
    try {
      setStatusMsg('Confirming pairing...');
      await onPairingRequest({ ...pairingSession, name: deviceLabel || pairingSession.name });
      setStep('done');
      setStatusMsg('Device paired successfully!');
    } catch (err: any) {
      setError(`Pairing failed: ${err?.message ?? String(err)}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ PRIME Device Setup</Text>

      {/* Hide Progress and Status boxes if we are in an error state or completely done */}
      {step !== 'error' && step !== 'done' && (
          <>
            <View style={styles.progressBar}>
              {(['scanning', 'wifi_form', 'provisioning', 'pairing', 'done'] as Step[]).map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.progressDot,
                    (step === s || getStepIndex(step) > i) && styles.progressDotActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.statusBox}>
              {deviceName ? (
                <Text style={styles.label}>Device: <Text style={styles.value}>{deviceName}</Text></Text>
              ) : null}
              <Text style={styles.label}>Status: <Text style={styles.value}>{statusMsg}</Text></Text>
            </View>
          </>
      )}

      {/* ── IDLE ── */}
      {step === 'idle' && (
        <>
          {!bluetoothSupported && (
            <Text style={styles.warningText}>
              ⚠️ Web Bluetooth requires Chrome or Edge on desktop or Android.
            </Text>
          )}
          <Text style={styles.hint}>
            Make sure your ESP32 is powered on and in setup mode (no WiFi saved).
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, !bluetoothSupported && styles.disabledButton]}
            onPress={scanAndConnect}
            disabled={!bluetoothSupported}
          >
            <Text style={styles.primaryButtonText}>🔍 Scan for PRIME Device</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── SCANNING ── */}
      {step === 'scanning' && (
        <ScanningAnimation />
      )}

      {/* ── WIFI FORM ── */}
      {step === 'wifi_form' && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Enter your WiFi details</Text>
          <Text style={styles.formHint}>The ESP32 will use these to connect to the internet.</Text>
          <TextInput
            style={styles.input}
            placeholder="WiFi Network Name (SSID)"
            value={ssid}
            onChangeText={setSsid}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="WiFi Password"
            value={wifiPass}
            onChangeText={setWifiPass}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={sendWifiCredentials}>
            <Text style={styles.primaryButtonText}>Send to Device</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── PROVISIONING ── */}
      {step === 'provisioning' && (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.hint}>Waiting for ESP32 to connect to WiFi...</Text>
        </View>
      )}

      {/* ── PAIRING ── */}
      {step === 'pairing' && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Confirm Pairing</Text>
          {pairingSession ? (
            <>
              <View style={styles.tokenBox}>
                <Text style={styles.tokenLabel}>Check this token on your device LCD:</Text>
                <Text style={styles.token}>{pairingSession.token}</Text>
              </View>
              <Text style={styles.formHint}>Give your device a name:</Text>
              <TextInput
                style={styles.input}
                placeholder={pairingSession.name || 'e.g. Living Room'}
                value={deviceLabel}
                onChangeText={setDeviceLabel}
              />
              <TouchableOpacity style={styles.primaryButton} onPress={confirmPairing}>
                <Text style={styles.primaryButtonText}>✓ Confirm & Pair</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color="#007AFF" />
              <Text style={styles.hint}>Waiting for device to appear...</Text>
              <Text style={styles.formHint}>
                Press the PAIR button on your ESP32 to broadcast its pairing token.
              </Text>
            </>
          )}
        </View>
      )}

      {/* ── DONE ── */}
      {step === 'done' && (
        <View style={styles.centeredContent}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>
            {deviceLabel || pairingSession?.name || 'Device'} paired successfully!
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={reset}>
            <Text style={styles.primaryButtonText}>Pair Another Device</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ERROR ── */}
      {step === 'error' && (
        <View style={styles.centeredContent}>
          <Text style={styles.errorIcon}>❌</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={reset}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function getStepIndex(step: Step): number {
  const order: Step[] = ['idle', 'scanning', 'wifi_form', 'provisioning', 'pairing', 'done'];
  return order.indexOf(step);
}

// ... styles remain exactly the same ...
const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#ffffff', borderRadius: 16, alignItems: 'center', margin: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1c1c1e' },
  progressBar: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d1d6' },
  progressDotActive: { backgroundColor: '#007AFF' },
  statusBox: { backgroundColor: '#f2f2f7', padding: 16, borderRadius: 8, width: '100%', marginBottom: 20 },
  label: { fontSize: 14, color: '#6c6c70', fontWeight: '600', marginBottom: 4 },
  value: { color: '#1c1c1e', fontWeight: '400' },
  hint: { fontSize: 13, color: '#6c6c70', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  warningText: { fontSize: 13, color: '#ff9500', textAlign: 'center', marginBottom: 12 },
  form: { width: '100%', gap: 12 },
  formTitle: { fontSize: 17, fontWeight: '600', color: '#1c1c1e', marginBottom: 4 },
  formHint: { fontSize: 13, color: '#6c6c70', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d1d6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f9f9f9', width: '100%' },
  tokenBox: { backgroundColor: '#e8f4fd', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 },
  tokenLabel: { fontSize: 13, color: '#3a7bd5', marginBottom: 8 },
  token: { fontSize: 36, fontWeight: 'bold', color: '#007AFF', letterSpacing: 8 },
  centeredContent: { alignItems: 'center', gap: 12, width: '100%' },
  successIcon: { fontSize: 48 },
  successText: { fontSize: 17, fontWeight: '600', color: '#34c759', textAlign: 'center' },
  errorIcon: { fontSize: 48 },
  errorText: { fontSize: 14, color: '#ff3b30', textAlign: 'center' },
  primaryButton: { backgroundColor: '#007AFF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, width: '100%', alignItems: 'center' },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  disabledButton: { backgroundColor: '#aeaeb2' },
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { color: '#007AFF', fontSize: 15 },
});
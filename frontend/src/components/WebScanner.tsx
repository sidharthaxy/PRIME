import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, TextInput, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import ScanningAnimation from './ScanningAnimation';
import { rtdb } from '../config/firebase';
import { ref, get } from 'firebase/database';
// ── BLE UUIDs (must match ESP32 firmware exactly) ──────────────────
const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const WIFI_CRED_UUID = '12345678-1234-1234-1234-123456789001'; // WRITE
const STATUS_UUID = '12345678-1234-1234-1234-123456789002'; // READ/NOTIFY
const DEVICE_ID_UUID = '12345678-1234-1234-1234-123456789003'; // READ — WiFi MAC = deviceId

// ── Pairing steps ──────────────────────────────────────────────────
// Token verification removed. New flow:
//   idle → scanning → wifi_form → provisioning → done
type Step = 'idle' | 'scanning' | 'wifi_form' | 'provisioning' | 'done' | 'error';

interface Props {
  /** Called when WiFi provisioning succeeds; parent shows the DeviceConfigModal */
  onProvisioningComplete?: (deviceId: string) => void;
}

export default function WebScanner({ onProvisioningComplete }: Props) {
  const [step, setStep] = useState<Step>('idle');
  const [deviceName, setDeviceName] = useState('');
  const [statusMsg, setStatusMsg] = useState('Not connected');
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Keep refs to BLE objects so we can clean up and reuse the connection
  const bleDeviceRef = useRef<any>(null);
  const serviceRef = useRef<any>(null);
  const pairedDeviceIdRef = useRef<string>('');

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
    bleDeviceRef.current = null;
    serviceRef.current = null;
    pairedDeviceIdRef.current = '';
    setStep('idle');
    setDeviceName('');
    setStatusMsg('Not connected');
    setSsid('');
    setWifiPass('');
    setErrorMsg('');
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
        if (step !== 'done' && step !== 'provisioning') {
          setError('Device disconnected unexpectedly. Please try again.');
        }
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      serviceRef.current = service;

      // Read the deviceId from the READ characteristic (WiFi MAC address)
      setStatusMsg('Reading device ID...');
      const idChar = await service.getCharacteristic(DEVICE_ID_UUID);
      const idValue = await idChar.readValue();
      const decoder = new TextDecoder();
      const deviceId = decoder.decode(idValue);
      pairedDeviceIdRef.current = deviceId;

      setStatusMsg(`Connected! Device ID: ${deviceId}`);
      setStep('wifi_form');

    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        setStep('idle'); // user cancelled — not an error
      } else {
        setError(`Scan failed: ${err?.message ?? String(err)}`);
      }
    }
  };

  // ── Step 2: Send WiFi credentials over BLE ────────────────────────
  const sendWifiCredentials = async () => {
    if (!ssid.trim()) {
      Alert.alert('Missing SSID', 'Please enter your WiFi network name.');
      return;
    }

    try {
      setStep('provisioning');
      setStatusMsg('Sending WiFi credentials to device...');

      if (!serviceRef.current) {
        throw new Error("Lost connection to the device's BLE service.");
      }

      const wifiChar = await serviceRef.current.getCharacteristic(WIFI_CRED_UUID);
      const statusChar = await serviceRef.current.getCharacteristic(STATUS_UUID);

      const payload = JSON.stringify({ ssid: ssid.trim(), password: wifiPass });
      const encoder = new TextEncoder();

      console.log(`Writing BLE Payload: ${payload}`);
      const bytes = encoder.encode(payload);

      // Manually fragment into 18-byte chunks to bypass strict browser MTU drops completely!
      for (let i = 0; i < bytes.length; i += 18) {
        console.log(`Sending chunk ${i/18}...`);
        const chunk = bytes.slice(i, i + 18);
        if (typeof wifiChar.writeValueWithoutResponse === 'function') {
          await wifiChar.writeValueWithoutResponse(chunk);
        } else if (typeof wifiChar.writeValueWithResponse === 'function') {
          await wifiChar.writeValueWithResponse(chunk);
        } else {
          await wifiChar.writeValue(chunk);
        }
        // Tiny wait to ensure the ESP32 buffers and ACKs each chunk properly over the air
        await new Promise(r => setTimeout(r, 60));
      }

      setStatusMsg('Verifying connection (this takes up to 25s)...');

      const startTime = Date.now();
      let finalStatus = '';

      while (Date.now() - startTime < 25000) {
        try {
          const val = await statusChar.readValue();
          const decoder = new TextDecoder();
          const strVal = decoder.decode(val);
          if (strVal === 'OK' || strVal === 'FAIL') {
            finalStatus = strVal;
            break;
          }
        } catch (e) {
          // ignore transient GATT disconnect errors while ESP32 switches radio context
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (finalStatus === 'FAIL') {
        Alert.alert(
          "Pairing Failed",
          "The ESP32 could not connect to WiFi. Please check the SSID and password and ensure it is a 2.4GHz network."
        );
        setStep('wifi_form');
        setStatusMsg('Connected! Device ID: ' + pairedDeviceIdRef.current);
        return;
      }

      if (!bleDeviceRef.current?.gatt?.connected) {
        throw new Error("GATT Server disconnected. The device may have restarted. Please close this window and scan again.");
      }

      if (finalStatus === '') {
        setStatusMsg('WiFi verification complete. Waiting for Cloud connection...');
      }

      // Disconnect BLE on success so it doesn't interfere
      if (bleDeviceRef.current?.gatt?.connected) {
        bleDeviceRef.current.gatt.disconnect();
      }

      setStatusMsg('WiFi Connected! Waiting for device to appear on the Cloud...');
      let cloudOnline = false;
      const cloudStartTime = Date.now();
      
      while (Date.now() - cloudStartTime < 20000) {
        try {
          const snap = await get(ref(rtdb, `devices/${pairedDeviceIdRef.current}/live`));
          if (snap.exists()) {
            cloudOnline = true;
            break;
          }
        } catch (e) { } // Ignore read errors, wait for next cycle
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!cloudOnline) {
        Alert.alert(
          "Cloud Connection Failed", 
          "The device successfully connected to your WiFi, but it could not reach the Cloud. Please factory reset the device (hold Pin 19 to GND for 3s) and try again, ensuring your network has internet access."
        );
        setStep('idle');
        return;
      }

      setStatusMsg('Credentials verified! Device is actively communicating with the Cloud.');
      setStep('done');

      // Notify parent to show DeviceConfigModal
      if (pairedDeviceIdRef.current && onProvisioningComplete) {
        onProvisioningComplete(pairedDeviceIdRef.current);
      }

    } catch (err: any) {
      setError(`Failed to send credentials: ${err?.message ?? String(err)}`);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <Text style={styles.title}>⚡ PRIME Device Setup</Text>

      {step !== 'error' && step !== 'done' && (
        <>
          <View style={styles.progressBar}>
            {(['scanning', 'wifi_form', 'provisioning', 'done'] as Step[]).map((s, i) => (
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
            {pairedDeviceIdRef.current ? (
              <Text style={styles.label}>ID: <Text style={[styles.value, styles.idText]}>{pairedDeviceIdRef.current}</Text></Text>
            ) : null}
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
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="WiFi Password"
              value={wifiPass}
              onChangeText={setWifiPass}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
              <FontAwesome5 name={showPassword ? "eye-slash" : "eye"} size={18} color="#6c6c70" />
            </TouchableOpacity>
          </View>
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

      {/* ── DONE ── */}
      {step === 'done' && (
        <View style={styles.centeredContent}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>WiFi credentials sent!</Text>
          <Text style={styles.hint}>A setup form will appear to complete pairing.</Text>
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
    </ScrollView>
  );
}

function getStepIndex(step: Step): number {
  const order: Step[] = ['idle', 'scanning', 'wifi_form', 'provisioning', 'done'];
  return order.indexOf(step);
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: '#ffffff', borderRadius: 16, alignItems: 'center', margin: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1c1c1e' },
  progressBar: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d1d6' },
  progressDotActive: { backgroundColor: '#007AFF' },
  statusBox: { backgroundColor: '#f2f2f7', padding: 16, borderRadius: 8, width: '100%', marginBottom: 20 },
  label: { fontSize: 14, color: '#6c6c70', fontWeight: '600', marginBottom: 4 },
  value: { color: '#1c1c1e', fontWeight: '400' },
  idText: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12 },
  hint: { fontSize: 13, color: '#6c6c70', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  warningText: { fontSize: 13, color: '#ff9500', textAlign: 'center', marginBottom: 12 },
  form: { width: '100%', gap: 12 },
  formTitle: { fontSize: 17, fontWeight: '600', color: '#1c1c1e', marginBottom: 4 },
  formHint: { fontSize: 13, color: '#6c6c70', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d1d6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f9f9f9', width: '100%' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d1d6', borderRadius: 10, backgroundColor: '#f9f9f9', width: '100%' },
  passwordInput: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15 },
  eyeButton: { padding: 12 },
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
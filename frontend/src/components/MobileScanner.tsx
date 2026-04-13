import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, PermissionsAndroid, Platform, TextInput, Alert } from 'react-native';
import { BleManager, Device, Subscription } from 'react-native-ble-plx';
import ScanningAnimation from './ScanningAnimation';

// ── Web Safety Initialization ─────────────────────────────────────────
let bleManager: BleManager | null = null;
if (Platform.OS !== 'web') {
    bleManager = new BleManager();
}

// ── BLE UUIDs (must match ESP32 firmware exactly) ──────────────────
const SERVICE_UUID   = '12345678-1234-1234-1234-123456789abc';
const WIFI_CRED_UUID = '12345678-1234-1234-1234-123456789001'; // WRITE
const STATUS_UUID    = '12345678-1234-1234-1234-123456789002'; // NOTIFY (reserved, not in firmware yet)
const DEVICE_ID_UUID = '12345678-1234-1234-1234-123456789003'; // READ  — WiFi MAC = deviceId

// ── Pairing steps ──────────────────────────────────────────────────
// Token verification is removed. New flow:
//   idle → scanning → connecting → wifi_form → provisioning → done
type Step = 'idle' | 'scanning' | 'connecting' | 'wifi_form' | 'provisioning' | 'done' | 'error';

interface Props {
  /** Called when WiFi provisioning succeeds; parent shows the DeviceConfigModal */
  onProvisioningComplete?: (deviceId: string) => void;
}

export default function MobileScanner({ onProvisioningComplete }: Props) {
    const [step, setStep]           = useState<Step>('idle');
    const [statusMsg, setStatusMsg] = useState('Not connected');
    const [devices, setDevices]     = useState<{ id: string, name: string | null }[]>([]);
    const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
    
    const [ssid, setSsid]           = useState('');
    const [wifiPass, setWifiPass]   = useState('');
    const [errorMsg, setErrorMsg]   = useState('');

    // Internal state: the deviceId read from the ESP32 BLE READ characteristic
    const pairedDeviceIdRef = useRef<string>('');

    // Refs for cleanup
    const monitorSubRef    = useRef<Subscription | null>(null);
    const disconnectSubRef = useRef<Subscription | null>(null);

    useEffect(() => {
        return () => {
            bleManager?.stopDeviceScan();
            monitorSubRef.current?.remove();
            disconnectSubRef.current?.remove();
        };
    }, []);

    const setError = (msg: string) => {
        setErrorMsg(msg);
        setStep('error');
    };

    const reset = async () => {
        if (connectedDevice && bleManager) {
            try {
                await bleManager.cancelDeviceConnection(connectedDevice.id);
            } catch (e) {}
        }
        monitorSubRef.current?.remove();
        disconnectSubRef.current?.remove();
        
        setStep('idle');
        setConnectedDevice(null);
        setDevices([]);
        setStatusMsg('Not connected');
        setSsid('');
        setWifiPass('');
        setErrorMsg('');
        pairedDeviceIdRef.current = '';
    };

    const requestPermissions = async () => {
        if (Platform.OS === 'android') {
            const apiLevel = parseInt(Platform.Version.toString(), 10);
            if (apiLevel < 31) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } else {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);
                return (
                    granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
                );
            }
        }
        return true; 
    };

    // ── Step 1: Scan for PRIME Devices ─────────────────────────────────────
    const startScan = async () => {
        if (!bleManager) {
            alert("Native Bluetooth is not supported on the web.");
            return;
        }

        const permissionGranted = await requestPermissions();
        if (!permissionGranted) {
            alert('Bluetooth permissions denied');
            return;
        }

        setStep('scanning');
        setStatusMsg('Scanning for nearby PRIME devices...');
        setDevices([]);

        bleManager.startDeviceScan(null, null, (error, scannedDevice) => {
            if (error) {
                console.warn(error);
                return;
            }
            if (scannedDevice && scannedDevice.name) {
                setDevices((prevDevices) => {
                    if (!prevDevices.find((d) => d.id === scannedDevice.id)) {
                        return [...prevDevices, { id: scannedDevice.id, name: scannedDevice.name }];
                    }
                    return prevDevices;
                });
            }
        });

        setTimeout(() => {
            if (bleManager) {
                bleManager.stopDeviceScan();
                if (step === 'scanning') setStatusMsg('Scan complete. Select a device.');
            }
        }, 10000);
    };

    // ── Step 2: Connect & Read deviceId ────────────────────────────────────
    const connectToDevice = async (device: { id: string, name: string | null }) => {
        if (!bleManager) return;
        bleManager.stopDeviceScan();
        setStep('connecting');
        setStatusMsg(`Connecting to ${device.name || 'Device'}...`);

        try {
            const connected = await bleManager.connectToDevice(device.id);
            setConnectedDevice(connected);
            
            setStatusMsg('Discovering services...');
            await connected.discoverAllServicesAndCharacteristics();

            // Read the deviceId from the READ characteristic (WiFi MAC address)
            setStatusMsg('Reading device ID...');
            const idCharacteristic = await bleManager.readCharacteristicForDevice(
                device.id,
                SERVICE_UUID,
                DEVICE_ID_UUID,
            );
            if (idCharacteristic?.value) {
                const deviceId = decodeB64(idCharacteristic.value);
                pairedDeviceIdRef.current = deviceId;
                setStatusMsg(`Connected! Device ID: ${deviceId}`);
            } else {
                setStatusMsg('Connected! Enter your WiFi details.');
            }

            // Listen for unexpected disconnects
            disconnectSubRef.current = bleManager.onDeviceDisconnected(device.id, () => {
                setStatusMsg('Disconnected');
                if (step !== 'done' && step !== 'provisioning') {
                    setError('Device disconnected unexpectedly.');
                }
            });

            setStep('wifi_form');

        } catch (error: any) {
            setError(`Failed to connect: ${error?.message || String(error)}`);
        }
    };

    // ── Step 3: Send WiFi Credentials ──────────────────────────────────────
    const sendWifiCredentials = async () => {
        if (!ssid.trim() || !connectedDevice || !bleManager) {
            Alert.alert('Missing Info', 'Please enter your WiFi network name.');
            return;
        }

        try {
            setStep('provisioning');
            setStatusMsg('Sending WiFi credentials to device...');

            const payload   = JSON.stringify({ ssid: ssid.trim(), password: wifiPass });
            const b64Payload = encodeB64(payload);

            await bleManager.writeCharacteristicWithResponseForDevice(
                connectedDevice.id,
                SERVICE_UUID,
                WIFI_CRED_UUID,
                b64Payload
            );

            // Disconnect BLE — device will now connect to WiFi + MQTT
            try { await bleManager.cancelDeviceConnection(connectedDevice.id); } catch (_) {}

            setStatusMsg('Credentials sent! Device is connecting to WiFi...');
            setStep('done');

            // Notify parent so it can show the DeviceConfigModal
            if (pairedDeviceIdRef.current && onProvisioningComplete) {
                onProvisioningComplete(pairedDeviceIdRef.current);
            }

        } catch (err: any) {
            setError(`Failed to send credentials: ${err?.message || String(err)}`);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>⚡ PRIME Device Setup</Text>

            {step !== 'error' && step !== 'done' && (
                <>
                    <View style={styles.progressBar}>
                        {(['scanning', 'connecting', 'wifi_form', 'provisioning', 'done'] as Step[]).map((s, i) => (
                            <View key={s} style={[styles.progressDot, (step === s || getStepIndex(step) > i) && styles.progressDotActive]} />
                        ))}
                    </View>

                    <View style={styles.statusBox}>
                        {connectedDevice ? (
                            <Text style={styles.label}>Device: <Text style={styles.value}>{connectedDevice.name}</Text></Text>
                        ) : null}
                        <Text style={styles.label}>Status: <Text style={styles.value}>{statusMsg}</Text></Text>
                        {pairedDeviceIdRef.current ? (
                            <Text style={styles.label}>ID: <Text style={[styles.value, styles.idText]}>{pairedDeviceIdRef.current}</Text></Text>
                        ) : null}
                    </View>
                </>
            )}

            {step === 'idle' && (
                <>
                    <Text style={styles.hint}>Make sure your ESP32 is powered on and in setup mode (blue LED).</Text>
                    <TouchableOpacity style={styles.primaryButton} onPress={startScan}>
                        <Text style={styles.primaryButtonText}>🔍 Scan for PRIME Device</Text>
                    </TouchableOpacity>
                </>
            )}

            {step === 'scanning' && (
                <>
                    <ScanningAnimation />
                    <FlatList
                        data={devices}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.deviceItem} onPress={() => connectToDevice(item)}>
                                <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
                                <Text style={styles.deviceId}>{item.id}</Text>
                            </TouchableOpacity>
                        )}
                        style={styles.list}
                        ListEmptyComponent={<Text style={styles.emptyText}>Searching...</Text>}
                    />
                    <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </>
            )}

            {step === 'connecting' && (
                 <View style={styles.centeredContent}>
                    <ActivityIndicator size="large" color="#007AFF" />
                 </View>
            )}

            {step === 'wifi_form' && (
                <View style={styles.form}>
                    <Text style={styles.formTitle}>Enter your WiFi details</Text>
                    <Text style={styles.formHint}>The ESP32 will use these to connect to the internet.</Text>
                    <TextInput style={styles.input} placeholder="WiFi Network Name (SSID)" value={ssid} onChangeText={setSsid} autoCapitalize="none" autoCorrect={false} />
                    <TextInput style={styles.input} placeholder="WiFi Password" value={wifiPass} onChangeText={setWifiPass} secureTextEntry autoCapitalize="none" autoCorrect={false} />
                    <TouchableOpacity style={styles.primaryButton} onPress={sendWifiCredentials}>
                        <Text style={styles.primaryButtonText}>Send to Device</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}

            {step === 'provisioning' && (
                <View style={styles.centeredContent}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.hint}>Sending WiFi credentials to device...</Text>
                </View>
            )}

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
    const order: Step[] = ['idle', 'scanning', 'connecting', 'wifi_form', 'provisioning', 'done'];
    return order.indexOf(step);
}

// ── Native Base64 Helpers for ble-plx ────────────────────────────────
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const encodeB64 = (input: string = '') => {
    let str = input;
    let output = '';
    for (let block = 0, charCode, i = 0, map = chars;
    str.charAt(i | 0) || (map = '=', i % 1);
    output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
        charCode = str.charCodeAt(i += 3/4);
        block = block << 8 | charCode;
    }
    return output;
};
const decodeB64 = (input: string = '') => {
    let str = input.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, buffer, i = 0;
        buffer = str.charAt(i++);
        ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer,
        bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
    ) {
        buffer = chars.indexOf(buffer);
    }
    return output;
};

// ── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, backgroundColor: '#ffffff', borderRadius: 16, alignItems: 'center', margin: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 5 },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1c1c1e' },
    progressBar: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    progressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#d1d1d6' },
    progressDotActive: { backgroundColor: '#007AFF' },
    statusBox: { backgroundColor: '#f2f2f7', padding: 16, borderRadius: 8, width: '100%', marginBottom: 20 },
    label: { fontSize: 14, color: '#6c6c70', fontWeight: '600', marginBottom: 4 },
    value: { color: '#1c1c1e', fontWeight: '400' },
    idText: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 12 },
    hint: { fontSize: 13, color: '#6c6c70', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    form: { width: '100%', gap: 12 },
    formTitle: { fontSize: 17, fontWeight: '600', color: '#1c1c1e', marginBottom: 4 },
    formHint: { fontSize: 13, color: '#6c6c70', marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#d1d1d6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, backgroundColor: '#f9f9f9', width: '100%' },
    centeredContent: { alignItems: 'center', gap: 12, width: '100%' },
    successIcon: { fontSize: 48 },
    successText: { fontSize: 17, fontWeight: '600', color: '#34c759', textAlign: 'center' },
    errorIcon: { fontSize: 48 },
    errorText: { fontSize: 14, color: '#ff3b30', textAlign: 'center' },
    primaryButton: { backgroundColor: '#007AFF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, width: '100%', alignItems: 'center' },
    primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
    secondaryButton: { paddingVertical: 12, alignItems: 'center' },
    secondaryButtonText: { color: '#007AFF', fontSize: 15 },
    list: { flex: 1, width: '100%' },
    deviceItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', width: '100%' },
    deviceName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    deviceId: { fontSize: 12, color: '#666', marginTop: 4 },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 20 }
});
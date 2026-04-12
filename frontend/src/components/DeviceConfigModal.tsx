import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { callPairDevice, callUpdateDeviceConfig, callSetDevicePin } from '../config/firebase';

interface Props {
  /** The deviceId read from the ESP32 BLE characteristic */
  deviceId: string | null;
  /** If provided, we are editing an existing device (not pairing) */
  existingConfig?: { name: string; tripWatts: number; safeWatts: number };
  /** Called after successful pair/update */
  onSuccess: (config: { name: string; tripWatts: number; safeWatts: number }) => void;
  /** Called when the user dismisses without saving */
  onDismiss: () => void;
  visible: boolean;
}

/** Floating modal shown right after BLE pairing (or when editing device config).
 *  Collects device name, trip threshold and safe threshold from the user.
 */
export default function DeviceConfigModal({
  deviceId,
  existingConfig,
  onSuccess,
  onDismiss,
  visible,
}: Props) {
  const [name,      setName]      = useState(existingConfig?.name      ?? '');
  const [tripWatts, setTripWatts] = useState(String(existingConfig?.tripWatts ?? 2000));
  const [safeWatts, setSafeWatts] = useState(String(existingConfig?.safeWatts ?? 1800));
  const [pin,       setPin]       = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setName(existingConfig?.name ?? '');
      setTripWatts(String(existingConfig?.tripWatts ?? 2000));
      setSafeWatts(String(existingConfig?.safeWatts ?? 1800));
      setPin('');
      setPinConfirm('');
      setError('');
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1,    useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1,    duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const validate = (): boolean => {
    if (!name.trim()) {
      setError('Please give your device a name.');
      return false;
    }
    const trip = parseInt(tripWatts, 10);
    const safe = parseInt(safeWatts, 10);
    if (isNaN(trip) || trip < 100) {
      setError('Trip wattage must be a number ≥ 100W.');
      return false;
    }
    if (isNaN(safe) || safe < 50) {
      setError('Safe threshold must be a number ≥ 50W.');
      return false;
    }
    if (safe >= trip) {
      setError('Safe threshold must be less than the trip wattage.');
      return false;
    }
    // PIN validation (only for new pairing, and only if user entered something)
    if (!existingConfig && pin) {
      if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        setError('PIN must be 4–8 digits (numbers only).');
        return false;
      }
      if (pin !== pinConfirm) {
        setError('PINs do not match.');
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setError('');

    const trip = parseInt(tripWatts, 10);
    const safe = parseInt(safeWatts, 10);

    try {
      if (existingConfig) {
        // Editing existing device
        await callUpdateDeviceConfig({
          deviceId: deviceId!,
          name: name.trim(),
          tripWatts: trip,
          safeWatts: safe,
        });
      } else {
        // New pairing
        await callPairDevice({
          deviceId: deviceId!,
          name: name.trim(),
          tripWatts: trip,
          safeWatts: safe,
        });
        // Set PIN if the user entered one
        if (pin) {
          await callSetDevicePin({ deviceId: deviceId!, pin });
        }
      }
      onSuccess({ name: name.trim(), tripWatts: trip, safeWatts: safe });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('already-exists') || msg.includes('already owned') || msg.includes('already paired')) {
        setError('This device is already paired to another account. Long-press the button on the device (3s) to reset it.');
      } else {
        setError(`Failed: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss} />

        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <FontAwesome5 name="bolt" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.title}>
                {existingConfig ? 'Edit Device' : 'Configure Your Device'}
              </Text>
              <Text style={styles.subtitle}>
                {existingConfig
                  ? 'Update name and safety thresholds'
                  : 'Set up name and safety thresholds'}
              </Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
              <FontAwesome5 name="times" size={16} color="#8e8e93" />
            </TouchableOpacity>
          </View>

          {deviceId && !existingConfig && (
            <View style={styles.deviceIdRow}>
              <Text style={styles.deviceIdLabel}>Device ID</Text>
              <Text style={styles.deviceIdValue}>{deviceId}</Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Device Name */}
            <Text style={styles.fieldLabel}>Device Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Living Room AC"
              placeholderTextColor="#aeaeb2"
              value={name}
              onChangeText={setName}
              maxLength={40}
            />

            {/* Trip Wattage */}
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Trip Threshold (W)</Text>
                <Text style={styles.fieldHint}>Circuit cuts off above this value</Text>
              </View>
              <View style={[styles.input, styles.numericInput]}>
                <TextInput
                  style={styles.numericText}
                  keyboardType="number-pad"
                  value={tripWatts}
                  onChangeText={setTripWatts}
                  maxLength={6}
                />
                <Text style={styles.numericUnit}>W</Text>
              </View>
            </View>

            {/* Safe Threshold */}
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Warning Threshold (W)</Text>
                <Text style={styles.fieldHint}>Push alert sent above this value</Text>
              </View>
              <View style={[styles.input, styles.numericInput]}>
                <TextInput
                  style={styles.numericText}
                  keyboardType="number-pad"
                  value={safeWatts}
                  onChangeText={setSafeWatts}
                  maxLength={6}
                />
                <Text style={styles.numericUnit}>W</Text>
              </View>
            </View>

            {/* Threshold visualizer */}
            <View style={styles.thresholdViz}>
              <View style={styles.thresholdBar}>
                <View style={[styles.thresholdFill, { flex: parseInt(safeWatts) || 1800, backgroundColor: '#34C759' }]} />
                <View style={[styles.thresholdFill, { flex: Math.max(0, (parseInt(tripWatts) || 2000) - (parseInt(safeWatts) || 1800)), backgroundColor: '#FF9500' }]} />
              </View>
              <View style={styles.thresholdLabels}>
                <Text style={[styles.thresholdLegend, { color: '#34C759' }]}>● Safe ({safeWatts}W)</Text>
                <Text style={[styles.thresholdLegend, { color: '#FF9500' }]}>● Warning zone</Text>
                <Text style={[styles.thresholdLegend, { color: '#FF3B30' }]}>● Trip ({tripWatts}W)</Text>
              </View>
            </View>

            {/* Remote-control PIN (new pairing only) */}
            {!existingConfig && (
              <>
                <View style={styles.pinSectionHeader}>
                  <FontAwesome5 name="lock" size={12} color="#636366" />
                  <Text style={styles.pinSectionTitle}>Remote Control PIN (Optional)</Text>
                </View>
                <Text style={styles.fieldHint}>
                  Set a 4–8 digit PIN to enable remote force-off from the dashboard.
                  You can set or change it later in device settings.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="PIN (4–8 digits)"
                  placeholderTextColor="#aeaeb2"
                  value={pin}
                  onChangeText={setPin}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={8}
                />
                {pin.length > 0 && (
                  <TextInput
                    style={[styles.input, { marginTop: 8 }]}
                    placeholder="Confirm PIN"
                    placeholderTextColor="#aeaeb2"
                    value={pinConfirm}
                    onChangeText={setPinConfirm}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                  />
                )}
              </>
            )}

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <FontAwesome5 name="exclamation-triangle" size={13} color="#FF3B30" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome5 name={existingConfig ? 'save' : 'check'} size={15} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitButtonText}>
                    {existingConfig ? 'Save Changes' : 'Pair Device'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    width: '90%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 30,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  subtitle: {
    fontSize: 12,
    color: '#8e8e93',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  deviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 18,
    gap: 8,
  },
  deviceIdLabel: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '600',
  },
  deviceIdValue: {
    fontSize: 12,
    color: '#3a3a3c',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3a3a3c',
    marginBottom: 6,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 11,
    color: '#aeaeb2',
    marginTop: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e5ea',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: '#fafafa',
    color: '#1c1c1e',
  },
  numericInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 90,
  },
  numericText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1c1e',
    minWidth: 50,
    textAlign: 'right',
  },
  numericUnit: {
    fontSize: 14,
    color: '#8e8e93',
    marginLeft: 4,
    fontWeight: '600',
  },
  thresholdViz: {
    marginTop: 18,
    marginBottom: 4,
  },
  thresholdBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#FF3B30',
  },
  thresholdFill: {
    borderRadius: 4,
  },
  thresholdLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  thresholdLegend: {
    fontSize: 10,
    fontWeight: '600',
  },
  pinSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 4,
  },
  pinSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636366',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fff0f0',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    flex: 1,
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  submitDisabled: {
    backgroundColor: '#aeaeb2',
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Animated,
  TouchableWithoutFeedback, Dimensions, Platform,
  TextInput, Modal, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Layout from '../src/components/Layout';
import { FontAwesome5 } from '@expo/vector-icons';
import {
  auth, DeviceDoc, LiveReading, callSaveFCMToken,
  callControlDevice,
} from '../src/config/firebase';
import { subscribeToUserDevices, subscribeToLiveReading } from '../src/services/devices';
import MobileScanner from '../src/components/MobileScanner';
import WebScanner from '../src/components/WebScanner';
import DeviceConfigModal from '../src/components/DeviceConfigModal';
import * as Notifications from 'expo-notifications';

// ── Push Notifications setup ─────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.log('Push notification registration skipped:', err);
    return null;
  }
}

// ── BlinkingDot ───────────────────────────────────────────────────────────────

const BlinkingDot = ({ isOnline }: { isOnline: boolean }) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!isOnline) { setVisible(true); return; }
    const t = setInterval(() => setVisible(v => !v), 800);
    return () => clearInterval(t);
  }, [isOnline]);
  return (
    <View style={[styles.indicatorDot, {
      backgroundColor: isOnline ? '#34C759' : '#8e8e93',
      opacity: visible ? 1 : 0.3,
    }]} />
  );
};

// ── PIN Dialog ────────────────────────────────────────────────────────────────

interface PinDialogProps {
  visible: boolean;
  deviceName: string;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
  loading: boolean;
  errorMsg: string;
}

function PinDialog({ visible, deviceName, onConfirm, onCancel, loading, errorMsg }: PinDialogProps) {
  const [pin, setPin] = useState('');
  const scaleAnim   = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPin('');
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={pinStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={pinStyles.backdrop} activeOpacity={1} onPress={onCancel} />
        <Animated.View style={[pinStyles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <View style={pinStyles.iconBadge}>
            <FontAwesome5 name="lock" size={20} color="#fff" />
          </View>
          <Text style={pinStyles.title}>Enter PIN</Text>
          <Text style={pinStyles.subtitle}>
            Enter the PIN for "{deviceName}" to force-off the circuit.
          </Text>

          <TextInput
            style={pinStyles.pinInput}
            value={pin}
            onChangeText={setPin}
            placeholder="• • • • • •"
            placeholderTextColor="#c7c7cc"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            autoFocus
          />

          {errorMsg ? (
            <View style={pinStyles.errorRow}>
              <FontAwesome5 name="exclamation-circle" size={12} color="#FF3B30" />
              <Text style={pinStyles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={pinStyles.btnRow}>
            <TouchableOpacity style={pinStyles.cancelBtn} onPress={onCancel}>
              <Text style={pinStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pinStyles.confirmBtn, (!pin || loading) && pinStyles.confirmDisabled]}
              onPress={() => onConfirm(pin)}
              disabled={!pin || loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={pinStyles.confirmBtnText}>Force Off</Text>}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Restore Warning Dialog ─────────────────────────────────────────────────────

interface RestoreDialogProps {
  visible: boolean;
  deviceName: string;
  tripReason: 'auto' | 'manual' | 'none';
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function RestoreDialog({ visible, deviceName, tripReason, onConfirm, onCancel, loading }: RestoreDialogProps) {
  const scaleAnim   = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const isAutoTrip = tripReason === 'auto';

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onCancel}>
      <TouchableOpacity style={pinStyles.overlay} activeOpacity={1} onPress={onCancel}>
        <Animated.View
          style={[pinStyles.card, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[pinStyles.iconBadge, { backgroundColor: isAutoTrip ? '#FF9500' : '#34C759' }]}>
            <FontAwesome5 name={isAutoTrip ? 'exclamation-triangle' : 'power-off'} size={20} color="#fff" />
          </View>

          <Text style={pinStyles.title}>
            {isAutoTrip ? 'Circuit Tripped' : 'Restore Circuit'}
          </Text>

          {isAutoTrip ? (
            <>
              <View style={pinStyles.warningBox}>
                <FontAwesome5 name="exclamation-triangle" size={13} color="#FF9500" />
                <Text style={pinStyles.warningText}>
                  "{deviceName}" tripped due to sustained high power draw.
                  {'\n\n'}Before restoring, make sure you have{' '}
                  <Text style={{ fontWeight: '700' }}>shut down or disconnected
                  high-power appliances</Text> to prevent an immediate re-trip.
                </Text>
              </View>
              <Text style={pinStyles.subtitle}>
                The buzzer on the device would have already alerted you.
              </Text>
            </>
          ) : (
            <Text style={pinStyles.subtitle}>
              Restore the circuit for "{deviceName}"?
            </Text>
          )}

          <View style={pinStyles.btnRow}>
            <TouchableOpacity style={pinStyles.cancelBtn} onPress={onCancel}>
              <Text style={pinStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[pinStyles.confirmBtn, { backgroundColor: isAutoTrip ? '#FF9500' : '#34C759' }, loading && pinStyles.confirmDisabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={pinStyles.confirmBtnText}>
                    {isAutoTrip ? 'Yes, Restore' : 'Restore'}
                  </Text>}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── DeviceCard ────────────────────────────────────────────────────────────────

function DeviceCard({
  device,
  onLiveUpdate,
  onEditConfig,
  onForceOff,
  onRestore,
}: {
  device: DeviceDoc;
  onLiveUpdate: (id: string, power: number, tripped: boolean, tripReason: LiveReading['tripReason']) => void;
  onEditConfig: (device: DeviceDoc) => void;
  onForceOff:  (device: DeviceDoc) => void;
  onRestore:   (device: DeviceDoc) => void;
}) {
  const router = useRouter();
  const [liveReading, setLiveReading] = useState<LiveReading | null>(null);

  useEffect(() => {
    const unsub = subscribeToLiveReading(device.deviceId, (reading) => {
      setLiveReading(reading);
      if (reading) onLiveUpdate(device.deviceId, reading.power, reading.tripped, reading.tripReason);
    });
    return unsub;
  }, [device.deviceId]);

  const isOnline   = device.status === 'online';
  const isTripped  = liveReading?.tripped  ?? device.tripped  ?? false;
  const tripReason = (liveReading?.tripReason ?? device.tripReason ?? 'none') as LiveReading['tripReason'];
  const power      = liveReading?.power ?? 0;
  const tripWatts  = device.tripWatts ?? 2000;
  const safeWatts  = device.safeWatts ?? 1800;
  const isWarning  = isOnline && !isTripped && power > safeWatts;
  const isManualOff = isTripped && tripReason === 'manual';
  const isAutoTrip  = isTripped && tripReason === 'auto';

  const powerRatio = Math.min(power / tripWatts, 1);
  const barColor   = isTripped ? '#FF3B30' : isWarning ? '#FF9500' : '#34C759';

  return (
    <TouchableOpacity
      style={[
        styles.deviceCard,
        isAutoTrip  && styles.deviceCardTripped,
        isManualOff && styles.deviceCardManual,
        isWarning   && styles.deviceCardWarning,
      ]}
      onPress={() => router.push(`/device/${device.deviceId}`)}
      onLongPress={() => onEditConfig(device)}
      activeOpacity={0.75}
    >
      {/* Trip / Manual-off banner */}
      {isTripped && (
        <View style={[styles.tripBanner, isManualOff && styles.tripBannerManual]}>
          <FontAwesome5 name={isManualOff ? 'power-off' : 'bolt'} size={9} color="#fff" />
          <Text style={styles.tripBannerText}>
            {isManualOff ? 'FORCE OFF' : 'AUTO-TRIPPED'}
          </Text>
        </View>
      )}

      <View style={styles.deviceHeader}>
        <Text style={styles.deviceName} numberOfLines={1}>
          {device.name || 'Unnamed Device'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={() => onEditConfig(device)}
            style={styles.editIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome5 name="sliders-h" size={10} color="#8e8e93" />
          </TouchableOpacity>
          <BlinkingDot isOnline={isOnline} />
        </View>
      </View>

      <View style={styles.deviceBody}>
        <FontAwesome5
          name={isManualOff ? 'power-off' : isAutoTrip ? 'exclamation-triangle' : 'bolt'}
          size={24}
          color={isManualOff ? '#8e8e93' : isAutoTrip ? '#FF3B30' : isOnline ? '#FFCC00' : '#ccc'}
          style={styles.deviceIcon}
        />
        <Text style={[
          styles.devicePower,
          !isOnline   && styles.offlineText,
          isAutoTrip  && styles.trippedText,
          isManualOff && styles.manualOffText,
          isWarning   && styles.warningText,
        ]}>
          {isManualOff
            ? 'Force Off'
            : isAutoTrip
            ? 'TRIPPED'
            : isOnline && liveReading
            ? `${Math.round(power)} W`
            : isOnline
            ? '-- W'
            : 'Offline'}
        </Text>
      </View>

      {/* Power bar */}
      {isOnline && !isTripped && (
        <View style={styles.powerBarBg}>
          <View style={[styles.powerBarFill, { flex: powerRatio, backgroundColor: barColor }]} />
          <View style={{ flex: Math.max(0, 1 - powerRatio) }} />
        </View>
      )}

      <Text style={styles.thresholdLabel}>
        Trip: {tripWatts}W · Warn: {safeWatts}W
      </Text>

      {/* ── Remote Control Buttons ── */}
      {isOnline && (
        <View style={styles.controlRow}>
          {isTripped ? (
            // Restore button
            <TouchableOpacity
              style={styles.restoreBtn}
              onPress={() => onRestore(device)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <FontAwesome5 name="power-off" size={10} color="#34C759" style={{ marginRight: 5 }} />
              <Text style={styles.restoreBtnText}>Restore</Text>
            </TouchableOpacity>
          ) : (
            // Force-off button
            <TouchableOpacity
              style={styles.forceOffBtn}
              onPress={() => onForceOff(device)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <FontAwesome5 name="stop-circle" size={10} color="#FF3B30" style={{ marginRight: 5 }} />
              <Text style={styles.forceOffBtnText}>Force Off</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── DashboardRoute (main) ─────────────────────────────────────────────────────

export default function DashboardRoute() {
  const router = useRouter();
  const [devices, setDevices]       = useState<DeviceDoc[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveData, setLiveData]     = useState<Record<string, { power: number; tripped: boolean; tripReason: LiveReading['tripReason'] }>>({});

  const ratePerKWh = 0.15;
  const [userAuth, setUserAuth] = useState<any>(auth.currentUser);

  // ── Scanner sheet ─────────────────────────────────────────────────────────
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [isScannerMounted, setIsScannerMounted] = useState(false);
  const { height } = Dimensions.get('window');
  const sheetHeight  = height * 0.6;
  const sheetAnim    = useRef(new Animated.Value(sheetHeight)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ── Config modal ──────────────────────────────────────────────────────────
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [pendingDeviceId, setPendingDeviceId]       = useState<string | null>(null);
  const [editingDevice, setEditingDevice]           = useState<DeviceDoc | null>(null);

  // ── PIN / Restore dialog ──────────────────────────────────────────────────
  const [pinDialogVisible, setPinDialogVisible]       = useState(false);
  const [restoreDialogVisible, setRestoreDialogVisible] = useState(false);
  const [targetDevice, setTargetDevice]               = useState<DeviceDoc | null>(null);
  const [controlLoading, setControlLoading]           = useState(false);
  const [controlError, setControlError]               = useState('');

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserAuth(u);
      if (!u) setLoading(false);
    });
    return unsub;
  }, []);

  // ── Push notifications ────────────────────────────────────────────────────
  useEffect(() => {
    if (!userAuth?.uid) return;
    registerForPushNotificationsAsync().then(async (token) => {
      if (token) {
        try { await callSaveFCMToken({ fcmToken: token }); } catch {}
      }
    });
    const sub = Notifications.addNotificationReceivedListener(() => {});
    return () => sub.remove();
  }, [userAuth?.uid]);

  // ── Firestore device subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!userAuth?.uid) return;
    return subscribeToUserDevices(userAuth.uid, (devs) => {
      setDevices(devs);
      setLoading(false);
    });
  }, [userAuth?.uid]);

  const handleLiveUpdate = useCallback(
    (deviceId: string, power: number, tripped: boolean, tripReason: LiveReading['tripReason']) => {
      setLiveData(prev => {
        const ex = prev[deviceId];
        if (ex?.power === power && ex?.tripped === tripped && ex?.tripReason === tripReason) return prev;
        return { ...prev, [deviceId]: { power, tripped, tripReason } };
      });
    }, []
  );

  // ── Scanner animations ────────────────────────────────────────────────────
  const openScanner  = () => setIsScannerVisible(true);
  const closeScanner = () => setIsScannerVisible(false);

  useEffect(() => {
    if (isScannerVisible) {
      setIsScannerMounted(true);
      Animated.parallel([
        Animated.timing(sheetAnim,    { toValue: 0,           duration: 300, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1,           duration: 300, useNativeDriver: true }),
      ]).start();
    } else if (isScannerMounted) {
      Animated.parallel([
        Animated.timing(sheetAnim,    { toValue: sheetHeight, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0,           duration: 250, useNativeDriver: true }),
      ]).start(() => setIsScannerMounted(false));
    }
  }, [isScannerVisible]);

  const handleProvisioningComplete = (deviceId: string) => {
    setPendingDeviceId(deviceId);
    setEditingDevice(null);
    closeScanner();
    setTimeout(() => setConfigModalVisible(true), 350);
  };

  const handleEditConfig = (device: DeviceDoc) => {
    setEditingDevice(device);
    setPendingDeviceId(device.deviceId);
    setConfigModalVisible(true);
  };

  // ── Remote control ────────────────────────────────────────────────────────

  const handleForceOff = (device: DeviceDoc) => {
    // Check if PIN is configured — backend will also validate, but surface upfront
    if (!device.pinHash) {
      Alert.alert(
        'No PIN Set',
        'Set a remote-control PIN in device settings (long-press the device card) before using Force Off.',
        [{ text: 'OK' }]
      );
      return;
    }
    setTargetDevice(device);
    setControlError('');
    setPinDialogVisible(true);
  };

  const handleForceOffConfirm = async (pin: string) => {
    if (!targetDevice) return;
    setControlLoading(true);
    setControlError('');
    try {
      await callControlDevice({ deviceId: targetDevice.deviceId, action: 'trip', pin });
      setPinDialogVisible(false);
      setTargetDevice(null);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.includes('Incorrect PIN') || msg.includes('permission-denied')) {
        setControlError('Incorrect PIN. Try again.');
      } else if (msg.includes('No PIN set') || msg.includes('failed-precondition')) {
        setControlError('No PIN set. Configure one in device settings.');
      } else {
        setControlError(`Failed: ${msg}`);
      }
    } finally {
      setControlLoading(false);
    }
  };

  const handleRestore = (device: DeviceDoc) => {
    setTargetDevice(device);
    setControlError('');
    setRestoreDialogVisible(true);
  };

  const handleRestoreConfirm = async () => {
    if (!targetDevice) return;
    setControlLoading(true);
    try {
      await callControlDevice({ deviceId: targetDevice.deviceId, action: 'restore' });
      setRestoreDialogVisible(false);
      setTargetDevice(null);
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message ?? String(err));
    } finally {
      setControlLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  // ── Computed totals ───────────────────────────────────────────────────────
  const netPower = devices.reduce((sum, d) => {
    return d.status === 'online' ? sum + (liveData[d.deviceId]?.power || 0) : sum;
  }, 0);
  const pricePerHour = (netPower / 1000) * ratePerKWh;
  const trippedCount = devices.filter(d => liveData[d.deviceId]?.tripped || d.tripped).length;

  // ── Auth guards ───────────────────────────────────────────────────────────
  if (!userAuth) {
    return (
      <Layout>
        <View style={[styles.center, { padding: 30 }]}>
          <FontAwesome5 name="user-lock" size={60} color="#ccc" style={{ marginBottom: 20 }} />
          <Text style={styles.emptyTitle}>Not Logged In</Text>
          <Text style={[styles.emptySubtitle, { marginBottom: 30 }]}>
            You need to be signed in to view your dashboard.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/auth')}>
            <Text style={styles.primaryButtonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </Layout>
    );
  }

  if (loading && devices.length === 0) {
    return (
      <Layout>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </Layout>
    );
  }

  return (
    <Layout>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Net Power Card */}
        <View style={styles.netPowerCard}>
          <View style={styles.netPowerInfo}>
            <Text style={styles.netPowerLabel}>Net Power Usage</Text>
            <Text style={styles.netPowerValue}>
              {Math.round(netPower)} <Text style={styles.unitText}>W</Text>
            </Text>
          </View>
          <View style={styles.dividerVertical} />
          <View style={styles.netPowerInfo}>
            <Text style={styles.netPowerLabel}>Approx. Cost</Text>
            <Text style={styles.netPowerValue}>
              ${pricePerHour.toFixed(3)} <Text style={styles.unitText}>/hr</Text>
            </Text>
          </View>
        </View>

        {/* Tripped alert banner */}
        {trippedCount > 0 && (
          <View style={styles.tripAlertBanner}>
            <FontAwesome5 name="bolt" size={14} color="#fff" />
            <Text style={styles.tripAlertText}>
              {trippedCount} device{trippedCount > 1 ? 's have' : ' has'} tripped or been
              forced off. Tap "Restore" on the card to turn back on.
            </Text>
          </View>
        )}

        {/* Devices Grid */}
        <Text style={styles.sectionTitle}>Paired Devices</Text>

        {devices.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5 name="microchip" size={48} color="#ccc" />
            <Text style={styles.emptyTitle}>No devices yet</Text>
            <Text style={styles.emptySubtitle}>Tap + to add your first PRIME monitor.</Text>
          </View>
        ) : (
          <View style={styles.gridContainer}>
            {devices.map(device => (
              <DeviceCard
                key={device.deviceId}
                device={device}
                onLiveUpdate={handleLiveUpdate}
                onEditConfig={handleEditConfig}
                onForceOff={handleForceOff}
                onRestore={handleRestore}
              />
            ))}
          </View>
        )}

        <Text style={styles.hint}>Long-press a device to edit settings · Use Force Off for remote shutdown</Text>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={openScanner}>
        <FontAwesome5 name="plus" size={24} color="#fff" />
      </TouchableOpacity>

      {/* BLE Scanner Sheet */}
      {isScannerMounted && (
        <View style={styles.sheetOverlayContainer}>
          <TouchableWithoutFeedback onPress={closeScanner}>
            <Animated.View style={[styles.sheetBackdrop, { opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.bottomSheet, { height: sheetHeight, transform: [{ translateY: sheetAnim }] }]}>
            <TouchableOpacity style={styles.closeSheetBtn} onPress={closeScanner}>
              <FontAwesome5 name="times" size={20} color="#666" />
            </TouchableOpacity>
            {Platform.OS === 'web'
              ? <WebScanner onProvisioningComplete={handleProvisioningComplete} />
              : <MobileScanner onProvisioningComplete={handleProvisioningComplete} />}
          </Animated.View>
        </View>
      )}

      {/* Device Config Modal */}
      <DeviceConfigModal
        visible={configModalVisible}
        deviceId={pendingDeviceId}
        existingConfig={editingDevice ? {
          name:      editingDevice.name,
          tripWatts: editingDevice.tripWatts ?? 2000,
          safeWatts: editingDevice.safeWatts ?? 1800,
        } : undefined}
        onSuccess={() => {
          setConfigModalVisible(false);
          setPendingDeviceId(null);
          setEditingDevice(null);
        }}
        onDismiss={() => {
          setConfigModalVisible(false);
          setPendingDeviceId(null);
          setEditingDevice(null);
        }}
      />

      {/* PIN Dialog — for Force Off */}
      <PinDialog
        visible={pinDialogVisible}
        deviceName={targetDevice?.name ?? ''}
        onConfirm={handleForceOffConfirm}
        onCancel={() => { setPinDialogVisible(false); setControlError(''); setTargetDevice(null); }}
        loading={controlLoading}
        errorMsg={controlError}
      />

      {/* Restore Dialog */}
      <RestoreDialog
        visible={restoreDialogVisible}
        deviceName={targetDevice?.name ?? ''}
        tripReason={(liveData[targetDevice?.deviceId ?? '']?.tripReason ?? targetDevice?.tripReason ?? 'none') as LiveReading['tripReason']}
        onConfirm={handleRestoreConfirm}
        onCancel={() => { setRestoreDialogVisible(false); setTargetDevice(null); }}
        loading={controlLoading}
      />
    </Layout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  netPowerCard: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    padding: 20, marginBottom: 16, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  netPowerInfo:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dividerVertical: { width: 1, backgroundColor: '#e5e5ea', marginHorizontal: 10 },
  netPowerLabel: { fontSize: 14, color: '#8e8e93', fontWeight: '600', marginBottom: 5, textTransform: 'uppercase' },
  netPowerValue: { fontSize: 32, fontWeight: 'bold', color: '#1c1c1e' },
  unitText:      { fontSize: 18, color: '#6c6c70', fontWeight: '500' },
  tripAlertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FF3B30', borderRadius: 12, padding: 14, marginBottom: 16,
  },
  tripAlertText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  sectionTitle:  { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 15, marginLeft: 5 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },

  // Device card
  deviceCard: {
    flexBasis: 150, flexGrow: 1, maxWidth: 250, backgroundColor: '#fff',
    borderRadius: 16, padding: 14, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5,
    elevation: 3, overflow: 'hidden', minHeight: 165,
  },
  deviceCardTripped: {
    borderColor: '#FF3B30', borderWidth: 2,
    shadowColor: '#FF3B30', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  deviceCardManual: {
    borderColor: '#8e8e93', borderWidth: 1.5,
  },
  deviceCardWarning: {
    borderColor: '#FF9500', borderWidth: 1.5,
  },
  tripBanner: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#FF3B30', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5, paddingVertical: 4,
  },
  tripBannerManual: { backgroundColor: '#636366' },
  tripBannerText:   { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  deviceHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 18,
  },
  deviceName:   { fontSize: 13, fontWeight: '600', color: '#3a3a3c', flex: 1, marginRight: 4 },
  editIconBtn:  { padding: 3 },
  indicatorDot: { width: 9, height: 9, borderRadius: 5, marginTop: 2 },
  deviceBody:   { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 6 },
  deviceIcon:   { marginBottom: 6 },
  devicePower:  { fontSize: 19, fontWeight: 'bold', color: '#1c1c1e' },
  offlineText:  { color: '#8e8e93', fontSize: 15, fontWeight: '500' },
  trippedText:  { color: '#FF3B30', fontSize: 13, fontWeight: '800' },
  manualOffText:{ color: '#636366', fontSize: 15, fontWeight: '700' },
  warningText:  { color: '#FF9500' },
  powerBarBg: {
    height: 4, borderRadius: 2, backgroundColor: '#f0f0f0',
    marginTop: 8, overflow: 'hidden', flexDirection: 'row',
  },
  powerBarFill: { height: 4 },
  thresholdLabel: { fontSize: 9, color: '#aeaeb2', marginTop: 4, textAlign: 'center' },

  // Control buttons (on card)
  controlRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  forceOffBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#FF3B30', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  forceOffBtnText: { fontSize: 11, color: '#FF3B30', fontWeight: '700' },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#34C759', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10,
  },
  restoreBtnText: { fontSize: 11, color: '#34C759', fontWeight: '700' },

  emptyState:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, marginTop: 40 },
  emptyTitle:    { fontSize: 22, fontWeight: 'bold', color: '#1c1c1e', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 16, color: '#8e8e93', textAlign: 'center' },
  hint:          { fontSize: 11, color: '#aeaeb2', textAlign: 'center', marginTop: 12 },
  fab: {
    position: 'absolute', bottom: 32, right: 32, width: 64, height: 64,
    borderRadius: 32, backgroundColor: '#007AFF', justifyContent: 'center',
    alignItems: 'center', shadowColor: '#007AFF', shadowOpacity: 0.4,
    shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  sheetOverlayContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, elevation: 20,
  },
  sheetBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    position: 'absolute', bottom: 0, alignSelf: 'center', width: '90%',
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 25, overflow: 'hidden',
  },
  closeSheetBtn: { position: 'absolute', top: 15, right: 20, zIndex: 10, padding: 10 },
  primaryButton: {
    backgroundColor: '#007AFF', paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 10, alignItems: 'center', shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});

// ── PIN / Restore dialog styles ───────────────────────────────────────────────

const pinStyles = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  card: {
    width: '88%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 24,
    padding: 26, alignItems: 'center', shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 30,
  },
  iconBadge: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#FF3B30',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#1c1c1e', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#8e8e93', textAlign: 'center', marginBottom: 18, lineHeight: 19 },
  pinInput: {
    width: '100%', borderWidth: 1.5, borderColor: '#e5e5ea', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 22, textAlign: 'center',
    letterSpacing: 6, color: '#1c1c1e', backgroundColor: '#fafafa', marginBottom: 8,
  },
  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  errorText: { fontSize: 12, color: '#FF3B30', flex: 1 },
  warningBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#fff8f0',
    borderRadius: 12, padding: 14, marginBottom: 12, width: '100%',
  },
  warningText: { fontSize: 13, color: '#c44d00', flex: 1, lineHeight: 19 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 13, alignItems: 'center',
    backgroundColor: '#f2f2f7',
  },
  cancelBtnText:  { fontSize: 15, fontWeight: '600', color: '#3a3a3c' },
  confirmBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 13, alignItems: 'center',
    backgroundColor: '#FF3B30', shadowColor: '#FF3B30',
    shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  confirmDisabled: { backgroundColor: '#aeaeb2', shadowOpacity: 0 },
  confirmBtnText:  { fontSize: 15, fontWeight: '700', color: '#fff' },
});

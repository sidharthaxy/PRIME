import React, { useEffect, useState } from 'react';
import { 
  View, Text, StyleSheet, SafeAreaView, ScrollView, 
  TouchableOpacity, ActivityIndicator, TextInput, Alert, Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { doc, updateDoc } from 'firebase/firestore';

import { db, DeviceDoc, Reading, callUnpairDevice, callGetDeviceReadings } from '../../src/config/firebase';
import { subscribeToDevice, subscribeToLatestReading } from '../../src/services/devices';

const screenWidth = Dimensions.get('window').width;

export default function DeviceDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [device, setDevice] = useState<DeviceDoc | null>(null);
  const [latestReading, setLatestReading] = useState<Reading | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState('');

  // 1. Subscribe to device & latest reading
  useEffect(() => {
    if (!id) return;

    const unsubDevice = subscribeToDevice(id, (d) => {
      if (d) {
        setDevice(d);
        if (!isRenaming) setEditName(d.name);
      } else {
        // Device deleted or lost access
        router.replace('/dashboard');
      }
      setLoading(false);
    });

    const unsubReading = subscribeToLatestReading(id, (r) => {
      setLatestReading(r);
      // Refresh history whenever a new reading arrives
      fetchHistory();
    });

    return () => {
      unsubDevice();
      unsubReading();
    };
  }, [id]);

  // 2. Fetch historical readings
  const fetchHistory = async () => {
    if (!id) return;
    try {
      const res = await callGetDeviceReadings({ deviceId: id, limit: 60 });
      // The backend returns them perfectly ordered desc, so we reverse to make it chronological for charting
      const reversed = [...res.data.readings].reverse();
      setHistory(reversed);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  // Run once on mount
  useEffect(() => {
    fetchHistory();
  }, [id]);

  const handleRenameSubmit = async () => {
    if (!id || !editName.trim()) {
      setIsRenaming(false);
      return;
    }
    try {
      await updateDoc(doc(db, 'devices', id), { name: editName.trim() });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to rename device');
    }
    setIsRenaming(false);
  };

  const handleUnpair = () => {
    Alert.alert(
      'Unpair Device', 
      'Are you sure you want to unpair this device? You will lose access to its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Unpair', 
          style: 'destructive',
          onPress: async () => {
            try {
              if (id) {
                await callUnpairDevice({ deviceId: id });
                router.replace('/dashboard');
              }
            } catch (e) {
              console.error(e);
              Alert.alert('Error', 'Failed to unpair device');
            }
          }
        }
      ]
    );
  };

  if (loading || !device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007aff" />
      </View>
    );
  }

  // Determine status color
  let statusColor = '#34c759'; // default 0 / green
  let statusText = 'Online';
  
  if (device.status === 'offline') {
    statusColor = '#8e8e93';
    statusText = 'Offline';
  } else if (latestReading) {
    if (latestReading.status === 1) statusColor = '#ff9500';
    else if (latestReading.status === 2) statusColor = '#ff3b30';
  }

  // Chart Data prep
  const chartData = history.map(r => r.power);
  // To avoid crowding, show 10 labels max
  const labelStep = Math.max(1, Math.floor(history.length / 10));
  const chartLabels = history.map((r, i) => {
    if (i % labelStep === 0 || i === history.length - 1) {
      const d = new Date(r.timestamp.seconds * 1000);
      return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    return '';
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#007aff" />
        </TouchableOpacity>
        
        <View style={styles.titleContainer}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          {isRenaming ? (
            <TextInput
              style={styles.renameInput}
              value={editName}
              onChangeText={setEditName}
              onBlur={handleRenameSubmit}
              onSubmitEditing={handleRenameSubmit}
              autoFocus
              returnKeyType="done"
            />
          ) : (
            <Text style={styles.deviceName}>{device.name}</Text>
          )}
        </View>

        <TouchableOpacity onPress={() => setIsRenaming(true)}>
          <Ionicons name="pencil" size={20} color="#007aff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Large Power Metric */}
        <View style={styles.powerSection}>
          <Text style={[styles.mainPowerValue, { color: statusColor }]}>
            {latestReading ? latestReading.power.toFixed(0) : '--'}
          </Text>
          <Text style={styles.powerUnit}>W</Text>
        </View>

        {/* Status Banner */}
        {latestReading && latestReading.status > 0 && (
          <View style={[styles.banner, { backgroundColor: statusColor }]}>
            <Text style={styles.bannerText}>
              {latestReading.status === 1 ? '⚠ High Usage Detected' : '🔴 TRIPPED'}
            </Text>
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Voltage</Text>
            <Text style={styles.statValue}>{latestReading ? latestReading.voltage.toFixed(1) : '--'} V</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>{latestReading ? latestReading.current.toFixed(2) : '--'} A</Text>
          </View>
          <View style={styles.verticalDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Energy</Text>
            <Text style={styles.statValue}>{latestReading ? latestReading.energy.toFixed(3) : '--'} kWh</Text>
          </View>
        </View>

        {/* Chart */}
        {chartData.length > 0 && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Recent Power Usage</Text>
            <LineChart
              data={{
                labels: chartLabels,
                datasets: [{ data: chartData }]
              }}
              width={screenWidth - 40}
              height={220}
              bezier
              withDots={false}
              withInnerLines={false}
              yAxisSuffix="W"
              chartConfig={{
                backgroundColor: '#ffffff',
                backgroundGradientFrom: '#ffffff',
                backgroundGradientTo: '#ffffff',
                decimalPlaces: 0,
                color: (opacity = 1) => statusColor,
                labelColor: (opacity = 1) => '#8e8e93',
                style: { borderRadius: 16 },
                propsForDots: { r: '0' }
              }}
              style={styles.chart}
            />
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity style={styles.unpairBtn} onPress={handleUnpair}>
            <Ionicons name="trash-outline" size={20} color="#ff3b30" />
            <Text style={styles.unpairBtnText}>Unpair Device</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea'
  },
  backBtn: { padding: 4 },
  titleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, marginHorizontal: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  deviceName: { fontSize: 20, fontWeight: 'bold', color: '#1c1c1e' },
  renameInput: { fontSize: 20, fontWeight: 'bold', color: '#1c1c1e', borderBottomWidth: 1, borderBottomColor: '#007aff', padding: 0, flex: 1 },
  scrollContent: { padding: 20 },
  powerSection: { alignItems: 'center', marginVertical: 32, flexDirection: 'row', justifyContent: 'center' },
  mainPowerValue: { fontSize: 80, fontWeight: '300', letterSpacing: -2 },
  powerUnit: { fontSize: 32, fontWeight: '500', color: '#8e8e93', marginTop: 32, marginLeft: 8 },
  banner: { padding: 12, borderRadius: 12, alignItems: 'center', marginBottom: 24, marginHorizontal: 16 },
  bannerText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  statBox: { flex: 1, alignItems: 'center' },
  verticalDivider: { width: 1, backgroundColor: '#e5e5ea', marginHorizontal: 8 },
  statLabel: { fontSize: 13, color: '#8e8e93', marginBottom: 4, textTransform: 'uppercase', fontWeight: '600' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#1c1c1e' },
  chartContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  chartTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c1c1e', marginBottom: 16 },
  chart: { marginVertical: 8, borderRadius: 16 },
  actionsSection: { marginTop: 16 },
  unpairBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#feece5', padding: 16, borderRadius: 16 },
  unpairBtnText: { color: '#ff3b30', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
});

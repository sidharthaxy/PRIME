import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, Animated, TouchableWithoutFeedback, Dimensions, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import Layout from '../src/components/Layout';
import { FontAwesome5 } from '@expo/vector-icons';
import { auth, DeviceDoc, Reading, callPairDevice, PairingSession } from '../src/config/firebase';
import { subscribeToUserDevices, subscribeToLatestReading, subscribeToPairingSessions } from '../src/services/devices';
import MobileScanner from '../src/components/MobileScanner';
import WebScanner from '../src/components/WebScanner';

// A blinking dot to show online status
const BlinkingDot = ({ isOnline }: { isOnline: boolean }) => {
    const [opacity, setOpacity] = useState(1);
    useEffect(() => {
        if (!isOnline) {
            setOpacity(1);
            return;
        }
        const interval = setInterval(() => {
            setOpacity((prev) => (prev === 1 ? 0.3 : 1));
        }, 800);
        return () => clearInterval(interval);
    }, [isOnline]);

    return (
        <View
            style={[
                styles.indicatorDot,
                { backgroundColor: isOnline ? '#34C759' : '#FF3B30', opacity },
            ]}
        />
    );
};

function DeviceCard({ device, onReadingUpdate }: { device: DeviceDoc, onReadingUpdate: (id: string, power: number) => void }) {
  const router = useRouter();
  const [latestReading, setLatestReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (device.deviceId.startsWith('dummy_')) {
      const dummyPower = device.deviceId === 'dummy_1' ? 120 : 350;
      const mockReading: Reading = {
        deviceId: device.deviceId,
        ownerId: device.ownerId || '',
        voltage: 220,
        current: dummyPower / 220,
        power: dummyPower,
        energy: 10,
        status: 0,
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 }
      };
      setLatestReading(mockReading);
      onReadingUpdate(device.deviceId, dummyPower);
      return () => {};
    }

    const unsubscribe = subscribeToLatestReading(device.deviceId, (reading) => {
      setLatestReading(reading);
      if (reading) {
        onReadingUpdate(device.deviceId, reading.power);
      }
    });
    return unsubscribe;
  }, [device.deviceId]);

  const isOnline = device.status === 'online';
  
  return (
      <TouchableOpacity 
          style={styles.deviceCard}
          onPress={() => router.push(`/device/${device.deviceId}`)}
          activeOpacity={0.7}
      >
          <View style={styles.deviceHeader}>
              <Text style={styles.deviceName} numberOfLines={1}>{device.name || 'Unnamed Device'}</Text>
              <BlinkingDot isOnline={isOnline} />
          </View>
          <View style={styles.deviceBody}>
              <FontAwesome5
                  name="bolt"
                  size={28}
                  color={isOnline ? "#FFCC00" : "#ccc"}
                  style={styles.deviceIcon}
              />
              <Text style={[styles.devicePower, !isOnline && styles.offlineText]}>
                  {isOnline && latestReading ? `${latestReading.power} W` : (isOnline ? '-- W' : 'Offline')}
              </Text>
          </View>
      </TouchableOpacity>
  );
}

export default function DashboardRoute() {
    const router = useRouter();
    const [devices, setDevices] = useState<DeviceDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [powerReadings, setPowerReadings] = useState<Record<string, number>>({});

    const ratePerKWh = 0.15; // static rate for now

    const [userAuth, setUserAuth] = useState<any>(auth.currentUser);

    // Scanner state
    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [isScannerMounted, setIsScannerMounted] = useState(false);
    const { height } = Dimensions.get('window');
    const sheetHeight = height * 0.6;
    const sheetAnim = useRef(new Animated.Value(sheetHeight)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    const [incomingSession, setIncomingSession] = useState<PairingSession | null>(null);

    useEffect(() => {
        const unsubscribe = subscribeToPairingSessions((session) => {
          setIncomingSession(session);
        });
        return unsubscribe;
    }, []);

    const handlePairingRequest = async (session: { deviceId: string; token: string; name: string }) => {
        try {
          await callPairDevice({
            deviceId: session.deviceId,
            token: session.token,
            name: session.name
          });
          closeScanner();
        } catch (err) {
          console.error('Pairing failed:', err);
        }
    };

    const openScanner = () => setIsScannerVisible(true);
    const closeScanner = () => setIsScannerVisible(false);

    useEffect(() => {
        if (isScannerVisible) {
            setIsScannerMounted(true);
            Animated.parallel([
                Animated.timing(sheetAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        } else if (isScannerMounted) {
            Animated.parallel([
                Animated.timing(sheetAnim, {
                    toValue: sheetHeight,
                    duration: 250,
                    useNativeDriver: true,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 0,
                    duration: 250,
                    useNativeDriver: true,
                })
            ]).start(() => setIsScannerMounted(false));
        }
    }, [isScannerVisible]);

    useEffect(() => {
        const unsubscribeAuth = auth.onAuthStateChanged((u) => {
            setUserAuth(u);
            if (!u) {
                setLoading(false);
            }
        });
        return unsubscribeAuth;
    }, []);

    useEffect(() => {
        if (!userAuth?.uid) return;

        const unsubscribe = subscribeToUserDevices(userAuth.uid, (fetchedDevices) => {
            const dummyDevices: DeviceDoc[] = [
                {
                    deviceId: 'dummy_1',
                    ownerId: userAuth.uid,
                    name: 'Living Room TV (DUMMY - REMOVE LATER)',
                    paired: true,
                    pairedAt: { seconds: Math.floor(Date.now() / 1000) },
                    status: 'online',
                    lastSeen: { seconds: Math.floor(Date.now() / 1000) }
                },
                {
                    deviceId: 'dummy_2',
                    ownerId: userAuth.uid,
                    name: 'Kitchen AC (DUMMY - REMOVE LATER)',
                    paired: true,
                    pairedAt: { seconds: Math.floor(Date.now() / 1000) },
                    status: 'online',
                    lastSeen: { seconds: Math.floor(Date.now() / 1000) }
                }
            ];

            setDevices([...fetchedDevices, ...dummyDevices]);
            setLoading(false);
        });

        return unsubscribe;
    }, [userAuth?.uid]);

    const handleReadingUpdate = useCallback((deviceId: string, power: number) => {
        setPowerReadings(prev => {
            if (prev[deviceId] === power) return prev;
            return { ...prev, [deviceId]: power };
        });
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 1000);
    };

    if (!userAuth) {
        return (
            <Layout>
                <View style={[styles.center, { padding: 30 }]}>
                    <FontAwesome5 name="user-lock" size={60} color="#ccc" style={{ marginBottom: 20 }} />
                    <Text style={styles.emptyTitle}>Not Logged In</Text>
                    <Text style={[styles.emptySubtitle, { marginBottom: 30 }]}>You need to be signed in to view your dashboard and devices.</Text>
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

    const netPower = devices.reduce((sum, d) => {
        if (d.status === 'online') {
            return sum + (powerReadings[d.deviceId] || 0);
        }
        return sum;
    }, 0);
    const pricePerHour = (netPower / 1000) * ratePerKWh;

    return (
        <Layout>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Rectangular Tile: Net Power & Approx Price */}
                <View style={styles.netPowerCard}>
                    <View style={styles.netPowerInfo}>
                        <Text style={styles.netPowerLabel}>Net Power Usage</Text>
                        <Text style={styles.netPowerValue}>{netPower} <Text style={styles.unitText}>W</Text></Text>
                    </View>
                    <View style={styles.dividerVertical} />
                    <View style={styles.netPowerInfo}>
                        <Text style={styles.netPowerLabel}>Approx. Cost</Text>
                        <Text style={styles.netPowerValue}>${pricePerHour.toFixed(3)} <Text style={styles.unitText}>/hr</Text></Text>
                    </View>
                </View>

                {/* Grid for ESP32 Tiles */}
                <Text style={styles.sectionTitle}>Paired Devices</Text>
                
                {devices.length === 0 ? (
                    <View style={styles.emptyState}>
                        <FontAwesome5 name="microchip" size={48} color="#ccc" />
                        <Text style={styles.emptyTitle}>No devices yet</Text>
                        <Text style={styles.emptySubtitle}>Tap + to add your first monitor.</Text>
                    </View>
                ) : (
                    <View style={styles.gridContainer}>
                        {devices.map(device => (
                            <DeviceCard 
                                key={device.deviceId} 
                                device={device} 
                                onReadingUpdate={handleReadingUpdate}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>

            <TouchableOpacity
              style={styles.fab}
              activeOpacity={0.8}
              onPress={openScanner}
            >
              <FontAwesome5 name="plus" size={24} color="#fff" />
            </TouchableOpacity>

            {/* Bottom Sheet */}
            {isScannerMounted && (
                <View style={styles.sheetOverlayContainer}>
                    <TouchableWithoutFeedback onPress={closeScanner}>
                        <Animated.View style={[styles.sheetBackdrop, { opacity: backdropAnim }]} />
                    </TouchableWithoutFeedback>
                    <Animated.View style={[styles.bottomSheet, { height: sheetHeight, transform: [{ translateY: sheetAnim }] }]}>
                        <TouchableOpacity style={styles.closeSheetBtn} onPress={closeScanner}>
                            <FontAwesome5 name="times" size={20} color="#666" />
                        </TouchableOpacity>
                        {Platform.OS === 'web' ? (
                            <WebScanner
                                incomingPairingSession={incomingSession}
                                onPairingRequest={handlePairingRequest}
                            />
                        ) : (
                            <MobileScanner
                                incomingPairingSession={incomingSession}
                                onPairingRequest={handlePairingRequest}
                            />
                        )}
                    </Animated.View>
                </View>
            )}
        </Layout>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    netPowerCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 30,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    netPowerInfo: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dividerVertical: {
        width: 1,
        backgroundColor: '#e5e5ea',
        marginHorizontal: 10,
    },
    netPowerLabel: {
        fontSize: 14,
        color: '#8e8e93',
        fontWeight: '600',
        marginBottom: 5,
        textTransform: 'uppercase',
    },
    netPowerValue: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1c1c1e',
    },
    unitText: {
        fontSize: 18,
        color: '#6c6c70',
        fontWeight: '500',
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#333',
        marginBottom: 15,
        marginLeft: 5,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 15,
    },
    deviceCard: {
        flexBasis: 150,
        flexGrow: 1,
        maxWidth: 250,
        aspectRatio: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        justifyContent: 'space-between',
    },
    deviceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    deviceName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#3a3a3c',
        flex: 1,
        marginRight: 10,
    },
    indicatorDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginTop: 4,
    },
    deviceBody: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
    },
    deviceIcon: {
        marginBottom: 10,
    },
    devicePower: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1c1c1e',
    },
    offlineText: {
        color: '#8e8e93',
        fontSize: 16,
        fontWeight: '500',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        marginTop: 40,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1c1c1e',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 16,
        color: '#8e8e93',
        textAlign: 'center',
    },
    fab: {
        position: 'absolute',
        bottom: 32,
        right: 32,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#007AFF', // Replaced Ionicons blue with Layout blue matching
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#007AFF',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
    },
    sheetOverlayContainer: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2000,
        elevation: 20,
    },
    sheetBackdrop: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    bottomSheet: {
        position: 'absolute',
        bottom: 0, 
        alignSelf: 'center',
        width: '90%',
        maxWidth: 500,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -5 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 25,
        overflow: 'hidden',
    },
    closeSheetBtn: {
        position: 'absolute',
        top: 15,
        right: 20,
        zIndex: 10,
        padding: 10,
    },
    primaryButton: { 
        backgroundColor: '#007AFF', 
        paddingVertical: 14, 
        paddingHorizontal: 32, 
        borderRadius: 10, 
        alignItems: 'center',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    primaryButtonText: { 
        color: '#ffffff', 
        fontSize: 16, 
        fontWeight: 'bold' 
    },
});

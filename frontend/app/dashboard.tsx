import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions, Animated, ActivityIndicator, TouchableOpacity } from 'react-native';
import Layout from '../src/components/Layout';
import { router } from 'expo-router';
import { auth } from '../src/config/firebase';
import { User } from 'firebase/auth';
import { FontAwesome5 } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isWeb = width > 700;
const ratePerKWh = 0.15; // approx rate $0.15 per kWh

type ESPDevice = {
    id: string;
    name: string;
    isOnline: boolean;
    power: number; // in Watts
};

const BlinkingDot = ({ isOnline }: { isOnline: boolean }) => {
    const fadeAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isOnline) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(fadeAnim, { toValue: 0.1, duration: 600, useNativeDriver: true }),
                    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true })
                ])
            ).start();
        } else {
            fadeAnim.setValue(1);
        }
    }, [isOnline]);

    return (
        <Animated.View style={[
            styles.indicatorDot,
            { backgroundColor: isOnline ? '#ff3b30' : '#8e8e93', opacity: fadeAnim }
        ]} />
    );
};

export default function Dashboard() {
    const [refreshing, setRefreshing] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    // Mock devices paired to the user's account
    const [devices, setDevices] = useState<ESPDevice[]>([
        { id: '1', name: 'Bedroom', isOnline: true, power: 120 },
        { id: '2', name: 'Kitchen', isOnline: false, power: 0 },
        { id: '3', name: 'Living Room', isOnline: true, power: 250 },
        { id: '4', name: 'Garage', isOnline: true, power: 45 },
    ]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return unsubscribe;
    }, []);

    const fetchMockData = () => {
        setTimeout(() => {
            // Randomize power slightly for online devices to simulate live data
            setDevices(prev => prev.map(d =>
                d.isOnline ? { ...d, power: Math.floor(d.power * (0.9 + Math.random() * 0.2)) } : d
            ));
            setRefreshing(false);
        }, 800);
    };

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchMockData();
    }, []);

    if (authLoading) {
        return (
            <Layout>
                <View style={[styles.container, styles.centered]}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            </Layout>
        );
    }

    if (!user) {
        return (
            <Layout>
                <View style={[styles.container, styles.centered]}>
                    <Text style={styles.errorTitle}>Access Denied</Text>
                    <Text style={styles.errorMessage}>Please log in to view the dashboard.</Text>
                    <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/auth')}>
                        <Text style={styles.loginButtonText}>Go to Login</Text>
                    </TouchableOpacity>
                </View>
            </Layout>
        );
    }

    const netPower = devices.reduce((sum, d) => sum + (d.isOnline ? d.power : 0), 0);
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
                <View style={styles.gridContainer}>
                    {devices.map(device => (
                        <View key={device.id} style={styles.deviceCard}>
                            <View style={styles.deviceHeader}>
                                <Text style={styles.deviceName} numberOfLines={1}>{device.name}</Text>
                                <BlinkingDot isOnline={device.isOnline} />
                            </View>
                            <View style={styles.deviceBody}>
                                <FontAwesome5
                                    name="bolt"
                                    size={28}
                                    color={device.isOnline ? "#FFCC00" : "#ccc"}
                                    style={styles.deviceIcon}
                                />
                                <Text style={[styles.devicePower, !device.isOnline && styles.offlineText]}>
                                    {device.isOnline ? `${device.power} W` : 'Offline'}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </Layout>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
    },
    errorMessage: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 30,
    },
    loginButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 10,
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
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
        justifyContent: 'space-between',
    },
    deviceCard: {
        width: '48%', // Square-ish aspect ratio handled by padding and layout
        aspectRatio: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 15,
        marginBottom: 15,
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
});

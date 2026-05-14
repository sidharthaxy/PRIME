import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Layout from '../src/components/Layout';

export default function Subscription() {
    return (
        <Layout>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Upgrade Your Plan</Text>
                <Text style={styles.subtitle}>Unlock advanced energy insights and connect more ESP32 devices.</Text>

                {/* Free Tier */}
                <View style={[styles.card, styles.currentPlan]}>
                    <Text style={styles.planName}>Basic Guard</Text>
                    <Text style={styles.planPrice}>₹ 0 <Text style={styles.perMonth}>/ month</Text></Text>
                    <Text style={styles.feature}>✔️ Support up to 3 Devices</Text>
                    <Text style={styles.feature}>✔️ Basic consumption stats</Text>
                    <Text style={styles.feature}>❌ No AI Predictor</Text>
                    <TouchableOpacity style={styles.currentButton} disabled>
                        <Text style={styles.currentButtonText}>Current Plan</Text>
                    </TouchableOpacity>
                </View>

                {/* Pro Tier */}
                <View style={[styles.card, styles.proPlan]}>
                    <View style={styles.popularBadge}>
                        <Text style={styles.popularText}>MOST POPULAR</Text>
                    </View>
                    <Text style={[styles.planName, styles.proText]}>Pro Guard</Text>
                    <Text style={[styles.planPrice, styles.proText]}>₹ 149 <Text style={[styles.perMonth, styles.proText]}>/ month</Text></Text>
                    <Text style={[styles.feature, styles.proText]}>✔️ Support up to 10 Devices</Text>
                    <Text style={[styles.feature, styles.proText]}>✔️ Advanced AI Bill Predictor</Text>
                    <Text style={[styles.feature, styles.proText]}>✔️ Priority notification alerts</Text>
                    <TouchableOpacity style={styles.upgradeButton}>
                        <Text style={styles.upgradeButtonText}>Upgrade Now</Text>
                    </TouchableOpacity>
                </View>

                {/* Elite Tier */}
                <View style={styles.card}>
                    <Text style={styles.planName}>Elite Guard</Text>
                    <Text style={styles.planPrice}>₹ 299 <Text style={styles.perMonth}>/ month</Text></Text>
                    <Text style={styles.feature}>✔️ Unlimited Devices</Text>
                    <Text style={styles.feature}>✔️ Complete Analytics History</Text>
                    <Text style={styles.feature}>✔️ Automated power shut-off</Text>
                    <TouchableOpacity style={styles.upgradeOutlineButton}>
                        <Text style={styles.upgradeOutlineText}>Upgrade Now</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </Layout>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20, backgroundColor: '#f5f5f5', flexGrow: 1, paddingBottom: 50 },
    header: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    subtitle: { fontSize: 15, color: '#666', marginBottom: 25, lineHeight: 22 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#eee',
    },
    currentPlan: { borderColor: '#d1d1d6', backgroundColor: '#f9f9f9' },
    proPlan: { borderColor: '#007AFF', backgroundColor: '#007AFF', transform: [{ scale: 1.02 }] },
    planName: { fontSize: 20, fontWeight: 'bold', color: '#444', marginBottom: 10 },
    planPrice: { fontSize: 32, fontWeight: 'bold', color: '#111', marginBottom: 15 },
    perMonth: { fontSize: 16, color: '#888', fontWeight: 'normal' },
    proText: { color: '#fff' },
    feature: { fontSize: 15, color: '#555', marginBottom: 8 },
    currentButton: {
        marginTop: 15,
        backgroundColor: '#e5e5ea',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    currentButtonText: { color: '#8e8e93', fontWeight: 'bold', fontSize: 16 },
    upgradeButton: {
        marginTop: 15,
        backgroundColor: '#fff',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    upgradeButtonText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 },
    upgradeOutlineButton: {
        marginTop: 15,
        borderWidth: 2,
        borderColor: '#007AFF',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    upgradeOutlineText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16 },
    popularBadge: {
        position: 'absolute',
        top: -12,
        right: 20,
        backgroundColor: '#FF9500',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    popularText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
});

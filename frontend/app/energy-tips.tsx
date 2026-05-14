import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Layout from '../src/components/Layout';

export default function EnergyTips() {
    return (
        <Layout>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Energy Saving Tips</Text>
                
                <Text style={styles.subtitle}>
                    Small changes can make a big difference in your monthly bill. Check out these AI-curated tips.
                </Text>

                <View style={styles.tipCard}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>❄️</Text>
                    </View>
                    <View style={styles.tipContent}>
                        <Text style={styles.tipTitle}>Optimize AC Temperature</Text>
                        <Text style={styles.tipDescription}>
                            Setting your AC to 24°C instead of 18°C can reduce cooling costs by up to <Text style={styles.highlight}>15%</Text>.
                        </Text>
                    </View>
                </View>

                <View style={styles.tipCard}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>🔌</Text>
                    </View>
                    <View style={styles.tipContent}>
                        <Text style={styles.tipTitle}>Unplug Vampire Devices</Text>
                        <Text style={styles.tipDescription}>
                            Appliances on standby can account for <Text style={styles.highlight}>10%</Text> of your total electricity usage. Unplug when not in use!
                        </Text>
                    </View>
                </View>

                <View style={styles.tipCard}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>🌙</Text>
                    </View>
                    <View style={styles.tipContent}>
                        <Text style={styles.tipTitle}>Shift to Off-Peak</Text>
                        <Text style={styles.tipDescription}>
                            Run heavy appliances like washing machines between <Text style={styles.highlight}>11 PM and 6 AM</Text> if your provider offers off-peak rates.
                        </Text>
                    </View>
                </View>

                <View style={styles.tipCard}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.icon}>💡</Text>
                    </View>
                    <View style={styles.tipContent}>
                        <Text style={styles.tipTitle}>Upgrade to LEDs</Text>
                        <Text style={styles.tipDescription}>
                            Swapping old bulbs for LEDs can save you up to <Text style={styles.highlight}>₹500 yearly</Text> per bulb.
                        </Text>
                    </View>
                </View>
                
                <View style={styles.insightBox}>
                    <Text style={styles.insightTitle}>📈 Personalized Insight</Text>
                    <Text style={styles.insightText}>
                        Your Living Room ESP32 monitor indicates that your TV is often left on standby overnight. Turning it off fully could save you ₹120 this month.
                    </Text>
                </View>

            </ScrollView>
        </Layout>
    );
}

const styles = StyleSheet.create({
    container: { 
        padding: 20, 
        backgroundColor: '#f5f5f5', 
        paddingBottom: 50,
        flexGrow: 1
    },
    header: { 
        fontSize: 28, 
        fontWeight: 'bold', 
        marginBottom: 8, 
        color: '#333' 
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
        lineHeight: 22,
    },
    tipCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        alignItems: 'center'
    },
    iconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#e6f2ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    icon: {
        fontSize: 24,
    },
    tipContent: {
        flex: 1,
    },
    tipTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    tipDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    highlight: {
        fontWeight: 'bold',
        color: '#007AFF',
    },
    insightBox: {
        marginTop: 10,
        backgroundColor: '#e8f5e9',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#c8e6c9',
    },
    insightTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2e7d32',
        marginBottom: 8,
    },
    insightText: {
        fontSize: 15,
        color: '#1b5e20',
        lineHeight: 22,
    }
});

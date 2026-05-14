import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Layout from '../src/components/Layout';

export default function ConsumptionLog() {
    const logs = [
        { id: '1', date: 'Today, 8:00 AM', device: 'Living Room', usage: '2.5', cost: '20.00' },
        { id: '2', date: 'Yesterday, 9:30 PM', device: 'Living Room', usage: '1.2', cost: '9.60' },
        { id: '3', date: 'Yesterday, 8:00 PM', device: 'Living Room', usage: '0.5', cost: '4.00' },
        { id: '4', date: 'Oct 14, 10:00 AM', device: 'Living Room', usage: '4.5', cost: '36.00' },
        { id: '5', date: 'Oct 13, 2:00 PM', device: 'Living Room', usage: '0.8', cost: '6.40' },
    ];

    return (
        <Layout>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Consumption Log</Text>
                <Text style={styles.subtitle}>Recent device activity and estimated energy usage.</Text>

                <View style={styles.logContainer}>
                    {logs.map((log) => (
                        <View key={log.id} style={styles.logItem}>
                            <View style={styles.logDetails}>
                                <Text style={styles.logDevice}>{log.device}</Text>
                                <Text style={styles.logDate}>{log.date}</Text>
                            </View>
                            <View style={styles.logMetrics}>
                                <Text style={styles.logUsage}>{log.usage} kWh</Text>
                                <Text style={styles.logCost}>₹ {log.cost}</Text>
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
        padding: 20, 
        backgroundColor: '#f5f5f5', 
        flexGrow: 1, 
        paddingBottom: 50 
    },
    header: { 
        fontSize: 28, 
        fontWeight: 'bold', 
        color: '#333', 
        marginBottom: 8 
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
        marginBottom: 20,
    },
    logContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
    },
    logItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    logDetails: {
        flex: 1,
    },
    logDevice: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#444',
        marginBottom: 4,
    },
    logDate: {
        fontSize: 13,
        color: '#888',
    },
    logMetrics: {
        alignItems: 'flex-end',
    },
    logUsage: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#007AFF',
        marginBottom: 4,
    },
    logCost: {
        fontSize: 14,
        color: '#555',
        fontWeight: '500',
    }
});

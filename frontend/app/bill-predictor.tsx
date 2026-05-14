import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import Layout from '../src/components/Layout';

export default function BillPredictor() {
    const [unitPrice, setUnitPrice] = useState('8');
    const mockConsumptionKWh = 340; // Static dummy data for prediction

    const numericPrice = parseFloat(unitPrice) || 0;
    const predictedBill = (numericPrice * mockConsumptionKWh).toFixed(2);

    return (
        <Layout>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Bill Predictor</Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current Tariff Settings</Text>
                    <Text style={styles.label}>Enter your per-unit cost (₹/kWh):</Text>
                    <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={unitPrice}
                        onChangeText={setUnitPrice}
                        placeholder="e.g. 8"
                        placeholderTextColor="#999"
                    />
                </View>

                <View style={[styles.card, styles.predictionCard]}>
                    <Text style={styles.predictionLabel}>Estimated Bill for this Month</Text>
                    <Text style={styles.predictionValue}>₹ {predictedBill}</Text>
                    <Text style={styles.predictionSubtext}>
                        Based on your projected usage of <Text style={styles.highlight}>{mockConsumptionKWh} kWh</Text>
                    </Text>
                </View>

                <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                        💡 Keep your usage below 400 kWh to stay in the standard tariff tier and avoid premium charges!
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
        marginBottom: 20, 
        color: '#333' 
    },
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
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#444',
        marginBottom: 15,
    },
    label: {
        fontSize: 15,
        color: '#666',
        marginBottom: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 15,
        fontSize: 16,
        color: '#333',
        backgroundColor: '#fafafa',
    },
    predictionCard: {
        backgroundColor: '#007AFF', // Vibrant blue for emphasis
        alignItems: 'center',
        paddingVertical: 30,
    },
    predictionLabel: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 16,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    predictionValue: {
        color: '#fff',
        fontSize: 48,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    predictionSubtext: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 15,
    },
    highlight: {
        fontWeight: 'bold',
        color: '#fff',
    },
    infoBox: {
        backgroundColor: '#fff3cd',
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ffe69c',
    },
    infoText: {
        color: '#856404',
        fontSize: 15,
        lineHeight: 22,
    }
});

import React from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import Layout from '../src/components/Layout';

const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
        borderRadius: 16
    },
    propsForDots: {
        r: '4',
        strokeWidth: '2',
        stroke: '#007AFF'
    }
};

export default function Analytics() {
    const { width: screenWidth } = useWindowDimensions();
    
    return (
        <Layout>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Energy Analytics</Text>

                {/* Total Energy Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Total Home Energy Spent</Text>
                    <Text style={styles.insightText}>
                        Your home consumed <Text style={styles.highlight}>340 kWh</Text> this month.
                        That's 12% lower than last month!
                    </Text>
                    <LineChart
                        data={{
                            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                            datasets: [{ data: [65, 78, 82, 115] }]
                        }}
                        width={screenWidth - 40}
                        height={220}
                        yAxisLabel=""
                        yAxisSuffix="k"
                        chartConfig={chartConfig}
                        bezier
                        style={styles.chart}
                    />
                </View>

                {/* Single Room Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Living Room (ESP32 Monitor)</Text>
                    <Text style={styles.insightText}>
                        The Living Room accounted for <Text style={styles.highlight}>22%</Text> of your total energy.
                        Your AC was the highest consumer.
                    </Text>
                    <BarChart
                        data={{
                            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                            datasets: [{ data: [2.5, 3.8, 3.2, 4.0, 5.1, 8.2, 7.5] }]
                        }}
                        width={screenWidth - 40}
                        height={220}
                        yAxisLabel=""
                        yAxisSuffix="kW"
                        chartConfig={{
                            ...chartConfig,
                            color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
                        }}
                        style={styles.chart}
                    />
                </View>

                <View style={[styles.section, styles.summaryBox]}>
                    <Text style={styles.summaryTitle}>AI Insight</Text>
                    <Text style={styles.summaryText}>
                        You can save up to ₹450 this month by turning off the Living Room AC during off-peak hours (2 PM - 4 PM).
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
    },
    header: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 20,
        color: '#333',
    },
    section: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 15,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#444',
        marginBottom: 8,
    },
    insightText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 15,
        lineHeight: 20,
    },
    highlight: {
        fontWeight: 'bold',
        color: '#007AFF',
    },
    chart: {
        marginVertical: 8,
        borderRadius: 16,
    },
    summaryBox: {
        backgroundColor: '#e6f2ff',
        borderColor: '#007AFF',
        borderWidth: 1,
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#007AFF',
        marginBottom: 8,
    },
    summaryText: {
        fontSize: 15,
        color: '#444',
        lineHeight: 22,
    }
});

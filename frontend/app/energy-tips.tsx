import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Layout from '../src/components/Layout';

export default function EnergyTips() {
    return (
        <Layout>
            <View style={styles.container}>
                <Text style={styles.text}>Coming Soon</Text>
            </View>
        </Layout>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
    text: { color: 'white', fontSize: 24, fontWeight: 'bold' }
});

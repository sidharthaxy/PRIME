import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MobileScanner from '../src/components/MobileScanner';
import WebScanner from '../src/components/WebScanner';

export default function PairRoute() {
  const router = useRouter();

  const handleProvisioningComplete = (deviceId: string) => {
    // BLE provisioning succeeded — device is now connecting to WiFi + MQTT.
    // Navigate to dashboard or show a post-pairing configuration screen.
    console.log('Device provisioned with ID:', deviceId);
    router.replace('/dashboard');
  };

  const ScannerComponent = Platform.OS === 'web' ? WebScanner : MobileScanner;

  return (
    <View style={styles.container}>
      <ScannerComponent
        onProvisioningComplete={handleProvisioningComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff'
  }
});

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MobileScanner from '../src/components/MobileScanner';
import WebScanner from '../src/components/WebScanner';
import { callPairDevice, PairingSession } from '../src/config/firebase';
import { subscribeToPairingSessions } from '../src/services/devices';

export default function PairRoute() {
  const router = useRouter();
  const [incomingSession, setIncomingSession] = React.useState<PairingSession | null>(null);

  React.useEffect(() => {
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
      router.replace('/dashboard');
    } catch (err) {
      console.error('Pairing failed:', err);
      // Could show an alert here
    }
  };

  const ScannerComponent = Platform.OS === 'web' ? WebScanner : MobileScanner;

  return (
    <View style={styles.container}>
      <ScannerComponent 
        incomingPairingSession={incomingSession}
        onPairingRequest={handlePairingRequest}
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

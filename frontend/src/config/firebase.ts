import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator, initializeAuth, Auth } from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Optionally import the services that you want to use
// import { getAnalytics } from "firebase/analytics";
// import { getFunctions } from 'firebase/functions';

export interface Reading {
  deviceId: string;
  ownerId: string;
  voltage: number;
  current: number;
  power: number;
  energy: number;
  status: 0 | 1 | 2;
  timestamp: { seconds: number; nanoseconds: number };
}

export interface DeviceDoc {
  deviceId: string;
  ownerId: string | null;
  name: string;
  paired: boolean;
  pairedAt: { seconds: number };
  status: 'online' | 'offline';
  lastSeen: { seconds: number };
}

export interface PairingSession {
  deviceId: string;
  token: string;
  name: string;
  expiresAt: { seconds: number };
  claimed: boolean;
}

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:1234567890:web:abc123def456",
};

// Initialize Firebase
let app;
let auth: Auth;

if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    if (Platform.OS === 'web') {
        auth = getAuth(app);
    } else {
        auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage)
        });
    }
} else {
    app = getApp();
    auth = getAuth(app);
}

const db = getFirestore(app);

// Connect to emulators if in development
if (__DEV__) {
    // Adjust host for Android emulator (10.0.2.2) vs Web/iOS (127.0.0.1)
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

    // Prevent re-connecting if it's already connected during Hot Reloads
    if (!auth.emulatorConfig) {
        connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    }

    try {
        connectFirestoreEmulator(db, host, 8080);
        console.log(`Connected to Firebase Emulators on ${host}`);
    } catch (e) {
        // Ignore error if already connected
    }
}

export { auth, db };

import { getFunctions, httpsCallable } from 'firebase/functions';
const functions = getFunctions(app);

export const callPairDevice = httpsCallable<
  { deviceId: string; token: string; name: string },
  { success: boolean; device: { deviceId: string; name: string } }
>(functions, 'pairDevice');

export const callUnpairDevice = httpsCallable<
  { deviceId: string },
  { success: boolean }
>(functions, 'unpairDevice');

export const callVerifyDeviceOwner = httpsCallable<
  { deviceId: string },
  { isOwner: boolean }
>(functions, 'verifyDeviceOwner');

export const callGetDeviceReadings = httpsCallable<
  { deviceId: string; limit?: number; fromTimestamp?: number; toTimestamp?: number },
  { readings: Reading[] }
>(functions, 'getDeviceReadings');

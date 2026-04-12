import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator, initializeAuth, Auth } from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Reading {
  deviceId: string;
  ownerId: string;
  voltage: number;
  current: number;
  power: number;
  energy: number;
  tripped: boolean;
  timestamp: { seconds: number; nanoseconds: number };
}

export interface DeviceDoc {
  deviceId: string;
  ownerId: string | null;
  name: string;
  paired: boolean;
  tripped: boolean;
  /** 'auto' = 20s sustained overpower | 'manual' = remote force-off | 'none' = ok */
  tripReason: 'auto' | 'manual' | 'none';
  tripWatts: number;
  safeWatts: number;
  /** Whether a PIN has been configured for remote force-off */
  pinHash?: string;
  pairedAt: { seconds: number };
  status: 'online' | 'offline';
  lastSeen: { seconds: number };
}

/** Live snapshot from Firebase RTDB — updated every 500ms from MQTT */
export interface LiveReading {
  power: number;
  tripped: boolean;
  /** 'auto' | 'manual' | 'none' */
  tripReason: 'auto' | 'manual' | 'none';
  energy: number;
  updatedAt: number;
}

// ── Firebase Config ───────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || "demo-api-key",
    authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || "demo-project.firebaseapp.com",
    projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || "demo-project",
    storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || "demo-project.appspot.com",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
    appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || "1:1234567890:web:abc123def456",
    databaseURL:       process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL       || "https://demo-project-default-rtdb.firebaseio.com",
};

// ── Initialize Firebase ───────────────────────────────────────────────────────

let app: any;
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

const db        = getFirestore(app);
const rtdb      = getDatabase(app);   // Firebase Realtime Database
const functions = getFunctions(app);

// ── Connect to emulators in development ──────────────────────────────────────

if (__DEV__) {
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

    if (!auth.emulatorConfig) {
        connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    }

    try {
        connectFirestoreEmulator(db, host, 8080);
        connectDatabaseEmulator(rtdb, host, 9000);
        connectFunctionsEmulator(functions, host, 5001);
        console.log(`Connected to Firebase Emulators on ${host}`);
    } catch (e) {
        // Ignore error if already connected
    }
}

export { auth, db, rtdb };

// ── Cloud Function Callables ──────────────────────────────────────────────────

/** Pair a device. No token needed — deviceId is read from BLE characteristic. */
export const callPairDevice = httpsCallable<
  { deviceId: string; name: string; tripWatts: number; safeWatts: number },
  { success: boolean; device: { deviceId: string; name: string } }
>(functions, 'pairDevice');

/** Unlink (un-pair) a device from the current user's account. */
export const callUnpairDevice = httpsCallable<
  { deviceId: string },
  { success: boolean }
>(functions, 'unpairDevice');

/** Update device display name and threshold settings. */
export const callUpdateDeviceConfig = httpsCallable<
  { deviceId: string; name?: string; tripWatts?: number; safeWatts?: number },
  { success: boolean }
>(functions, 'updateDeviceConfig');

/** Check if the current user owns a device. */
export const callVerifyDeviceOwner = httpsCallable<
  { deviceId: string },
  { isOwner: boolean }
>(functions, 'verifyDeviceOwner');

/** Fetch historical readings for a device. */
export const callGetDeviceReadings = httpsCallable<
  { deviceId: string; limit?: number; fromTimestamp?: number; toTimestamp?: number },
  { readings: Reading[] }
>(functions, 'getDeviceReadings');

/** Save the Expo/FCM push token for the current user to enable push notifications. */
export const callSaveFCMToken = httpsCallable<
  { fcmToken: string },
  { success: boolean }
>(functions, 'saveFCMToken');

/** Set (or update) the 4-8 digit PIN for remote force-off on a device. */
export const callSetDevicePin = httpsCallable<
  { deviceId: string; pin: string },
  { success: boolean }
>(functions, 'setDevicePin');

/**
 * Remotely control a device's relay.
 * action='trip'    → force-off (PIN required)
 * action='restore' → turn circuit back on (no PIN — but show warning for auto-trip)
 */
export const callControlDevice = httpsCallable<
  { deviceId: string; action: 'trip' | 'restore'; pin?: string },
  { success: boolean }
>(functions, 'controlDevice');

# Backend: Cloud Infrastructure & MQTT Bridge

The PRIME backend is a serverless architecture built on **Firebase**, serving as the central nervous system for the Smart Home Energy Guardian. It bridges real-time IoT data from MQTT brokers to a persistent database and provides a secure API for the mobile application.

## 🏗 System Architecture

### 1. The MQTT Bridge (`mqttWorker`)
A long-running Cloud Function that maintains a secure connection to the **HiveMQ Cloud** broker. 
- **Subscriptions**: Listens to `devices/+/data` (telemetry), `devices/+/status` (LWT), and `devices/unlink` (factory reset).
- **Dual-Database Write**:
    - **Firestore**: Stores historical readings for long-term analytics.
    - **Realtime Database (RTDB)**: Stores a "Live" snapshot of each device for instantaneous frontend updates (sub-second latency).

### 2. Security & Control Logic
- **PIN Hashing**: User-defined PINs for remote shut-off are hashed using **SHA-256** before storage. The backend never sees or stores plaintext PINs.
- **Remote Control**: The `controlDevice` function verifies ownership and PINs before publishing a "trip" or "restore" command back to the ESP32 via MQTT.

### 3. Notification System
Integrated with **Firebase Cloud Messaging (FCM)** to send critical alerts:
- **Auto-Trip Alerts**: Sent when the device detects an overload and shuts off.
- **Power Warnings**: Proactive warnings when consumption exceeds a "Safe Watts" threshold for a sustained period.
- **Throttling**: RTDB flags are used to prevent notification spam (e.g., max 1 warning per 5 minutes).

## 📊 Database Schema

### Firestore Collections
- `users`: User profiles, linked devices, and FCM tokens.
- `devices`: Metadata (name, thresholds), ownership info, and current trip status.
- `readings`: Massive historical collection of power/energy data used for charts and billing logs.

### Realtime Database (RTDB)
- `devices/<deviceId>/live`: The "Hot" path containing live `power`, `energy`, `tripped`, and `online` status.

## 🛠 Cloud Functions (API)
- `pairDevice`: Securely links an ESP32 to a user account using the hardware-fused MAC ID.
- `controlDevice`: Remote relay control with PIN verification.
- `calculateBillForecast`: Predictive algorithm to estimate monthly electricity bills based on current usage trends.
- `getDeviceReadings`: Optimized query engine for historical analytics.

## 🚀 Deployment
1. Ensure `firebase-tools` is installed.
2. Configure `.env` with HiveMQ credentials.
3. Run `firebase deploy --only functions,firestore,database`.

# Frontend: Smart Energy Guardian App

The PRIME Frontend is a cross-platform mobile application built with **React Native** and **Expo**. It provides users with a high-fidelity dashboard to monitor energy consumption, control circuits remotely, and receive safety alerts.

## 📱 Application Architecture

### 1. Navigation & Routing
Uses **Expo Router** (File-based routing) for a native-feeling navigation experience:
- `/dashboard`: Real-time power monitoring with gauge visualizations.
- `/analytics`: Interactive charts powered by `react-native-chart-kit`.
- `/bill-predictor`: AI-driven cost estimations and usage forecasting.
- `/pair`: Guided device setup using **Bluetooth Low Energy (BLE)**.
- `/device/[id]`: Detailed configuration for specific energy monitors.

### 2. Real-time Synchronization
The app employs a "Hybrid Sync" strategy:
- **RTDB Listeners**: Subscribes to the Firebase Realtime Database for live "Power" and "Status" updates, ensuring the dashboard reflects the hardware state in <100ms.
- **Firestore Queries**: Fetches historical data and user preferences on-demand.
- **Firebase Auth**: Secure authentication via Email/Password and social providers.

### 3. Device Pairing Flow (BLE)
Integrates `react-native-ble-plx` for hardware interaction:
1. Scans for ESP32 devices in "PRIME-Setup" mode.
2. Connects to the hardware BLE service.
3. Reads the unique **Device ID** from the hardware.
4. Writes WiFi credentials (SSID/Pass) to the ESP32.
5. Calls the backend `pairDevice` API to finalize ownership.

## 🎨 UI/UX Features
- **Glassmorphic Design**: Modern, translucent UI components for a premium feel.
- **Dynamic Gauges**: Visual representation of real-time power draw.
- **Push Notifications**: Integrated with `expo-notifications` for critical trip alerts and threshold warnings.
- **PWA Support**: Fully optimized for web deployment via Vercel or Expo Web.

## 🛠 Tech Stack
- **Framework**: Expo (SDK 54) / React Native
- **State Management**: React Hooks + Firebase Live Listeners
- **Charts**: `react-native-chart-kit`
- **Styling**: `react-native-stylesheet` with custom design tokens.

## 🚀 Local Development
1. `cd frontend`
2. `npm install`
3. `npx expo start`
4. Use the **Expo Go** app to test on physical devices (recommended for BLE features).

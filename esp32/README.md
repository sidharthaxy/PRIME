# ESP32 Firmware: Smart Energy Guardian (PRIME)

This folder contains the source code for the ESP32-based energy monitoring hardware. The device measures real-time voltage and current, calculates power consumption, and provides circuit protection features.

## 🛠 Hardware Architecture

### Components & Pin Mapping
- **Microcontroller**: ESP32 (WROOM-32)
- **Sensors**: 
    - **Current Sensor**: Pin 34 (Analog)
    - **Voltage Sensor**: Pin 35 (Analog)
- **Actuators**:
    - **Relay**: Pin 26 (Controls the main power line)
    - **Buzzer**: Pin 27 (Audible alerts during trips/warnings)
- **Indicators**:
    - **Normal LED (Green)**: Pin 25
    - **Warning LED (Yellow)**: Pin 33
    - **Trip LED (Red)**: Pin 32
- **Input**:
    - **Pairing/Reset Button**: Pin 19 (Long press for 3s to factory reset)

## 📡 Connectivity & Provisioning

The firmware supports **Dual-Stack Provisioning** to ensure easy setup:
1. **BLE Provisioning**: Uses a custom BLE service with 128-bit UUIDs to receive WiFi credentials and expose the unique Device ID.
2. **WiFiManager Portal**: Spawns an Access Point named `PRIME-Setup` if no WiFi is configured, allowing users to connect and provide credentials via a captive portal.

### Communication Protocols
- **MQTT**: Connects to HiveMQ Cloud over a secure TLS connection (Port 8883).
- **JSON**: All telemetry and commands are exchanged as lightweight JSON payloads.

## ⚙️ Core Logic

### 1. Measurement System
The firmware implements an **Inverted RMS Calculation** for both voltage and current. It samples the analog pins at high frequency, applies a DC offset correction, and computes the Root Mean Square (RMS) to accurately determine:
- **Voltage (V)**
- **Current (I)**
- **Power (P = V * I)**
- **Energy (kWh)**: Cumulative consumption tracked over time.

### 2. Protection Engine (Auto-Trip)
The device monitors power consumption in real-time. If the power exceeds the **2kW limit** (configurable) for more than **20 seconds** (Sustain Time):
- The relay is automatically opened (Power OFF).
- The buzzer sounds 5 times.
- A "tripped" status is published to the cloud.
- The device enters a "Trip" state until a remote "restore" command is received.

### 3. Telemetry & Control
- **Publish Interval**: Telemetry is sent every 500ms to `devices/<deviceId>/data`.
- **Command Subscription**: Listens on `devices/<deviceId>/cmd` for:
    - `trip`: Remote manual shut-off.
    - `restore`: Remote circuit restoration.

## 🚀 Setup & Flashing
1. Install **Arduino IDE** with ESP32 board support.
2. Libraries required: `PubSubClient`, `ArduinoJson`, `WiFiManager`, `Preferences`.
3. Update the `MQTT_HOST`, `MQTT_USER`, and `MQTT_PASS` if using a private broker.
4. Flash the code to the ESP32.
5. Use the pairing button (Pin 19) to enter provisioning mode if needed.

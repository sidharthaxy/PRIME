/**
 * mqtt-bridge.js — Local MQTT → Firebase Emulator bridge
 *
 * Architecture:
 *   ESP32 → HiveMQ Cloud (remote) → [this script] → Local Firebase Emulators
 *                                                        ├─ RTDB  :9000  (live power)
 *                                                        └─ Firestore :8080 (readings + devices)
 *
 * Run in a second terminal (while firebase emulators:start is running):
 *   node mqtt-bridge.js
 *
 * The controlDevice emulated function handles publishing commands back to HiveMQ.
 * That direction is handled by functions/.env.local (MQTT credentials injected there).
 */

// ── Must be set BEFORE admin.initializeApp() ──────────────────────────────────
require('dotenv').config();
const admin = require("./functions/node_modules/firebase-admin");
const mqtt = require("./functions/node_modules/mqtt");

// Set Emulator Environment Variables from .env
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.DB_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST = process.env.FS_EMULATOR_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.AUTH_EMULATOR_HOST;

const PROJECT_ID = process.env.PROJECT_ID;

// Initialize Firebase
admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

const rtdb = admin.database();
const db = admin.firestore();

// Connect to HiveMQ Cloud
const client = mqtt.connect({
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT) || 8883,
  protocol: "mqtts",
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  
  // HiveMQ Cloud specific TLS settings
  rejectUnauthorized: false, // Prevents certificate chain errors
  ALPNProtocols: ['mqtt'],    // Helps bypass some network firewalls
  
  // Connection management
  reconnectPeriod: 2000,
  connectTimeout: 30 * 1000,
  clean: true
});
client.on("connect", () => {
  console.log("✅ Bridge Online: HiveMQ ↔️ Firebase Emulator");
  client.subscribe(["devices/+/data", "devices/+/status", "devices/unlink"]);
});
client.on("error", (err) => {
  console.error("❌ Connection Error:", err.message);
});

client.on("close", () => {
  console.log("📡 MQTT Connection Closed (Retrying...)");
});

// This will trigger if the credentials are wrong
client.on("packetsend", (packet) => {
  if (packet.cmd === 'connect') console.log("📤 Sending connection packet to HiveMQ...");
});
client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const deviceId = payload.deviceId || topic.split('/')[1];

    if (topic.endsWith("/data")) {
      // 1. Live Update (RTDB)
      await rtdb.ref(`devices/${deviceId}/live`).set({
        ...payload,
        updatedAt: Date.now()
      });

      // 2. Historical Log (Firestore)
      await db.collection("readings").add({
        deviceId,
        ...payload,
        timestamp: admin.firestore.Timestamp.now()
      });

      // 3. Update Device Status to Online
      await db.collection("devices").doc(deviceId).update({
        status: 'online',
        lastSeen: admin.firestore.Timestamp.now()
      });

      console.log(`📡 [${deviceId.slice(-6)}] Power: ${payload.power}W | Tripped: ${payload.tripped}`);
    }
  } catch (err) {
    console.error("❌ Processing Error:", err.message);
  }
});
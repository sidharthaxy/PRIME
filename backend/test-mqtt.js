require('dotenv').config();
const mqtt = require('./functions/node_modules/mqtt'); // Assumes mqtt is installed in functions folder as in bridge.js

const DEVICE_ID = "MOCK_ESP32_123";

console.log(`📡 Connecting to MQTT broker at ${process.env.MQTT_HOST}...`);

const client = mqtt.connect({
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT || "8883"),
  protocol: "mqtts",
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  rejectUnauthorized: true,
  clientId: `sim_device_${Math.random().toString(16).slice(2, 10)}`
});

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker (acting as ESP32)");

  const topic = `devices/${DEVICE_ID}/data`;
  const payload = JSON.stringify({
    deviceId: DEVICE_ID,
    power: 1250,
    energy: 14.5,
    tripped: false,
    tripReason: "none"
  });

  console.log(`📤 Publishing to topic [${topic}]: ${payload}`);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Publish Error:", err);
    } else {
      console.log("✅ Message published!");
      console.log("➡️ Check your `mqtt-bridge.js` terminal to see if it receives the payload.");
    }

    // Give it a second to finish network operations then exit
    setTimeout(() => {
      console.log("👋 Disconnecting...");
      client.end();
      process.exit(0);
    }, 1000);
  });
});

client.on("error", (err) => {
  console.error("❌ MQTT Connection Error:", err.message);
  process.exit(1);
});

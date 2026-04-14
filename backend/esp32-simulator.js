require('dotenv').config();
const mqtt = require('./functions/node_modules/mqtt');

// The dummy device identifier. If you have an existing one, change this,
// or pass it via command line: node esp32-simulator.js YOUR_DEVICE_ID
const DEVICE_ID = process.argv[2] || "SIM_DEVICE_001";

const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_PORT = parseInt(process.env.MQTT_PORT || "8883");
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;

console.log(`🔌 Starting ESP32 Simulator`);
console.log(`📱 Device ID: ${DEVICE_ID}`);
console.log(`📡 Connecting to HiveMQ at ${MQTT_HOST}...`);

const client = mqtt.connect({
  host: MQTT_HOST,
  port: MQTT_PORT,
  protocol: "mqtts",
  username: MQTT_USER,
  password: MQTT_PASS,
  rejectUnauthorized: true,
  clientId: `sim_esp32_${Math.random().toString(16).slice(2, 10)}`
});

// ── State variables ──
let tripped = false;
let power = 500; // Start at 500W
let energy = 100.5; // Arbitrary starting accumulated energy reading
let tripReason = "none";
let tickCount = 0;

const MAX_TICKS_BEFORE_TRIP = 6; // 6 ticks * 5 seconds = 30 seconds

client.on("connect", () => {
  console.log("✅ Connected! ESP32 Firmware Emulation Started.\n");

  // 1. Subscribe to command topic to listen for "restore" from the frontend
  const cmdTopic = `devices/${DEVICE_ID}/cmd`;
  client.subscribe(cmdTopic, (err) => {
    if (err) console.error("❌ Failed to subscribe to command topic:", err);
    else console.log(`👂 Listening for frontend commands on: ${cmdTopic}`);
  });

  // 2. Start the telemetry loop (reports every 5 seconds)
  console.log(`⏱️  Beginning 30-second power ramp cycle...`);
  reportTelemetry(); // Trigger first hit immediately
  setInterval(() => reportTelemetry(), 5000);
});

// ── Handle incoming commands from the App ──
client.on("message", (topic, message) => {
  if (topic === `devices/${DEVICE_ID}/cmd`) {
    try {
      const payload = JSON.parse(message.toString());
      
      if (payload.cmd === "restore" || payload.cmd === "turn_on") {
        console.log("\n🔄 RECEIVED RESTORE COMMAND FROM APP! Resetting breaker...");
        // Reset state and restart 30s cycle
        tripped = false;
        tripReason = "none";
        power = 500;
        tickCount = 0;
        
        // Immediately publish new status to reflect restore in frontend
        reportTelemetry();
        
      } else if (payload.cmd === "trip" || payload.cmd === "force_off") {
        console.log("\n🛑 RECEIVED MANUAL TRIP COMMAND FROM APP!");
        tripped = true;
        tripReason = "manual";
        power = 0;
        reportTelemetry();
      }
    } catch (e) {
      console.error("❌ Failed to parse command:", e.message);
    }
  }
});

// ── Send telemetry payload to backend ──
function reportTelemetry() {
  const dataTopic = `devices/${DEVICE_ID}/data`;

  if (!tripped) {
    // Normal cycle
    tickCount++;
    energy += (power / 1000) * (5 / 3600); // Rough energy calculation
    
    if (tickCount >= MAX_TICKS_BEFORE_TRIP) {
       // Trip the breaker!
       tripped = true;
       tripReason = "auto";
       power = 0;
       console.log(`\n🚨 [30s Reached] Breaker Auto-Tripped! Voltage overload. Waiting for app restore command...`);
    } else {
       // Ramp up power simulating load
       power += 350; 
    }
  } else {
    // If tripped, we still send telemetry so the app knows it is still offline/tripped
    power = 0;
  }

  const payload = JSON.stringify({
    deviceId: DEVICE_ID,
    power: power,
    energy: parseFloat(energy.toFixed(4)),
    tripped: tripped,
    tripReason: tripReason
  });

  client.publish(dataTopic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("❌ Publish Error:", err);
    } else {
      const statusIcon = tripped ? "🔴" : "🟢";
      console.log(`${statusIcon} Published -> Power: ${power}W | Tripped: ${tripped} | Time: ${new Date().toLocaleTimeString()}`);
    }
  });
}

client.on("error", (err) => {
  console.error("\n❌ MQTT Connection Error:", err.message);
  process.exit(1);
});

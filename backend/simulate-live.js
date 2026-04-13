const admin = require("./functions/node_modules/firebase-admin");

process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";

const PROJECT_ID = "prime-ce8f3";
const DEVICE_ID  = "AABBCCDDEEFF";

admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

const rtdb = admin.database();
const liveRef = rtdb.ref(`devices/${DEVICE_ID}/live`);

let currentPower = 1000; // Start at 1000W
const TRIP_THRESHOLD = 2000; // Threshold for "Smart Home Energy Guardian"

console.log("🚀 Starting Live Simulation...");
console.log("📈 Power will increase by 200W every 2 seconds.");
console.log("🛑 At 2200W, the status will change to TRIPPED.");

const interval = setInterval(async () => {
  currentPower += 200;
  
  let isTripped = currentPower > TRIP_THRESHOLD;
  let reason = isTripped ? "auto" : "none";

  const payload = {
    power: isTripped ? 0 : currentPower, // If tripped, actual power draw usually drops to 0
    energy: 0.375, // Simplified for test
    tripped: isTripped,
    tripReason: reason,
    updatedAt: Date.now()
  };

  try {
    await liveRef.set(payload);
    console.log(`[${new Date().toLocaleTimeString()}] Power: ${currentPower}W | Tripped: ${isTripped}`);
    
    if (isTripped) {
      console.log("🚨 TRIP THRESHOLD REACHED! Stopping simulation.");
      clearInterval(interval);
    }
  } catch (error) {
    console.error("❌ Write failed:", error);
  }
}, 2000);
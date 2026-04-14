require('dotenv').config();
const admin = require("./functions/node_modules/firebase-admin");

// Pull emulator vars from .env to match what you did in mqtt-bridge
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.DB_EMULATOR_HOST || "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST         = process.env.FS_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST     = process.env.AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PROJECT_ID = process.env.PROJECT_ID || "prime-ce8f3";

admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`
});

const DEVICE_ID = "SIM_DEVICE_001";

async function forcePair() {
  try {
    console.log("🔍 Looking for a user in the local emulator...");
    // Grab the first user from the local Auth emulator
    const userRecords = await admin.auth().listUsers(1);
    
    if (userRecords.users.length === 0) {
      console.log("⚠️ No users found in the emulator. Make sure you complete the signup/login flow in the frontend app first!");
      process.exit(1);
    }

    const uid = userRecords.users[0].uid;
    console.log(`✅ Found test user! UID: ${uid}`);

    console.log(`🔗 Linking device ${DEVICE_ID} to user...`);
    const db = admin.firestore();
    const deviceRef = db.collection("devices").doc(DEVICE_ID);

    await deviceRef.set({
      deviceId: DEVICE_ID,
      ownerId: uid,
      name: "Smart Breaker (Sim)",
      paired: true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      tripWatts: 2000,
      safeWatts: 1800,
      tripped: false,
      tripReason: "none",
      status: "online"
    }, { merge: true });

    console.log(`🎉 Success! ${DEVICE_ID} has been permanently paired to your account.`);
    console.log(`➡️  Please REFRESH your app or switch tabs to make it fetch the data!`);
    process.exit(0);

  } catch (err) {
    console.error("❌ Error pairing:", err);
    process.exit(1);
  }
}

forcePair();

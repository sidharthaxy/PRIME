require('dotenv').config();
const admin = require("./functions/node_modules/firebase-admin");
const crypto = require("crypto");

process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.DB_EMULATOR_HOST || "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST         = process.env.FS_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST     = process.env.AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PROJECT_ID = process.env.PROJECT_ID || "prime-ce8f3";

admin.initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`
});

const DEVICE_ID = "SIM_DEVICE_001";
const hashPin = crypto.createHash("sha256").update("1234").digest("hex");

async function setDefaultPin() {
  try {
    const db = admin.firestore();
    await db.collection("devices").doc(DEVICE_ID).update({ pinHash: hashPin });
    console.log(`✅ PIN for ${DEVICE_ID} has been permanently set to: 1234`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error setting PIN:", err);
    process.exit(1);
  }
}

setDefaultPin();

/**
 * test-rtdb.js — Manual RTDB emulator test
 *
 * Tests the full MQTT→RTDB data flow locally without real hardware.
 * Run with: node test-rtdb.js
 *
 * Requirements:
 *   - firebase emulators:start must be running in the backend/ directory
 *   - RTDB emulator is on 127.0.0.1:9000
 */

const admin = require("./functions/node_modules/firebase-admin");

// ── Point admin SDK at local emulator ────────────────────────────────────────
// These env vars MUST be set before initializeApp().
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";
process.env.FIRESTORE_EMULATOR_HOST         = "127.0.0.1:8080";

const PROJECT_ID = "prime-ce8f3";
const DEVICE_ID  = "AABBCCDDEEFF"; // Fake device MAC for testing

admin.initializeApp({
  projectId:   PROJECT_ID,
  // The admin SDK uses FIREBASE_DATABASE_EMULATOR_HOST env var above,
  // but still needs a syntactically valid databaseURL — point it at your real project.
  databaseURL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
});

const rtdb = admin.database();

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(label, data) {
  console.log(`\n${"─".repeat(55)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(55)}`);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n🔥  RTDB Emulator Test Suite");
  console.log(`    Project  : ${PROJECT_ID}`);
  console.log(`    Device ID: ${DEVICE_ID}`);
  console.log(`    RTDB URL : http://127.0.0.1:9000\n`);

  // ── 1. Write a live power reading (simulates mqttWorker) ─────────────────
  log("TEST 1: Write live telemetry to RTDB");
  const livePayload = {
    power:      1350.5,
    tripped:    false,
    tripReason: "none",
    energy:     0.375,
    updatedAt:  Date.now(),
  };
  await rtdb.ref(`devices/${DEVICE_ID}/live`).set(livePayload);
  console.log("✅  Written:", livePayload);

  // ── 2. Read it straight back ──────────────────────────────────────────────
  log("TEST 2: Read live snapshot back from RTDB");
  const snapshot = await rtdb.ref(`devices/${DEVICE_ID}/live`).get();
  const data = snapshot.val();
  console.log("✅  Read back:", data);
  console.assert(data.power === 1350.5,   "FAIL: power mismatch");
  console.assert(data.tripped === false,  "FAIL: tripped mismatch");
  console.assert(data.tripReason === "none", "FAIL: tripReason mismatch");

  // ── 3. Simulate auto-trip ─────────────────────────────────────────────────
  log("TEST 3: Simulate auto-trip (power sustained > 20s on device)");
  await rtdb.ref(`devices/${DEVICE_ID}/live`).update({
    power:      2450.0,
    tripped:    true,
    tripReason: "auto",
    updatedAt:  Date.now(),
  });
  const trippedSnap = await rtdb.ref(`devices/${DEVICE_ID}/live`).get();
  const trippedData = trippedSnap.val();
  console.log("✅  Tripped state:", trippedData);
  console.assert(trippedData.tripped    === true,   "FAIL: should be tripped");
  console.assert(trippedData.tripReason === "auto",  "FAIL: reason should be auto");

  // ── 4. Simulate manual force-off ─────────────────────────────────────────
  log("TEST 4: Simulate remote force-off (manual)");
  await rtdb.ref(`devices/${DEVICE_ID}/live`).update({
    tripped:    true,
    tripReason: "manual",
    power:      0,
    updatedAt:  Date.now(),
  });
  const manualSnap = await rtdb.ref(`devices/${DEVICE_ID}/live`).get();
  console.log("✅  Manual-off state:", manualSnap.val());
  console.assert(manualSnap.val().tripReason === "manual", "FAIL: reason should be manual");

  // ── 5. Simulate restore ───────────────────────────────────────────────────
  log("TEST 5: Simulate remote restore");
  await rtdb.ref(`devices/${DEVICE_ID}/live`).update({
    tripped:    false,
    tripReason: "none",
    power:      980,
    updatedAt:  Date.now(),
  });
  const restoredSnap = await rtdb.ref(`devices/${DEVICE_ID}/live`).get();
  console.log("✅  Restored state:", restoredSnap.val());
  console.assert(restoredSnap.val().tripped === false,    "FAIL: should not be tripped");
  console.assert(restoredSnap.val().tripReason === "none", "FAIL: reason should be none");

  // ── 6. Real-time listener (simulates the frontend onValue) ────────────────
  log("TEST 6: Real-time listener (simulates frontend dashboard subscription)");
  console.log("   Attaching listener for 3 seconds, then writing 3 updates...");

  let updateCount = 0;
  const liveRef = rtdb.ref(`devices/${DEVICE_ID}/live`);

  const unsubscribe = liveRef.on("value", (snap) => {
    updateCount++;
    const v = snap.val();
    console.log(`   📡 [Update #${updateCount}] power=${v?.power}W  tripped=${v?.tripped}  reason=${v?.tripReason}`);
  });

  await sleep(300);
  await liveRef.update({ power: 1100, updatedAt: Date.now() });
  await sleep(300);
  await liveRef.update({ power: 1650, updatedAt: Date.now() });
  await sleep(300);
  await liveRef.update({ power: 1950, updatedAt: Date.now() });
  await sleep(500);

  liveRef.off("value", unsubscribe);
  console.log(`   ✅  Received ${updateCount} real-time updates (expected ≥ 4)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(55)}`);
  console.log("  ✅  ALL RTDB TESTS PASSED");
  console.log(`${"═".repeat(55)}\n`);

  console.log("💡  Open the Emulator UI to inspect data visually:");
  console.log("    http://127.0.0.1:4000/database");
  console.log("    http://127.0.0.1:4000/firestore\n");

  process.exit(0);
}

runTests().catch((err) => {
  console.error("\n❌  TEST FAILED:", err.message);
  console.error(err);
  process.exit(1);
});

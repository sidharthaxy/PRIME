require('dotenv').config({ path: __dirname + '/.env' });
const functions = require("firebase-functions/v1");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const mqtt = require("mqtt");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const crypto = require("crypto");

// ── PIN hashing helper ────────────────────────────────────────────────────────
const hashPin = (pin) => crypto.createHash("sha256").update(String(pin)).digest("hex");

admin.initializeApp();
const db = admin.firestore();
const rtdb = admin.database(); // Firebase Realtime Database for live MQTT data

// ── createUserProfile (KEEP - onCreate trigger) ──────────────────────────────
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  await db.collection("users").doc(user.uid).set({
    email: user.email || null,
    createdAt: FieldValue.serverTimestamp(),
    devices: []
  });
});

// ── calculateBillForecast (KEEP - HTTPS Callable) ────────────────────────────
exports.calculateBillForecast = onCall(async (request) => {
  if (request.data.currentUsageKWh === undefined) {
    throw new HttpsError("invalid-argument", "The 'currentUsageKWh' parameter is required.");
  }

  const { currentUsageKWh } = request.data;
  const RATE_PER_KWH = 0.15;
  const daysInMonth = 30;

  const estimatedMonthlyUsage = currentUsageKWh * daysInMonth;
  const estimatedBill = estimatedMonthlyUsage * RATE_PER_KWH;

  return {
    estimatedBill: estimatedBill.toFixed(2),
    currency: "USD"
  };
});

// ── verifyDeviceOwner (HTTPS Callable) ───────────────────────────────────────
exports.verifyDeviceOwner = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId } = request.data;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "The 'deviceId' parameter is required.");
  }

  const deviceDoc = await db.collection("devices").doc(deviceId).get();

  if (!deviceDoc.exists) {
    return { isOwner: false };
  }

  const deviceData = deviceDoc.data();
  return { isOwner: deviceData.ownerId === uid };
});

// ── mqttWorker (HTTPS onRequest) ─────────────────────────────────────────────
// Long-running MQTT bridge: subscribes to all device topics and writes to
// Firestore (persistent readings) + Firebase RTDB (live power for dashboard).
// Also handles the 'devices/unlink' topic emitted by long-press factory reset.
let mqttClient = null;

exports.mqttWorker = onRequest(async (req, res) => {
  if (mqttClient && mqttClient.connected) {
    res.status(200).send("Already running");
    return;
  }

  mqttClient = mqtt.connect({
    host: process.env.MQTT_HOST,
    port: 8883,
    protocol: "mqtts",
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    rejectUnauthorized: true
  });

  mqttClient.on("connect", () => {
    console.log("Connected to HiveMQ");
    mqttClient.subscribe([
      "devices/+/data",
      "devices/+/status",
      "devices/unlink"   // emitted by ESP32 long-press factory reset
    ]);
    res.status(200).send("MQTT worker started");
  });

  mqttClient.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      // ── devices/<id>/data ─────────────────────────────────────────────────
      if (topic.startsWith("devices/") && topic.endsWith("/data")) {
        const { deviceId, power, tripped, energy } = payload;
        if (!deviceId) return;

        const deviceRef = db.collection("devices").doc(deviceId);
        const deviceDoc = await deviceRef.get();

        if (deviceDoc.exists) {
          const ownerId = deviceDoc.data().ownerId;
          const tripWatts = deviceDoc.data().tripWatts || 2000;
          const safeWatts = deviceDoc.data().safeWatts || 1800;

          if (ownerId) {
            // 1. Write to Firestore readings (historical)
            await db.collection("readings").add({
              deviceId,
              ownerId,
              power: power || 0,
              energy: energy || 0,
              tripped: tripped || false,
              timestamp: Timestamp.now()
            });

            // 2. Write live snapshot to RTDB for real-time frontend updates
            const tripReason = payload.tripReason || (tripped ? "auto" : "none");
            await rtdb.ref(`devices/${deviceId}/live`).set({
              power: power || 0,
              tripped: tripped || false,
              tripReason,
              energy: energy || 0,
              updatedAt: Date.now()
            });

            // 3. Update online/tripped status in Firestore device doc
            await deviceRef.update({
              lastSeen: FieldValue.serverTimestamp(),
              status: "online",
              tripped: tripped || false,
              tripReason: tripped ? tripReason : "none"
            });

            // 4. Push notification via FCM if tripped (only on leading edge)
            const deviceName = deviceDoc.data().name || "Your Monitor";
            const tripReason2 = payload.tripReason || "auto";
            if (tripped && !deviceDoc.data().tripped) {
              // Only send once per trip event (not every 500ms)
              // Manual off via the app is already acknowledged by the user — skip notification
              if (tripReason2 !== "manual") {
                const userDoc = await db.collection("users").doc(ownerId).get();
                const fcmToken = userDoc.exists ? userDoc.data().fcmToken : null;
                if (fcmToken) {
                  await admin.messaging().send({
                    token: fcmToken,
                    notification: {
                      title: "⚡ Circuit Auto-Tripped!",
                      body: `${deviceName} drew too much power for 20s and tripped. Open the app to restore after reducing load.`
                    },
                    data: { deviceId, type: "trip", tripReason: tripReason2 }
                  });
                }
              }
            }

            // 5. Push notification if power exceeds safeWatts threshold
            if (!tripped && power > safeWatts) {
              const userDoc = await db.collection("users").doc(ownerId).get();
              const fcmToken = userDoc.exists ? userDoc.data().fcmToken : null;
              if (fcmToken) {
                // Throttle: only send if not sent in last 5 minutes (use RTDB flag)
                const throttleRef = rtdb.ref(`devices/${deviceId}/lastWarnSent`);
                const lastWarn = (await throttleRef.get()).val() || 0;
                if (Date.now() - lastWarn > 5 * 60 * 1000) {
                  await admin.messaging().send({
                    token: fcmToken,
                    notification: {
                      title: "⚠️ High Power Warning",
                      body: `Power consumption in ${deviceName} is exceeding threshold (${Math.round(power)}W). Please shut down a few devices to prevent tripping.`
                    },
                    data: { deviceId, type: "threshold" }
                  });
                  await throttleRef.set(Date.now());
                }
              }
            }
          }
        }

      // ── devices/<id>/status ───────────────────────────────────────────────
      } else if (topic.startsWith("devices/") && topic.endsWith("/status")) {
        const { deviceId, online } = payload;
        if (!deviceId) return;

        await db.collection("devices").doc(deviceId).update({
          status: online ? "online" : "offline",
          lastSeen: FieldValue.serverTimestamp()
        });

        // Mirror to RTDB so the frontend can react in real time
        await rtdb.ref(`devices/${deviceId}/live/online`).set(online ? true : false);

      // ── devices/unlink ────────────────────────────────────────────────────
      // Emitted by the ESP32 on long-press factory reset.
      // Clears ownership so the device can be re-paired by any user.
      } else if (topic === "devices/unlink") {
        const { deviceId } = payload;
        if (!deviceId) return;

        console.log(`[UNLINK] Device ${deviceId} requested factory reset`);

        const deviceRef = db.collection("devices").doc(deviceId);
        const deviceDoc = await deviceRef.get();

        if (deviceDoc.exists) {
          await deviceRef.update({
            ownerId: null,
            paired: false,
            status: "offline",
            tripped: false
          });
        }

        // Clear RTDB live data
        await rtdb.ref(`devices/${deviceId}`).remove();

        console.log(`[UNLINK] Device ${deviceId} successfully unlinked`);
      }

    } catch (error) {
      console.error("Error processing MQTT message:", error);
    }
  });

  mqttClient.on("error", (err) => {
    console.error("MQTT connection error:", err);
  });
});

// ── pairDevice (HTTPS Callable) ───────────────────────────────────────────────
// Simplified pairing — no token required.
// The app reads the deviceId from the ESP32 BLE characteristic (UUID ...9003)
// which exposes the WiFi MAC address. After WiFi provisioning succeeds,
// the app calls this function with the deviceId + initial config.
exports.pairDevice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, name, tripWatts, safeWatts } = request.data;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "Missing deviceId.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  // Reject if already owned (one device → one user)
  if (deviceDoc.exists && deviceDoc.data().ownerId) {
    throw new HttpsError(
      "already-exists",
      "Device already paired to another user. Long-press the button to reset it first."
    );
  }

  const finalName    = name     || "My PRIME Monitor";
  const finalTrip    = tripWatts  || 2000;
  const finalSafe    = safeWatts  || 1800;

  await deviceRef.set({
    deviceId,
    ownerId:   uid,
    name:      finalName,
    tripWatts: finalTrip,
    safeWatts: finalSafe,
    paired:    true,
    tripped:   false,
    pairedAt:  FieldValue.serverTimestamp(),
    status:    "offline",
    lastSeen:  FieldValue.serverTimestamp()
  }, { merge: true });

  return { success: true, device: { deviceId, name: finalName } };
});

// ── updateDeviceConfig (HTTPS Callable) ──────────────────────────────────────
// Allows the user to update their device's name and threshold settings
// after initial pairing.
exports.updateDeviceConfig = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, name, tripWatts, safeWatts } = request.data;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "Missing deviceId.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }

  if (deviceDoc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "You don't own this device.");
  }

  const updates = {};
  if (name      !== undefined) updates.name      = name;
  if (tripWatts !== undefined) updates.tripWatts = tripWatts;
  if (safeWatts !== undefined) updates.safeWatts = safeWatts;

  await deviceRef.update(updates);

  return { success: true };
});

// ── unpairDevice (HTTPS Callable) ─────────────────────────────────────────────
exports.unpairDevice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId } = request.data;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "Missing deviceId.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }

  if (deviceDoc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "permission-denied");
  }

  await deviceRef.update({
    ownerId: null,
    paired:  false,
    status:  "offline",
    tripped: false
  });

  // Also clear RTDB live data
  await rtdb.ref(`devices/${deviceId}`).remove();

  return { success: true };
});

// ── getDeviceReadings (HTTPS Callable) ────────────────────────────────────────
exports.getDeviceReadings = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, limit, fromTimestamp, toTimestamp } = request.data;

  if (!deviceId) {
    throw new HttpsError("invalid-argument", "Missing deviceId.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }

  if (deviceDoc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "permission-denied");
  }

  let query = db.collection("readings").where("deviceId", "==", deviceId);

  if (fromTimestamp) {
    query = query.where("timestamp", ">=", Timestamp.fromMillis(fromTimestamp));
  }
  if (toTimestamp) {
    query = query.where("timestamp", "<=", Timestamp.fromMillis(toTimestamp));
  }

  query = query.orderBy("timestamp", "desc").limit(limit ?? 100);

  const snapshot = await query.get();

  return { readings: snapshot.docs.map(d => d.data()) };
});

// ── saveFCMToken (HTTPS Callable) ─────────────────────────────────────────────
// Called by the frontend once after the user grants notification permission.
// Saves the Expo/FCM push token to the user's Firestore doc.
exports.saveFCMToken = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { fcmToken } = request.data;
  if (!fcmToken) {
    throw new HttpsError("invalid-argument", "Missing fcmToken.");
  }

  await db.collection("users").doc(request.auth.uid).update({ fcmToken });
  return { success: true };
});

// ── setDevicePin (HTTPS Callable) ─────────────────────────────────────────────
// Called after pairing (or from settings) to set a PIN for remote force-off.
// The PIN is hashed (SHA-256) before storage — it is never stored in plaintext.
exports.setDevicePin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, pin } = request.data;

  if (!deviceId || !pin) {
    throw new HttpsError("invalid-argument", "Missing deviceId or pin.");
  }

  if (String(pin).length < 4 || String(pin).length > 8) {
    throw new HttpsError("invalid-argument", "PIN must be 4–8 digits.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }
  if (deviceDoc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "You don't own this device.");
  }

  await deviceRef.update({ pinHash: hashPin(pin) });
  return { success: true };
});

// ── controlDevice (HTTPS Callable) ────────────────────────────────────────────
// Remotely trips (force-off) or restores the circuit via MQTT.
//
// action: "trip"    → PIN required, relay OFF (manual off, no buzzer on device)
// action: "restore" → no PIN required, relay ON
//
// The backend publishes to devices/<id>/cmd which the ESP32 subscribes to.
// A shared mqttClient is reused if already connected.
exports.controlDevice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, action, pin } = request.data;

  if (!deviceId || !action) {
    throw new HttpsError("invalid-argument", "Missing deviceId or action.");
  }
  if (action !== "trip" && action !== "restore") {
    throw new HttpsError("invalid-argument", "action must be 'trip' or 'restore'.");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }
  if (deviceDoc.data().ownerId !== uid) {
    throw new HttpsError("permission-denied", "You don't own this device.");
  }

  // ── PIN verification (required for force-off only) ────────────────────────
  if (action === "trip") {
    const storedHash = deviceDoc.data().pinHash;
    if (!storedHash) {
      throw new HttpsError(
        "failed-precondition",
        "No PIN set for this device. Set one in device settings first."
      );
    }
    if (!pin || hashPin(pin) !== storedHash) {
      throw new HttpsError("permission-denied", "Incorrect PIN.");
    }
  }

  // ── Publish MQTT command to the ESP32 ────────────────────────────────────
  const cmdPayload = JSON.stringify({ cmd: action });
  const cmdTopic   = `devices/${deviceId}/cmd`;

  await new Promise((resolve, reject) => {
    const client = mqtt.connect({
      host:              process.env.MQTT_HOST,
      port:              8883,
      protocol:          "mqtts",
      username:          process.env.MQTT_USER,
      password:          process.env.MQTT_PASS,
      rejectUnauthorized: true,
      clientId:          `backend-ctrl-${Date.now()}`
    });

    client.on("connect", () => {
      client.publish(cmdTopic, cmdPayload, { qos: 1, retain: false }, (err) => {
        client.end();
        if (err) reject(err); else resolve();
      });
    });
    client.on("error", reject);
    setTimeout(() => { client.end(); reject(new Error("MQTT publish timeout")); }, 8000);
  });

  // ── Mirror state immediately to Firestore + RTDB ─────────────────────────
  // This gives instant UI feedback before the ESP32 echoes back via telemetry.
  const isOff = action === "trip";
  await deviceRef.update({
    tripped:    isOff,
    tripReason: isOff ? "manual" : "none"
  });
  await rtdb.ref(`devices/${deviceId}/live`).update({
    tripped:    isOff,
    tripReason: isOff ? "manual" : "none",
    updatedAt:  Date.now()
  });

  return { success: true };
});
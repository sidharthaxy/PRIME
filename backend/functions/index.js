const functions = require("firebase-functions/v1");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const mqtt = require("mqtt");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// ── createUserProfile (KEEP - onCreate trigger) ──
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  await db.collection("users").doc(user.uid).set({
    email: user.email || null,
    createdAt: FieldValue.serverTimestamp(),
    devices: []
  });
});

// ── calculateBillForecast (KEEP - HTTPS Callable) ──
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

// ── verifyDeviceOwner (HTTPS Callable) ──
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

// ── mqttWorker (HTTPS onRequest) ──
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
      "pairing/available",
      "devices/+/data",
      "devices/+/status"
    ]);
    res.status(200).send("MQTT worker started");
  });

  mqttClient.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());

      if (topic === "pairing/available") {
        const { deviceId, token, name } = payload;
        if (!deviceId || !token) return;

        await db.collection("pairing_sessions").doc(deviceId).set({
          deviceId,
          token,
          name: name || "New Device",
          expiresAt: Timestamp.fromMillis(Date.now() + 60000),
          claimed: false
        });
      } else if (topic.startsWith("devices/") && topic.endsWith("/data")) {
        const { deviceId, voltage, current, power, energy, status, timestamp } = payload;
        if (!deviceId || timestamp === undefined) return;

        const deviceRef = db.collection("devices").doc(deviceId);
        const deviceDoc = await deviceRef.get();
        if (deviceDoc.exists) {
          const ownerId = deviceDoc.data().ownerId;
          if (ownerId) {
            await db.collection("readings").add({
              deviceId,
              ownerId,
              voltage: voltage || 0,
              current: current || 0,
              power: power || 0,
              energy: energy || 0,
              status: status || 0,
              timestamp: Timestamp.fromMillis(timestamp * 1000)
            });
            await deviceRef.update({ lastSeen: FieldValue.serverTimestamp() });
          }
        }
      } else if (topic.startsWith("devices/") && topic.endsWith("/status")) {
        const { deviceId, online } = payload;
        if (!deviceId) return;

        await db.collection("devices").doc(deviceId).update({
          status: online ? "online" : "offline",
          lastSeen: FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error processing MQTT message:", error);
    }
  });

  mqttClient.on("error", (err) => {
    console.error("MQTT connection error:", err);
    setTimeout(() => {
      // Reconnect handled automatically by mqtt.js
    }, 5000);
  });
});

// ── pairDevice (HTTPS Callable) ──
exports.pairDevice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { deviceId, token, name } = request.data;

  if (!deviceId || !token) {
    throw new HttpsError("invalid-argument", "Missing deviceId or token.");
  }

  const sessionRef = db.collection("pairing_sessions").doc(deviceId);
  const sessionDoc = await sessionRef.get();

  if (!sessionDoc.exists) {
    throw new HttpsError("not-found", "No pairing session found");
  }

  const sessionData = sessionDoc.data();

  if (sessionData.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("deadline-exceeded", "Pairing token expired");
  }

  if (sessionData.claimed === true) {
    throw new HttpsError("already-exists", "Token already used");
  }

  if (sessionData.token !== token) {
     throw new HttpsError("invalid-argument", "Invalid token");
  }

  const deviceRef = db.collection("devices").doc(deviceId);
  const deviceDoc = await deviceRef.get();

  if (deviceDoc.exists && deviceDoc.data().ownerId) {
    throw new HttpsError("already-exists", "Device already owned");
  }

  const finalName = name || sessionData.name || "My Monitor";

  // Using set with merge to ensure doc creation and owner assignment
  await deviceRef.set({
    deviceId,
    ownerId: uid,
    name: finalName,
    paired: true,
    pairedAt: FieldValue.serverTimestamp(),
    status: "offline",
    lastSeen: FieldValue.serverTimestamp()
  }, { merge: true });

  await sessionRef.update({ claimed: true });

  // One-shot MQTT publish to pairing/confirm
  await new Promise((resolve, reject) => {
    const shotClient = mqtt.connect({
      host: process.env.MQTT_HOST,
      port: 8883,
      protocol: "mqtts",
      username: process.env.MQTT_USER,
      password: process.env.MQTT_PASS,
      rejectUnauthorized: true
    });

    shotClient.on("connect", () => {
      shotClient.publish("pairing/confirm", JSON.stringify({ deviceId, token }), (err) => {
        shotClient.end();
        if (err) reject(err);
        else resolve();
      });
    });

    shotClient.on("error", (err) => {
      shotClient.end();
      reject(new HttpsError("internal", "MQTT publish failed"));
    });
  });

  return { success: true, device: { deviceId, name: finalName } };
});

// ── unpairDevice (HTTPS Callable) ──
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
    paired: false,
    status: "offline"
  });

  return { success: true };
});

// ── getDeviceReadings (HTTPS Callable) ──
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
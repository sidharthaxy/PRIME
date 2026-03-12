const functions = require("firebase-functions/v1"); // v1 for Auth triggers
const { onCall, HttpsError } = require("firebase-functions/v2/https"); // v2 for Callable functions
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();
const db = admin.firestore();

// 1. Create user profile when user signs up (Using v1 Auth Trigger)
exports.createUserProfile = functions.auth.user().onCreate(async (user) => {
  // Note: In v1, 'user' is passed directly, so we don't need 'event.data'
  await db.collection("users").doc(user.uid).set({
    email: user.email || null,
    createdAt: FieldValue.serverTimestamp(),
    devices: []
  });
});

// 2. Verify device owner (Using v2 onCall)
exports.verifyDeviceOwner = onCall(async (request) => {
  // Use HttpsError so the client receives a structured error object
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { macAddress } = request.data;

  // Added a quick validation check for macAddress
  if (!macAddress) {
    throw new HttpsError("invalid-argument", "The 'macAddress' parameter is required.");
  }

  const deviceDoc = await db.collection("devices").doc(macAddress).get();

  if (!deviceDoc.exists) {
    throw new HttpsError("not-found", "Device not found.");
  }

  const deviceData = deviceDoc.data();

  return {
    isOwner: deviceData.ownerUid === uid
  };
});

// 3. Bill forecast (Using v2 onCall)
exports.calculateBillForecast = onCall(async (request) => {
  // Added validation to prevent NaN calculations
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
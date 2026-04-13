import { collection, query, where, onSnapshot, doc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import { db, rtdb, DeviceDoc, Reading, LiveReading } from '../config/firebase';

// ── Firestore: User's paired devices ─────────────────────────────────────────

export function subscribeToUserDevices(
  uid: string,
  callback: (devices: DeviceDoc[]) => void
): () => void {
  const q = query(collection(db, 'devices'), where('ownerId', '==', uid));
  
  return onSnapshot(q, (snapshot) => {
    const devices = snapshot.docs.map(doc => doc.data() as DeviceDoc);
    callback(devices);
  });
}

export function subscribeToDevice(
  deviceId: string,
  callback: (device: DeviceDoc | null) => void
): () => void {
  const docRef = doc(db, 'devices', deviceId);
  
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as DeviceDoc);
    } else {
      callback(null);
    }
  });
}

// ── RTDB: Live power reading (updated every 500ms from MQTT) ─────────────────
// Replaces the old subscribeToLatestReading (Firestore) for the dashboard
// real-time power display. RTDB has much lower latency for live data.

export function subscribeToLiveReading(
  deviceId: string,
  callback: (reading: LiveReading | null) => void
): () => void {
  const liveRef = ref(rtdb, `devices/${deviceId}/live`);

  const handler = onValue(liveRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as LiveReading);
    } else {
      callback(null);
    }
  });

  // Return an unsubscribe function
  return () => off(liveRef, 'value', handler);
}

// ── Firestore: Historical readings ───────────────────────────────────────────

export function subscribeToLatestReading(
  deviceId: string,
  callback: (reading: Reading | null) => void
): () => void {
  const q = query(
    collection(db, 'readings'),
    where('deviceId', '==', deviceId),
    orderBy('timestamp', 'desc'),
    limit(1)
  );
  
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      callback(snapshot.docs[0].data() as Reading);
    } else {
      callback(null);
    }
  });
}

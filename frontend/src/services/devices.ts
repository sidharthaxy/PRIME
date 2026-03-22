import { collection, query, where, onSnapshot, doc, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db, DeviceDoc, Reading, PairingSession } from '../config/firebase';

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

export function subscribeToPairingSessions(
  callback: (session: PairingSession | null) => void
): () => void {
  const q = query(
    collection(db, 'pairing_sessions'),
    where('claimed', '==', false),
    where('expiresAt', '>', Timestamp.now())
  );
  
  return onSnapshot(q, (snapshot) => {
    if (!snapshot.empty) {
      callback(snapshot.docs[0].data() as PairingSession);
    } else {
      callback(null);
    }
  });
}
